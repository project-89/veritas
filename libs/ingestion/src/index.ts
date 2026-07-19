/**
 * This is the main entry point for the ingestion library.
 * All exports from this library should be defined here.
 */

export type { ContentClassification } from '@veritas/content-classification';
// Re-export from external packages
export {
  ContentClassificationModule,
  ContentClassificationService,
} from '@veritas/content-classification';
// RSS Feed Catalog
export {
  getAllFeeds,
  getFeedsByCategory,
  getFeedsByTier,
  getFeedsForQuery,
  type RssFeedEntry,
} from './lib/config/rss-feed-catalog';
// Controllers
export * from './lib/controllers/ingestion.controller';
// Main module
export * from './lib/ingestion.module';
// Interfaces
export * from './lib/interfaces';
export type { AnalysisJobData } from './lib/queue/analysis.processor';
// Analysis processor tokens
export {
  AnalysisProcessor,
  CLAIM_VERIFICATION_SERVICE,
  CROSS_PLATFORM_SERVICE,
  DEEP_INVESTIGATION_SERVICE,
  DOWNSTREAM_EFFECTS_SERVICE,
  GRAPH_BOT_DETECTION_SERVICE,
  PROPAGANDA_SERVICE,
  PSYCHOLOGICAL_PROFILER_SERVICE,
  SOURCE_CREDIBILITY_SERVICE,
} from './lib/queue/analysis.processor';
// Queue
export { ScanProcessor } from './lib/queue/scan.processor';
export { AlertRepository } from './lib/repositories/alert.repository';
export { AnalysisJobRepository } from './lib/repositories/analysis-job.repository';
// Embedding cache
export { EmbeddingCacheRepository, hashText } from './lib/repositories/embedding-cache.repository';
export type { GlobalEventQueryOptions } from './lib/repositories/global-event.repository';
export { GlobalEventRepository } from './lib/repositories/global-event.repository';
// Identity records
export { IdentityRecordRepository } from './lib/repositories/identity-record.repository';
export { InvestigationRepository } from './lib/repositories/investigation.repository';
// Repositories
export * from './lib/repositories/narrative-insight.repository';
// RSS cache
export { RssCacheRepository } from './lib/repositories/rss-cache.repository';
export { ScanJobRepository } from './lib/repositories/scan-job.repository';
export { SignalCacheRepository } from './lib/repositories/signal-cache.repository';
// Schemas
export * from './lib/schemas/alert.schema';
// Analysis job schema + types
export * from './lib/schemas/analysis-job.schema';
export * from './lib/schemas/embedding-cache.schema';
export * from './lib/schemas/global-event.schema';
export * from './lib/schemas/identity-record.schema';
export * from './lib/schemas/rss-cache.schema';
export * from './lib/schemas/scan-job.schema';
// Signal cache schema
export * from './lib/schemas/signal-cache.schema';
export { FourChanFreeConnector } from './lib/services/4chan-free.connector';
export { BlueskyFreeConnector } from './lib/services/bluesky-free.connector';
export { FacebookJinaConnector } from './lib/services/facebook-jina.connector';
// Services
export * from './lib/services/ingestion.service';
export * from './lib/services/web-search.service';
// API-free connectors
export { RedditFreeConnector } from './lib/services/reddit-free.connector';
// Scan progress events (SSE bus)
export type {
  AnalysisJobEvent,
  ScanProgressEvent,
  ScanStatusEvent,
} from './lib/services/scan-events.service';
export { ScanEventsService } from './lib/services/scan-events.service';
export { TelegramFreeConnector } from './lib/services/telegram-free.connector';
export * from './lib/services/transform/transform-on-ingest.service';
export { TwitterFreeConnector } from './lib/services/twitter-free.connector';
export { JinaReaderService } from './lib/services/utils/jina-reader.service';
// Utilities
export { SubprocessUtil } from './lib/services/utils/subprocess.util';
export { YouTubeFreeConnector } from './lib/services/youtube-free.connector';
export * from './types/narrative-insight.interface';
export * from './types/narrative-trend.interface';
// Types
export * from './types/social-media.types';
