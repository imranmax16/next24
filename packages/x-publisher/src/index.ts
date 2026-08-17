import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import twitter from "twitter-text";

export interface PublisherAdapter { publish(text:string,idempotencyKey:string):Promise<PublishResult> }
export interface PublishRequest { text:string; headline:string; sourceArticleUrl:string; candidateId:string; clusterId?:string; automatic?:boolean }
export interface PublishResult { id:string; url?:string; dryRun:boolean; duplicate?:boolean; publishedAt:string; status:"dry_run"|"published"|"duplicate" }
export interface PublicationRecord extends PublishRequest { idempotencyKey:string; headlineFingerprint:string; weightedCharacterCount:number; status:string; xPostId?:string; xPostUrl?:string; publishedAt?:string; error?:string }
export interface PublicationStore {
  findDuplicate(input:{idempotencyKey:string;headlineFingerprint:string;sourceArticleUrl:string;windowHours:number}):Promise<PublicationRecord|null>;
  save(record:PublicationRecord):Promise<void>;
  markPublished(idempotencyKey:string,result:{xPostId:string;xPostUrl:string;publishedAt:string}):Promise<void>;
  markFailed(idempotencyKey:string,error:string):Promise<void>;
  logFailure(correlationId:string,payload:Record<string,unknown>):Promise<void>;
}

