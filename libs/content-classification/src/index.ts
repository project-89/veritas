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
  DatabaseService,
  ExtendedContentNode,
} from './lib/services/content.service';

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
  EngagementMetricsType,
  ContentClassificationType,
  EntityType,
} from './lib/types/content.types';
