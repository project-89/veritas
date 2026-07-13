import { GoogleGenerativeAI } from '@google/generative-ai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RawPost } from './deviation.service';
import type { AnalyzedNarrative } from './narrative-analysis.service';
import {
  DETERMINISTIC_JSON_CONFIG,
  extractFirstJsonObject,
  geminiChatModel,
} from './utils/llm-config';
import { LlmBudgetExceededError, LlmGateway } from './utils/llm-gateway';

// ---------------------------------------------------------------------------
// Versioning
// ---------------------------------------------------------------------------

/**
 * Bump whenever the prompt, taxonomy, sampling, or grounding logic changes in
 * a way that makes results non-comparable with earlier runs.
 *
 * v2: SemEval-2020 Task 11 taxonomy, stratified sampling, span-evidence
 *     grounding check, confidence rubric, coordination indicators split out.
 */
export const PROPAGANDA_PROMPT_VERSION = 2;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PropagandaTechnique {
  id: string;
  name: string;
  description: string;
  confidence: number;
  /** Verbatim quotes from the sampled posts, verified to exist in the input. */
  examples: string[];
  /** Post tags (e.g. "P3") the grounded examples were found in. */
  postRefs: string[];
  /** Number of examples that survived the grounding check. */
  groundedExampleCount: number;
  educationalNote: string;
}

export interface ExtractedClaim {
  claim: string;
  type: 'factual' | 'interpretive' | 'predictive' | 'normative';
  sources: string[];
  firstSeen: string;
  frequency: number;
  verifiability: 'verifiable' | 'subjective' | 'unfalsifiable';
}

export interface NarrativeFrame {
  frame: string;
  description: string;
  narrativeIds: string[];
  emotionalAppeal: string;
}

/**
 * How an analysis result was produced. 'unavailable' means NO analysis ran —
 * consumers must render this as "analysis unavailable", never as a clean
 * "nothing detected" finding.
 */
export type AnalysisMode = 'llm' | 'heuristic' | 'skipped' | 'unavailable';

export interface PropagandaAnalysisResult {
  analysisMode: AnalysisMode;
  analysisModeReason?: string;
  /** Per-text rhetorical techniques (SemEval-2020 Task 11 taxonomy). */
  techniques: PropagandaTechnique[];
  /** Network-level coordination signals — distinct from per-text rhetoric. */
  coordinationIndicators: PropagandaTechnique[];
  claims: ExtractedClaim[];
  frames: NarrativeFrame[];
  overallAssessment: {
    manipulationLikelihood: 'low' | 'medium' | 'high';
    confidence: number;
    reasoning: string;
    caveats: string[];
  };
  /** Prompt/method version that produced this result. */
  promptVersion: number;
  /** Model configured for this run (stamped even on empty results). */
  model: string;
}

// ---------------------------------------------------------------------------
// Technique taxonomy — SemEval-2020 Task 11 (Da San Martino et al.)
// ---------------------------------------------------------------------------

interface TechniqueDefinition {
  id: string;
  name: string;
  definition: string;
}

