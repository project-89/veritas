import { type ConcentrationResult, measureConcentration } from './concentration';
import { type DuplicationResult, findNearDuplicates } from './duplication';
import { measureTemporal, type TemporalResult } from './temporal';

/**
 * Campaign-level signals: the deterministic Layer 1 of propaganda detection
 * (docs/development/detection-methodology.md §5.2).
 *
 * Propaganda is a CAMPAIGN property, not a text property. Repetition,
 * synchrony, source concentration and infrastructure reuse exist in the
 * distribution over ALL posts — which is why this runs on the full corpus,
 * never a sample, and why no LLM is involved. A single post can exhibit
 * rhetoric; only a corpus can exhibit a campaign.
 *
 * THRESHOLDS ARE DECLARED, NOT CALIBRATED. Each elevation cutoff below is a
 * named constant with its rationale. Burstiness has a principled reference
 * (a Poisson process sits at CV ≈ 1); the others are literature-informed
 * hand-picks awaiting calibration against labelled campaign corpora
 * (analysis-quality-plan Phase F). The output says which signals were
 * measurable, which were elevated, and why — never a bare adjective.
 */

export interface PostForSignals {
  text: string;
  authorHandle: string;
  platform: string;
  timestamp: string;
}

export interface CampaignSignal {
  /** Whether this signal could be measured on this corpus. */
  measured: boolean;
  /** Whether it exceeded its declared threshold. Meaningless if !measured. */
  elevated: boolean;
  /** Quotable, numeric statement of what was found. */
  evidence: string;
}

export interface CampaignSignalsResult {
  repetition: CampaignSignal & { detail: DuplicationResult };
  synchrony: CampaignSignal & { detail: TemporalResult };
  concentration: CampaignSignal & { detail: ConcentrationResult };
  infrastructure: CampaignSignal & {
    detail: { domains: Array<{ domain: string; count: number; share: number }>; postsWithLinks: number };
  };
  crossPlatform: CampaignSignal & {
    detail: Array<{ platform: string; firstSeen: string; count: number }>;
  };
  /** Signals that were measurable on this corpus. */
  measurableCount: number;
  /** Of those, how many were elevated. */
  elevatedCount: number;
  postCount: number;
}

// ---------------------------------------------------------------------------
// Declared thresholds — rationale inline, calibration pending (Phase F).
// ---------------------------------------------------------------------------

/** A third of a corpus being near-copies is copy-paste amplification, not chatter. */
const DUPLICATE_RATE_ELEVATED = 0.3;
/** Poisson (organic) arrival sits at CV ≈ 1; 2+ means strongly bursty. */
const BURSTINESS_ELEVATED = 2.0;
/** Half the corpus inside one hour is a spike, not a conversation. */
const PEAK_WINDOW_ELEVATED = 0.5;
/**
 * A dense hour only counts when arrivals are also at least somewhat bursty.
 * Checked against a real 28-post search corpus: CV=1.13 (squarely organic)
 * still had 54% of posts in one hour, because SEARCH RESULTS ARE
 * RECENCY-BIASED — a dense recent hour is a collection artifact, not
 * coordination. Peak share alone must not elevate an organic-rate corpus.
 */
const PEAK_REQUIRES_BURSTINESS = 1.5;
/** HHI 0.2 is the antitrust "highly concentrated" line; posts are analogous. */
const HHI_ELEVATED = 0.2;
/** One link domain carrying >60% of all links is infrastructure reuse. */
const DOMAIN_SHARE_ELEVATED = 0.6;
/** Domain analysis needs at least this many linked posts to mean anything. */
const MIN_LINKED_POSTS = 5;
/**
 * The dominant domain itself needs this many references before its share
 * means anything — 3 of 5 links is 60% by arithmetic and nothing by evidence.
 * Also from the real-data check above.
 */
const MIN_TOP_DOMAIN_REFS = 5;

