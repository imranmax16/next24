import { PostgresPublicationStore, XPublisher, type PublishRequest } from "./index";
let singleton:XPublisher|undefined;
export function getXPublishingService(){if(!singleton){const dryRun=process.env.DRY_RUN!=="false";singleton=new XPublisher(dryRun,dryRun&&!process.env.DATABASE_URL?undefined:new PostgresPublicationStore())}return singleton}
export const publishApprovedNews=(input:PublishRequest)=>getXPublishingService().publishNews(input);
export const autoPublishApprovedNews=(input:Omit<PublishRequest,"automatic">)=>{if(process.env.AUTO_PUBLISH_X!=="true")return Promise.resolve({skipped:true,reason:"AUTO_PUBLISH_X_DISABLED"} as const);return publishApprovedNews({...input,automatic:true})};
