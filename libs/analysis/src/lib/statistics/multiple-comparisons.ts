/**
 * Multiple-comparison correction.
 *
 * Testing N narratives against M signals and keeping the best hit is
 * guaranteed to produce a spurious winner: the strongest apparent correlation
 * in a large set of noise draws is, by construction, the maximum of that noise.
 * This is the defect the July audit recorded as "over-detects with no base
 * rate", and it is not fixable by raising a threshold — the threshold has to
 * account for how many tests were run.
 *
 * Benjamini-Hochberg controls the False Discovery Rate: of the findings
 * reported as significant, at most q are expected to be false. That is the
 * right family-wise guarantee for exploratory intelligence work, where
 * Bonferroni's "no false positives at all" is so conservative it would suppress
 * every real signal too.
 *
 * The number of tests performed is part of the output. Hiding it makes a
 * surviving finding look stronger than it is.
 */

export interface CorrectedResult<T> {
  item: T;
  pValue: number;
  /** BH-adjusted p-value. Monotone non-decreasing in raw p, capped at 1. */
  qValue: number;
  /** Whether it survives at the requested FDR. */
  significant: boolean;
}

export interface CorrectionSummary<T> {
  results: Array<CorrectedResult<T>>;
  /** How many tests were run — part of the finding, not an implementation detail. */
  testsPerformed: number;
  significantCount: number;
  fdr: number;
}

/**
 * Apply Benjamini-Hochberg FDR correction.
 *
 * @param items each carrying its raw p-value
 * @param fdr acceptable false-discovery rate (0.05 conventional)
 */
export function benjaminiHochberg<T>(
  items: readonly { item: T; pValue: number }[],
  fdr = 0.05,
): CorrectionSummary<T> {
  const valid = items.filter((i) => Number.isFinite(i.pValue));
  const m = valid.length;

  if (m === 0) {
    return { results: [], testsPerformed: 0, significantCount: 0, fdr };
  }

  // Sort ascending by p, remembering original positions.
  const indexed = valid
    .map((entry, originalIndex) => ({ ...entry, originalIndex }))
    .sort((a, b) => a.pValue - b.pValue);

  // Adjusted p-values, computed from the largest p downward so the running
  // minimum enforces monotonicity — without it a q-value could exceed the
  // q-value of a larger raw p, which is incoherent.
  const adjusted = new Array<number>(m);
  let runningMin = 1;
  for (let i = m - 1; i >= 0; i--) {
    const rank = i + 1;
    const raw = (indexed[i] as { pValue: number }).pValue;
    runningMin = Math.min(runningMin, (m / rank) * raw);
    adjusted[i] = Math.min(1, runningMin);
  }

  // Largest rank k with p(k) <= (k/m)*fdr; everything up to k is rejected.
  let cutoffRank = 0;
  for (let i = 0; i < m; i++) {
    const rank = i + 1;
    if ((indexed[i] as { pValue: number }).pValue <= (rank / m) * fdr) cutoffRank = rank;
  }

  const results: Array<CorrectedResult<T>> = new Array(m);
  for (let i = 0; i < m; i++) {
    const entry = indexed[i] as { item: T; pValue: number; originalIndex: number };
    results[entry.originalIndex] = {
      item: entry.item,
      pValue: entry.pValue,
      qValue: adjusted[i] as number,
      significant: i + 1 <= cutoffRank,
    };
  }

  return {
    results,
    testsPerformed: m,
    significantCount: results.filter((r) => r.significant).length,
    fdr,
  };
}
