/**
 * Content Classification Module
 * This module provides content analysis and classification capabilities
 */

// Export the module for importing in app
export { ContentClassificationModule } from './lib/content-classification.module';

// Export the service and interfaces for direct use
export {
  ContentClassificationService,
  ContentClassification,
} from './lib/services/content-classification.service';

// Export ContentValidationService
export {
  ContentValidationService,
  ContentCreateInput,
  ContentUpdateInput,
} from './lib/services/content-validation.service';

// Export ContentService
export {
  ContentService,
  ContentSearchParams,
  ExtendedContentNode,
} from './lib/services/content.service';

// Export EmbeddingsService
export {
  EmbeddingsService,
  EmbeddingVector,
  VectorSearchResult,
  VectorSearchOptions,
} from './lib/services/embeddings.service';

// Export the controller
export { ContentController } from './lib/controllers/content.controller';

// Export the resolver
export { ContentResolver } from './lib/resolvers/content.resolver';

// Export GraphQL types
export {
  ContentType,
  ContentCreateInputType,
  ContentUpdateInputType,
  ContentSearchParamsType,
  SemanticSearchParamsType,
  SimilarContentResultType,
  EngagementMetricsType,
  ContentClassificationType,
  EntityType,
} from './lib/types/content.types';
