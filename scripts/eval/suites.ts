import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ContentClassificationService } from '../../libs/content-classification/src/lib/services/content-classification.service';
import { PropagandaAnalysisService } from '../../libs/analysis/src/lib/services/propaganda.service';
import type { AnalyzedNarrative } from '../../libs/analysis/src/lib/services/narrative-analysis.service';
import type { RawPost } from '../../libs/analysis/src/lib/services/deviation.service';
import { krippendorffAlpha } from '../../libs/analysis/src/lib/statistics/krippendorff';
import { StanceService, stancesOppose } from '../../libs/analysis/src/lib/services/stance.service';
import { matchesQuery } from '../../libs/ingestion/src/lib/utils/query-match.util';
import type { Prediction } from './metrics';

export interface Suite {
  name: string;
  /** What a "positive" means here, so the precision/recall columns are readable. */
  positiveMeans: string;
  /**
   * Whether this suite can run in the current environment. LLM-backed suites
   * need an API key and are SKIPPED (not failed, and not silently passed)
   * when it is absent, so a green CI run without a key never implies the
   * LLM-dependent capabilities were verified.
   */
  available?(): boolean;
  /** Why it cannot run, shown in the report when `available()` is false. */
  unavailableReason?: string;
  run(): Promise<Prediction[]> | Prediction[];
}