const TECHNIQUE_CATALOG: readonly TechniqueDefinition[] = [
  {
    id: 'loaded-language',
    name: 'Loaded Language',
    definition:
      'Words or phrases with strong emotional connotations chosen to influence the audience beyond their literal meaning.',
  },
  {
    id: 'name-calling-labeling',
    name: 'Name Calling / Labeling',
    definition:
      'Attaching a praising or insulting label to a person, group, or idea so the audience judges the label instead of the evidence.',
  },
  {
    id: 'repetition',
    name: 'Repetition',
    definition:
      'Repeating the same message, phrase, or claim so familiarity substitutes for proof.',
  },
  {
    id: 'exaggeration-minimisation',
    name: 'Exaggeration / Minimisation',
    definition:
      'Representing something as far better/worse or far more/less important than the evidence supports.',
  },
  {
    id: 'doubt',
    name: 'Doubt',
    definition:
      'Questioning the credibility of a person, institution, or source without engaging its actual claims.',
  },
  {
    id: 'appeal-to-fear-prejudice',
    name: 'Appeal to Fear / Prejudice',
    definition:
      'Building support by instilling anxiety, panic, or prejudice toward an alternative or a group.',
  },
  {
    id: 'flag-waving',
    name: 'Flag-Waving',
    definition:
      'Justifying a position by appeal to group identity — nation, movement, community — rather than to its merits.',
  },
  {
    id: 'causal-oversimplification',
    name: 'Causal Oversimplification',
    definition:
      'Assuming a single cause for a complex outcome, or blaming one actor for a multi-cause problem.',
  },
  {
    id: 'slogans',
    name: 'Slogans',
    definition:
      'Brief, striking phrases that package an argument as a memorable chant rather than a reasoned claim.',
  },
  {
    id: 'appeal-to-authority',
    name: 'Appeal to Authority',
    definition:
      'Treating a claim as settled because an authority or expert endorsed it, without supporting evidence.',
  },
  {
    id: 'black-and-white-fallacy',
    name: 'Black-and-White Fallacy / Dictatorship',
    definition:
      'Presenting exactly two options (or only one acceptable course of action) when more exist.',
  },
  {
    id: 'thought-terminating-cliche',
    name: 'Thought-Terminating Cliché',
    definition:
      'Short generic phrases ("it is what it is", "wake up") deployed to shut down critical thought or dissent.',
  },
  {
    id: 'whataboutism-strawman-redherring',
    name: 'Whataboutism / Straw Man / Red Herring',
    definition:
      "Deflecting a charge by accusing the accuser, misrepresenting an opponent's position, or diverting to an irrelevant topic.",
  },
  {
    id: 'bandwagon-reductio-ad-hitlerum',
    name: 'Bandwagon / Reductio ad Hitlerum',
    definition:
      'Urging agreement because "everyone" agrees, or dismissing an idea by associating it with a despised group.',
  },
] as const;

/**
 * Network-level coordination signals. These are NOT per-text rhetorical
 * techniques — they describe how content is distributed, not how it is
 * worded — so they are reported separately in `coordinationIndicators`.
 */
const COORDINATION_INDICATOR_CATALOG: readonly TechniqueDefinition[] = [
  {
    id: 'astroturfing-indicators',
    name: 'Astroturfing Indicators',
    definition:
      'Signs that seemingly grassroots posts are centrally produced: identical or near-identical phrasing across unrelated accounts, template-like structure, synchronized posting.',
  },
  {
    id: 'manufactured-consensus',
    name: 'Manufactured Consensus',
    definition:
      'Signs of an artificially inflated impression of agreement: many accounts asserting the same conclusion in the same words, engagement patterns inconsistent with organic spread.',
  },
] as const;

// ---------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------

const MAX_POSTS_PER_NARRATIVE = 12;
const STRATUM_SIZE = 4;
const EXCERPT_CHARS = 500;

/** A post selected for the prompt, with its stable prompt tag (e.g. "P3"). */
interface SampledPost {
  tag: string;
  postIndex: number;
  post: RawPost;
  normalizedText: string;
}

