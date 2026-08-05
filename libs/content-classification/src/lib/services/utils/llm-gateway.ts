import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';

/**
 * Process-wide cost/concurrency governor for ALL Gemini generateContent calls
 * across the analysis, ingestion and content-classification libs. A single
 * investigation used to fan out into 100+
 * uncontrolled LLM calls; the gateway bounds that with three mechanisms:
 *
 * 1. Concurrency semaphore — a hard cap on simultaneous in-flight calls, so a
 *    burst of parallel per-user / per-narrative analyses can't stampede the API.
 * 2. In-memory response cache — identical (model + promptVersion + prompt)
 *    tuples resolve from cache instead of re-calling Gemini, deduping repeated
 *    work within and across close-together runs.
 * 3. Per-context token budget — a finite spend ceiling scoped by a caller key
 *    (e.g. an investigation topic/id). Once a context exceeds its cap, further
 *    calls throw LlmBudgetExceededError WITHOUT hitting Gemini, so a runaway
 *    investigation degrades gracefully instead of burning unbounded cost.
 *
 * Deliberately DI-free (like SourceRateLimiter in the ingestion lib) so every
 * analysis service can share one governor without module wiring.
 * `LlmGateway.instance` is the process-wide governor.
 */

/** Thrown when a context's token budget is exhausted. Callers should treat this
 * as a graceful "analysis unavailable" degradation, not a hard failure. */
export class LlmBudgetExceededError extends Error {
  constructor(
    readonly contextKey: string,
    readonly spent: number,
    readonly cap: number,
  ) {
    super(
      `LLM token budget exceeded for context "${contextKey}": ${spent} >= ${cap} tokens. ` +
        'Further LLM calls for this context are blocked.',
    );
    this.name = 'LlmBudgetExceededError';
  }
}

export interface LlmGatewayConfig {
  /** Max simultaneous in-flight generateContent calls. */
  maxConcurrency: number;
  /** Cache entry lifetime in ms. 0 disables the cache. */
  cacheTtlMs: number;
  /** Max cached entries before oldest are evicted. */
  cacheMaxEntries: number;
  /** Token ceiling per context key. */
  maxTokensPerContext: number;
  /** Idle time before a context's spend record is evicted, in ms. */
  contextTtlMs: number;
}

export interface LlmRunParams {
  model: string;
  promptVersion: number | string;
  prompt: string;
  /** Optional cost-accounting scope. Omit for one-off, budget-exempt calls. */
  contextKey?: string;
  /** Performs the actual Gemini call and returns the raw response text. */
  generate: () => Promise<string>;
}

interface CacheEntry {
  text: string;
  expiresAt: number;
}

interface ContextSpend {
  tokens: number;
  lastTouched: number;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function defaultConfig(): LlmGatewayConfig {
  const ttlMinutes = envInt('LLM_CACHE_TTL_MINUTES', 60);
  return {
    maxConcurrency: Math.max(1, envInt('LLM_MAX_CONCURRENCY', 4)),
    cacheTtlMs: ttlMinutes * 60 * 1000,
    cacheMaxEntries: 500,
    maxTokensPerContext: Math.max(1, envInt('LLM_MAX_TOKENS_PER_CONTEXT', 2_000_000)),
    contextTtlMs: 10 * 60 * 1000,
  };
}

/** Cheap, provider-agnostic token estimate: ~4 chars per token. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export class LlmGateway {
  private static _instance: LlmGateway | null = null;

  static get instance(): LlmGateway {
    if (!LlmGateway._instance) {
      LlmGateway._instance = new LlmGateway();
    }
    return LlmGateway._instance;
  }

  /** Test seam — replaces the singleton. Pass null to reset to env defaults. */
  static setInstance(gateway: LlmGateway | null): void {
    LlmGateway._instance = gateway;
  }

  private readonly logger = new Logger(LlmGateway.name);
  private readonly config: LlmGatewayConfig;

  // Concurrency semaphore
  private inFlight = 0;
  private readonly waiters: Array<() => void> = [];

