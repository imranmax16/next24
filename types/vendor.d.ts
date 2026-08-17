declare module "twitter-text" { const twitter:{parseTweet(text:string):{valid:boolean;weightedLength:number;permillage:number}}; export default twitter }
declare module "pg" {
  export interface QueryResult<T>{rows:T[]}
  export interface PoolClient{query<T=Record<string,unknown>>(sql:string,values?:unknown[]):Promise<QueryResult<T>>}
  export class Pool { constructor(config?:Record<string,unknown>); query<T=Record<string,unknown>>(sql:string,values?:unknown[]):Promise<QueryResult<T>> }
}
declare module "cloudflare:workers" { export const env:{DB?:D1Database;[key:string]:unknown} }
interface Fetcher { fetch(input:RequestInfo|URL,init?:RequestInit):Promise<Response> }
interface D1Database { prepare(query:string):unknown }
