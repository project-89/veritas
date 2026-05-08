import type { UserPost } from './deep-investigation.service';
import { GraphDatabaseService } from './graph-database.service';
import { SourceCredibilityService } from './source-credibility.service';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makePost(overrides: Partial<UserPost> = {}): UserPost {
  return {
    text: overrides.text ?? 'Test post content',
    timestamp: overrides.timestamp ?? '2025-06-01T12:00:00Z',
    platform: overrides.platform ?? 'twitter',
    url: overrides.url,
    engagement: overrides.engagement ?? { likes: 10, comments: 3, shares: 2 },
    sentiment: overrides.sentiment ?? { score: 0.5, label: 'positive' },
  };
}

function makePosts(count: number, opts?: { startDate?: Date; intervalMs?: number }): UserPost[] {
  const start = opts?.startDate ?? new Date('2025-01-01T00:00:00Z');
  const interval = opts?.intervalMs ?? 24 * 60 * 60 * 1000; // 1 day default

  return Array.from({ length: count }, (_, i) => {
    const ts = new Date(start.getTime() + i * interval);
    return makePost({
      text: `Unique post number ${i} about topic ${i % 5}`,
      timestamp: ts.toISOString(),
      engagement: {
        likes: 5 + Math.floor(Math.random() * 50),
        comments: 1 + Math.floor(Math.random() * 10),
        shares: Math.floor(Math.random() * 5),
      },
    });
  });
}

