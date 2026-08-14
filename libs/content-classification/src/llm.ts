/**
 * Focused entry point for the shared Gemini plumbing and the translation
 * layer, importable as `@veritas/content-classification/llm`.
 *
 * This exists so the analysis and ingestion libs can reach TranslationService
 * and LlmGateway WITHOUT pulling in the barrel's NLP stack (`compromise`,
 * `franc-min`, `afinn-165`). Those are ESM-only and heavy; importing the full
 * barrel just to get a translator drags them into every consumer's module
 * graph and test environment for no benefit.
 */

export type { TranslationCacheStore } from './lib/services/translation-cache.port';
export { TRANSLATION_CACHE_STORE } from './lib/services/translation-cache.port';
export type { TranslatedText, TranslationKind } from './lib/services/translation.service';
export { TRANSLATION_PROMPT_VERSION, TranslationService } from './lib/services/translation.service';
export {
  DETERMINISTIC_JSON_CONFIG,
  extractFirstJsonObject,
  parseLlmJsonObject,
  geminiChatModel,
  geminiReasoningModel,
} from './lib/services/utils/llm-config';
export type { LlmGatewayConfig, LlmRunParams } from './lib/services/utils/llm-gateway';
export type { LlmResponseCacheStore } from './lib/services/utils/llm-response-cache.port';
export { LLM_RESPONSE_CACHE_STORE } from './lib/services/utils/llm-response-cache.port';
export { LlmBudgetExceededError, LlmGateway } from './lib/services/utils/llm-gateway';
