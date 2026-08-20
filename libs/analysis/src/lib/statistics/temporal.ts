/**
 * Temporal distribution measures.
 *
 * Organic discussion of a topic arrives irregularly — people post when they
 * wake up, when they see something, when they have time. Coordinated
 * amplification arrives in bursts, or at suspiciously even intervals. Both are
 * properties of the ARRIVAL DISTRIBUTION, invisible in any single post.
 *
 * Pure functions, no I/O. Values are null when the sample is too small to
 * distinguish a pattern from chance, rather than returning a confident number
 * computed from four timestamps.
 */

export interface TemporalResult {
  /**
   * Coefficient of variation of inter-arrival gaps (stddev / mean).
   * A Poisson (memoryless, organic) process sits near 1. Substantially above 1
   * means bursty; near 0 means machine-like regularity. Null when insufficient.
   */
  burstiness: number | null;
  /**
   * Largest share of items falling inside any single window of
   * `burstWindowMs`. High values mean the corpus is dominated by one spike.
   */
  peakWindowShare: number | null;
  /** Median gap between consecutive items, in ms. */
  medianGapMs: number | null;
  /** Span from first to last item, in ms. */
  spanMs: number;
  itemCount: number;
  insufficientReason?: string;
}

/**
 * Inter-arrival statistics need enough gaps to have a distribution. With fewer
 * than this, a single outlier dominates every measure.
 */
const MIN_ITEMS = 8;

export function measureTemporal(
  timestamps: readonly (string | number | Date)[],
  burstWindowMs = 60 * 60 * 1000,
): TemporalResult {
  const times = timestamps
    .map((t) => (t instanceof Date ? t.getTime() : new Date(t).getTime()))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);

  const first = times[0];
  const last = times[times.length - 1];
  const spanMs = times.length >= 2 && first !== undefined && last !== undefined ? last - first : 0;

  if (times.length < MIN_ITEMS) {
    return {
      burstiness: null,
      peakWindowShare: null,
      medianGapMs: null,
      spanMs,
      itemCount: times.length,
      insufficientReason: `need >=${MIN_ITEMS} timestamps for an arrival distribution, got ${times.length}`,
    };
  }

  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) {
    gaps.push((times[i] as number) - (times[i - 1] as number));
  }

  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const variance = gaps.reduce((sum, g) => sum + (g - mean) ** 2, 0) / gaps.length;
  // All items at the identical timestamp: mean gap 0. That is maximal
  // synchrony, not an undefined ratio.
  const burstiness = mean === 0 ? Number.POSITIVE_INFINITY : Math.sqrt(variance) / mean;

  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const mid = Math.floor(sortedGaps.length / 2);
  const medianGapMs =
    sortedGaps.length % 2 === 0
      ? ((sortedGaps[mid - 1] as number) + (sortedGaps[mid] as number)) / 2
      : (sortedGaps[mid] as number);

  // Sliding window anchored on each item — the densest real window, not an
  // arbitrary calendar bucket that could split a burst across two buckets.
  let peak = 0;
  for (let i = 0; i < times.length; i++) {
    const windowEnd = (times[i] as number) + burstWindowMs;
    let count = 0;
    for (let j = i; j < times.length && (times[j] as number) <= windowEnd; j++) count++;
    if (count > peak) peak = count;
  }

  return {
    burstiness: Number.isFinite(burstiness) ? burstiness : null,
    peakWindowShare: peak / times.length,
    medianGapMs,
    spanMs,
    itemCount: times.length,
    ...(Number.isFinite(burstiness)
      ? {}
      : { insufficientReason: 'all items share one timestamp; gap distribution undefined' }),
  };
}
