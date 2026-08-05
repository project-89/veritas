/**
 * Optional persistence port for translated text.
 *
 * `TranslationService` keeps a bounded in-memory LRU, which is enough within a
 * process but loses everything on restart — and translations are both
 * deterministic and paid-for, so re-buying them after every deploy is pure
 * waste.
 *
 * This is a PORT rather than a concrete repository so the content-classification
 * lib does not take on a database dependency it otherwise does not need. The
 * implementation lives in the ingestion lib, where `DatabaseService` is already
 * wired; when nothing provides it, TranslationService silently falls back to
 * in-memory only.
 */
export interface TranslationCacheStore {
  /** Returns the cached English text for a key, or null on miss. */
  get(key: string): Promise<string | null>;

  /** Persists a translation. Implementations should not throw on failure. */
  set(key: string, value: string): Promise<void>;
}

/** DI token for {@link TranslationCacheStore}. */
export const TRANSLATION_CACHE_STORE = Symbol('TRANSLATION_CACHE_STORE');