  // Response cache (insertion-ordered Map → oldest-first eviction)
  private readonly cache = new Map<string, CacheEntry>();

  // Per-context token spend
  private readonly contexts = new Map<string, ContextSpend>();

  constructor(overrides?: Partial<LlmGatewayConfig>) {
    this.config = { ...defaultConfig(), ...overrides };
  }

  /**
   * Run a governed LLM call:
   * 1. Return a cached response if one exists.
   * 2. Reject (throw) if the context's token budget is already exhausted.
   * 3. Acquire a concurrency slot (queueing if all are busy).
   * 4. Invoke generate(), estimate + record token spend, cache the result.
   * 5. Release the slot.
   */
  async run(params: LlmRunParams): Promise<string> {
    const { model, promptVersion, prompt, contextKey, generate } = params;
    const key = this.cacheKey(model, promptVersion, prompt);

    // 1. Cache hit — no budget charge, no slot needed.
    const cached = this.readCache(key);
    if (cached !== null) {
      this.logger.debug(`LLM cache hit (${model}) — skipping Gemini call`);
      return cached;
    }

    // 2. Budget gate (contextless calls are exempt).
    if (contextKey !== undefined) {
      this.enforceBudget(contextKey);
    }

    // 3. Concurrency slot.
    await this.acquireSlot();
    try {
      const text = await generate();

      // 4. Record spend + cache.
      if (contextKey !== undefined) {
        this.recordSpend(contextKey, estimateTokens(prompt) + estimateTokens(text));
      }
      this.writeCache(key, text);
      return text;
    } finally {
      // 5. Release slot.
      this.releaseSlot();
    }
  }

  /** Clear a context's accumulated spend (e.g. at the start of a fresh run). */
  resetContext(contextKey: string): void {
    this.contexts.delete(contextKey);
  }

  // ---------------------------------------------------------------------------
  // Budget
  // ---------------------------------------------------------------------------

  private enforceBudget(contextKey: string): void {
    this.evictStaleContexts();
    const spend = this.contexts.get(contextKey);
    if (spend && spend.tokens >= this.config.maxTokensPerContext) {
      this.logger.warn(
        `LLM budget exhausted for context "${contextKey}" ` +
          `(${spend.tokens}/${this.config.maxTokensPerContext} tokens) — blocking further calls`,
      );
      throw new LlmBudgetExceededError(contextKey, spend.tokens, this.config.maxTokensPerContext);
    }
  }

  private recordSpend(contextKey: string, tokens: number): void {
    const existing = this.contexts.get(contextKey);
    if (existing) {
      existing.tokens += tokens;
      existing.lastTouched = Date.now();
    } else {
      this.contexts.set(contextKey, { tokens, lastTouched: Date.now() });
    }
  }

  private evictStaleContexts(): void {
    const cutoff = Date.now() - this.config.contextTtlMs;
    for (const [key, spend] of this.contexts) {
      if (spend.lastTouched < cutoff) {
        this.contexts.delete(key);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Cache
  // ---------------------------------------------------------------------------

  private cacheKey(model: string, promptVersion: number | string, prompt: string): string {
    return createHash('sha256').update(`${model}\0${promptVersion}\0${prompt}`).digest('hex');
  }

  private readCache(key: string): string | null {
    if (this.config.cacheTtlMs <= 0) return null;
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return entry.text;
  }

  private writeCache(key: string, text: string): void {
    if (this.config.cacheTtlMs <= 0) return;
    // Refresh insertion order so recently-written entries evict last.
    this.cache.delete(key);
    this.cache.set(key, { text, expiresAt: Date.now() + this.config.cacheTtlMs });
    while (this.cache.size > this.config.cacheMaxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  // ---------------------------------------------------------------------------
  // Concurrency semaphore
  // ---------------------------------------------------------------------------

  private async acquireSlot(): Promise<void> {
    if (this.inFlight < this.config.maxConcurrency) {
      this.inFlight++;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.inFlight++;
  }

  private releaseSlot(): void {
    this.inFlight--;
    const next = this.waiters.shift();
    if (next) next();
  }
}
