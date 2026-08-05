/**
 * Central LLM configuration for all analysis services.
 *
 * Model names are env-configurable so a model upgrade is one deployment
 * change, and results can be stamped with the model that produced them.
 * JSON-parsing call sites must use DETERMINISTIC_JSON_CONFIG: temperature 0
 * makes repeated runs comparable, and native JSON mode removes the
 * markdown-fence-stripping failure mode.
 */

// Chat = gemini-3.5-flash (high-volume summaries/propaganda/sentiment);
// reasoning = gemini-3.1-pro-preview (heavy: claim verification, causal
// reasoning, deep investigation). Env-overridable so a model swap is one
// deployment change.
export function geminiChatModel(): string {
  return process.env['GEMINI_CHAT_MODEL'] ?? 'gemini-3.5-flash';
}

export function geminiReasoningModel(): string {
  return process.env['GEMINI_REASONING_MODEL'] ?? 'gemini-3.1-pro-preview';
}

/** For every LLM call whose output is parsed as JSON. */
export const DETERMINISTIC_JSON_CONFIG = {
  temperature: 0,
  responseMimeType: 'application/json',
} as const;

/**
 * Extract the first COMPLETE, balanced JSON object from an LLM response.
 *
 * "Thinking" models (gemini-3.x) can append reasoning text or a second block
 * after the JSON even in JSON mode, which breaks both JSON.parse(whole) and a
 * greedy /\{[\s\S]*\}/ (the latter grabs to the last brace). This scans from
 * the first `{`, tracks string/escape state, and returns the substring at the
 * matching `}` — ignoring anything before or after.
 */
export function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
