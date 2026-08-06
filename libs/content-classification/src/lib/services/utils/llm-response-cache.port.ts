/**
 * Optional durable backing for {@link LlmGateway}'s response cache.
 *
 * The gateway's in-memory cache holds 500 entries with a 60-minute TTL and
 * dies with the process. Since it fronts EVERY Gemini call site — propaganda
 * analysis, claim verification, causal reasoning, downstream effects,
 * narrative summaries, investigations, translation — a restart or deploy
 * means re-buying all of it. LLM calls are the most expensive thing this
 * system does, and they are deterministic: temperature is 0 and every prompt
 * is stamped with a model + promptVersion, so an identical key genuinely has
 * an identical answer.
 *
 * A PORT rather than a repository because content-classification takes no
 * database dependency, and because `LlmGateway` is deliberately DI-free (a
 * process-wide singleton every service shares without module wiring) — it
 * cannot receive an injected repository. The implementation lives in the
 * ingestion lib and is attached once at bootstrap via
 * `LlmGateway.instance.setPersistentCache(...)`.
 *
 * Implementations must never throw: a cache that is down has to slow the
 * pipeline, never break it.
 */
export interface LlmResponseCacheStore {
  /** Cached response text for a key, or null on miss. */
  get(key: string): Promise<string | null>;

  /** Persist a response. Failures must be swallowed, not propagated. */
  set(key: string, value: string): Promise<void>;
}

/** DI token for {@link LlmResponseCacheStore}. */
export const LLM_RESPONSE_CACHE_STORE = Symbol('LLM_RESPONSE_CACHE_STORE');
