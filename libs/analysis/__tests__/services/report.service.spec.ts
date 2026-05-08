import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import type { DeepInvestigationResult } from '../../src/lib/services/deep-investigation.service';
import type { AnalyzedNarrative } from '../../src/lib/services/narrative-analysis.service';
import { ReportService } from '../../src/lib/services/report.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNarrative(overrides: Partial<AnalyzedNarrative> = {}): AnalyzedNarrative {
  return {
    id: overrides.id ?? 'narrative-0',
    summary: overrides.summary ?? 'Test narrative about climate policy',
    postIndices: overrides.postIndices ?? [0, 1, 2],
    avgSentiment: overrides.avgSentiment ?? 0.3,
    sentimentTrajectory: overrides.sentimentTrajectory ?? [
      { timestamp: '2025-06-01T00:00:00Z', score: 0.2 },
      { timestamp: '2025-06-02T00:00:00Z', score: 0.4 },
    ],
    platforms: overrides.platforms ?? { twitter: 2, reddit: 1 },
    authors: overrides.authors ?? [
      { name: 'Alice', handle: 'alice', postCount: 2 },
      { name: 'Bob', handle: 'bob', postCount: 1 },
    ],
    firstSeen: overrides.firstSeen ?? '2025-06-01T00:00:00Z',
    lastSeen: overrides.lastSeen ?? '2025-06-02T00:00:00Z',
    totalEngagement: overrides.totalEngagement ?? 150,
    velocity: overrides.velocity ?? {
      postsPerHour: 1.5,
      acceleration: 0.3,
      trend: 'growing',
    },
    centroidEmbedding: overrides.centroidEmbedding ?? [],
  };
}

function makeInvestigation(
  overrides: Partial<DeepInvestigationResult> = {},
): DeepInvestigationResult {
  return {
    topic: overrides.topic ?? 'climate policy',
    users: overrides.users ?? [
      {
        user: {
          handle: 'alice',
          name: 'Alice',
          platform: 'twitter',
          topicPosts: [],
          historicalPosts: [],
          firstMention: '2025-06-01T00:00:00Z',
          narrativeEvolution: [],
          profile: {
            summary: 'Climate activist',
            topics: ['climate'],
            patterns: {
              avgPostsPerDay: 5,
              mostActiveHours: [9, 14],
              platformPresence: ['twitter'],
            },
            motivations: ['advocacy'],
            coordinationFlags: [],
          },
        },
        adoptionTimestamp: '2025-06-01T00:00:00Z',
        likelySource: null,
        influenceScore: 0.8,
        flags: [],
      },
      {
        user: {
          handle: 'bot_account',
          name: 'Bot',
          platform: 'twitter',
          topicPosts: [],
          historicalPosts: [],
          firstMention: '2025-06-01T01:00:00Z',
          narrativeEvolution: [],
          profile: {
            summary: 'Suspicious account',
            topics: ['climate'],
            patterns: {
              avgPostsPerDay: 80,
              mostActiveHours: [0, 1, 2, 3],
              platformPresence: ['twitter'],
            },
            motivations: ['unknown'],
            coordinationFlags: ['burst posting'],
          },
        },
        adoptionTimestamp: '2025-06-01T01:00:00Z',
        likelySource: 'alice',
        influenceScore: 0.4,
        flags: ['Unusually high posting rate (>50 posts/day)'],
      },
    ],
    originAnalysis: overrides.originAnalysis ?? {
      firstMover: 'alice',
      firstPlatform: 'twitter',
      firstTimestamp: '2025-06-01T00:00:00Z',
      propagationChain: ['alice', 'bot_account'],
    },
    cuiBono: overrides.cuiBono ?? {
      beneficiaries: [
        { entity: 'Green Energy Corp', howTheyBenefit: 'Increased demand', confidence: 0.7 },
      ],
      agendas: ['Promote renewable energy policy'],
      summary: 'Green energy industry stands to benefit.',
    },
    coordination: overrides.coordination ?? {
      clusters: [
        {
          users: ['bot_account', 'shill_42'],
          pattern: '2 users adopted the narrative within 5 minutes',
          confidence: 0.6,
        },
      ],
      summary: '1 potential coordination cluster(s) detected',
    },
  };
}

