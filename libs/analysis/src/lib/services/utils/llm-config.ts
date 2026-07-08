/**
 * Central LLM configuration for all analysis services.
 *
 * Model names are env-configurable so a model upgrade is one deployment
 * change, and results can be stamped with the model that produced them.
 * JSON-parsing call sites must use DETERMINISTIC_JSON_CONFIG: temperature 0
 * makes repeated runs comparable, and native JSON mode removes the
 * markdown-fence-stripping failure mode.
 */

export function geminiChatModel(): string {
  return process.env['GEMINI_CHAT_MODEL'] ?? 'gemini-2.0-flash';
}

export function geminiReasoningModel(): string {
  return process.env['GEMINI_REASONING_MODEL'] ?? 'gemini-3.1-pro-preview';
}

/** For every LLM call whose output is parsed as JSON. */
export const DETERMINISTIC_JSON_CONFIG = {
  temperature: 0,
  responseMimeType: 'application/json',
} as const;
