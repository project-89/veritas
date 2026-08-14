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

/**
 * Parse an LLM JSON object, repairing the boundary damage gemini-3.x "thinking"
 * models produce even in JSON mode.
 *
 * Observed on real responses with `finishReason: STOP` (i.e. the model believed
 * it was done):
 *   - the outer object's closing brace simply missing: `{"stances": [ ... ]`
 *   - an EXTRA trailing brace after a complete object: `{...}}`
 *
 * Both defeat `extractFirstJsonObject`, which requires a balanced object, and
 * the failure is SILENT — the caller sees an empty result and cannot tell it
 * apart from "the model found nothing". That flakiness is intermittent, so it
 * shows up as a capability that scores 100% on one run and 68% on the next.
 *
 * Strategy: exact parse first, then a bounded repair that appends the missing
 * closers. Returns null when nothing salvageable is present — callers must
 * still treat null as "no answer", never as an empty answer.
 */
export function parseLlmJsonObject(raw: string): unknown | null {
  const exact = extractFirstJsonObject(raw);
  if (exact) {
    try {
      return JSON.parse(exact);
    } catch {
      // fall through to repair
    }
  }

  const start = raw.indexOf('{');
  if (start === -1) return null;

  // Walk the remainder tracking nesting, ignoring braces inside strings, and
  // record where the last structurally valid position was.
  let inString = false;
  let escaped = false;
  const stack: string[] = [];
  let lastGood = -1;

  for (let i = start; i < raw.length; i++) {
    const ch = raw[i] as string;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') {
      const open = stack[stack.length - 1];
      if ((ch === '}' && open === '{') || (ch === ']' && open === '[')) {
        stack.pop();
        if (stack.length === 0) lastGood = i;
      } else {
        // Unbalanced closer (the extra-brace case) — stop; what precedes it is
        // the salvageable region.
        break;
      }
    }
  }

  // Complete object already present, with trailing junk after it.
  if (lastGood !== -1) {
    try {
      return JSON.parse(raw.slice(start, lastGood + 1));
    } catch {
      return null;
    }
  }

  // Truncated: close whatever is still open, innermost first.
  if (stack.length === 0) return null;
  const closers = stack
    .reverse()
    .map((open) => (open === '{' ? '}' : ']'))
    .join('');
  // A dangling comma or half-written key would make this unparseable; trim
  // back to the last complete element before closing.
  const body = raw.slice(start).replace(/,\s*$/, '');
  try {
    return JSON.parse(body + closers);
  } catch {
    return null;
  }
}