function makeGraphService(available = false): GraphDatabaseService {
  return {
    isAvailable: available,
    runQuery: jest.fn().mockResolvedValue([]),
    upsertUser: jest.fn().mockResolvedValue(undefined),
    upsertNarrative: jest.fn().mockResolvedValue(undefined),
    addEdge: jest.fn().mockResolvedValue(undefined),
    recordAmplification: jest.fn().mockResolvedValue(undefined),
    getPageRankForNarrative: jest.fn().mockResolvedValue(new Map()),
    getBetweennessForNarrative: jest.fn().mockResolvedValue(new Map()),
    detectCommunities: jest.fn().mockResolvedValue(new Map()),
  } as unknown as GraphDatabaseService;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SourceCredibilityService', () => {
  describe('heuristic scoring (no Memgraph)', () => {
    let service: SourceCredibilityService;

    beforeEach(() => {
      service = new SourceCredibilityService(makeGraphService(false));
    });

    it('should return a score between 0 and 1', async () => {
      const posts = makePosts(20);
      const result = await service.scoreSource('testuser', 'twitter', posts);

      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(1);
      expect(result.handle).toBe('testuser');
      expect(result.platform).toBe('twitter');
    });

    it('should have null graph signals when Memgraph is unavailable', async () => {
      const posts = makePosts(10);
      const result = await service.scoreSource('testuser', 'twitter', posts);

      expect(result.signals.pageRank).toBeNull();
      expect(result.signals.betweenness).toBeNull();
      expect(result.signals.communityCount).toBeNull();
    });

    it('should give higher credibility to consistent, diverse posters', async () => {
      // Consistent poster: regular intervals, diverse content, good engagement
      const goodPosts = makePosts(30, {
        startDate: new Date('2024-06-01'),
        intervalMs: 24 * 60 * 60 * 1000, // once per day
      });

      // Suspicious poster: burst of identical posts, no engagement
      const badPosts = Array.from({ length: 30 }, (_, i) =>
        makePost({
          text: 'Buy crypto now! Amazing opportunity!',
          timestamp: new Date(Date.now() - (30 - i) * 60 * 1000).toISOString(), // all within 30 min
          engagement: { likes: 0, comments: 0, shares: 0 },
        }),
      );

      const goodScore = await service.scoreSource('gooduser', 'twitter', goodPosts);
      const badScore = await service.scoreSource('baduser', 'twitter', badPosts);

      expect(goodScore.overallScore).toBeGreaterThan(badScore.overallScore);
    });

    it('should score multiple sources', async () => {
      const results = await service.scoreMultipleSources([
        { handle: 'user1', platform: 'twitter', posts: makePosts(10) },
        { handle: 'user2', platform: 'reddit', posts: makePosts(5) },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0]!.handle).toBe('user1');
      expect(results[1]!.handle).toBe('user2');
    });
  });

  describe('computeAccountAge', () => {
    let service: SourceCredibilityService;

    beforeEach(() => {
      service = new SourceCredibilityService(makeGraphService(false));
    });

    it('should return moderate score for a single post (benefit of doubt)', () => {
      const result = service.computeAccountAge([makePost()]);
      expect(result).toBe(0.3);
    });

    it('should return higher score for longer posting history', () => {
      const posts = makePosts(10, {
        startDate: new Date('2024-01-01'),
        intervalMs: 30 * 24 * 60 * 60 * 1000, // monthly
      });
      const result = service.computeAccountAge(posts);
      expect(result).toBeGreaterThan(0.5);
    });

    it('should max out at 1.0 for 180+ days', () => {
      const posts = [
        makePost({ timestamp: '2024-01-01T00:00:00Z' }),
        makePost({ timestamp: '2024-07-15T00:00:00Z' }),
      ];
      const result = service.computeAccountAge(posts);
      expect(result).toBe(1.0);
    });
  });

  describe('computePostingConsistency', () => {
    let service: SourceCredibilityService;

    beforeEach(() => {
      service = new SourceCredibilityService(makeGraphService(false));
    });

    it('should return 0.5 for too few posts', () => {
      const result = service.computePostingConsistency([makePost(), makePost()]);
      expect(result).toBe(0.5);
    });

    it('should score high for regular intervals', () => {
      const posts = makePosts(10, {
        intervalMs: 60 * 60 * 1000, // exactly every hour
      });
      const result = service.computePostingConsistency(posts);
      expect(result).toBeGreaterThanOrEqual(0.8);
    });

    it('should score low for all-at-once posting', () => {
      const posts = makePosts(10, {
        intervalMs: 0, // all at same time
      });
      const result = service.computePostingConsistency(posts);
      expect(result).toBeLessThanOrEqual(0.2);
    });
  });

  describe('computeEngagementRatio', () => {
    let service: SourceCredibilityService;

    beforeEach(() => {
      service = new SourceCredibilityService(makeGraphService(false));
    });

    it('should return 0 for no posts', () => {
      expect(service.computeEngagementRatio([])).toBe(0);
    });

    it('should return higher score for more engagement', () => {
      const lowEngagement = [makePost({ engagement: { likes: 0, comments: 0, shares: 0 } })];
      const highEngagement = [makePost({ engagement: { likes: 500, comments: 100, shares: 50 } })];

      const low = service.computeEngagementRatio(lowEngagement);
      const high = service.computeEngagementRatio(highEngagement);

      expect(high).toBeGreaterThan(low);
    });
  });

  describe('computeContentDiversity', () => {
    let service: SourceCredibilityService;

    beforeEach(() => {
      service = new SourceCredibilityService(makeGraphService(false));
    });

    it('should return 0.5 for single post', () => {
      expect(service.computeContentDiversity([makePost()])).toBe(0.5);
    });

    it('should return low score for identical posts', () => {
      const posts = Array.from({ length: 10 }, () =>
        makePost({ text: 'Same text over and over again in every single post' }),
      );
      const result = service.computeContentDiversity(posts);
      expect(result).toBeLessThan(0.5);
    });

    it('should return high score for diverse posts', () => {
      const posts = makePosts(20); // Each has unique text
      const result = service.computeContentDiversity(posts);
      expect(result).toBeGreaterThan(0.5);
    });
  });

  describe('computeCrossPlatformPresence', () => {
    let service: SourceCredibilityService;

    beforeEach(() => {
      service = new SourceCredibilityService(makeGraphService(false));
    });

    it('should return 0.2 for single platform', () => {
      const posts = [makePost({ platform: 'twitter' })];
      expect(service.computeCrossPlatformPresence(posts)).toBe(0.2);
    });

    it('should return 0.5 for two platforms', () => {
      const posts = [makePost({ platform: 'twitter' }), makePost({ platform: 'reddit' })];
      expect(service.computeCrossPlatformPresence(posts)).toBe(0.5);
    });

    it('should return 1.0 for three or more platforms', () => {
      const posts = [
        makePost({ platform: 'twitter' }),
        makePost({ platform: 'reddit' }),
        makePost({ platform: 'youtube' }),
      ];
      expect(service.computeCrossPlatformPresence(posts)).toBe(1.0);
    });

    it('should count cross-platform accounts', () => {
      const posts = [makePost({ platform: 'twitter' })];
      expect(service.computeCrossPlatformPresence(posts, ['twitter', 'reddit', 'mastodon'])).toBe(
        1.0,
      );
    });
  });

  describe('flags', () => {
    let service: SourceCredibilityService;

    beforeEach(() => {
      service = new SourceCredibilityService(makeGraphService(false));
    });

    it('should flag accounts with limited history when many posts cluster in short window', async () => {
      // 12 posts all within a single day — triggers "limited history" flag
      const posts = Array.from({ length: 12 }, (_, i) =>
        makePost({
          text: `Post ${i} about various topics`,
          timestamp: new Date(2025, 5, 1, i, 0, 0).toISOString(),
        }),
      );
      const result = await service.scoreSource('newuser', 'twitter', posts);
      expect(result.flags).toContain('Limited history — all sampled posts within 3 days');
    });

    it('should flag 24h posting', async () => {
      const posts = Array.from({ length: 24 }, (_, i) =>
        makePost({
          text: `Post at hour ${i} about different things`,
          timestamp: new Date(2025, 5, 1, i, 0, 0).toISOString(),
        }),
      );
      const result = await service.scoreSource('alwayson', 'twitter', posts);
      expect(result.flags.some((f) => f.includes('Posts across nearly all hours'))).toBe(true);
    });
  });

  describe('buildRelationshipGraph', () => {
    it('should skip graph build when Memgraph is unavailable', async () => {
      const graphService = makeGraphService(false);
      const service = new SourceCredibilityService(graphService);

      await service.buildRelationshipGraph(
        [{ handle: 'user1', platform: 'twitter', posts: makePosts(5) }],
        'test-narrative',
      );

      expect(graphService.upsertNarrative).not.toHaveBeenCalled();
    });

    it('should build graph when Memgraph is available', async () => {
      const graphService = makeGraphService(true);
      const service = new SourceCredibilityService(graphService);

      const users = [
        { handle: 'user1', platform: 'twitter', posts: makePosts(3) },
        { handle: 'user2', platform: 'twitter', posts: makePosts(3) },
      ];

      await service.buildRelationshipGraph(users, 'test-narrative');

      expect(graphService.upsertNarrative).toHaveBeenCalledWith(
        'test-narrative',
        'test-narrative',
        {},
      );
      expect(graphService.upsertUser).toHaveBeenCalledTimes(2);
      expect(graphService.recordAmplification).toHaveBeenCalledTimes(2);
    });
  });

  describe('detectBridgeNodes', () => {
    it('should return empty array when Memgraph is unavailable', async () => {
      const service = new SourceCredibilityService(makeGraphService(false));
      const result = await service.detectBridgeNodes('test-narrative');
      expect(result).toEqual([]);
    });
  });
});