const baseSummary = {
  total: 100,
  positive: 40,
  negative: 30,
  neutral: 30,
  byPlatform: { twitter: 60, reddit: 40 },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReportService', () => {
  let service: ReportService;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    delete process.env['GEMINI_API_KEY'];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<ReportService>(ReportService);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('generateReport — markdown', () => {
    it('should generate a markdown report with narratives', async () => {
      const result = await service.generateReport({
        query: 'climate policy',
        summary: baseSummary,
        narratives: [
          makeNarrative(),
          makeNarrative({
            id: 'narrative-1',
            summary: 'Opposition to carbon tax',
            avgSentiment: -0.4,
            velocity: { postsPerHour: 0.5, acceleration: -0.5, trend: 'fading' },
          }),
        ],
        format: 'markdown',
      });

      expect(result.content).toBeDefined();
      expect(result.generatedAt).toBeDefined();

      // Check all major sections
      expect(result.content).toContain('# Narrative Analysis Report: climate policy');
      expect(result.content).toContain('## Executive Summary');
      expect(result.content).toContain('## Narrative Landscape');
      expect(result.content).toContain('## Methodology');

      // Check narrative data is present
      expect(result.content).toContain('Test narrative about climate policy');
      expect(result.content).toContain('Opposition to carbon tax');

      // Check summary stats
      expect(result.content).toContain('100');
      expect(result.content).toContain('twitter');
      expect(result.content).toContain('reddit');

      // Check velocity trends noted
      expect(result.content).toContain('Growing');
      expect(result.content).toContain('Fading');
    });

    it('should include dominant and surging/fading narrative highlights', async () => {
      const surging = makeNarrative({
        id: 'n-surging',
        summary: 'Surging narrative',
        velocity: { postsPerHour: 10, acceleration: 1.0, trend: 'surging' },
      });
      const fading = makeNarrative({
        id: 'n-fading',
        summary: 'Fading narrative',
        velocity: { postsPerHour: 0.2, acceleration: -0.5, trend: 'fading' },
      });

      const result = await service.generateReport({
        query: 'test',
        summary: baseSummary,
        narratives: [surging, fading],
        format: 'markdown',
      });

      expect(result.content).toContain('**Dominant narrative:**');
      expect(result.content).toContain('**Surging narratives:**');
      expect(result.content).toContain('**Fading narratives:**');
    });
  });

  describe('generateReport — html', () => {
    it('should generate an HTML report', async () => {
      const result = await service.generateReport({
        query: 'climate policy',
        summary: baseSummary,
        narratives: [makeNarrative()],
        format: 'html',
      });

      expect(result.content).toBeDefined();
      expect(result.generatedAt).toBeDefined();

      // Check HTML structure
      expect(result.content).toContain('<!DOCTYPE html>');
      expect(result.content).toContain('</html>');
      expect(result.content).toContain('<h1>');
      expect(result.content).toContain('<h2>Executive Summary</h2>');
      expect(result.content).toContain('<h2>Narrative Landscape</h2>');
      expect(result.content).toContain('<h2>Methodology</h2>');

      // Check data
      expect(result.content).toContain('Test narrative about climate policy');
      expect(result.content).toContain('climate policy');
    });

    it('should escape HTML entities in user-provided data', async () => {
      const narrative = makeNarrative({ summary: 'XSS <script>alert("x")</script> test' });

      const result = await service.generateReport({
        query: '<b>malicious</b>',
        summary: baseSummary,
        narratives: [narrative],
        format: 'html',
      });

      expect(result.content).not.toContain('<script>');
      expect(result.content).toContain('&lt;script&gt;');
      expect(result.content).toContain('&lt;b&gt;malicious&lt;/b&gt;');
    });
  });

  describe('generateReport — empty narratives', () => {
    it('should handle empty narratives gracefully', async () => {
      const result = await service.generateReport({
        query: 'empty query',
        summary: { total: 0, positive: 0, negative: 0, neutral: 0, byPlatform: {} },
        narratives: [],
        format: 'markdown',
      });

      expect(result.content).toBeDefined();
      expect(result.content).toContain('# Narrative Analysis Report: empty query');
      expect(result.content).toContain('No distinct narratives detected');
      expect(result.content).toContain('## Methodology');
    });

    it('should handle empty narratives in HTML format', async () => {
      const result = await service.generateReport({
        query: 'empty',
        summary: { total: 0, positive: 0, negative: 0, neutral: 0, byPlatform: {} },
        narratives: [],
        format: 'html',
      });

      expect(result.content).toContain('No distinct narratives detected');
      expect(result.content).toContain('</html>');
    });
  });

  describe('generateReport — with investigation data', () => {
    it('should include investigation sections in markdown', async () => {
      const result = await service.generateReport({
        query: 'climate policy',
        summary: baseSummary,
        narratives: [makeNarrative()],
        investigation: makeInvestigation(),
        format: 'markdown',
      });

      // All investigation sections present
      expect(result.content).toContain('## Key Actors');
      expect(result.content).toContain('## Coordination Analysis');
      expect(result.content).toContain('## Cui Bono');

      // Key data points
      expect(result.content).toContain('@alice');
      expect(result.content).toContain('@bot_account');
      expect(result.content).toContain('Green Energy Corp');
      expect(result.content).toContain('Promote renewable energy policy');
      expect(result.content).toContain('Propagation chain');

      // Methodology should mention deep investigation
      expect(result.content).toContain('Origin tracing');
      expect(result.content).toContain('Users investigated');
    });

    it('should include investigation sections in HTML', async () => {
      const result = await service.generateReport({
        query: 'climate policy',
        summary: baseSummary,
        narratives: [makeNarrative()],
        investigation: makeInvestigation(),
        format: 'html',
      });

      expect(result.content).toContain('Key Actors');
      expect(result.content).toContain('Coordination Analysis');
      expect(result.content).toContain('Cui Bono');
      expect(result.content).toContain('Green Energy Corp');
    });
  });

  describe('report structure — all sections present', () => {
    it('should contain all expected sections in markdown', async () => {
      const result = await service.generateReport({
        query: 'test topic',
        summary: baseSummary,
        narratives: [makeNarrative()],
        investigation: makeInvestigation(),
        format: 'markdown',
      });

      const expectedSections = [
        '# Narrative Analysis Report',
        '## Executive Summary',
        '## Narrative Landscape',
        '## Key Actors',
        '### Origin Analysis',
        '## Coordination Analysis',
        '## Cui Bono',
        '## Methodology',
        '### Limitations and Caveats',
      ];

      for (const section of expectedSections) {
        expect(result.content).toContain(section);
      }
    });

    it('should not include investigation sections when no investigation is provided', async () => {
      const result = await service.generateReport({
        query: 'test topic',
        summary: baseSummary,
        narratives: [makeNarrative()],
        format: 'markdown',
      });

      expect(result.content).not.toContain('## Key Actors');
      expect(result.content).not.toContain('## Coordination Analysis');
      expect(result.content).not.toContain('## Cui Bono');
    });
  });

  describe('generatedAt timestamp', () => {
    it('should return a valid ISO timestamp', async () => {
      const result = await service.generateReport({
        query: 'test',
        summary: baseSummary,
        narratives: [],
        format: 'markdown',
      });

      const date = new Date(result.generatedAt);
      expect(date.getTime()).not.toBeNaN();
      expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});
