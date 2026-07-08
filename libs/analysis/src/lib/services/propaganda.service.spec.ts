import { ConfigService } from '@nestjs/config';
import type { RawPost } from './deviation.service';
import type { AnalyzedNarrative } from './narrative-analysis.service';
import { PROPAGANDA_PROMPT_VERSION, PropagandaAnalysisService } from './propaganda.service';
import { geminiChatModel } from './utils/llm-config';

// ---------------------------------------------------------------------------
// Gemini mock (only used by tests that construct the service WITH an API key)
// ---------------------------------------------------------------------------

const mockGenerateContent = jest.fn();

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn(() => ({ generateContent: mockGenerateContent })),
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNarrative(overrides: Partial<AnalyzedNarrative> & { id: string }): AnalyzedNarrative {
  return {
    summary: overrides.summary ?? `Summary for ${overrides.id}`,
    postIndices: overrides.postIndices ?? [0, 1],
    avgSentiment: overrides.avgSentiment ?? 0,
    sentimentTrajectory: overrides.sentimentTrajectory ?? [],
    platforms: overrides.platforms ?? { twitter: 2 },
    authors: overrides.authors ?? [
      { name: 'Alice', handle: 'alice', postCount: 1 },
      { name: 'Bob', handle: 'bob', postCount: 1 },
    ],
    firstSeen: overrides.firstSeen ?? '2025-01-01T00:00:00Z',
    lastSeen: overrides.lastSeen ?? '2025-01-02T00:00:00Z',
    totalEngagement: overrides.totalEngagement ?? 100,
    velocity: overrides.velocity ?? {
      postsPerHour: 1,
      acceleration: 0,
      trend: 'steady',
    },
    centroidEmbedding: overrides.centroidEmbedding ?? [1, 0, 0],
    ...overrides,
  };
}

function makePosts(count: number): RawPost[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `post-${i}`,
    text: `Post text ${i} with some content about the topic`,
    platform: i % 2 === 0 ? 'twitter' : 'reddit',
    authorName: `Author ${i}`,
    authorHandle: `author${i}`,
    timestamp: new Date(Date.now() - (count - i) * 3600000).toISOString(),
    engagement: { likes: 10 + i, shares: 2, comments: 3 },
  }));
}

function makeConfigService(geminiKey?: string): ConfigService {
  return {
    get: (key: string) => {
      if (key === 'GEMINI_API_KEY') return geminiKey;
      return undefined;
    },
  } as unknown as ConfigService;
}

function makeServiceWithoutKey(): PropagandaAnalysisService {
  const original = process.env['GEMINI_API_KEY'];
  delete process.env['GEMINI_API_KEY'];
  const service = new PropagandaAnalysisService(makeConfigService(undefined));
  if (original) process.env['GEMINI_API_KEY'] = original;
  return service;
}

/**
 * Build sampled-post entries (the internal structure passed to parseResponse)
 * so that grounding can be exercised directly against known post texts.
 */
function makeSampled(
  service: PropagandaAnalysisService,
  texts: string[],
): { tag: string; postIndex: number; post: RawPost; normalizedText: string }[] {
  return texts.map((text, i) => ({
    tag: `P${i}`,
    postIndex: i,
    post: {
      id: `post-${i}`,
      text,
      platform: 'twitter',
      authorName: `Author ${i}`,
      authorHandle: `author${i}`,
      timestamp: '2025-01-01T00:00:00Z',
    },
    normalizedText: (service as any).normalizeForMatch(text),
  }));
}

function llmResponse(payload: unknown): { response: { text: () => string } } {
  return { response: { text: () => JSON.stringify(payload) } };
}

