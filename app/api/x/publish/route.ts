import { createHmac } from "node:crypto";
import { z } from "zod";
import { publishApprovedNews } from "../../../../packages/x-publisher/src/service";
import { safeCompare } from "../../../../packages/x-publisher/src/index";

export const runtime="nodejs";
const Body=z.object({candidateId:z.string().min(1).max(160),clusterId:z.string().max(160).optional(),text:z.string().min(1).max(1000),headline:z.string().min(1).max(1000),sourceArticleUrl:z.string().url().max(2048)}).strict();
function authorized(request:Request){
  if(process.env.NODE_ENV!=="production"||process.env.DRY_RUN!=="false")return true;
  const secret=process.env.ADMIN_SESSION_SECRET;if(!secret||secret.length<32)return false;
  const cookie=request.headers.get("cookie")?.split(";").map(x=>x.trim()).find(x=>x.startsWith("nabiz_session="))?.slice(14);if(!cookie)return false;
  const [payload,signature]=cookie.split(".");if(!payload||!signature)return false;
  const expected=createHmac("sha256",secret).update(payload).digest("base64url");if(!safeCompare(signature,expected))return false;
  try{const session=JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));return["admin","editor"].includes(session.role)&&Number(session.exp)>Date.now()/1000}catch{return false}
}
export async function POST(request:Request){
  if(!authorized(request))return Response.json({error:"Editor authentication required"},{status:401});
  const site=request.headers.get("sec-fetch-site");if(site&&!["same-origin","same-site"].includes(site))return Response.json({error:"Cross-site request rejected"},{status:403});
  try{const input=Body.parse(await request.json());const result=await publishApprovedNews(input);return Response.json(result,{status:result.duplicate?200:201})}
  catch(error){if(error instanceof z.ZodError)return Response.json({error:"Invalid publication request",details:error.issues},{status:400});const message=error instanceof Error?error.message:"Publication failed";const status=/duplicate/i.test(message)?409:/character limit/i.test(message)?422:502;return Response.json({error:message},{status})}
}
