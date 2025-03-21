/**
 * This is the main entry point for the ingestion library.
 * All exports from this library should be defined here.
 */

// Main modules
export * from './lib/modules/ingestion.module';
export * from './lib/modules/transform-on-ingest.module';
export * from './lib/modules/narrative.module';

// Controllers
export * from './lib/controllers/narrative.controller';
export * from './lib/controllers/ingestion.controller';

// Services
export * from './lib/services/facebook.connector';
export * from './lib/services/twitter.connector';
export * from './lib/services/reddit.connector';
export * from './lib/services/social-media.service';
export * from './lib/services/transform/transform-on-ingest.service';

// Repositories
export * from './lib/repositories/narrative-insight.repository';

// Resolvers
export * from './lib/resolvers/ingestion.resolver';

// Interfaces
export * from './lib/interfaces';

// Types
export * from './lib/types/ingestion.types';
export * from './lib/types/graphql.types';

// Schemas
export * from './lib/schemas';

// Module resolution utilities
export * from './lib/modules/module-resolver';

// Mock implementations for testing
import * as Mocks from './lib/__mocks__';
export { Mocks };

// Explicit MongoDB exports to make them easier to import
export { MongoNarrativeRepository } from './lib/repositories/mongo-narrative.repository';
export {
  NarrativeInsightSchema,
  NarrativeInsightModel,
} from './lib/schemas/narrative-insight.schema';
export {
  NarrativeTrendSchema,
  NarrativeTrendModel,
} from './lib/schemas/narrative-trend.schema';
export { MongoDBModule } from './lib/modules/mongodb.module';
