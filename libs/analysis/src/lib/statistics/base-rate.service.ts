import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { type NullComparison, compareToNull } from './null-model';

/** Injection token for the historical event source backing base rates. */
export const BASE_RATE_STORE = Symbol('BASE_RATE_STORE');

/** The slice of an archived event a base rate can condition on. */
export interface ArchivedEvent {
  eventId: string;
  timestamp: string;
  category?: string;
  severity?: string;
  source?: string;
}

/**
 * Port over the historical corpus. Implemented in the ingestion lib against
 * `global_event_archive` — ~25k no-TTL rows written for exactly this purpose.
 */
export interface BaseRateStore {
  /** Events with timestamp in [startMs, endMs), optionally filtered. */
  findInWindow(
    startMs: number,
    endMs: number,
    filter?: { category?: string; severity?: string },
  ): Promise<ArchivedEvent[]>;

  /** Oldest and newest timestamps available, so sampling stays in range. */
  timeRange(): Promise<{ earliestMs: number; latestMs: number } | null>;
}

export interface BaseRateOptions {
  /** How many matched control windows to draw. */
  samples?: number;
  /** Condition the null on the same category/severity as the observation. */
  filter?: { category?: string; severity?: string };
  /** Which direction counts as extreme. */
  tail?: 'greater' | 'less' | 'two-sided';
  /** Deterministic sampling seed, so a finding can be reproduced exactly. */
  seed?: number;
}

/** Enough draws to express a p-value finer than 0.01 without absurd cost. */
const DEFAULT_SAMPLES = 200;
/**
 * Control windows must not overlap the observation, or the "null" contains the
 * very thing being tested and the comparison is circular.
 */
const EXCLUSION_BUFFER_MS = 24 * 60 * 60 * 1000;

/**
 * Answers "compared to what?" for any statistic over a time window.
 *
 * The method is an empirical matched-window null. Given an observation made
 * over some window, draw many windows of the SAME DURATION from periods where
 * the thing under test was absent, measure the same statistic on each, and
 * report where the real observation falls in that distribution.
 *
 * Empirical rather than parametric because event arrivals are not normal — they
 * are bursty, seasonal and autocorrelated, and a z-test against an assumed
 * Gaussian would manufacture significance wherever the assumption fails.
 *
 * Deterministic by default: the sampler is seeded, so a reported finding can be
 * reproduced exactly rather than shifting on every recomputation. A finding you
 * cannot reproduce is not evidence.
 */
@Injectable()
export class BaseRateService {
  private readonly logger = new Logger(BaseRateService.name);

  constructor(@Optional() @Inject(BASE_RATE_STORE) private readonly store?: BaseRateStore) {}

  get available(): boolean {
    return this.store !== undefined;
  }

  /**
   * Compare a statistic measured over `[startMs, endMs)` against matched
   * control windows.
   *
   * @param measure computes the statistic from the events in one window. The
   *        SAME function runs on the observation and every control, which is
   *        what makes the comparison meaningful.
   */
  async compare(
    startMs: number,
    endMs: number,
    measure: (events: ArchivedEvent[]) => number,
    options: BaseRateOptions = {},
  ): Promise<NullComparison> {
    const observedWindowMs = endMs - startMs;
    const noStore: NullComparison = {
      observed: Number.NaN,
      expected: null,
      pValue: null,
      effectSize: null,
      percentile: null,
      nullSampleCount: 0,
      insufficientReason: 'no base-rate store configured; cannot establish a baseline',
    };

    if (!this.store || observedWindowMs <= 0) return noStore;

    const range = await this.store.timeRange();
    if (!range) {
      return { ...noStore, insufficientReason: 'historical corpus is empty' };
    }

    const observedEvents = await this.store.findInWindow(startMs, endMs, options.filter);
    const observed = measure(observedEvents);

    const samples = options.samples ?? DEFAULT_SAMPLES;
    const nullValues = await this.drawNullSamples(
      range,
      observedWindowMs,
      { startMs, endMs },
      measure,
      samples,
      options,
    );

    const result = compareToNull(observed, nullValues, options.tail ?? 'greater');
    this.logger.debug(
      `Base rate: observed=${observed.toFixed(3)} expected=${result.expected?.toFixed(3) ?? 'n/a'} ` +
        `p=${result.pValue?.toFixed(4) ?? 'n/a'} (${result.nullSampleCount} controls)`,
    );
    return result;
  }

  private async drawNullSamples(
    range: { earliestMs: number; latestMs: number },
    windowMs: number,
    exclude: { startMs: number; endMs: number },
    measure: (events: ArchivedEvent[]) => number,
    samples: number,
    options: BaseRateOptions,
  ): Promise<number[]> {
    const span = range.latestMs - range.earliestMs - windowMs;
    if (span <= 0) return [];

    const rand = seededRandom(options.seed ?? 1337);
    const values: number[] = [];
    // Bounded attempts: with a wide exclusion zone and a short corpus, some
    // draws land in the excluded region and must be retried rather than
    // silently reducing the sample count without saying so.
    const maxAttempts = samples * 5;

    for (let attempt = 0; attempt < maxAttempts && values.length < samples; attempt++) {
      const start = range.earliestMs + Math.floor(rand() * span);
      const end = start + windowMs;

      const overlapsObservation =
        start < exclude.endMs + EXCLUSION_BUFFER_MS &&
        end > exclude.startMs - EXCLUSION_BUFFER_MS;
      if (overlapsObservation) continue;

      const events = await this.store!.findInWindow(start, end, options.filter);
      const value = measure(events);
      if (Number.isFinite(value)) values.push(value);
    }

    if (values.length < samples) {
      this.logger.debug(
        `Base rate: drew ${values.length}/${samples} control windows — corpus span may be too ` +
          'short relative to the observation window',
      );
    }
    return values;
  }
}

/** Mulberry32 — small, fast, and deterministic given a seed. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
