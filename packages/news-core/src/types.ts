export type SourceTier="A"|"B"|"C"|"OFFICIAL";
export type RiskLevel="low"|"medium"|"high";
export interface RawNewsItem{externalId:string;title:string;summary?:string;url:string;publishedAt:string;language:string;raw:unknown}
export interface NewsItem extends RawNewsItem{id:string;sourceId:string;sourceName:string;sourceTier:SourceTier;sourceTrustScore:number;canonicalUrl:string;discoveredAt:string;country?:string;region?:string;category:string;entities:string[];claims:Claim[];breakingScore:number;importanceScore:number;confidenceScore:number;turkeyRelevanceScore:number;rawPayloadHash:string;storyClusterId?:string;processingStatus:string}
export interface Claim{text:string;type:string;supportingSources:string[];contradictingSources:string[];confidence:number;attributionRequired:boolean}
export interface StoryCluster{id:string;fingerprint:string;itemIds:string[];sourceIds:string[];entities:string[];firstSeenAt:string;lastSeenAt:string;published:boolean}
export interface SourceHealth{status:"GREEN"|"YELLOW"|"RED";latencyMs:number;lastSuccess?:string;error?:string}
export interface SourceConfig{id:string;name:string;enabled:boolean;sourceType:"publisher"|"wire"|"official";acquisitionMethod:"rss"|"api"|"stream"|"fixture"|"sitemap"|"scraper"|"webhook";feedUrl?:string;apiEndpoint?:string;priority:number;trustScore:number;language:string;country?:string;categories:string[];pollIntervalMs:number;requiresLicense:boolean;credentialsConfigured:boolean}
export interface PendingPost{id:string;clusterId:string;text:string;weightedCharacterCount:number;sourceIds:string[];importanceScore:number;breakingScore:number;confidenceScore:number;publishMode:"FAST"|"CONFIRM"|"MANUAL";generatedAt:string;status:string}
