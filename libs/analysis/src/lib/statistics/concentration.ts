/**
 * Distributional concentration measures.
 *
 * Coordination and inauthentic amplification do not show up in any individual
 * post — they show up as a skewed DISTRIBUTION. Ten accounts producing 90% of
 * the posts about a topic is a finding; the same ten posts spread across a
 * hundred accounts is a conversation. Neither is visible from reading a sample,
 * which is why this has to be computed over the whole corpus.
 *
 * Pure functions, no I/O. Every one returns the evidence alongside the number,
 * because a concentration score with no denominator is not actionable.
 */

export interface ConcentrationResult {
  /**
   * Gini coefficient, 0-1. 0 = every contributor equal, 1 = one contributor
   * produced everything. Null when there is too little data to mean anything.
   */
  gini: number | null;
  /**
   * Herfindahl-Hirschman Index, 0-1. Sum of squared shares. More sensitive to
   * a few dominant contributors than Gini is, which is the case we care about.
   */
  hhi: number | null;
  /** Contributors sorted by volume, most prolific first. */
  topContributors: Array<{ id: string; count: number; share: number }>;
  totalItems: number;
  uniqueContributors: number;
  /** Populated when the measures are null, saying what was missing. */
  insufficientReason?: string;
}

/**
 * Below this, concentration measures are noise. Three posts from two accounts
 * gives Gini 0.33 — arithmetically fine, evidentially meaningless.
 */
const MIN_ITEMS = 10;
const MIN_CONTRIBUTORS = 3;

/**
 * Measure how concentrated production is across contributors.
 *
 * @param contributorIds one entry per item (e.g. authorHandle per post), so
 *        repeats are what carry the signal.
 */
export function measureConcentration(
  contributorIds: readonly string[],
  topN = 10,
): ConcentrationResult {
  const counts = new Map<string, number>();
  for (const id of contributorIds) {
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const unique = counts.size;

  const topContributors = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([id, count]) => ({ id, count, share: total === 0 ? 0 : count / total }));

  const base = { topContributors, totalItems: total, uniqueContributors: unique };

  if (total < MIN_ITEMS || unique < MIN_CONTRIBUTORS) {
    return {
      ...base,
      gini: null,
      hhi: null,
      insufficientReason: `need >=${MIN_ITEMS} items across >=${MIN_CONTRIBUTORS} contributors, got ${total} across ${unique}`,
    };
  }

  const shares = [...counts.values()].map((c) => c / total);
  const hhi = shares.reduce((sum, s) => sum + s * s, 0);

  // Gini over the count distribution, using the standard sorted formulation.
  const sorted = [...counts.values()].sort((a, b) => a - b);
  const n = sorted.length;
  let weighted = 0;
  for (let i = 0; i < n; i++) {
    weighted += (i + 1) * (sorted[i] as number);
  }
  const gini = (2 * weighted) / (n * total) - (n + 1) / n;

  return { ...base, gini: clamp01(gini), hhi: clamp01(hhi) };
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}
