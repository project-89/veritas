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

// Utilities
export { SubprocessUtil } from './lib/services/utils/subprocess.util';
export { JinaReaderService } from './lib/services/utils/jina-reader.service';

// Re-export from external packages
export {
  ContentClassificationModule,
  ContentClassificationService,
  ContentClassification,
} from '@veritas/content-classification';

// Repositories
export * from './lib/repositories/narrative-insight.repository';

// Resolvers
export * from './lib/resolvers/ingestion.resolver';

// Types
export * from './types/social-media.types';
export * from './types/narrative-insight.interface';
export * from './types/narrative-trend.interface';