export const weightedLength=(text:string)=>twitter.parseTweet(text).weightedLength;
export const validatePost=(text:string)=>{const r=twitter.parseTweet(text);return{valid:r.valid,weightedLength:r.weightedLength,permillage:r.permillage}};
export const headlineFingerprint=(text:string)=>createHmac("sha256","nabiz-public-dedupe-v1").update(text.toLocaleLowerCase("tr").normalize("NFKD").replace(/[^a-z0-9çğıöşü\s]/gi," ").replace(/\s+/g," ").trim()).digest("hex");
const canonicalUrl=(value:string)=>{const u=new URL(value);u.hash="";[...u.searchParams.keys()].filter(k=>k.startsWith("utm_")||["fbclid","gclid"].includes(k)).forEach(k=>u.searchParams.delete(k));return u.toString().replace(/\/$/,"")};
const encode=(v:string)=>encodeURIComponent(v).replace(/[!'()*]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));

export class PostgresPublicationStore implements PublicationStore {
  private pool:Pool;
  constructor(connectionString=process.env.DATABASE_URL){if(!connectionString)throw new Error("DATABASE_URL is required for live X publishing");this.pool=new Pool({connectionString,ssl:/supabase\.(co|com)/i.test(connectionString)?{rejectUnauthorized:false}:undefined,max:5})}
  private async query<T>(sql:string,values:unknown[]=[],client?:PoolClient){return (client??this.pool).query<T>(sql,values)}
  async findDuplicate(x:{idempotencyKey:string;headlineFingerprint:string;sourceArticleUrl:string;windowHours:number}){const r=await this.query<PublicationRecord>(`SELECT idempotency_key AS "idempotencyKey", headline, source_article_url AS "sourceArticleUrl", candidate_id AS "candidateId", coalesce(cluster_id,'') AS "clusterId", text, headline_fingerprint AS "headlineFingerprint", weighted_character_count AS "weightedCharacterCount", status, x_post_id AS "xPostId", x_post_url AS "xPostUrl", published_at AS "publishedAt" FROM x_publications WHERE status='published' AND (idempotency_key=$1 OR source_article_url=$2 OR headline_fingerprint=$3) AND created_at >= now()-($4::text||' hours')::interval ORDER BY created_at DESC LIMIT 1`,[x.idempotencyKey,x.sourceArticleUrl,x.headlineFingerprint,x.windowHours]);return r.rows[0]??null}
  async save(r:PublicationRecord){await this.query(`INSERT INTO x_publications(idempotency_key,candidate_id,cluster_id,text,headline,headline_fingerprint,source_article_url,weighted_character_count,status,automatic) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(idempotency_key) DO NOTHING`,[r.idempotencyKey,r.candidateId,r.clusterId??null,r.text,r.headline,r.headlineFingerprint,r.sourceArticleUrl,r.weightedCharacterCount,r.status,!!r.automatic])}
  async markPublished(key:string,r:{xPostId:string;xPostUrl:string;publishedAt:string}){await this.query(`UPDATE x_publications SET status='published',x_post_id=$2,x_post_url=$3,published_at=$4,updated_at=now(),error=NULL WHERE idempotency_key=$1`,[key,r.xPostId,r.xPostUrl,r.publishedAt])}
  async markFailed(key:string,error:string){await this.query(`UPDATE x_publications SET status='failed',error=$2,attempt_count=attempt_count+1,updated_at=now() WHERE idempotency_key=$1`,[key,error.slice(0,2000)])}
  async logFailure(id:string,payload:Record<string,unknown>){await this.query(`INSERT INTO processing_logs(correlation_id,event,level,payload) VALUES($1,'x_publish_failed','error',$2::jsonb)`,[id,JSON.stringify(payload)])}
}

export class MemoryPublicationStore implements PublicationStore {
  rows=new Map<string,PublicationRecord>(); logs:Record<string,unknown>[]=[];
  async findDuplicate(x:{idempotencyKey:string;headlineFingerprint:string;sourceArticleUrl:string}){return[...this.rows.values()].find(r=>r.status==="published"&&(r.idempotencyKey===x.idempotencyKey||r.headlineFingerprint===x.headlineFingerprint||r.sourceArticleUrl===x.sourceArticleUrl))??null}
  async save(r:PublicationRecord){if(!this.rows.has(r.idempotencyKey))this.rows.set(r.idempotencyKey,r)}
  async markPublished(k:string,r:{xPostId:string;xPostUrl:string;publishedAt:string}){Object.assign(this.rows.get(k)!,r,{status:"published"})}
  async markFailed(k:string,error:string){Object.assign(this.rows.get(k)!,{status:"failed",error})}
  async logFailure(correlationId:string,payload:Record<string,unknown>){this.logs.push({correlationId,...payload})}
}

export type XCredentials={apiKey:string;apiKeySecret:string;accessToken:string;accessTokenSecret:string};
export const credentialsFromEnv=():XCredentials=>{const map={apiKey:process.env.X_API_KEY,apiKeySecret:process.env.X_API_KEY_SECRET,accessToken:process.env.X_ACCESS_TOKEN,accessTokenSecret:process.env.X_ACCESS_TOKEN_SECRET};const missing=Object.entries(map).filter(([,v])=>!v).map(([k])=>k);if(missing.length)throw new Error(`Missing X credentials: ${missing.join(", ")}`);return map as XCredentials};

export class XPublisher implements PublisherAdapter {
  private results=new Map<string,PublishResult>();
  constructor(private dryRun=true,private store:PublicationStore=new MemoryPublicationStore(),private fetcher:typeof fetch=fetch,private credentials?:XCredentials){}
  async publish(text:string,idempotencyKey:string){return this.publishNews({text,headline:text,sourceArticleUrl:"https://example.invalid",candidateId:idempotencyKey})}
  async publishNews(input:PublishRequest):Promise<PublishResult>{
    if(input.automatic&&process.env.AUTO_PUBLISH_X!=="true")throw new Error("Automatic X publishing is disabled");
    const check=validatePost(input.text);if(!check.valid)throw new Error(`X weighted character limit exceeded (${check.weightedLength}/280)`);
    const sourceArticleUrl=canonicalUrl(input.sourceArticleUrl),idempotencyKey=createHmac("sha256","nabiz-x-idempotency-v1").update(`${input.candidateId}|${input.clusterId??""}`).digest("hex"),fingerprint=headlineFingerprint(input.headline),windowHours=Number(process.env.DUPLICATE_WINDOW_HOURS??6),cached=this.results.get(idempotencyKey);if(cached)return cached;
    const duplicate=await this.store.findDuplicate({idempotencyKey,headlineFingerprint:fingerprint,sourceArticleUrl,windowHours});
    if(duplicate)return{id:duplicate.xPostId??duplicate.idempotencyKey,url:duplicate.xPostUrl,dryRun:false,duplicate:true,publishedAt:duplicate.publishedAt??new Date().toISOString(),status:"duplicate"};
    const record:PublicationRecord={...input,sourceArticleUrl,idempotencyKey,headlineFingerprint:fingerprint,weightedCharacterCount:check.weightedLength,status:this.dryRun?"dry_run":"publishing"};await this.store.save(record);
    if(this.dryRun){const publishedAt=new Date().toISOString(),result:PublishResult={id:`dry_${idempotencyKey.slice(0,16)}`,dryRun:true,publishedAt,status:"dry_run"};this.results.set(idempotencyKey,result);console.log(JSON.stringify({level:"info",event:"WOULD_PUBLISH",candidateId:input.candidateId,text:input.text,weightedLength:check.weightedLength,sourceArticleUrl}));return result}
    try{const result=await this.postWithRetry(input.text,input.candidateId);const publishedAt=new Date().toISOString(),url=`https://x.com/i/web/status/${result.id}`;await this.store.markPublished(idempotencyKey,{xPostId:result.id,xPostUrl:url,publishedAt});const output:PublishResult={id:result.id,url,dryRun:false,publishedAt,status:"published"};this.results.set(idempotencyKey,output);return output}
    catch(error){const message=error instanceof Error?error.message:String(error);await this.store.markFailed(idempotencyKey,message);await this.store.logFailure(input.candidateId,{message,headline:input.headline,sourceArticleUrl,automatic:!!input.automatic});console.error(JSON.stringify({level:"error",event:"x_publish_failed",candidateId:input.candidateId,message}));throw error}
  }
  private oauthHeader(url:string,method:string){const c=this.credentials??credentialsFromEnv(),params:Record<string,string>={oauth_consumer_key:c.apiKey,oauth_nonce:randomBytes(18).toString("hex"),oauth_signature_method:"HMAC-SHA1",oauth_timestamp:Math.floor(Date.now()/1000).toString(),oauth_token:c.accessToken,oauth_version:"1.0"};const parameterString=Object.entries(params).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${encode(k)}=${encode(v)}`).join("&"),base=[method.toUpperCase(),encode(url),encode(parameterString)].join("&"),key=`${encode(c.apiKeySecret)}&${encode(c.accessTokenSecret)}`;params.oauth_signature=createHmac("sha1",key).update(base).digest("base64");return"OAuth "+Object.entries(params).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${encode(k)}=\"${encode(v)}\"`).join(", ")}
  private async postWithRetry(text:string,correlationId:string){const url="https://api.x.com/2/tweets",max=Number(process.env.X_PUBLISH_MAX_ATTEMPTS??4);for(let attempt=1;attempt<=max;attempt++){try{const response=await this.fetcher(url,{method:"POST",headers:{authorization:this.oauthHeader(url,"POST"),"content-type":"application/json","user-agent":"NabizNewsroom/1.0"},body:JSON.stringify({text}),signal:AbortSignal.timeout(15000)});const body=await response.text();if(response.ok){const parsed=JSON.parse(body);if(!parsed.data?.id)throw new Error("X response did not contain a post ID");return{id:String(parsed.data.id)}}const retryable=response.status===429||response.status>=500;if(!retryable||attempt===max)throw new Error(`X API ${response.status}: ${body.slice(0,1000)}`);const reset=Number(response.headers.get("x-rate-limit-reset")??0)*1000-Date.now(),backoff=Math.min(Number(process.env.X_RETRY_MAX_DELAY_MS??30000),Math.max(500,reset>0?reset:500*2**(attempt-1)));console.warn(JSON.stringify({level:"warn",event:"x_publish_retry",correlationId,attempt,status:response.status,backoffMs:backoff}));await sleep(backoff)}catch(error){if(attempt===max||error instanceof Error&&error.message.startsWith("X API 4"))throw error;const backoff=Math.min(8000,500*2**(attempt-1));console.warn(JSON.stringify({level:"warn",event:"x_publish_retry",correlationId,attempt,reason:String(error),backoffMs:backoff}));await sleep(backoff)}}throw new Error("X publication retries exhausted")}
}

export const safeCompare=(a:string,b:string)=>{const A=Buffer.from(a),B=Buffer.from(b);return A.length===B.length&&timingSafeEqual(A,B)};