function loadCorpus<T>(file: string): T[] {
  const path = join(__dirname, 'corpora', file);
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

// ---------------------------------------------------------------------------
// Query relevance
// ---------------------------------------------------------------------------

interface RelevanceCase {
  id: string;
  query: string;
  text: string;
  expected: boolean;
  note?: string;
}

/**
 * The connector-level relevance filter. This is the single highest-value thing
 * to measure: it is the ONLY defence against off-topic content reaching the
 * narrative stage (NarrativeAnalysisService.analyze never sees the query), and
 * it has broken silently twice — once by substring-matching "ai" inside
 * "blockchain", once by extracting zero terms from non-Latin queries, which
 * made matchesQuery return true for everything.
 */
const queryRelevance: Suite = {
  name: 'query-relevance',
  positiveMeans: 'post is relevant to the query',
  run() {
    return loadCorpus<RelevanceCase>('query-relevance.jsonl').map((c) => ({
      id: c.id,
      expected: c.expected,
      actual: matchesQuery(c.text, c.query),
      note: c.note,
    }));
  },
};

// ---------------------------------------------------------------------------
// Language abstention
// ---------------------------------------------------------------------------

interface AbstentionCase {
  id: string;
  text: string;
  /**
   * When present, overrides the detector so the corpus can exercise the
   * abstention RULE independently of what franc happens to say. Absent means
   * the case runs end-to-end against the real detector.
   */
  detectedLanguage?: string;
  expectAbstain: boolean;
  note?: string;
}

/**
 * Whether classification correctly ABSTAINS on text its English-only NLP stack
 * cannot handle. Both directions matter and pull against each other:
 * abstaining too eagerly silently strips topics from real English posts,
 * abstaining too rarely emits fragments like "rentiels" as topics.
 *
 * The seam is the service's own `detectLanguage` method, overridden per
 * instance. An earlier version of this harness tried to stub the `franc-min`
 * module directly — that FAILED SILENTLY (an ESM namespace is frozen, so the
 * assignment is a no-op) and the forced-misdetection cases were passing for
 * the wrong reason. Exactly the class of bug this harness exists to catch, so
 * it is worth stating plainly: measure the seam you actually control.
 */
const languageAbstention: Suite = {
  name: 'language-abstention',
  positiveMeans: 'system abstains from topic extraction',
  run() {
    const cases = loadCorpus<AbstentionCase>('language-abstention.jsonl');

    return cases.map((c) => {
      const service = new ContentClassificationService({ get: () => undefined } as never);
      if (c.detectedLanguage !== undefined) {
        // classifyLocally calls this.detectLanguage(), so an own-property
        // override on the instance is a real seam.
        (service as unknown as { detectLanguage: (t: string) => string }).detectLanguage = () =>
          c.detectedLanguage as string;
      }
      const result = (
        service as unknown as {
          classifyLocally(text: string): { topics: string[]; entities: unknown[] };
        }
      ).classifyLocally(c.text);
      const abstained = result.topics.length === 0 && result.entities.length === 0;
      return { id: c.id, expected: c.expectAbstain, actual: abstained, note: c.note };
    });
  },
};


// ---------------------------------------------------------------------------
// Stance classification (LLM-backed)
// ---------------------------------------------------------------------------

interface StanceCase {
  id: string;
  target: string;
  text: string;
  expected: 'favor' | 'against' | 'neutral' | 'unclear';
  note?: string;
}

/**
 * Does the classifier assign the labelled stance?
 *
 * Framed as binary correct/incorrect, so precision and recall collapse to
 * accuracy — which is the honest summary for a multi-class task here. The
 * value is in the failure list, which names exactly which cases it got wrong.
 *
 * The corpus is built around the sentiment/stance trap, because that is the
 * confusion the old facet heuristic fell into: an angry post can be `favor`
 * and a calm one `against`. If the classifier is really just doing sentiment,
 * those cases fail and the accuracy number will say so.
 */
const stanceClassification: Suite = {
  name: 'stance-classification',
  positiveMeans: 'classifier matched the labelled stance',
  available: () => Boolean(process.env['GEMINI_API_KEY']),
  unavailableReason: 'GEMINI_API_KEY not set — LLM stance classification not verified',
  async run(): Promise<Prediction[]> {
    const cases = loadCorpus<StanceCase>('stance.jsonl');
    const service = new StanceService({
      get: () => process.env['GEMINI_API_KEY'],
    } as never);

    // Group by target: stance is target-relative, so one call per target.
    const byTarget = new Map<string, StanceCase[]>();
    for (const c of cases) {
      const list = byTarget.get(c.target);
      if (list) list.push(c);
      else byTarget.set(c.target, [c]);
    }

    const predictions: Prediction[] = [];
    for (const [target, group] of byTarget) {
      const results = await service.classify(
        group.map((c) => c.text),
        target,
      );
      group.forEach((c, i) => {
        const got = results[i]?.stance ?? 'unclear';
        predictions.push({
          id: c.id,
          expected: true,
          actual: got === c.expected,
          note: `${c.note ?? ''} [expected ${c.expected}, got ${got}]`,
        });
      });
    }
    return predictions;
  },
};

// ---------------------------------------------------------------------------
// Stance opposition (the decision clustering actually makes)
// ---------------------------------------------------------------------------

/**
 * Whether two posts get HARD SPLIT into separate narratives.
 *
 * This is the decision that reaches the user, and it is stricter than raw
 * classification: a case can be misclassified and still split correctly (or
 * fail to split, which is the safer error). Measuring the decision rather than
 * the intermediate is what tells us whether stance-aware clustering works.
 *
 * Pairs are derived from the labelled corpus: two posts on the same target
 * should split exactly when their labels are favor-vs-against.
 */
const stanceOpposition: Suite = {
  name: 'stance-opposition',
  positiveMeans: 'the two posts should be split into separate narratives',
  available: () => Boolean(process.env['GEMINI_API_KEY']),
  unavailableReason: 'GEMINI_API_KEY not set — stance-split decisions not verified',
  async run(): Promise<Prediction[]> {
    const cases = loadCorpus<StanceCase>('stance.jsonl');
    const service = new StanceService({
      get: () => process.env['GEMINI_API_KEY'],
    } as never);

    const byTarget = new Map<string, StanceCase[]>();
    for (const c of cases) {
      const list = byTarget.get(c.target);
      if (list) list.push(c);
      else byTarget.set(c.target, [c]);
    }

    const predictions: Prediction[] = [];
    for (const [target, group] of byTarget) {
      const results = await service.classify(
        group.map((c) => c.text),
        target,
      );
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i] as StanceCase;
          const b = group[j] as StanceCase;
          const shouldSplit =
            (a.expected === 'favor' && b.expected === 'against') ||
            (a.expected === 'against' && b.expected === 'favor');
          const ra = results[i] ?? { stance: 'unclear' as const, confidence: 0 };
          const rb = results[j] ?? { stance: 'unclear' as const, confidence: 0 };
          predictions.push({
            id: `${a.id}|${b.id}`,
            expected: shouldSplit,
            actual: stancesOppose(ra, rb),
            note: `${a.expected} vs ${b.expected} on "${target}"`,
          });
        }
      }
    }
    return predictions;
  },
};


// ---------------------------------------------------------------------------
// Technique coding (LLM-as-coder, with measured reliability)
// ---------------------------------------------------------------------------

interface TechniqueCase {
  id: string;
  text: string;
  gold: string[];
  note?: string;
}

