import { Logger } from '@nestjs/common';

/**
 * Process-wide, per-platform rate limiter for ALL outbound requests to
 * external data sources.
 *
 * Guarantees per platform:
 * - at most `maxConcurrent` requests in flight
 * - request starts spaced by at least `minIntervalMs` (+ small jitter)
 * - honors server-signaled cooldowns (429 / Retry-After) via
 *   `notifyRateLimited()`, pausing the whole platform, not just one caller
 *
 * Connectors must route every outbound HTTP/subprocess call through
 * `schedule()`. The limiter is deliberately DI-free so it can be shared by
 * connectors, queue processors, and evidence adapters without module wiring;
 * `SourceRateLimiter.instance` is the process-wide limiter.
 */

export interface PlatformRateConfig {
  /** Minimum ms between request starts. */
  minIntervalMs: number;
  /** Max requests in flight simultaneously. */
  maxConcurrent: number;
}

interface PlatformState {
  config: PlatformRateConfig;
  inFlight: number;
  nextAllowedAt: number;
  /** Server-signaled cooldown (429 etc.) — no requests until this time. */
  cooldownUntil: number;
  queue: Array<() => void>;
}

const DEFAULT_CONFIG: PlatformRateConfig = { minIntervalMs: 1000, maxConcurrent: 2 };

/**
 * Conservative defaults per source. Tighter than the sources' hard limits so
 * Veritas stays a polite citizen even with several scans queued.
 */
const PLATFORM_DEFAULTS: Record<string, PlatformRateConfig> = {
  reddit: { minIntervalMs: 2000, maxConcurrent: 1 }, // ~30 req/min public JSON API
  twitter: { minIntervalMs: 1500, maxConcurrent: 1 }, // scraper — be gentle
  bluesky: { minIntervalMs: 350, maxConcurrent: 2 }, // generous public AT proto API
  youtube: { minIntervalMs: 1000, maxConcurrent: 2 }, // yt-dlp subprocesses
  telegram: { minIntervalMs: 1000, maxConcurrent: 2 }, // t.me web preview scraping
  farcaster: { minIntervalMs: 600, maxConcurrent: 2 }, // Neynar free tier
  '4chan': { minIntervalMs: 1100, maxConcurrent: 1 }, // API ToS: max 1 req/s
  rss: { minIntervalMs: 100, maxConcurrent: 10 }, // many distinct hosts
  facebook: { minIntervalMs: 2000, maxConcurrent: 1 }, // Jina reader
  truthsocial: { minIntervalMs: 2000, maxConcurrent: 1 },
  wikipedia: { minIntervalMs: 300, maxConcurrent: 2 },
  web: { minIntervalMs: 1000, maxConcurrent: 2 },
  gdelt: { minIntervalMs: 5500, maxConcurrent: 1 }, // GDELT DOC API: max 1 req / 5s
};

const ENV_OVERRIDE_VAR = 'SOURCE_RATE_LIMITS';

export class SourceRateLimiter {
  private static _instance: SourceRateLimiter | null = null;

  static get instance(): SourceRateLimiter {
    if (!SourceRateLimiter._instance) {
      SourceRateLimiter._instance = new SourceRateLimiter();
    }
    return SourceRateLimiter._instance;
  }

  /** Test hook — replaces the singleton (pass null to reset to defaults). */
  static setInstance(limiter: SourceRateLimiter | null): void {
    SourceRateLimiter._instance = limiter;
  }

  private readonly logger = new Logger(SourceRateLimiter.name);
  private readonly platforms = new Map<string, PlatformState>();
  private readonly overrides: Record<string, Partial<PlatformRateConfig>>;

  constructor(overrides?: Record<string, Partial<PlatformRateConfig>>) {
    this.overrides = overrides ?? SourceRateLimiter.parseEnvOverrides();
  }

  /**
   * Run `fn` when the platform has a free slot and its interval has elapsed.
   * All outbound source requests go through here.
   */
  async schedule<T>(platform: string, fn: () => Promise<T>): Promise<T> {
    const state = this.getState(platform);
    await this.acquire(state);
    try {
      return await fn();
    } finally {
      this.release(state);
    }
  }

  /**
   * Signal that the source told us to back off (HTTP 429 / Retry-After).
   * Pauses ALL requests to the platform, not just the caller's.
   */
  notifyRateLimited(platform: string, retryAfterMs?: number): void {
    const state = this.getState(platform);
    const cooldown = Math.min(
      Math.max(retryAfterMs ?? state.config.minIntervalMs * 10, 1000),
      10 * 60 * 1000,
    );
    const until = Date.now() + cooldown;
    if (until > state.cooldownUntil) {
      state.cooldownUntil = until;
      this.logger.warn(
        `${platform} signaled rate limiting — cooling down for ${Math.round(cooldown / 1000)}s`,
      );
    }
  }

  /** Extract Retry-After (seconds or HTTP date) from a response, in ms. */
  static retryAfterMsFrom(headers: { get(name: string): string | null }): number | undefined {
    const raw = headers.get('retry-after');
    if (!raw) return undefined;
    const seconds = Number(raw);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(raw);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
    return undefined;
  }

  getConfig(platform: string): PlatformRateConfig {
    return this.getState(platform).config;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private getState(platform: string): PlatformState {
    const key = platform.toLowerCase();
    let state = this.platforms.get(key);
    if (!state) {
      const base = PLATFORM_DEFAULTS[key] ?? DEFAULT_CONFIG;
      const override = this.overrides[key] ?? {};
      state = {
        config: { ...base, ...override },
        inFlight: 0,
        nextAllowedAt: 0,
        cooldownUntil: 0,
        queue: [],
      };
      this.platforms.set(key, state);
    }
    return state;
  }

  private async acquire(state: PlatformState): Promise<void> {
    // Wait until a concurrency slot is free.
    while (state.inFlight >= state.config.maxConcurrent) {
      await new Promise<void>((resolve) => state.queue.push(resolve));
    }
    state.inFlight++;

    // Wait out the pacing interval and any server-signaled cooldown.
    // Jitter (0–25% of the interval) prevents thundering-herd alignment.
    for (;;) {
      const now = Date.now();
      const waitUntil = Math.max(state.nextAllowedAt, state.cooldownUntil);
      if (waitUntil <= now) break;
      await sleep(waitUntil - now);
    }
    const jitter = Math.random() * state.config.minIntervalMs * 0.25;
    state.nextAllowedAt = Date.now() + state.config.minIntervalMs + jitter;
  }

  private release(state: PlatformState): void {
    state.inFlight--;
    const next = state.queue.shift();
    if (next) next();
  }

  private static parseEnvOverrides(): Record<string, Partial<PlatformRateConfig>> {
    const raw = process.env[ENV_OVERRIDE_VAR];
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as Record<string, Partial<PlatformRateConfig>>;
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      new Logger(SourceRateLimiter.name).warn(
        `Ignoring malformed ${ENV_OVERRIDE_VAR} env var (expected JSON object)`,
      );
      return {};
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
