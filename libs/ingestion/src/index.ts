/**
 * This is the main entry point for the ingestion library.
 * All exports from this library should be defined here.
 */

// Main module
export * from './lib/ingestion.module';

// Interfaces
export * from './lib/interfaces';

// Controllers
export * from './lib/controllers/ingestion.controller';

// Services
export * from './lib/services/ingestion.service';
export * from './lib/services/transform/transform-on-ingest.service';

// API-free connectors
export { RedditFreeConnector } from './lib/services/reddit-free.connector';
export { TwitterFreeConnector } from './lib/services/twitter-free.connector';
export { YouTubeFreeConnector } from './lib/services/youtube-free.connector';
export { FacebookJinaConnector } from './lib/services/facebook-jina.connector';
export { TelegramFreeConnector } from './lib/services/telegram-free.connector';
export { BlueskyFreeConnector } from './lib/services/bluesky-free.connector';
export { FourChanFreeConnector } from './lib/services/4chan-free.connector';

// Utilities
export { SubprocessUtil } from './lib/services/utils/subprocess.util';
export { JinaReaderService } from './lib/services/utils/jina-reader.service';

// Re-export from external packages
export {
  ContentClassificationModule,
  ContentClassificationService,
} from '@veritas/content-classification';
export type { ContentClassification } from '@veritas/content-classification';

// Repositories
export * from './lib/repositories/narrative-insight.repository';
export { AlertRepository } from './lib/repositories/alert.repository';
export { GlobalEventRepository } from './lib/repositories/global-event.repository';
export type { GlobalEventQueryOptions } from './lib/repositories/global-event.repository';

// Schemas
export * from './lib/schemas/alert.schema';
export * from './lib/schemas/global-event.schema';
export * from './lib/schemas/scan-job.schema';
export { InvestigationRepository } from './lib/repositories/investigation.repository';

// RSS Feed Catalog
export { getAllFeeds, getFeedsByTier, getFeedsByCategory, getFeedsForQuery, type RssFeedEntry } from './lib/config/rss-feed-catalog';
export { ScanJobRepository } from './lib/repositories/scan-job.repository';
export { SignalCacheRepository } from './lib/repositories/signal-cache.repository';
export { AnalysisJobRepository } from './lib/repositories/analysis-job.repository';

// Signal cache schema
export * from './lib/schemas/signal-cache.schema';

// Embedding cache
export { EmbeddingCacheRepository } from './lib/repositories/embedding-cache.repository';
export { hashText } from './lib/repositories/embedding-cache.repository';
export * from './lib/schemas/embedding-cache.schema';

// RSS cache
export { RssCacheRepository } from './lib/repositories/rss-cache.repository';
export * from './lib/schemas/rss-cache.schema';

// Analysis job schema + types
export * from './lib/schemas/analysis-job.schema';

// Analysis processor tokens
export {
  PROPAGANDA_SERVICE,
  CLAIM_VERIFICATION_SERVICE,
  DOWNSTREAM_EFFECTS_SERVICE,
  DEEP_INVESTIGATION_SERVICE,
  CROSS_PLATFORM_SERVICE,
  SOURCE_CREDIBILITY_SERVICE,
  GRAPH_BOT_DETECTION_SERVICE,
  PSYCHOLOGICAL_PROFILER_SERVICE,
} from './lib/queue/analysis.processor';

// Queue
export { ScanProcessor } from './lib/queue/scan.processor';
export { AnalysisProcessor } from './lib/queue/analysis.processor';

// Identity records
export { IdentityRecordRepository } from './lib/repositories/identity-record.repository';
export * from './lib/schemas/identity-record.schema';

// Resolvers
export * from './lib/resolvers/ingestion.resolver';

// Types
export * from './types/social-media.types';
export * from './types/narrative-insight.interface';
export * from './types/narrative-trend.interface';