/** FNV-1a hash — deterministic seed from a narrative id. */
function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mulberry32 PRNG — small, fast, deterministic for a given seed. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class PropagandaAnalysisService {
  private readonly logger = new Logger(PropagandaAnalysisService.name);
  private readonly genAI: GoogleGenerativeAI | null = null;
  private readonly chatModel: string = geminiChatModel();

  constructor(private readonly configService: ConfigService) {
    const geminiKey =
      this.configService.get<string>('GEMINI_API_KEY') || process.env['GEMINI_API_KEY'];

    if (geminiKey) {
      this.genAI = new GoogleGenerativeAI(geminiKey);
      this.logger.log('PropagandaAnalysisService initialized with Gemini');
    } else {
      this.logger.warn('GEMINI_API_KEY not set -- propaganda analysis will return empty results');
    }
  }

  /**
   * Analyze narratives and their source posts for propaganda techniques,
   * coordination indicators, extractable claims, and framing patterns.
   */
  async analyze(
    narratives: AnalyzedNarrative[],
    posts: RawPost[],
  ): Promise<PropagandaAnalysisResult> {
    if (narratives.length === 0) {
      return this.emptyResult('skipped', 'No narratives to analyze.');
    }

    if (!this.genAI) {
      this.logger.warn('No Gemini key -- propaganda analysis unavailable');
      return this.emptyResult(
        'unavailable',
        'GEMINI_API_KEY is not configured — propaganda analysis did not run.',
      );
    }

    const model = this.genAI.getGenerativeModel({
      model: this.chatModel,
      generationConfig: DETERMINISTIC_JSON_CONFIG,
    });

    // Stratified, deterministic sample of posts per narrative, each tagged
    // with a stable reference the model must cite in its evidence.
    // Minimum-text floor: drop only genuinely trivial narratives (a stray word
    // or two). Kept intentionally LOW — propaganda techniques (name-calling,
    // loaded language, fear appeals) routinely appear in short punchy posts, so
    // a high floor would suppress exactly what we want to catch.
    const MIN_TEXT_CHARS = 40;
    const sampledByNarrative = narratives
      .map((n) => ({
        narrative: n,
        sampled: this.sampleNarrativePosts(n, posts),
      }))
      .filter(
        ({ sampled }) =>
          sampled.reduce((sum, s) => sum + s.normalizedText.length, 0) >= MIN_TEXT_CHARS,
      );

    if (sampledByNarrative.length === 0) {
      return this.emptyResult(
        'skipped',
        'Insufficient text to assess — narratives had too few characters for reliable propaganda-technique detection.',
      );
    }

    // Global dedup: the same post may back multiple narratives, but it needs
    // exactly one tag for grounding.
    const allSampled = new Map<number, SampledPost>();
    for (const { sampled } of sampledByNarrative) {
      for (const s of sampled) {
        if (!allSampled.has(s.postIndex)) allSampled.set(s.postIndex, s);
      }
    }
    const sampledPosts = [...allSampled.values()];

    const prompt = this.buildPrompt(sampledByNarrative);

    try {
      const responseText = await LlmGateway.instance.run({
        model: this.chatModel,
        promptVersion: PROPAGANDA_PROMPT_VERSION,
        prompt,
        generate: () => model.generateContent(prompt).then((r) => r.response.text()),
      });
      return this.parseResponse(responseText, sampledPosts);
    } catch (err) {
      if (err instanceof LlmBudgetExceededError) {
        this.logger.warn(`Propaganda analysis skipped — ${err.message}`);
        return this.emptyResult(
          'unavailable',
          'LLM token budget for this run was exhausted — propaganda analysis did not run.',
        );
      }
      this.logger.error(`Propaganda analysis LLM call failed: ${err}`);
      return this.emptyResult('unavailable', 'LLM call failed — propaganda analysis did not run.');
    }
  }

  // ---------------------------------------------------------------------------
  // Stratified sampling
  // ---------------------------------------------------------------------------

  /**
   * Select up to 12 posts per narrative: top 4 by engagement, 4 most recent,
   * and 4 seeded-random picks from the remainder (seed derived from the
   * narrative id, so runs are reproducible). Deduped by post index.
   */
  private sampleNarrativePosts(narrative: AnalyzedNarrative, posts: RawPost[]): SampledPost[] {
    const valid = narrative.postIndices.filter((idx) => posts[idx] !== undefined);

    const engagementOf = (idx: number): number => {
      const e = posts[idx]?.engagement;
      return (e?.likes ?? 0) + (e?.shares ?? 0) + (e?.comments ?? 0);
    };
    const timestampOf = (idx: number): number => {
      const t = Date.parse(posts[idx]?.timestamp ?? '');
      return Number.isNaN(t) ? 0 : t;
    };

    const selected = new Set<number>();

    // Stratum 1: top engagement (index tiebreak keeps ordering deterministic)
    const byEngagement = [...valid].sort((a, b) => engagementOf(b) - engagementOf(a) || a - b);
    for (const idx of byEngagement.slice(0, STRATUM_SIZE)) selected.add(idx);

    // Stratum 2: most recent
    const byRecency = [...valid].sort((a, b) => timestampOf(b) - timestampOf(a) || a - b);
    for (const idx of byRecency.slice(0, STRATUM_SIZE)) selected.add(idx);

    // Stratum 3: seeded-random picks from the remainder
    const remainder = valid.filter((idx) => !selected.has(idx));
    const rng = mulberry32(hashSeed(narrative.id));
    for (let i = remainder.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const a = remainder[i] as number;
      remainder[i] = remainder[j] as number;
      remainder[j] = a;
    }
    for (const idx of remainder.slice(0, STRATUM_SIZE)) selected.add(idx);

    return [...selected]
      .sort((a, b) => a - b)
      .slice(0, MAX_POSTS_PER_NARRATIVE)
      .flatMap((idx) => {
        const post = posts[idx];
        if (!post) return [];
        return [
          {
            tag: `P${idx}`,
            postIndex: idx,
            post,
            normalizedText: this.normalizeForMatch(post.text),
          },
        ];
      });
  }

  // ---------------------------------------------------------------------------
  // Prompt
  // ---------------------------------------------------------------------------

  private buildPrompt(
    sections: { narrative: AnalyzedNarrative; sampled: SampledPost[] }[],
  ): string {
    const narrativeSections = sections.map(({ narrative: n, sampled }) => {
      const samplePosts = sampled
        .map(
          (s) =>
            `  [${s.tag}] @${s.post.authorHandle || s.post.authorName}: ${s.post.text.slice(0, EXCERPT_CHARS)}`,
        )
        .join('\n');

      return `[Narrative "${n.id}": "${n.summary}" | ${n.postIndices.length} posts total, ${sampled.length} sampled | sentiment: ${n.avgSentiment.toFixed(2)} | velocity: ${n.velocity.trend}]
${samplePosts}`;
    });

    const techniqueList = TECHNIQUE_CATALOG.map(
      (t) => `- ${t.id} ("${t.name}"): ${t.definition}`,
    ).join('\n');
    const coordinationList = COORDINATION_INDICATOR_CATALOG.map(
      (t) => `- ${t.id} ("${t.name}"): ${t.definition}`,
    ).join('\n');

    return `You are an expert in communication analysis and rhetoric. Analyze the following narrative clusters and their sampled social media posts for the presence of propaganda techniques (SemEval-2020 Task 11 taxonomy) and coordination indicators.

IMPORTANT PRINCIPLES:
- Follow evidence-first analysis: describe patterns you observe, do not label content as left/right or good/bad.
- Distinguish between intentional manipulation and organic emotional expression.
- A technique being present does not mean the underlying claims are false.
- Every post below is tagged with a reference like [P3]. All evidence you cite must use these tags.

NARRATIVES AND SAMPLED POSTS:
${narrativeSections.join('\n\n')}

RHETORICAL TECHNIQUES TO CHECK FOR (report in "techniques"; use these exact ids):
${techniqueList}

COORDINATION INDICATORS TO CHECK FOR (report in "coordinationIndicators"; use these exact ids — these are network-level distribution signals, not per-text rhetoric):
${coordinationList}

CONFIDENCE RUBRIC — what the "confidence" number means:
- 0.9 or higher: explicit, repeated, unambiguous use of the technique across multiple posts.
- 0.7: clear single use in one post.
- 0.5: plausible, but could be ordinary strong language rather than a deliberate technique.
- below 0.4: do NOT report the technique at all.

EVIDENCE RULES (mandatory):
- Every reported technique and coordination indicator MUST include at least one example.
- Each example "quote" must be an EXACT verbatim substring copied character-for-character from one of the tagged posts above. Do not paraphrase, translate, fix typos, truncate mid-word, or merge text from multiple posts.
- Each example must set "postRef" to the tag of the post it was copied from (e.g. "P3").
- Examples will be programmatically checked against the source posts; any quote that does not appear verbatim will be discarded, and a technique left with no verified examples will be discarded entirely. Fabricated evidence is worse than no evidence.

Respond ONLY with a single JSON object matching this exact schema (no markdown fences, no other text):

{
  "techniques": [
    {
      "id": "loaded-language",
      "name": "Loaded Language",
      "description": "How this technique is being used in these specific posts",
      "confidence": 0.75,
      "examples": [
        { "postRef": "P3", "quote": "exact verbatim quote copied from post P3" }
      ],
      "educationalNote": "Why this technique is effective and how readers can recognize it"
    }
  ],
  "coordinationIndicators": [
    {
      "id": "astroturfing-indicators",
      "name": "Astroturfing Indicators",
      "description": "What distribution pattern you observed across the posts",
      "confidence": 0.6,
      "examples": [
        { "postRef": "P7", "quote": "exact verbatim quote illustrating the pattern" }
      ],
      "educationalNote": "How readers can recognize this pattern"
    }
  ],
  "claims": [
    {
      "claim": "The specific propositional statement",
      "type": "factual",
      "sources": ["author handles who made this claim"],
      "firstSeen": "ISO timestamp of earliest post containing this claim",
      "frequency": 5,
      "verifiability": "verifiable"
    }
  ],
  "frames": [
    {
      "frame": "frame name (e.g. victim, aggressor, coverup, whistleblower)",
      "description": "How this interpretive lens shapes the narrative",
      "narrativeIds": ["narrative-0"],
      "emotionalAppeal": "fear"
    }
  ],
  "overallAssessment": {
    "manipulationLikelihood": "low",
    "confidence": 0.6,
    "reasoning": "Evidence-based explanation of the assessment",
    "caveats": ["Explicit limitations and uncertainties in this analysis"]
  }
}

Rules for the JSON:
- Only include techniques and coordination indicators you actually detect with confidence >= 0.4 per the rubric above.
- "id" values must come from the catalogs above.
- "type" must be one of: factual, interpretive, predictive, normative
- "verifiability" must be one of: verifiable, subjective, unfalsifiable
- "manipulationLikelihood" must be one of: low, medium, high
- "emotionalAppeal" should be a single emotion word (fear, anger, hope, disgust, pride, etc.)
- confidence values are 0-1 floats
- Always include at least one caveat`;
  }

  // ---------------------------------------------------------------------------
  // Response parsing
  // ---------------------------------------------------------------------------

  private parseResponse(text: string, sampledPosts: SampledPost[]): PropagandaAnalysisResult {
    // Balanced-brace extraction — resilient to thinking models that append
    // reasoning/trailing content after the JSON.
    const jsonStr = extractFirstJsonObject(text);
    if (!jsonStr) {
      this.logger.warn('Could not extract JSON from LLM response');
      return this.emptyResult('unavailable', 'LLM returned an unparseable response.');
    }

    try {
      const raw = JSON.parse(jsonStr) as Record<string, unknown>;
      return this.validateAndNormalize(raw, sampledPosts);
    } catch (err) {
      this.logger.warn(`Failed to parse propaganda analysis JSON: ${err}`);
      return this.emptyResult('unavailable', 'LLM returned an unparseable response.');
    }
  }

  private validateAndNormalize(
    raw: Record<string, unknown>,
    sampledPosts: SampledPost[],
  ): PropagandaAnalysisResult {
    const techniques = this.validateTechniques(raw['techniques'], sampledPosts);
    const coordinationIndicators = this.validateTechniques(
      raw['coordinationIndicators'],
      sampledPosts,
    );
    const claims = this.validateClaims(raw['claims']);
    const frames = this.validateFrames(raw['frames']);
    const overallAssessment = this.validateAssessment(raw['overallAssessment']);

    return {
      analysisMode: 'llm',
      techniques,
      coordinationIndicators,
      claims,
      frames,
      overallAssessment,
      promptVersion: PROPAGANDA_PROMPT_VERSION,
      model: this.chatModel,
    };
  }

  /**
   * Validate technique entries and enforce grounding: every example quote
   * must occur verbatim (whitespace/case-insensitive) in the referenced —
   * or failing that, any — sampled post. Ungrounded examples are dropped;
   * techniques left with zero grounded examples are dropped entirely.
   */
  private validateTechniques(raw: unknown, sampledPosts: SampledPost[]): PropagandaTechnique[] {
    if (!Array.isArray(raw)) return [];
    const byTag = new Map(sampledPosts.map((p) => [p.tag, p]));

    return raw
      .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null)
      .map((t, i) => {
        const grounded = this.groundExamples(t['examples'], byTag, sampledPosts);
        return {
          id: typeof t['id'] === 'string' ? t['id'] : `technique-${i}`,
          name: typeof t['name'] === 'string' ? t['name'] : 'Unknown',
          description: typeof t['description'] === 'string' ? t['description'] : '',
          confidence: this.clamp(Number(t['confidence']) || 0, 0, 1),
          examples: grounded.map((g) => g.quote),
          postRefs: [...new Set(grounded.map((g) => g.postRef))],
          groundedExampleCount: grounded.length,
          educationalNote: typeof t['educationalNote'] === 'string' ? t['educationalNote'] : '',
        };
      })
      .filter((t) => t.confidence >= 0.4 && t.groundedExampleCount > 0);
  }

  /**
   * Keep only examples whose quote occurs verbatim (after whitespace/case
   * normalization) in the referenced post, or in any sampled post as a
   * fallback for mis-attributed refs. Fabricated quotes are discarded.
   */
  private groundExamples(
    raw: unknown,
    byTag: Map<string, SampledPost>,
    sampledPosts: SampledPost[],
  ): { quote: string; postRef: string }[] {
    if (!Array.isArray(raw)) return [];

    const grounded: { quote: string; postRef: string }[] = [];
    for (const entry of raw) {
      let quote = '';
      let claimedRef = '';
      if (typeof entry === 'string') {
        quote = entry;
      } else if (typeof entry === 'object' && entry !== null) {
        const obj = entry as Record<string, unknown>;
        quote = typeof obj['quote'] === 'string' ? obj['quote'] : '';
        claimedRef =
          typeof obj['postRef'] === 'string' ? obj['postRef'].replace(/^\[|\]$/g, '') : '';
      }

      const needle = this.normalizeForMatch(quote);
      if (!needle) continue;

      const referenced = claimedRef ? byTag.get(claimedRef) : undefined;
      let matchedRef: string | null = null;
      if (referenced?.normalizedText.includes(needle)) {
        matchedRef = referenced.tag;
      } else {
        const anyMatch = sampledPosts.find((p) => p.normalizedText.includes(needle));
        if (anyMatch) matchedRef = anyMatch.tag;
      }

      if (matchedRef) grounded.push({ quote: quote.trim(), postRef: matchedRef });
    }
    return grounded;
  }

  private validateClaims(raw: unknown): ExtractedClaim[] {
    const validTypes = new Set(['factual', 'interpretive', 'predictive', 'normative']);
    const validVerifiability = new Set(['verifiable', 'subjective', 'unfalsifiable']);

    if (!Array.isArray(raw)) return [];
    return raw
      .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
      .map((c) => ({
        claim: typeof c['claim'] === 'string' ? c['claim'] : '',
        type: validTypes.has(c['type'] as string)
          ? (c['type'] as ExtractedClaim['type'])
          : 'interpretive',
        sources: Array.isArray(c['sources'])
          ? c['sources'].filter((s): s is string => typeof s === 'string')
          : [],
        firstSeen: typeof c['firstSeen'] === 'string' ? c['firstSeen'] : '',
        frequency: Math.max(Math.round(Number(c['frequency']) || 0), 0),
        verifiability: validVerifiability.has(c['verifiability'] as string)
          ? (c['verifiability'] as ExtractedClaim['verifiability'])
          : 'subjective',
      }))
      .filter((c) => c.claim.length > 0);
  }

  private validateFrames(raw: unknown): NarrativeFrame[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((f): f is Record<string, unknown> => typeof f === 'object' && f !== null)
      .map((f) => ({
        frame: typeof f['frame'] === 'string' ? f['frame'] : '',
        description: typeof f['description'] === 'string' ? f['description'] : '',
        narrativeIds: Array.isArray(f['narrativeIds'])
          ? f['narrativeIds'].filter((id): id is string => typeof id === 'string')
          : [],
        emotionalAppeal:
          typeof f['emotionalAppeal'] === 'string' ? f['emotionalAppeal'] : 'neutral',
      }))
      .filter((f) => f.frame.length > 0);
  }

  private validateAssessment(raw: unknown): PropagandaAnalysisResult['overallAssessment'] {
    const defaults: PropagandaAnalysisResult['overallAssessment'] = {
      manipulationLikelihood: 'low',
      confidence: 0,
      reasoning: 'Analysis could not be completed.',
      caveats: [
        'This is an automated analysis and may contain errors.',
        'The presence of persuasion techniques does not necessarily indicate intentional manipulation.',
      ],
    };

    if (typeof raw !== 'object' || raw === null) return defaults;
    const obj = raw as Record<string, unknown>;

    const validLikelihood = new Set(['low', 'medium', 'high']);

    return {
      manipulationLikelihood: validLikelihood.has(obj['manipulationLikelihood'] as string)
        ? (obj[
            'manipulationLikelihood'
          ] as PropagandaAnalysisResult['overallAssessment']['manipulationLikelihood'])
        : 'low',
      confidence: this.clamp(Number(obj['confidence']) || 0, 0, 1),
      reasoning: typeof obj['reasoning'] === 'string' ? obj['reasoning'] : defaults.reasoning,
      caveats: Array.isArray(obj['caveats'])
        ? obj['caveats'].filter((c): c is string => typeof c === 'string')
        : defaults.caveats,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Normalize for span matching: lowercase, unify quotes, collapse whitespace. */
  private normalizeForMatch(s: string): string {
    return s.toLowerCase().replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  private emptyResult(mode: AnalysisMode, reason: string): PropagandaAnalysisResult {
    return {
      analysisMode: mode,
      analysisModeReason: reason,
      techniques: [],
      coordinationIndicators: [],
      claims: [],
      frames: [],
      overallAssessment: {
        manipulationLikelihood: 'low',
        confidence: 0,
        reasoning: reason,
        caveats: ['No analysis was performed. This is not a "no propaganda detected" finding.'],
      },
      promptVersion: PROPAGANDA_PROMPT_VERSION,
      model: this.chatModel,
    };
  }
}
