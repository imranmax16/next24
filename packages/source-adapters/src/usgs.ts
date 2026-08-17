import type { NewsSourceAdapter } from "./index";
import type { RawNewsItem, SourceConfig, SourceHealth } from "../../news-core/src/types";
type Feature={id:string;properties:{mag:number|null;place:string|null;time:number;url:string;title?:string;status?:string;type?:string};geometry?:{coordinates?:number[]}};
export const USGS_FEED_URL="https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson";
export class UsgsGeoJsonAdapter implements NewsSourceAdapter{
 id="usgs";config:SourceConfig;
 constructor(feedUrl=process.env.USGS_FEED_URL??USGS_FEED_URL){this.config={id:"usgs",name:"USGS",enabled:true,sourceType:"official",acquisitionMethod:"api",feedUrl,priority:100,trustScore:99,language:"en",categories:["earthquake","breaking"],pollIntervalMs:Number(process.env.USGS_POLL_INTERVAL_MS??60000),requiresLicense:false,credentialsConfigured:true}}
 async fetchLatest():Promise<RawNewsItem[]>{const response=await fetch(this.config.feedUrl!,{headers:{accept:"application/geo+json, application/json","user-agent":"NabizNewsroom/0.1 (official-public-feed)"},signal:AbortSignal.timeout(12000)});if(!response.ok)throw new Error(`usgs: HTTP ${response.status}`);const body=await response.json() as {features?:Feature[]};return(body.features??[]).filter(x=>x.properties.type==="earthquake"||!x.properties.type).map(x=>({externalId:x.id,title:x.properties.title??`M ${x.properties.mag??"?"} - ${x.properties.place??"Unknown location"}`,summary:JSON.stringify({magnitude:x.properties.mag,place:x.properties.place,status:x.properties.status,coordinates:x.geometry?.coordinates}),url:x.properties.url,publishedAt:new Date(x.properties.time).toISOString(),language:"en",raw:x}))}
 async healthCheck():Promise<SourceHealth>{const started=Date.now();try{await this.fetchLatest();return{status:"GREEN",latencyMs:Date.now()-started,lastSuccess:new Date().toISOString()}}catch(error){return{status:"RED",latencyMs:Date.now()-started,error:String(error)}}}
}
