import { ConfigService } from '@nestjs/config';
import { PropagandaAnalysisService } from './propaganda.service';
import type { AnalyzedNarrative } from './narrative-analysis.service';
import type { RawPost } from './deviation.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNarrative(
  overrides: Partial<AnalyzedNarrative> & { id: string },
): AnalyzedNarrative {
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PropagandaAnalysisService', () => {
  // -------------------------------------------------------------------------
  // No Gemini key -- fallback behavior
  // -------------------------------------------------------------------------

  describe('without Gemini API key', () => {
    let service: PropagandaAnalysisService;

    beforeEach(() => {
      // Ensure env var doesn't interfere
      const original = process.env['GEMINI_API_KEY'];
      delete process.env['GEMINI_API_KEY'];
      service = new PropagandaAnalysisService(makeConfigService(undefined));
      if (original) process.env['GEMINI_API_KEY'] = original;
    });

    it('returns empty result with explanatory reasoning', async () => {
      const narratives = [makeNarrative({ id: 'n-0' })];
      const posts = makePosts(5);
      const result = await service.analyze(narratives, posts);

      expect(result.techniques).toEqual([]);
      expect(result.claims).toEqual([]);
      expect(result.frames).toEqual([]);
      expect(result.overallAssessment.manipulationLikelihood).toBe('low');
      expect(result.overallAssessment.confidence).toBe(0);
      expect(result.overallAssessment.reasoning).toContain('could not be completed');
      expect(result.overallAssessment.caveats.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Empty / edge-case inputs
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    let service: PropagandaAnalysisService;

    beforeEach(() => {
      const original = process.env['GEMINI_API_KEY'];
      delete process.env['GEMINI_API_KEY'];
      service = new PropagandaAnalysisService(makeConfigService(undefined));
      if (original) process.env['GEMINI_API_KEY'] = original;
    });

    it('returns empty result for empty narratives array', async () => {
      const result = await service.analyze([], makePosts(5));
      expect(result.techniques).toEqual([]);
      expect(result.claims).toEqual([]);
      expect(result.frames).toEqual([]);
      expect(result.overallAssessment.confidence).toBe(0);
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
  // Result structure validation (via parseResponse)
  // -------------------------------------------------------------------------

  describe('result structure validation', () => {
    let service: PropagandaAnalysisService;

    beforeEach(() => {
      const original = process.env['GEMINI_API_KEY'];
      delete process.env['GEMINI_API_KEY'];
      service = new PropagandaAnalysisService(makeConfigService(undefined));
      if (original) process.env['GEMINI_API_KEY'] = original;
    });

    it('validates and normalizes a well-formed LLM response', () => {
      const raw = JSON.stringify({
        techniques: [
          {
            id: 'technique-0',
            name: 'Loaded Language',
            description: 'Using emotionally charged words',
            confidence: 0.8,
            examples: ['This is OUTRAGEOUS and UNACCEPTABLE'],
            educationalNote: 'Words with strong emotional connotations bypass critical thinking.',
          },
          {
            id: 'technique-1',
            name: 'Low confidence technique',
            description: 'Should be filtered out',
            confidence: 0.2,
            examples: [],
            educationalNote: '',
          },
        ],
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
      const result = (service as any).parseResponse(raw);

      // Techniques: low-confidence one filtered out
      expect(result.techniques).toHaveLength(1);
      expect(result.techniques[0].name).toBe('Loaded Language');
      expect(result.techniques[0].confidence).toBe(0.8);

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

    it('handles malformed JSON gracefully', () => {
      const result = (service as any).parseResponse('not valid json at all');
      expect(result.techniques).toEqual([]);
      expect(result.claims).toEqual([]);
      expect(result.frames).toEqual([]);
      expect(result.overallAssessment.confidence).toBe(0);
    });

    it('handles response with markdown fences', () => {
      const raw = '```json\n' + JSON.stringify({
        techniques: [],
        claims: [],
        frames: [],
        overallAssessment: {
          manipulationLikelihood: 'low',
          confidence: 0.3,
          reasoning: 'No significant patterns.',
          caveats: ['Limited data.'],
        },
      }) + '\n```';

      const result = (service as any).parseResponse(raw);
      expect(result.overallAssessment.manipulationLikelihood).toBe('low');
      expect(result.overallAssessment.confidence).toBe(0.3);
    });

    it('clamps confidence values to 0-1 range', () => {
      const raw = JSON.stringify({
        techniques: [
          {
            id: 'technique-0',
            name: 'Test',
            description: 'Test',
            confidence: 1.5,
            examples: [],
            educationalNote: '',
          },
        ],
        claims: [],
        frames: [],
        overallAssessment: {
          manipulationLikelihood: 'high',
          confidence: -0.5,
          reasoning: 'Test',
          caveats: [],
        },
      });

      const result = (service as any).parseResponse(raw);
      expect(result.techniques[0].confidence).toBe(1);
      expect(result.overallAssessment.confidence).toBe(0);
    });

    it('defaults invalid enum values', () => {
      const raw = JSON.stringify({
        techniques: [],
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

      const result = (service as any).parseResponse(raw);
      expect(result.claims[0].type).toBe('interpretive'); // default
      expect(result.claims[0].verifiability).toBe('subjective'); // default
      expect(result.overallAssessment.manipulationLikelihood).toBe('low'); // default
    });

    it('filters out claims with empty claim text', () => {
      const raw = JSON.stringify({
        techniques: [],
        claims: [
          { claim: '', type: 'factual', sources: [], firstSeen: '', frequency: 1, verifiability: 'verifiable' },
          { claim: 'Valid claim', type: 'factual', sources: [], firstSeen: '', frequency: 1, verifiability: 'verifiable' },
        ],
        frames: [],
        overallAssessment: {
          manipulationLikelihood: 'low',
          confidence: 0.1,
          reasoning: 'test',
          caveats: [],
        },
      });

      const result = (service as any).parseResponse(raw);
      expect(result.claims).toHaveLength(1);
      expect(result.claims[0].claim).toBe('Valid claim');
    });

    it('filters out frames with empty frame name', () => {
      const raw = JSON.stringify({
        techniques: [],
        claims: [],
        frames: [
          { frame: '', description: 'No name', narrativeIds: [], emotionalAppeal: 'fear' },
          { frame: 'victim', description: 'Named', narrativeIds: [], emotionalAppeal: 'fear' },
        ],
        overallAssessment: {
          manipulationLikelihood: 'low',
          confidence: 0.1,
          reasoning: 'test',
          caveats: [],
        },
      });

      const result = (service as any).parseResponse(raw);
      expect(result.frames).toHaveLength(1);
      expect(result.frames[0].frame).toBe('victim');
    });
  });

  // -------------------------------------------------------------------------
  // Technique identification from sample data
  // -------------------------------------------------------------------------

  describe('technique identification structure', () => {
    it('returns properly structured techniques with all required fields', () => {
      const original = process.env['GEMINI_API_KEY'];
      delete process.env['GEMINI_API_KEY'];
      const service = new PropagandaAnalysisService(makeConfigService(undefined));
      if (original) process.env['GEMINI_API_KEY'] = original;

      // Simulate a parsed response with known techniques
      const raw = JSON.stringify({
        techniques: [
          {
            id: 'technique-0',
            name: 'Scapegoating',
            description: 'Blaming a specific group for complex problems',
            confidence: 0.85,
            examples: ['They are the reason our economy is failing'],
            educationalNote: 'Scapegoating simplifies complex issues by assigning blame to a target group.',
          },
          {
            id: 'technique-1',
            name: 'Appeal to Fear',
            description: 'Using fear to influence the audience',
            confidence: 0.7,
            examples: ['If we do not act now, everything will be destroyed'],
            educationalNote: 'Fear appeals bypass rational analysis by triggering fight-or-flight responses.',
          },
        ],
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

      const result = (service as any).parseResponse(raw);

      // Verify each technique has all required fields
      for (const tech of result.techniques) {
        expect(typeof tech.id).toBe('string');
        expect(typeof tech.name).toBe('string');
        expect(typeof tech.description).toBe('string');
        expect(typeof tech.confidence).toBe('number');
        expect(tech.confidence).toBeGreaterThanOrEqual(0);
        expect(tech.confidence).toBeLessThanOrEqual(1);
        expect(Array.isArray(tech.examples)).toBe(true);
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
      const original = process.env['GEMINI_API_KEY'];
      delete process.env['GEMINI_API_KEY'];
      const service = new PropagandaAnalysisService(makeConfigService(undefined));
      if (original) process.env['GEMINI_API_KEY'] = original;

      const raw = JSON.stringify({
        techniques: [],
        claims: [
          { claim: 'The vaccine has a 95% efficacy rate', type: 'factual', sources: ['@doctor1'], firstSeen: '2025-01-01T00:00:00Z', frequency: 20, verifiability: 'verifiable' },
          { claim: 'This policy is unjust', type: 'normative', sources: ['@activist1'], firstSeen: '2025-01-02T00:00:00Z', frequency: 15, verifiability: 'subjective' },
          { claim: 'The economy will crash next year', type: 'predictive', sources: ['@analyst1'], firstSeen: '2025-01-03T00:00:00Z', frequency: 8, verifiability: 'unfalsifiable' },
          { claim: 'The situation is being misrepresented', type: 'interpretive', sources: ['@reporter1'], firstSeen: '2025-01-04T00:00:00Z', frequency: 12, verifiability: 'subjective' },
        ],
        frames: [],
        overallAssessment: { manipulationLikelihood: 'low', confidence: 0.3, reasoning: 'test', caveats: [] },
      });

      const result = (service as any).parseResponse(raw);

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
      const original = process.env['GEMINI_API_KEY'];
      delete process.env['GEMINI_API_KEY'];
      const service = new PropagandaAnalysisService(makeConfigService(undefined));
      if (original) process.env['GEMINI_API_KEY'] = original;

      const raw = JSON.stringify({
        techniques: [],
        claims: [
          { claim: 'Test', type: 'factual', sources: [], firstSeen: '', frequency: -5, verifiability: 'verifiable' },
        ],
        frames: [],
        overallAssessment: { manipulationLikelihood: 'low', confidence: 0.1, reasoning: 'test', caveats: [] },
      });

      const result = (service as any).parseResponse(raw);
      expect(result.claims[0].frequency).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Assessment defaults
  // -------------------------------------------------------------------------

  describe('overall assessment defaults', () => {
    it('provides default caveats when assessment is missing', () => {
      const original = process.env['GEMINI_API_KEY'];
      delete process.env['GEMINI_API_KEY'];
      const service = new PropagandaAnalysisService(makeConfigService(undefined));
      if (original) process.env['GEMINI_API_KEY'] = original;

      const raw = JSON.stringify({
        techniques: [],
        claims: [],
        frames: [],
      });

      const result = (service as any).parseResponse(raw);
      expect(result.overallAssessment.caveats.length).toBeGreaterThan(0);
      expect(result.overallAssessment.manipulationLikelihood).toBe('low');
    });
  });
});