const URL_RE = /https?:\/\/([^\s/$.?#].[^\s/:]*)/gi;

/** Compute all campaign signals over the FULL corpus. Pure; no I/O. */
export function measureCampaignSignals(posts: readonly PostForSignals[]): CampaignSignalsResult {
  const texts = posts.map((p) => p.text);
  const dup = findNearDuplicates(texts);
  const temporal = measureTemporal(posts.map((p) => p.timestamp));
  const conc = measureConcentration(posts.map((p) => p.authorHandle));

  // --- repetition ---
  const repMeasured = dup.duplicateRate !== null;
  const repetition = {
    measured: repMeasured,
    elevated: repMeasured && (dup.duplicateRate as number) >= DUPLICATE_RATE_ELEVATED,
    evidence: repMeasured
      ? `${Math.round((dup.duplicateRate as number) * 100)}% of ${dup.itemCount} posts are near-duplicates; largest copy-cluster spans ${dup.largestClusterSize} posts`
      : `repetition unmeasured: ${dup.insufficientReason ?? 'unknown'}`,
    detail: dup,
  };

  // --- synchrony ---
  const syncMeasured = temporal.burstiness !== null;
  const burstElevated =
    syncMeasured &&
    ((temporal.burstiness as number) >= BURSTINESS_ELEVATED ||
      ((temporal.peakWindowShare ?? 0) >= PEAK_WINDOW_ELEVATED &&
        (temporal.burstiness as number) >= PEAK_REQUIRES_BURSTINESS));
  const synchrony = {
    measured: syncMeasured,
    elevated: burstElevated,
    evidence: syncMeasured
      ? `arrival burstiness CV=${(temporal.burstiness as number).toFixed(2)} (organic ≈ 1); densest hour holds ${Math.round((temporal.peakWindowShare ?? 0) * 100)}% of posts`
      : `synchrony unmeasured: ${temporal.insufficientReason ?? 'unknown'}`,
    detail: temporal,
  };

  // --- concentration ---
  const concMeasured = conc.hhi !== null;
  const top = conc.topContributors[0];
  const concentration = {
    measured: concMeasured,
    elevated: concMeasured && (conc.hhi as number) >= HHI_ELEVATED,
    evidence: concMeasured
      ? `HHI=${(conc.hhi as number).toFixed(2)} across ${conc.uniqueContributors} accounts; top account produced ${Math.round((top?.share ?? 0) * 100)}% of posts`
      : `concentration unmeasured: ${conc.insufficientReason ?? 'unknown'}`,
    detail: conc,
  };

  // --- infrastructure (link domains extracted from text) ---
  const domainCounts = new Map<string, number>();
  let postsWithLinks = 0;
  for (const p of posts) {
    const seen = new Set<string>();
    for (const m of p.text.matchAll(URL_RE)) {
      const domain = (m[1] as string).toLowerCase();
      if (!seen.has(domain)) {
        seen.add(domain);
        domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
      }
    }
    if (seen.size > 0) postsWithLinks++;
  }
  const totalDomainRefs = [...domainCounts.values()].reduce((a, b) => a + b, 0);
  const domains = [...domainCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([domain, count]) => ({
      domain,
      count,
      share: totalDomainRefs === 0 ? 0 : count / totalDomainRefs,
    }));
  const infraMeasured = postsWithLinks >= MIN_LINKED_POSTS;
  const infrastructure = {
    measured: infraMeasured,
    elevated:
      infraMeasured &&
      (domains[0]?.share ?? 0) >= DOMAIN_SHARE_ELEVATED &&
      (domains[0]?.count ?? 0) >= MIN_TOP_DOMAIN_REFS,
    evidence: infraMeasured
      ? `${postsWithLinks} posts carry links; top domain "${domains[0]?.domain}" accounts for ${Math.round((domains[0]?.share ?? 0) * 100)}% of link references`
      : `infrastructure unmeasured: only ${postsWithLinks} posts carry links (need >=${MIN_LINKED_POSTS})`,
    detail: { domains, postsWithLinks },
  };

  // --- cross-platform propagation order (descriptive, never "elevated") ---
  const byPlatform = new Map<string, { firstSeen: number; count: number }>();
  for (const p of posts) {
    const t = Date.parse(p.timestamp);
    if (!Number.isFinite(t)) continue;
    const cur = byPlatform.get(p.platform);
    if (!cur) byPlatform.set(p.platform, { firstSeen: t, count: 1 });
    else {
      cur.count++;
      if (t < cur.firstSeen) cur.firstSeen = t;
    }
  }
  const order = [...byPlatform.entries()]
    .sort((a, b) => a[1].firstSeen - b[1].firstSeen)
    .map(([platform, v]) => ({
      platform,
      firstSeen: new Date(v.firstSeen).toISOString(),
      count: v.count,
    }));
  const crossPlatform = {
    measured: order.length >= 2,
    // Propagation order is PROVENANCE, not an anomaly — there is no sensible
    // threshold on "appeared on platform A before platform B". It informs
    // tracing, so it is reported but never counts toward elevation.
    elevated: false,
    evidence:
      order.length >= 2
        ? `appeared first on ${order[0]?.platform}, then ${order
            .slice(1)
            .map((o) => o.platform)
            .join(', ')}`
        : 'single-platform corpus; propagation order not applicable',
    detail: order,
  };

  const anomalySignals = [repetition, synchrony, concentration, infrastructure];
  return {
    repetition,
    synchrony,
    concentration,
    infrastructure,
    crossPlatform,
    measurableCount: anomalySignals.filter((s) => s.measured).length,
    elevatedCount: anomalySignals.filter((s) => s.measured && s.elevated).length,
    postCount: posts.length,
  };
}
