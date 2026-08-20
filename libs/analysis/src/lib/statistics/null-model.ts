/**
 * Null-model comparison — the "compared to what?" of every finding.
 *
 * A co-occurrence, a burst, a duplicate rate, a concentration score: none of
 * them mean anything on their own. Ten accounts producing 90% of posts is only
 * notable if that is unusual for a topic of this size. Two events landing three
 * days apart is only notable if events of that kind are not landing every other
 * day anyway.
 *
 * The method is empirical rather than parametric: draw many MATCHED control
 * samples (same window length, same category, periods where the thing being
 * tested was absent), measure the same statistic on each, and ask where the
 * real observation falls in that distribution. No assumption of normality,
 * which matters because event arrivals are emphatically not normal.
 *
 * Pure functions. The sampling of control windows is the caller's job — see
 * BaseRateService — so this core is testable against distributions with known
 * answers.
 */

export interface NullComparison {
  observed: number;
  /** Mean of the null distribution — the "expected" value. */
  expected: number | null;
  /**
   * Empirical p-value: share of null samples at least as extreme as observed.
   *
   * Uses (count + 1) / (n + 1) rather than count / n. A permutation test can
   * never legitimately report p = 0 — it can only say "none of my N samples
   * reached this" — and reporting 0 would overstate certainty that no amount
   * of sampling supports.
   */
  pValue: number | null;
  /**
   * Standardized effect size: (observed - mean) / stddev of the null.
   * Reported SEPARATELY from significance because with enough samples
   * everything becomes significant while remaining trivial.
   */
  effectSize: number | null;
  /** Percentile rank of the observation within the null, 0-1. */
  percentile: number | null;
  nullSampleCount: number;
  /** Set when the comparison could not be made. */
  insufficientReason?: string;
}

/**
 * Fewer null samples than this cannot support a percentile claim: with 20
 * samples the finest p-value expressible is ~0.05, so anything "significant"
 * is an artefact of the sample count.
 */
const MIN_NULL_SAMPLES = 50;

/**
 * Compare an observation against an empirical null distribution.
 *
 * @param observed the statistic measured on the real data
 * @param nullSamples the same statistic measured on matched control samples
 * @param tail which direction counts as "extreme"
 */
export function compareToNull(
  observed: number,
  nullSamples: readonly number[],
  tail: 'greater' | 'less' | 'two-sided' = 'greater',
): NullComparison {
  const samples = nullSamples.filter((s) => Number.isFinite(s));
  const n = samples.length;

  if (!Number.isFinite(observed) || n < MIN_NULL_SAMPLES) {
    return {
      observed,
      expected: null,
      pValue: null,
      effectSize: null,
      percentile: null,
      nullSampleCount: n,
      insufficientReason:
        n < MIN_NULL_SAMPLES
          ? `need >=${MIN_NULL_SAMPLES} null samples for an empirical p-value, got ${n}`
          : 'observed value is not finite',
    };
  }

  const mean = samples.reduce((a, b) => a + b, 0) / n;
  const variance = samples.reduce((sum, s) => sum + (s - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);

  let atLeastAsExtreme: number;
  if (tail === 'greater') {
    atLeastAsExtreme = samples.filter((s) => s >= observed).length;
  } else if (tail === 'less') {
    atLeastAsExtreme = samples.filter((s) => s <= observed).length;
  } else {
    const delta = Math.abs(observed - mean);
    atLeastAsExtreme = samples.filter((s) => Math.abs(s - mean) >= delta).length;
  }

  const pValue = (atLeastAsExtreme + 1) / (n + 1);
  const below = samples.filter((s) => s < observed).length;

  return {
    observed,
    expected: mean,
    pValue,
    // A null with no spread cannot standardize a difference. Null rather than
    // Infinity, which would render as a spectacular and meaningless effect.
    effectSize: stddev === 0 ? null : (observed - mean) / stddev,
    percentile: below / n,
    nullSampleCount: n,
    ...(stddev === 0
      ? { insufficientReason: 'null distribution has zero variance; effect size undefined' }
      : {}),
  };
}
