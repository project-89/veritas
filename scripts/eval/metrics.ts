/**
 * Binary-classification metrics for the evaluation harness.
 *
 * Deliberately dependency-free and pure so the harness itself can be unit
 * tested — a measurement tool that is silently wrong is worse than none.
 */

export interface Prediction {
  /** Stable identifier from the corpus, so failures name the exact case. */
  id: string;
  /** What the labelled corpus says the answer is. */
  expected: boolean;
  /** What the system under test actually produced. */
  actual: boolean;
  /** Human-readable description, printed for failures. */
  note?: string;
}

export interface Metrics {
  total: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  /** Of the cases we flagged, how many should have been. NaN when none flagged. */
  precision: number;
  /** Of the cases that should have been flagged, how many we caught. NaN when none exist. */
  recall: number;
  /** Harmonic mean of precision and recall. NaN when either is undefined. */
  f1: number;
  accuracy: number;
}

/**
 * Precision and recall are NaN rather than 0 when undefined (no positive
 * predictions / no positive labels). Reporting 0 there would read as "the
 * system failed" when the truth is "this corpus cannot answer that question" —
 * the same honest-abstention principle the pipeline itself follows.
 */
export function computeMetrics(predictions: Prediction[]): Metrics {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;

  for (const p of predictions) {
    if (p.expected && p.actual) tp++;
    else if (!p.expected && p.actual) fp++;
    else if (!p.expected && !p.actual) tn++;
    else fn++;
  }

  const precision = tp + fp === 0 ? Number.NaN : tp / (tp + fp);
  const recall = tp + fn === 0 ? Number.NaN : tp / (tp + fn);
  const f1 =
    Number.isNaN(precision) || Number.isNaN(recall) || precision + recall === 0
      ? Number.NaN
      : (2 * precision * recall) / (precision + recall);

  return {
    total: predictions.length,
    truePositives: tp,
    falsePositives: fp,
    trueNegatives: tn,
    falseNegatives: fn,
    precision,
    recall,
    f1,
    accuracy: predictions.length === 0 ? Number.NaN : (tp + tn) / predictions.length,
  };
}

/** Cases the system got wrong, for printing. */
export function failures(predictions: Prediction[]): Prediction[] {
  return predictions.filter((p) => p.expected !== p.actual);
}

export function formatPct(value: number): string {
  return Number.isNaN(value) ? '  n/a' : `${(value * 100).toFixed(1).padStart(5)}%`;
}
