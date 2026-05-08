/**
 * Content Classification Module
 * This module provides content analysis and classification capabilities
 */

// Export the module for importing in app
export { ContentClassificationModule } from './lib/content-classification.module';
// Export the controller
export { ContentController } from './lib/controllers/content.controller';
// Export the resolver
export { ContentResolver } from './lib/resolvers/content.resolver';
export type { ContentSearchParams, ExtendedContentNode } from './lib/services/content.service';
// Export ContentService
export { ContentService } from './lib/services/content.service';
export type { ContentClassification } from './lib/services/content-classification.service';
// Export the service and interfaces for direct use
export { ContentClassificationService } from './lib/services/content-classification.service';
export type {
  ContentCreateInput,
  ContentUpdateInput,
} from './lib/services/content-validation.service';
// Export ContentValidationService
export { ContentValidationService } from './lib/services/content-validation.service';
export type {
  EmbeddingVector,
  VectorSearchOptions,
  VectorSearchResult,
} from './lib/services/embeddings.service';
// Export EmbeddingsService
export { EmbeddingsService } from './lib/services/embeddings.service';

// Export GraphQL types
export {
  ContentClassificationType,
  ContentCreateInputType,
  ContentSearchParamsType,
  ContentType,
  ContentUpdateInputType,
  EngagementMetricsType,
  EntityType,
  SemanticSearchParamsType,
  SimilarContentResultType,
} from './lib/types/content.types';
