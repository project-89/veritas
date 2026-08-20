/**
 * Corpus statistics — the deterministic layer beneath every detector.
 *
 * These measure properties that exist in the DISTRIBUTION over a corpus and
 * are invisible in any individual item or sample: who produced it, when it
 * arrived, and whether the wording is shared. Pure functions, no I/O, no LLM.
 *
 * Each abstains (null) rather than returning a confident number computed from
 * too few observations, and each returns the evidence alongside the measure.
 *
 * See docs/development/detection-methodology.md.
 */
export { measureConcentration } from './concentration';
export type { ConcentrationResult } from './concentration';
export {
  countIndependentSources,
  findNearDuplicates,
  jaccard,
  shingles,
} from './duplication';
export type { DuplicateCluster, DuplicationResult } from './duplication';
export { measureTemporal } from './temporal';
export type { TemporalResult } from './temporal';
export { compareToNull } from './null-model';
export type { NullComparison } from './null-model';
export { benjaminiHochberg } from './multiple-comparisons';
export type { CorrectedResult, CorrectionSummary } from './multiple-comparisons';
export { BASE_RATE_STORE, BaseRateService } from './base-rate.service';
export type { ArchivedEvent, BaseRateOptions, BaseRateStore } from './base-rate.service';
