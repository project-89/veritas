/**
 * Content Classification Module
 * This module provides content analysis and classification capabilities
 */

// Export the module for importing in app
export { ContentClassificationModule } from './lib/content-classification.module';
// Export the controller
export { ContentController } from './lib/controllers/content.controller';
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
export type { TranslatedText } from './lib/services/translation.service';
// Translation to English. Lives here rather than in the analysis lib because
// normalization has to happen at INGEST, before clustering/embedding/topic
// extraction run — and the ingestion lib cannot depend on analysis without
// deepening the existing dependency cycle.
export { TRANSLATION_PROMPT_VERSION, TranslationService } from './lib/services/translation.service';
export { TRANSLATION_CACHE_STORE } from './lib/services/translation-cache.port';
export type { TranslationCacheStore } from './lib/services/translation-cache.port';

// Shared Gemini plumbing (process-wide cost/concurrency governor + model
// config), used by both the analysis and ingestion libs.
export {
  DETERMINISTIC_JSON_CONFIG,
  extractFirstJsonObject,
  geminiChatModel,
  geminiReasoningModel,
} from './lib/services/utils/llm-config';
export type { LlmGatewayConfig, LlmRunParams } from './lib/services/utils/llm-gateway';
export { LlmBudgetExceededError, LlmGateway } from './lib/services/utils/llm-gateway';
// Export content DTO types
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
