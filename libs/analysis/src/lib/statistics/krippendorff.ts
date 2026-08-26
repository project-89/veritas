/**
 * Krippendorff's alpha for nominal data, two coders.
 *
 * The content-analysis answer to "the LLM said so" (detection-methodology
 * §3.4): treat the model as ONE CODER in a coding protocol and measure its
 * agreement with human gold labels. α = 1 is perfect agreement; α = 0 is what
 * coin-flipping over the same label distribution would produce; below 0 is
 * systematic disagreement.
 *
 * The conventional bar for drawing conclusions is α >= 0.8, with 0.667 as the
 * floor for tentative use (Krippendorff, Content Analysis). Reporting the
 * number is the point — "a coder with measured α" is an instrument, an
 * unmeasured one is an opinion.
 *
 * Chance correction is what separates this from raw accuracy: on skewed
 * label distributions (most post/technique pairs are "absent") accuracy is
 * inflated by agreement that would happen by chance. α discounts exactly
 * that, which is why a 90%-accurate coder on a 90%-skewed task can still
 * score α ≈ 0.
 */

export interface AlphaResult {
  alpha: number | null;
  /** Items where both coders supplied a value. */
  pairedItems: number;
  observedDisagreement: number | null;
  expectedDisagreement: number | null;
  insufficientReason?: string;
}

/** Below this many paired items the estimate is too unstable to report. */
const MIN_PAIRED_ITEMS = 10;

/**
 * Nominal-data α over paired labels. Items where either side is
 * null/undefined are dropped (standard treatment of missing data for the
 * two-coder case).
 */
export function krippendorffAlpha(
  pairs: ReadonlyArray<{ a: string | null | undefined; b: string | null | undefined }>,
): AlphaResult {
  const paired = pairs.filter(
    (p): p is { a: string; b: string } => p.a != null && p.b != null,
  );
  const n2 = paired.length * 2; // total values in the coincidence matrix

  if (paired.length < MIN_PAIRED_ITEMS) {
    return {
      alpha: null,
      pairedItems: paired.length,
      observedDisagreement: null,
      expectedDisagreement: null,
      insufficientReason: `need >=${MIN_PAIRED_ITEMS} paired items for a stable alpha, got ${paired.length}`,
    };
  }

  // Coincidence matrix: each item contributes both (a,b) and (b,a).
  const marginals = new Map<string, number>();
  let disagreements = 0; // Σ_{c≠k} o_ck, counted once per direction
  for (const { a, b } of paired) {
    marginals.set(a, (marginals.get(a) ?? 0) + 1);
    marginals.set(b, (marginals.get(b) ?? 0) + 1);
    if (a !== b) disagreements += 2;
  }

  const observedDisagreement = disagreements / n2;

  // Expected disagreement from the pooled label distribution.
  let sameLabelPairs = 0;
  for (const count of marginals.values()) sameLabelPairs += count * (count - 1);
  const expectedDisagreement = 1 - sameLabelPairs / (n2 * (n2 - 1));

  if (expectedDisagreement === 0) {
    // Every value identical: agreement is trivially perfect but α is
    // undefined (0/0). Report the honest edge case.
    return {
      alpha: null,
      pairedItems: paired.length,
      observedDisagreement,
      expectedDisagreement,
      insufficientReason:
        'all labels identical across both coders; alpha undefined (no variation to agree about)',
    };
  }

  return {
    alpha: 1 - observedDisagreement / expectedDisagreement,
    pairedItems: paired.length,
    observedDisagreement,
    expectedDisagreement,
  };
}