const EMPTY_ASSESSMENT = {
  manipulationLikelihood: 'low',
  confidence: 0.1,
  reasoning: 'test',
  caveats: ['Limited data.'],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PropagandaAnalysisService', () => {
  beforeEach(() => {
    mockGenerateContent.mockReset();
  });

  // -------------------------------------------------------------------------
  // No Gemini key -- fallback behavior
  // -------------------------------------------------------------------------

  describe('without Gemini API key', () => {
    let service: PropagandaAnalysisService;

    beforeEach(() => {
      service = makeServiceWithoutKey();
    });

    it('marks the result unavailable instead of returning a silent empty finding', async () => {
      const narratives = [makeNarrative({ id: 'n-0' })];
      const posts = makePosts(5);
      const result = await service.analyze(narratives, posts);

      expect(result.analysisMode).toBe('unavailable');
      expect(result.analysisModeReason).toContain('GEMINI_API_KEY');
      expect(result.techniques).toEqual([]);
      expect(result.coordinationIndicators).toEqual([]);
      expect(result.claims).toEqual([]);
      expect(result.frames).toEqual([]);
      expect(result.overallAssessment.manipulationLikelihood).toBe('low');
      expect(result.overallAssessment.confidence).toBe(0);
      expect(result.overallAssessment.caveats.length).toBeGreaterThan(0);
    });

    it('stamps promptVersion and model even on unavailable results', async () => {
      const result = await service.analyze([makeNarrative({ id: 'n-0' })], makePosts(5));
      expect(result.promptVersion).toBe(PROPAGANDA_PROMPT_VERSION);
      expect(result.model).toBe(geminiChatModel());
    });
  });

  // -------------------------------------------------------------------------
  // Empty / edge-case inputs
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    let service: PropagandaAnalysisService;

    beforeEach(() => {
      service = makeServiceWithoutKey();
    });

    it('returns empty result for empty narratives array', async () => {
      const result = await service.analyze([], makePosts(5));
      expect(result.techniques).toEqual([]);
      expect(result.coordinationIndicators).toEqual([]);
      expect(result.claims).toEqual([]);
      expect(result.frames).toEqual([]);
      expect(result.overallAssessment.confidence).toBe(0);
      expect(result.promptVersion).toBe(PROPAGANDA_PROMPT_VERSION);
      expect(result.model).toBe(geminiChatModel());
    });

    it('returns empty result for single narrative with no API key', async () => {
      const narratives = [makeNarrative({ id: 'n-0', postIndices: [0] })];
      const posts = makePosts(1);
      const result = await service.analyze(narratives, posts);

      expect(result.techniques).toEqual([]);
      expect(result.overallAssessment.manipulationLikelihood).toBe('low');
    });
  });

  // -------------------------------------------------------------------------
  // Stratified sampling
  // -------------------------------------------------------------------------

  describe('stratified sampling', () => {
    let service: PropagandaAnalysisService;

    beforeEach(() => {
      service = makeServiceWithoutKey();
    });

    /** 30 posts: engagement DECREASES with index, recency INCREASES with index. */
    function makeStratifiablePosts(count = 30): RawPost[] {
      return Array.from({ length: count }, (_, i) => ({
        id: `post-${i}`,
        text: `Post number ${i} discussing the topic at length`,
        platform: 'twitter',
        authorName: `Author ${i}`,
        authorHandle: `author${i}`,
        timestamp: new Date(Date.UTC(2025, 0, 1) + i * 3600000).toISOString(),
        engagement: { likes: 1000 - i * 10, shares: 5, comments: 5 },
      }));
    }

    it('takes top-engagement, most-recent, and random strata, capped at 12', () => {
      const posts = makeStratifiablePosts(30);
      const narrative = makeNarrative({
        id: 'n-sample',
        postIndices: Array.from({ length: 30 }, (_, i) => i),
      });

      const sampled = (service as any).sampleNarrativePosts(narrative, posts);
      const indices = sampled.map((s: { postIndex: number }) => s.postIndex);

      expect(indices.length).toBeLessThanOrEqual(12);
      expect(indices.length).toBe(12); // engagement and recency strata are disjoint here
      // Top 4 by engagement are indices 0..3
      for (const idx of [0, 1, 2, 3]) expect(indices).toContain(idx);
      // 4 most recent are indices 26..29
      for (const idx of [26, 27, 28, 29]) expect(indices).toContain(idx);
      // No duplicates
      expect(new Set(indices).size).toBe(indices.length);
      // Tags are stable per post index
      for (const s of sampled) expect(s.tag).toBe(`P${s.postIndex}`);
    });

    it('is deterministic for the same narrative id (no Math.random)', () => {
      const posts = makeStratifiablePosts(30);
      const narrative = makeNarrative({
        id: 'n-deterministic',
        postIndices: Array.from({ length: 30 }, (_, i) => i),
      });

      const run1 = (service as any)
        .sampleNarrativePosts(narrative, posts)
        .map((s: { postIndex: number }) => s.postIndex);
      const run2 = (service as any)
        .sampleNarrativePosts(narrative, posts)
        .map((s: { postIndex: number }) => s.postIndex);

      expect(run1).toEqual(run2);
    });

    it('seeds the random stratum from the narrative id', () => {
      const posts = makeStratifiablePosts(30);
      const indicesOf = (id: string) =>
        (service as any)
          .sampleNarrativePosts(
            makeNarrative({ id, postIndices: Array.from({ length: 30 }, (_, i) => i) }),
            posts,
          )
          .map((s: { postIndex: number }) => s.postIndex);

      // Same id twice: identical. Different ids: different random picks.
      expect(indicesOf('n-a')).toEqual(indicesOf('n-a'));
      expect(indicesOf('n-a')).not.toEqual(indicesOf('n-b'));
    });

    it('returns all valid posts when the narrative has fewer than 12', () => {
      const posts = makeStratifiablePosts(5);
      const narrative = makeNarrative({ id: 'n-small', postIndices: [0, 1, 2, 3, 4, 99] });
      const sampled = (service as any).sampleNarrativePosts(narrative, posts);
      const indices = sampled.map((s: { postIndex: number }) => s.postIndex);
      expect(indices.sort((a: number, b: number) => a - b)).toEqual([0, 1, 2, 3, 4]);
    });
  });

  // -------------------------------------------------------------------------
  // Grounding check (via mocked LLM through analyze())
  // -------------------------------------------------------------------------

  describe('grounding check', () => {
    const posts: RawPost[] = [
      {
        id: 'post-0',
        text: 'They are POISONING our children and nobody in the media will say it',
        platform: 'twitter',
        authorName: 'Alice',
        authorHandle: 'alice',
        timestamp: '2025-01-01T00:00:00Z',
        engagement: { likes: 50, shares: 10, comments: 5 },
      },
      {
        id: 'post-1',
        text: 'Wake up people, this is exactly what they want you to believe',
        platform: 'reddit',
        authorName: 'Bob',
        authorHandle: 'bob',
        timestamp: '2025-01-02T00:00:00Z',
        engagement: { likes: 20, shares: 2, comments: 8 },
      },
    ];
    const narratives = [makeNarrative({ id: 'n-0', postIndices: [0, 1] })];

    function makeServiceWithKey(): PropagandaAnalysisService {
      return new PropagandaAnalysisService(makeConfigService('fake-key'));
    }

    it('drops fabricated examples and keeps verbatim ones', async () => {
      mockGenerateContent.mockResolvedValue(
        llmResponse({
          techniques: [
            {
              id: 'loaded-language',
              name: 'Loaded Language',
              description: 'Emotionally charged wording',
              confidence: 0.8,
              examples: [
                { postRef: 'P0', quote: 'POISONING our children' }, // real
                { postRef: 'P0', quote: 'they are stealing our future' }, // fabricated
              ],
              educationalNote: 'Charged words bypass critical thinking.',
            },
            {
              id: 'appeal-to-fear-prejudice',
              name: 'Appeal to Fear / Prejudice',
              description: 'Fear-based persuasion',
              confidence: 0.9,
              examples: [
                { postRef: 'P1', quote: 'everything you love will be destroyed' }, // fabricated
              ],
              educationalNote: 'Fear appeals bypass rational analysis.',
            },
          ],
          coordinationIndicators: [],
          claims: [],
          frames: [],
          overallAssessment: EMPTY_ASSESSMENT,
        }),
      );

      const service = makeServiceWithKey();
      const result = await service.analyze(narratives, posts);

      expect(result.analysisMode).toBe('llm');
      // Technique with only fabricated evidence is removed entirely
      expect(result.techniques).toHaveLength(1);
      const tech = result.techniques[0];
      expect(tech?.id).toBe('loaded-language');
      // Fabricated example dropped, counts recomputed
      expect(tech?.examples).toEqual(['POISONING our children']);
      expect(tech?.groundedExampleCount).toBe(1);
      expect(tech?.postRefs).toEqual(['P0']);
    });

    it('grounds a quote against any sampled post when the postRef is wrong', async () => {
      mockGenerateContent.mockResolvedValue(
        llmResponse({
          techniques: [
            {
              id: 'thought-terminating-cliche',
              name: 'Thought-Terminating Cliché',
              description: 'Dismissive phrasing',
              confidence: 0.7,
              // Quote is from post 1 but attributed to P0
              examples: [{ postRef: 'P0', quote: 'Wake up people' }],
              educationalNote: 'Clichés shut down critical thought.',
            },
          ],
          coordinationIndicators: [],
          claims: [],
          frames: [],
          overallAssessment: EMPTY_ASSESSMENT,
        }),
      );

      const service = makeServiceWithKey();
      const result = await service.analyze(narratives, posts);

      expect(result.techniques).toHaveLength(1);
      expect(result.techniques[0]?.postRefs).toEqual(['P1']); // corrected to actual source
    });

    it('grounds case- and whitespace-insensitively but rejects paraphrases', async () => {
      mockGenerateContent.mockResolvedValue(
        llmResponse({
          techniques: [
            {
              id: 'loaded-language',
              name: 'Loaded Language',
              description: 'x',
              confidence: 0.8,
              examples: [
                { postRef: 'P0', quote: 'poisoning   OUR children' }, // normalizes to a real span
                { postRef: 'P0', quote: 'harming our kids' }, // paraphrase
              ],
              educationalNote: 'x',
            },
          ],
          coordinationIndicators: [],
          claims: [],
          frames: [],
          overallAssessment: EMPTY_ASSESSMENT,
        }),
      );

      const service = makeServiceWithKey();
      const result = await service.analyze(narratives, posts);

      expect(result.techniques).toHaveLength(1);
      expect(result.techniques[0]?.groundedExampleCount).toBe(1);
    });

    it('applies the same grounding to coordination indicators and keeps them separate', async () => {
      mockGenerateContent.mockResolvedValue(
        llmResponse({
          techniques: [],
          coordinationIndicators: [
            {
              id: 'astroturfing-indicators',
              name: 'Astroturfing Indicators',
              description: 'Template-like phrasing',
              confidence: 0.6,
              examples: [
                { postRef: 'P1', quote: 'what they want you to believe' }, // real
                { postRef: 'P1', quote: 'copy paste campaign detected' }, // fabricated
              ],
              educationalNote: 'x',
            },
            {
              id: 'manufactured-consensus',
              name: 'Manufactured Consensus',
              description: 'x',
              confidence: 0.7,
              examples: [{ postRef: 'P0', quote: 'entirely invented consensus quote' }],
              educationalNote: 'x',
            },
          ],
          claims: [],
          frames: [],
          overallAssessment: EMPTY_ASSESSMENT,
        }),
      );

      const service = makeServiceWithKey();
      const result = await service.analyze(narratives, posts);

      expect(result.techniques).toEqual([]);
      expect(result.coordinationIndicators).toHaveLength(1);
      expect(result.coordinationIndicators[0]?.id).toBe('astroturfing-indicators');
      expect(result.coordinationIndicators[0]?.groundedExampleCount).toBe(1);
    });

    it('stamps promptVersion and model on LLM results and tags posts in the prompt', async () => {
      mockGenerateContent.mockResolvedValue(
        llmResponse({
          techniques: [],
          coordinationIndicators: [],
          claims: [],
          frames: [],
          overallAssessment: EMPTY_ASSESSMENT,
        }),
      );

      const service = makeServiceWithKey();
      const result = await service.analyze(narratives, posts);

      expect(result.promptVersion).toBe(PROPAGANDA_PROMPT_VERSION);
      expect(result.model).toBe(geminiChatModel());

      const prompt = mockGenerateContent.mock.calls[0]?.[0] as string;
      expect(prompt).toContain('[P0]');
      expect(prompt).toContain('[P1]');
      expect(prompt).toContain('loaded-language');
      expect(prompt).toContain('CONFIDENCE RUBRIC');
    });

    it('returns unavailable (not a clean finding) when the LLM call fails', async () => {
      mockGenerateContent.mockRejectedValue(new Error('quota exceeded'));
      const service = makeServiceWithKey();
      const result = await service.analyze(narratives, posts);

      expect(result.analysisMode).toBe('unavailable');
      expect(result.techniques).toEqual([]);
      expect(result.promptVersion).toBe(PROPAGANDA_PROMPT_VERSION);
      expect(result.model).toBe(geminiChatModel());
    });
  });

  // -------------------------------------------------------------------------
  // Result structure validation (via parseResponse)
  // -------------------------------------------------------------------------

  describe('result structure validation', () => {
    let service: PropagandaAnalysisService;

    beforeEach(() => {
      service = makeServiceWithoutKey();
    });

    it('validates and normalizes a well-formed LLM response', () => {
      const sampled = makeSampled(service, [
        'This is OUTRAGEOUS and UNACCEPTABLE, we will not stand for it',
      ]);
      const raw = JSON.stringify({
        techniques: [
          {
            id: 'loaded-language',
            name: 'Loaded Language',
            description: 'Using emotionally charged words',
            confidence: 0.8,
            examples: [{ postRef: 'P0', quote: 'This is OUTRAGEOUS and UNACCEPTABLE' }],
            educationalNote: 'Words with strong emotional connotations bypass critical thinking.',
          },
          {
            id: 'doubt',
            name: 'Low confidence technique',
            description: 'Should be filtered out',
            confidence: 0.2,
            examples: [{ postRef: 'P0', quote: 'we will not stand for it' }],
            educationalNote: '',
          },
        ],
        coordinationIndicators: [],
        claims: [
          {
            claim: 'The government is hiding the truth',
            type: 'factual',
            sources: ['@user1', '@user2'],
            firstSeen: '2025-01-01T00:00:00Z',
            frequency: 12,
            verifiability: 'verifiable',
          },
        ],
        frames: [
          {
            frame: 'coverup',
            description: 'Framing the situation as a deliberate concealment',
            narrativeIds: ['narrative-0'],
            emotionalAppeal: 'anger',
          },
        ],
        overallAssessment: {
          manipulationLikelihood: 'medium',
          confidence: 0.65,
          reasoning: 'Multiple persuasion techniques detected with moderate confidence.',
          caveats: ['Automated analysis may miss context.'],
        },
      });

      // Access private method via type casting for testing
      const result = (service as any).parseResponse(raw, sampled);

      // Techniques: low-confidence one filtered out
      expect(result.techniques).toHaveLength(1);
      expect(result.techniques[0].name).toBe('Loaded Language');
      expect(result.techniques[0].confidence).toBe(0.8);
      expect(result.techniques[0].postRefs).toEqual(['P0']);
      expect(result.techniques[0].groundedExampleCount).toBe(1);

      // Versioning
      expect(result.promptVersion).toBe(PROPAGANDA_PROMPT_VERSION);
      expect(result.model).toBe(geminiChatModel());

      // Claims
      expect(result.claims).toHaveLength(1);
      expect(result.claims[0].claim).toBe('The government is hiding the truth');
      expect(result.claims[0].type).toBe('factual');
      expect(result.claims[0].verifiability).toBe('verifiable');
      expect(result.claims[0].frequency).toBe(12);

      // Frames
      expect(result.frames).toHaveLength(1);
      expect(result.frames[0].frame).toBe('coverup');
      expect(result.frames[0].emotionalAppeal).toBe('anger');

      // Assessment
      expect(result.overallAssessment.manipulationLikelihood).toBe('medium');
      expect(result.overallAssessment.confidence).toBe(0.65);
      expect(result.overallAssessment.caveats).toHaveLength(1);
    });

    it('filters techniques below the 0.4 confidence floor even with grounded examples', () => {
      const sampled = makeSampled(service, ['Some very strong language right here']);
      const raw = JSON.stringify({
        techniques: [
          {
            id: 'loaded-language',
            name: 'Loaded Language',
            description: 'x',
            confidence: 0.35,
            examples: [{ postRef: 'P0', quote: 'very strong language' }],
            educationalNote: '',
          },
        ],
        coordinationIndicators: [],
        claims: [],
        frames: [],
        overallAssessment: EMPTY_ASSESSMENT,
      });

      const result = (service as any).parseResponse(raw, sampled);
      expect(result.techniques).toEqual([]);
    });

    it('handles malformed JSON gracefully', () => {
      const result = (service as any).parseResponse('not valid json at all', []);
      expect(result.techniques).toEqual([]);
      expect(result.claims).toEqual([]);
      expect(result.frames).toEqual([]);
      expect(result.overallAssessment.confidence).toBe(0);
      expect(result.analysisMode).toBe('unavailable');
      expect(result.promptVersion).toBe(PROPAGANDA_PROMPT_VERSION);
    });

    it('handles response with markdown fences', () => {
      const raw =
        '```json\n' +
        JSON.stringify({
          techniques: [],
          coordinationIndicators: [],
          claims: [],
          frames: [],
          overallAssessment: {
            manipulationLikelihood: 'low',
            confidence: 0.3,
            reasoning: 'No significant patterns.',
            caveats: ['Limited data.'],
          },
        }) +
        '\n```';

      const result = (service as any).parseResponse(raw, []);
      expect(result.overallAssessment.manipulationLikelihood).toBe('low');
      expect(result.overallAssessment.confidence).toBe(0.3);
    });

    it('clamps confidence values to 0-1 range', () => {
      const sampled = makeSampled(service, ['A grounded example quote lives here']);
      const raw = JSON.stringify({
        techniques: [
          {
            id: 'repetition',
            name: 'Test',
            description: 'Test',
            confidence: 1.5,
            examples: [{ postRef: 'P0', quote: 'grounded example quote' }],
            educationalNote: '',
          },
        ],
        coordinationIndicators: [],
        claims: [],
        frames: [],
        overallAssessment: {
          manipulationLikelihood: 'high',
          confidence: -0.5,
          reasoning: 'Test',
          caveats: [],
        },
      });

      const result = (service as any).parseResponse(raw, sampled);
      expect(result.techniques[0].confidence).toBe(1);
      expect(result.overallAssessment.confidence).toBe(0);
    });

    it('defaults invalid enum values', () => {
      const raw = JSON.stringify({
        techniques: [],
        coordinationIndicators: [],
        claims: [
          {
            claim: 'Something',
            type: 'invalid_type',
            sources: [],
            firstSeen: '',
            frequency: 1,
            verifiability: 'invalid_verif',
          },
        ],
        frames: [],
        overallAssessment: {
          manipulationLikelihood: 'extreme',
          confidence: 0.5,
          reasoning: 'test',
          caveats: [],
        },
      });

      const result = (service as any).parseResponse(raw, []);
      expect(result.claims[0].type).toBe('interpretive'); // default
      expect(result.claims[0].verifiability).toBe('subjective'); // default
      expect(result.overallAssessment.manipulationLikelihood).toBe('low'); // default
    });

    it('filters out claims with empty claim text', () => {
      const raw = JSON.stringify({
        techniques: [],
        coordinationIndicators: [],
        claims: [
          {
            claim: '',
            type: 'factual',
            sources: [],
            firstSeen: '',
            frequency: 1,
            verifiability: 'verifiable',
          },
          {
            claim: 'Valid claim',
            type: 'factual',
            sources: [],
            firstSeen: '',
            frequency: 1,
            verifiability: 'verifiable',
          },
        ],
        frames: [],
        overallAssessment: EMPTY_ASSESSMENT,
      });

      const result = (service as any).parseResponse(raw, []);
      expect(result.claims).toHaveLength(1);
      expect(result.claims[0].claim).toBe('Valid claim');
    });

    it('filters out frames with empty frame name', () => {
      const raw = JSON.stringify({
        techniques: [],
        coordinationIndicators: [],
        claims: [],
        frames: [
          { frame: '', description: 'No name', narrativeIds: [], emotionalAppeal: 'fear' },
          { frame: 'victim', description: 'Named', narrativeIds: [], emotionalAppeal: 'fear' },
        ],
        overallAssessment: EMPTY_ASSESSMENT,
      });

      const result = (service as any).parseResponse(raw, []);
      expect(result.frames).toHaveLength(1);
      expect(result.frames[0].frame).toBe('victim');
    });
  });

  // -------------------------------------------------------------------------
  // Technique identification from sample data
  // -------------------------------------------------------------------------

  describe('technique identification structure', () => {
    it('returns properly structured techniques with all required fields', () => {
      const service = makeServiceWithoutKey();
      const sampled = makeSampled(service, [
        'They are the reason our economy is failing, everyone knows it',
        'If we do not act now, everything will be destroyed forever',
      ]);

      // Simulate a parsed response with known techniques
      const raw = JSON.stringify({
        techniques: [
          {
            id: 'causal-oversimplification',
            name: 'Causal Oversimplification',
            description: 'Blaming a specific group for complex problems',
            confidence: 0.85,
            examples: [{ postRef: 'P0', quote: 'They are the reason our economy is failing' }],
            educationalNote:
              'Causal oversimplification assigns blame for complex issues to a single target.',
          },
          {
            id: 'appeal-to-fear-prejudice',
            name: 'Appeal to Fear / Prejudice',
            description: 'Using fear to influence the audience',
            confidence: 0.7,
            examples: [
              { postRef: 'P1', quote: 'If we do not act now, everything will be destroyed' },
            ],
            educationalNote:
              'Fear appeals bypass rational analysis by triggering fight-or-flight responses.',
          },
        ],
        coordinationIndicators: [],
        claims: [
          {
            claim: 'The economy is failing because of group X',
            type: 'factual',
            sources: ['@user1'],
            firstSeen: '2025-01-01T00:00:00Z',
            frequency: 8,
            verifiability: 'verifiable',
          },
        ],
        frames: [
          {
            frame: 'victim',
            description: 'Positioning the in-group as victims of the scapegoated out-group',
            narrativeIds: ['narrative-0'],
            emotionalAppeal: 'anger',
          },
        ],
        overallAssessment: {
          manipulationLikelihood: 'high',
          confidence: 0.75,
          reasoning: 'Multiple classic propaganda techniques present with high confidence.',
          caveats: ['Automated analysis, verify independently.'],
        },
      });

      const result = (service as any).parseResponse(raw, sampled);

      expect(result.techniques).toHaveLength(2);

      // Verify each technique has all required fields
      for (const tech of result.techniques) {
        expect(typeof tech.id).toBe('string');
        expect(typeof tech.name).toBe('string');
        expect(typeof tech.description).toBe('string');
        expect(typeof tech.confidence).toBe('number');
        expect(tech.confidence).toBeGreaterThanOrEqual(0);
        expect(tech.confidence).toBeLessThanOrEqual(1);
        expect(Array.isArray(tech.examples)).toBe(true);
        expect(Array.isArray(tech.postRefs)).toBe(true);
        expect(tech.groundedExampleCount).toBeGreaterThan(0);
        expect(typeof tech.educationalNote).toBe('string');
      }

      // Verify claims structure
      for (const claim of result.claims) {
        expect(typeof claim.claim).toBe('string');
        expect(['factual', 'interpretive', 'predictive', 'normative']).toContain(claim.type);
        expect(Array.isArray(claim.sources)).toBe(true);
        expect(typeof claim.frequency).toBe('number');
        expect(['verifiable', 'subjective', 'unfalsifiable']).toContain(claim.verifiability);
      }

      // Verify overall assessment structure
      expect(['low', 'medium', 'high']).toContain(result.overallAssessment.manipulationLikelihood);
      expect(typeof result.overallAssessment.confidence).toBe('number');
      expect(typeof result.overallAssessment.reasoning).toBe('string');
      expect(Array.isArray(result.overallAssessment.caveats)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Claim extraction validation
  // -------------------------------------------------------------------------

  describe('claim extraction', () => {
    it('correctly categorizes different claim types', () => {
      const service = makeServiceWithoutKey();

      const raw = JSON.stringify({
        techniques: [],
        coordinationIndicators: [],
        claims: [
          {
            claim: 'The vaccine has a 95% efficacy rate',
            type: 'factual',
            sources: ['@doctor1'],
            firstSeen: '2025-01-01T00:00:00Z',
            frequency: 20,
            verifiability: 'verifiable',
          },
          {
            claim: 'This policy is unjust',
            type: 'normative',
            sources: ['@activist1'],
            firstSeen: '2025-01-02T00:00:00Z',
            frequency: 15,
            verifiability: 'subjective',
          },
          {
            claim: 'The economy will crash next year',
            type: 'predictive',
            sources: ['@analyst1'],
            firstSeen: '2025-01-03T00:00:00Z',
            frequency: 8,
            verifiability: 'unfalsifiable',
          },
          {
            claim: 'The situation is being misrepresented',
            type: 'interpretive',
            sources: ['@reporter1'],
            firstSeen: '2025-01-04T00:00:00Z',
            frequency: 12,
            verifiability: 'subjective',
          },
        ],
        frames: [],
        overallAssessment: {
          manipulationLikelihood: 'low',
          confidence: 0.3,
          reasoning: 'test',
          caveats: [],
        },
      });

      const result = (service as any).parseResponse(raw, []);

      expect(result.claims).toHaveLength(4);
      expect(result.claims[0].type).toBe('factual');
      expect(result.claims[1].type).toBe('normative');
      expect(result.claims[2].type).toBe('predictive');
      expect(result.claims[3].type).toBe('interpretive');

      expect(result.claims[0].verifiability).toBe('verifiable');
      expect(result.claims[1].verifiability).toBe('subjective');
      expect(result.claims[2].verifiability).toBe('unfalsifiable');
    });

    it('handles negative frequency by clamping to 0', () => {
      const service = makeServiceWithoutKey();

      const raw = JSON.stringify({
        techniques: [],
        coordinationIndicators: [],
        claims: [
          {
            claim: 'Test',
            type: 'factual',
            sources: [],
            firstSeen: '',
            frequency: -5,
            verifiability: 'verifiable',
          },
        ],
        frames: [],
        overallAssessment: EMPTY_ASSESSMENT,
      });

      const result = (service as any).parseResponse(raw, []);
      expect(result.claims[0].frequency).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Assessment defaults
  // -------------------------------------------------------------------------

  describe('overall assessment defaults', () => {
    it('provides default caveats when assessment is missing', () => {
      const service = makeServiceWithoutKey();

      const raw = JSON.stringify({
        techniques: [],
        coordinationIndicators: [],
        claims: [],
        frames: [],
      });

      const result = (service as any).parseResponse(raw, []);
      expect(result.overallAssessment.caveats.length).toBeGreaterThan(0);
      expect(result.overallAssessment.manipulationLikelihood).toBe('low');
    });
  });
});
