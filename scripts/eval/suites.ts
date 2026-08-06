import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ContentClassificationService } from '../../libs/content-classification/src/lib/services/content-classification.service';
import { matchesQuery } from '../../libs/ingestion/src/lib/utils/query-match.util';
import type { Prediction } from './metrics';

export interface Suite {
  name: string;
  /** What a "positive" means here, so the precision/recall columns are readable. */
  positiveMeans: string;
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

export const SUITES: Suite[] = [queryRelevance, languageAbstention];