/**
 * The intercoder-reliability protocol from detection-methodology §3.4: the LLM
 * is ONE CODER, and this measures its agreement with human gold labels over
 * every (post × technique) decision — reported as Krippendorff's alpha
 * alongside the harness's P/R/F1.
 *
 * Alpha matters here because the decision matrix is heavily skewed toward
 * "absent": a coder that never labels anything scores high accuracy and
 * alpha ≈ 0. Accuracy flatters; alpha does not.
 *
 * The corpus runs through the REAL PropagandaAnalysisService — same sampler,
 * same prompt, same grounding — because the seam users get is the one worth
 * measuring (the franc-stub lesson). Engagement and timestamps are arranged so
 * the 4+4+4 stratified sampler provably selects all 12 posts.
 */
const techniqueCoding: Suite = {
  name: 'technique-coding',
  positiveMeans: 'technique present in post (per post × technique decision)',
  available: () => Boolean(process.env['GEMINI_API_KEY']),
  unavailableReason: 'GEMINI_API_KEY not set — LLM technique coding not verified',
  async run(): Promise<Prediction[]> {
    const cases = loadCorpus<TechniqueCase>('techniques.jsonl');
    const base = Date.UTC(2026, 5, 1, 12, 0, 0);

    const posts: RawPost[] = cases.map((c, i) => ({
      id: `post-${i}`,
      text: c.text,
      platform: 'twitter',
      authorName: `Author ${i}`,
      authorHandle: `author${i}`,
      // Posts 4-7 newest so they fill the recency stratum; 0-3 take the
      // engagement stratum below; 8-11 are the exact remainder.
      timestamp: new Date(
        base + (i >= 4 && i <= 7 ? 1000 * 60 * 60 : 0) + i * 60_000,
      ).toISOString(),
      engagement: { likes: i <= 3 ? 100 - i : 0, shares: 0, comments: 0 },
    }));

    const narrative = {
      id: 'technique-eval-n0',
      summary: 'Debate over the fictional Valley City reservoir ordinance',
      postIndices: posts.map((_, i) => i),
      avgSentiment: 0,
      sentimentTrajectory: [],
      platforms: { twitter: posts.length },
      authors: [],
      firstSeen: posts[0]?.timestamp ?? new Date(base).toISOString(),
      lastSeen: posts[posts.length - 1]?.timestamp ?? new Date(base).toISOString(),
      totalEngagement: 0,
      velocity: { postsPerHour: 0, trend: 'stable', acceleration: 0 },
      centroidEmbedding: [],
      supportLevel: 'clustered',
    } as unknown as AnalyzedNarrative;

    const service = new PropagandaAnalysisService({
      get: () => process.env['GEMINI_API_KEY'],
    } as never);
    const result = await service.analyze([narrative], posts);

    if (result.analysisMode !== 'llm') {
      // Coder did not run — report every gold decision as failed rather than
      // silently passing, and say why.
      return cases.map((c) => ({
        id: c.id,
        expected: true,
        actual: false,
        note: `coder did not run: ${result.analysisModeReason ?? result.analysisMode}`,
      }));
    }

    // Model's per-post assignments, from grounded post refs (tags are P<index>).
    const assigned = new Map<number, Set<string>>();
    for (const t of result.techniques) {
      for (const ref of t.postRefs) {
        const idx = Number(ref.replace(/^P/i, ''));
        if (!Number.isInteger(idx)) continue;
        const set = assigned.get(idx) ?? new Set<string>();
        set.add(t.id);
        assigned.set(idx, set);
      }
    }

    // Evaluate over the techniques the gold corpus actually uses.
    const evaluated = [...new Set(cases.flatMap((c) => c.gold))].sort();
    const predictions: Prediction[] = [];
    const pairs: Array<{ a: string; b: string }> = [];
    cases.forEach((c, i) => {
      for (const tech of evaluated) {
        const expected = c.gold.includes(tech);
        const actual = assigned.get(i)?.has(tech) ?? false;
        pairs.push({ a: String(expected), b: String(actual) });
        predictions.push({
          id: `${c.id}:${tech}`,
          expected,
          actual,
          note: c.note ?? '',
        });
      }
    });

    const alpha = krippendorffAlpha(pairs);
    console.log(
      `  technique-coding intercoder reliability: alpha=${
        alpha.alpha === null ? `n/a (${alpha.insufficientReason})` : alpha.alpha.toFixed(3)
      } over ${alpha.pairedItems} decisions ` +
        '(>=0.8 conclusive, >=0.667 tentative — Krippendorff)',
    );

    return predictions;
  },
};

export const SUITES: Suite[] = [
  queryRelevance,
  languageAbstention,
  stanceClassification,
  stanceOpposition,
  techniqueCoding,
];
