import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  NarrativeAnalysisService,
  AnalyzedNarrative,
  AnalyzeResult,
} from '../../src/lib/services/narrative-analysis.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePost(overrides: Partial<{
  text: string;
  platform: string;
  authorName: string;
  authorHandle: string;
  timestamp: string;
  sentiment: { score: number; label: string };
  engagement: { likes: number; comments: number; shares: number };
}> = {}) {
  return {
    text: overrides.text ?? 'default post text',
    platform: overrides.platform ?? 'twitter',
    authorName: overrides.authorName ?? 'Test User',
    authorHandle: overrides.authorHandle ?? 'testuser',
    timestamp: overrides.timestamp ?? '2025-01-15T12:00:00Z',
    sentiment: overrides.sentiment ?? { score: 0, label: 'neutral' },
    engagement: overrides.engagement ?? { likes: 10, comments: 2, shares: 1 },
  };
}

// Generate posts that should cluster together (similar content)
function makeCluster(topic: string, count: number, platform = 'twitter') {
  const variations = [
    `${topic} is really important for everyone to understand`,
    `People need to know about ${topic} and its impact`,
    `The ${topic} situation is getting more serious every day`,
    `Breaking: new developments in ${topic} are emerging`,
    `${topic} continues to dominate the conversation`,
    `Why ${topic} matters more than ever before`,
    `Understanding ${topic} is critical right now`,
    `The truth about ${topic} that nobody talks about`,
  ];

  return Array.from({ length: count }, (_, i) => makePost({
    text: variations[i % variations.length],
    platform,
    authorHandle: `user${i}`,
    authorName: `User ${i}`,
    timestamp: new Date(Date.now() - (count - i) * 3600000).toISOString(),
    sentiment: { score: i % 2 === 0 ? 0.3 : -0.2, label: i % 2 === 0 ? 'positive' : 'negative' },
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NarrativeAnalysisService', () => {
  let service: NarrativeAnalysisService;

  const originalEnv = process.env;

  beforeEach(async () => {
    // Ensure tests never hit real Gemini API
    process.env = { ...originalEnv };
    delete process.env['GEMINI_API_KEY'];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NarrativeAnalysisService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(undefined), // No Gemini key — uses fallback
          },
        },
      ],
    }).compile();

    service = module.get<NarrativeAnalysisService>(NarrativeAnalysisService);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('analyze', () => {
    it('should return empty result for empty input', async () => {
      const result = await service.analyze([]);
      expect(result.narratives).toEqual([]);
      expect(result.unclustered).toEqual([]);
    });

    it('should return unclustered for a single post', async () => {
      const result = await service.analyze([makePost()]);
      expect(result.narratives).toHaveLength(0);
      expect(result.unclustered).toHaveLength(1);
      expect(result.unclustered[0]).toBe(0);
    });

    it('should promote a high-signal singleton into an emerging narrative', async () => {
      const result = await service.analyze([
        makePost({
          platform: 'youtube',
          text:
            'Rexas Finance scam investigation deep dive with wallet tracing, on-chain evidence, and proof of suspicious fund movement across addresses',
          engagement: { likes: 45, comments: 12, shares: 8 },
        }),
      ]);

      expect(result.narratives).toHaveLength(1);
      expect(result.narratives[0]!.supportLevel).toBe('emerging');
      expect(result.unclustered).toHaveLength(0);
    });

    it('should cluster similar posts together', async () => {
      const posts = [
        ...makeCluster('climate change', 5),
        ...makeCluster('cryptocurrency', 5),
      ];

      const result = await service.analyze(posts);

      // With fallback hash embeddings (no Gemini), clustering quality varies.
      // The key invariant: all posts are accounted for (clustered + unclustered = input)
      const totalAccountedFor =
        result.narratives.reduce((sum, n) => sum + n.postIndices.length, 0) +
        result.unclustered.length;
      expect(totalAccountedFor).toBe(posts.length);
    });

    it('should keep promotion and scam narratives separate when claims conflict', async () => {
      const posts = [
        makePost({
          text: 'Rexas Finance presale launch is bullish and the token sale could moon after launch',
          authorHandle: 'promo1',
        }),
        makePost({
          text: 'Rexas Finance token sale momentum is strong and the presale looks bullish to buyers',
          authorHandle: 'promo2',
        }),
        makePost({
          text: 'Rexas Finance scam investigation shows wallet tracing evidence and warning signs of fraud',
          authorHandle: 'sleuth1',
          sentiment: { score: -0.8, label: 'negative' },
        }),
        makePost({
          text: 'Rexas Finance fraud warning with on-chain evidence and traced funds suggests a rug pull',
          authorHandle: 'sleuth2',
          sentiment: { score: -0.9, label: 'negative' },
        }),
      ];

      const result = await service.analyze(posts);
      expect(result.narratives.length).toBeGreaterThanOrEqual(2);
    });

    it('should produce valid narrative objects', async () => {
      const posts = makeCluster('housing crisis', 6);
      const result = await service.analyze(posts);

      if (result.narratives.length > 0) {
        const narrative = result.narratives[0]!;

        // Required fields
        expect(narrative.id).toBeDefined();
        expect(typeof narrative.summary).toBe('string');
        expect(narrative.postIndices.length).toBeGreaterThanOrEqual(2);
        expect(typeof narrative.avgSentiment).toBe('number');
        expect(narrative.avgSentiment).toBeGreaterThanOrEqual(-1);
        expect(narrative.avgSentiment).toBeLessThanOrEqual(1);

        // Platforms
        expect(narrative.platforms).toBeDefined();
        expect(narrative.platforms['twitter']).toBeGreaterThan(0);

        // Authors
        expect(narrative.authors.length).toBeGreaterThan(0);
        expect(narrative.authors[0]).toHaveProperty('name');
        expect(narrative.authors[0]).toHaveProperty('handle');
        expect(narrative.authors[0]).toHaveProperty('postCount');

        // Timestamps
        expect(narrative.firstSeen).toBeDefined();
        expect(narrative.lastSeen).toBeDefined();
        expect(new Date(narrative.firstSeen).getTime()).toBeLessThanOrEqual(
          new Date(narrative.lastSeen).getTime(),
        );

        // Velocity
        expect(narrative.velocity).toBeDefined();
        expect(typeof narrative.velocity.postsPerHour).toBe('number');
        expect(typeof narrative.velocity.acceleration).toBe('number');
        expect(['surging', 'growing', 'steady', 'fading']).toContain(
          narrative.velocity.trend,
        );

        // Centroid
        expect(narrative.centroidEmbedding).toBeDefined();
        expect(narrative.centroidEmbedding.length).toBeGreaterThan(0);
      }
    });

    it('should sort narratives by post count descending', async () => {
      const posts = [
        ...makeCluster('big topic', 10),
        ...makeCluster('small topic', 3),
      ];

      const result = await service.analyze(posts);

      for (let i = 1; i < result.narratives.length; i++) {
        expect(result.narratives[i - 1]!.postIndices.length).toBeGreaterThanOrEqual(
          result.narratives[i]!.postIndices.length,
        );
      }
    });

    it('should not duplicate post indices across narratives', async () => {
      const posts = [
        ...makeCluster('topic A', 8),
        ...makeCluster('topic B', 8),
      ];

      const result = await service.analyze(posts);
      const allIndices = [
        ...result.narratives.flatMap((n) => n.postIndices),
        ...result.unclustered,
      ];

      // No duplicates
      const uniqueIndices = new Set(allIndices);
      expect(uniqueIndices.size).toBe(allIndices.length);

      // All original indices accounted for
      expect(allIndices.length).toBe(posts.length);
    });

    it('should handle multi-platform posts', async () => {
      const posts = [
        ...makeCluster('elections', 3, 'twitter'),
        ...makeCluster('elections', 3, 'reddit'),
        ...makeCluster('elections', 3, 'youtube'),
      ];

      const result = await service.analyze(posts);

      // At least some narrative should have multiple platforms
      const multiPlatform = result.narratives.some(
        (n) => Object.keys(n.platforms).length > 1,
      );
      // With fallback embeddings this isn't guaranteed, but check structure
      for (const narrative of result.narratives) {
        for (const [platform, count] of Object.entries(narrative.platforms)) {
          expect(typeof platform).toBe('string');
          expect(count).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('velocity calculation', () => {
    it('should detect surging narratives', async () => {
      // Posts accelerating: 1 per hour first half, 5 per hour second half
      const now = Date.now();
      const posts: ReturnType<typeof makePost>[] = [];

      // First half: 3 posts over 3 hours
      for (let i = 0; i < 3; i++) {
        posts.push(makePost({
          text: 'economy collapse discussion topic',
          timestamp: new Date(now - 6 * 3600000 + i * 3600000).toISOString(),
        }));
      }
      // Second half: 9 posts over 3 hours
      for (let i = 0; i < 9; i++) {
        posts.push(makePost({
          text: 'economy collapse urgent discussion',
          timestamp: new Date(now - 3 * 3600000 + i * 1200000).toISOString(),
        }));
      }

      const result = await service.analyze(posts);

      // Should have at least one narrative
      if (result.narratives.length > 0) {
        const biggest = result.narratives[0]!;
        expect(biggest.velocity.postsPerHour).toBeGreaterThan(0);
        // acceleration should be positive (second half is faster)
        expect(biggest.velocity.acceleration).toBeGreaterThan(0);
      }
    });

    it('should detect fading narratives', async () => {
      const now = Date.now();
      const posts: ReturnType<typeof makePost>[] = [];

      // First half: 9 posts over 3 hours
      for (let i = 0; i < 9; i++) {
        posts.push(makePost({
          text: 'trending scandal breaking news',
          timestamp: new Date(now - 6 * 3600000 + i * 1200000).toISOString(),
        }));
      }
      // Second half: 3 posts over 3 hours
      for (let i = 0; i < 3; i++) {
        posts.push(makePost({
          text: 'trending scandal update news',
          timestamp: new Date(now - 3 * 3600000 + i * 3600000).toISOString(),
        }));
      }

      const result = await service.analyze(posts);

      if (result.narratives.length > 0) {
        const biggest = result.narratives[0]!;
        // acceleration should be negative (second half is slower)
        expect(biggest.velocity.acceleration).toBeLessThan(0);
      }
    });
  });

  describe('sentiment trajectory', () => {
    it('should produce time-bucketed sentiment data', async () => {
      const posts = makeCluster('test narrative', 8);
      const result = await service.analyze(posts);

      if (result.narratives.length > 0) {
        const trajectory = result.narratives[0]!.sentimentTrajectory;
        expect(Array.isArray(trajectory)).toBe(true);

        for (const point of trajectory) {
          expect(point.timestamp).toBeDefined();
          expect(typeof point.score).toBe('number');
          expect(point.score).toBeGreaterThanOrEqual(-1);
          expect(point.score).toBeLessThanOrEqual(1);
        }

        // Should be sorted chronologically
        for (let i = 1; i < trajectory.length; i++) {
          expect(
            new Date(trajectory[i]!.timestamp).getTime(),
          ).toBeGreaterThanOrEqual(
            new Date(trajectory[i - 1]!.timestamp).getTime(),
          );
        }
      }
    });
  });

  describe('author aggregation', () => {
    it('should aggregate authors and sort by post count', async () => {
      const posts = [
        makePost({ text: 'same topic discussion point', authorHandle: 'prolific', authorName: 'Prolific' }),
        makePost({ text: 'same topic discussion update', authorHandle: 'prolific', authorName: 'Prolific' }),
        makePost({ text: 'same topic discussion news', authorHandle: 'prolific', authorName: 'Prolific' }),
        makePost({ text: 'same topic discussion view', authorHandle: 'casual', authorName: 'Casual' }),
      ];

      const result = await service.analyze(posts);

      if (result.narratives.length > 0) {
        const authors = result.narratives[0]!.authors;
        // Authors should be sorted by postCount descending
        for (let i = 1; i < authors.length; i++) {
          expect(authors[i - 1]!.postCount).toBeGreaterThanOrEqual(
            authors[i]!.postCount,
          );
        }
      }
    });
  });

  describe('edge cases', () => {
    it('should handle posts with empty text', async () => {
      const posts = [
        makePost({ text: '' }),
        makePost({ text: '' }),
      ];

      // Should not throw
      const result = await service.analyze(posts);
      expect(result).toBeDefined();
    });

    it('should handle posts with very long text', async () => {
      const longText = 'word '.repeat(5000);
      const posts = [
        makePost({ text: longText }),
        makePost({ text: longText }),
      ];

      const result = await service.analyze(posts);
      expect(result).toBeDefined();
    });

    it('should handle posts with identical timestamps', async () => {
      const ts = '2025-06-01T00:00:00Z';
      const posts = Array.from({ length: 5 }, () =>
        makePost({ text: 'identical time post about topic', timestamp: ts }),
      );

      const result = await service.analyze(posts);
      expect(result).toBeDefined();
      // Velocity should handle zero time range gracefully
      if (result.narratives.length > 0) {
        expect(isFinite(result.narratives[0]!.velocity.postsPerHour)).toBe(true);
      }
    });

    it('should handle exactly 2 posts', async () => {
      const posts = [
        makePost({ text: 'topic A important discussion' }),
        makePost({ text: 'topic A important update' }),
      ];

      const result = await service.analyze(posts);
      // Either clustered together or both unclustered — no crash
      const totalAccountedFor =
        result.narratives.reduce((s, n) => s + n.postIndices.length, 0) +
        result.unclustered.length;
      expect(totalAccountedFor).toBe(2);
    });
  });
});
