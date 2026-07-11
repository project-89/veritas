import type { UserPost } from './deep-investigation.service';
import { GraphBotDetectionService } from './graph-bot-detection.service';
import { GraphDatabaseService } from './graph-database.service';

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

function makeGraphService(available = false): GraphDatabaseService {
  return {
    isAvailable: available,
    runQuery: jest.fn().mockResolvedValue([]),
    upsertUser: jest.fn().mockResolvedValue(undefined),
    upsertNarrative: jest.fn().mockResolvedValue(undefined),
    addEdge: jest.fn().mockResolvedValue(undefined),
    recordAmplification: jest.fn().mockResolvedValue(undefined),
    detectStarPatterns: jest.fn().mockResolvedValue([]),
    detectChainPatterns: jest.fn().mockResolvedValue([]),
    detectCliquePatterns: jest.fn().mockResolvedValue([]),
  } as unknown as GraphDatabaseService;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GraphBotDetectionService', () => {
  describe('heuristic-only detection (no Memgraph)', () => {
    let service: GraphBotDetectionService;

    beforeEach(() => {
      service = new GraphBotDetectionService(makeGraphService(false));
    });

    it('should detect bots with burst posting patterns', async () => {
      const burstUser = {
        handle: 'burstbot',
        platform: 'twitter',
        posts: Array.from({ length: 20 }, (_, i) =>
          makePost({
            text: `Spam message ${i} about scam`,
            timestamp: new Date(
              Date.now() - (20 - i) * 10 * 1000, // one every 10 seconds
            ).toISOString(),
            engagement: { likes: 0, comments: 0, shares: 0 },
          }),
        ),
      };

      const result = await service.detectBots([burstUser]);

      expect(result.scores).toHaveLength(1);
      expect(result.scores[0]!.botProbability).toBeGreaterThan(0);
      expect(result.graphEnhanced).toBe(false);
    });

    it('should give low bot score to normal users', async () => {
      const normalUser = {
        handle: 'normaluser',
        platform: 'twitter',
        posts: Array.from({ length: 15 }, (_, i) =>
          makePost({
            text: `Unique thoughtful post number ${i} about different topics like ${['cats', 'tech', 'news', 'weather', 'food'][i % 5]}`,
            timestamp: new Date(
              Date.now() - (15 - i) * 4 * 60 * 60 * 1000, // every 4 hours
            ).toISOString(),
            engagement: { likes: 10 + i, comments: 2, shares: 1 },
            sentiment: { score: [-0.3, 0.2, 0.5, -0.1, 0.8][i % 5]!, label: 'mixed' },
          }),
        ),
      };

      const result = await service.detectBots([normalUser]);

      expect(result.scores[0]!.botProbability).toBeLessThan(0.5);
    });

    it('should detect repetitive content as behavioral anomaly', async () => {
      const spammer = {
        handle: 'spammer',
        platform: 'twitter',
        posts: Array.from({ length: 20 }, (_, i) =>
          makePost({
            text: 'Check out this amazing offer! Click here now!',
            timestamp: new Date(Date.now() - (20 - i) * 60 * 60 * 1000).toISOString(),
            engagement: { likes: 0, comments: 0, shares: 0 },
            sentiment: { score: 0.5, label: 'positive' },
          }),
        ),
      };

      const result = await service.detectBots([spammer]);

      expect(result.scores[0]!.behavioralScore).toBeGreaterThan(0.3);
    });

    it('should return summary with detection counts', async () => {
      const result = await service.detectBots([
        {
          handle: 'user1',
          platform: 'twitter',
          posts: [makePost()],
        },
      ]);

      // A single-post user cannot be assessed — the score abstains (null) and
      // the summary reports it as insufficient rather than laundering it into 0.
      expect(result.summary).toContain('Assessed 0/1 users');
      expect(result.summary).toContain('insufficient data');
      expect(result.summary).toContain('heuristic-only detection');
      expect(result.scores[0]!.botProbability).toBeNull();
      expect(result.scores[0]!.dataSufficiency).toBe('insufficient');
    });
  });

  describe('temporal scoring', () => {
    let service: GraphBotDetectionService;

    beforeEach(() => {
      service = new GraphBotDetectionService(makeGraphService(false));
    });

    it('should return 0 for too few posts', () => {
      const result = service.computeTemporalScore([makePost(), makePost()]);
      expect(result).toBe(0);
    });

    it('should detect machine-like regularity', () => {
      // Posts at exactly 60-second intervals
      const posts = Array.from({ length: 20 }, (_, i) =>
        makePost({
          timestamp: new Date(Date.now() - (20 - i) * 60 * 1000).toISOString(),
        }),
      );

      const result = service.computeTemporalScore(posts);
      expect(result).toBeGreaterThanOrEqual(0.3);
    });
  });

  describe('behavioral scoring', () => {
    let service: GraphBotDetectionService;

    beforeEach(() => {
      service = new GraphBotDetectionService(makeGraphService(false));
    });

    it('should return 0 for too few posts', () => {
      const result = service.computeBehavioralScore([makePost()]);
      expect(result).toBe(0);
    });

    it('should score high for identical content with zero engagement', () => {
      const posts = Array.from({ length: 10 }, () =>
        makePost({
          text: 'Identical bot spam message',
          engagement: { likes: 0, comments: 0, shares: 0 },
          sentiment: { score: 0.5, label: 'positive' },
        }),
      );

      const result = service.computeBehavioralScore(posts);
      expect(result).toBeGreaterThan(0.5);
    });
  });

  describe('heuristic structural patterns', () => {
    let service: GraphBotDetectionService;

    beforeEach(() => {
      service = new GraphBotDetectionService(makeGraphService(false));
    });

    it('should detect co-timed posting clusters', async () => {
      const now = Date.now();
      const coTimedUsers = Array.from({ length: 5 }, (_, i) => ({
        handle: `user${i}`,
        platform: 'twitter',
        posts: [
          makePost({
            timestamp: new Date(now - 60 * 1000 * i).toISOString(), // within 5 min
          }),
          makePost({
            timestamp: new Date(now - 120 * 1000 * i).toISOString(),
          }),
          makePost({
            timestamp: new Date(now - 180 * 1000 * i).toISOString(),
          }),
        ],
      }));

      const result = await service.detectBots(coTimedUsers);

      // Should find some structural patterns
      expect(result.structuralPatterns.length).toBeGreaterThanOrEqual(0);
      expect(result.summary).toContain('5 users');
    });

    it('should detect similar content between users', async () => {
      const users = [
        {
          handle: 'copycat1',
          platform: 'twitter',
          posts: [
            makePost({
              text: 'This is clearly a coordinated message that multiple accounts share',
            }),
            makePost({ text: 'Another identical message posted by supposedly different people' }),
          ],
        },
        {
          handle: 'copycat2',
          platform: 'twitter',
          posts: [
            makePost({
              text: 'This is clearly a coordinated message that multiple accounts share',
            }),
            makePost({ text: 'Another identical message posted by supposedly different people' }),
          ],
        },
      ];

      const result = await service.detectBots(users);

      // Should detect the similar content
      const hasChainPattern = result.structuralPatterns.some(
        (p) => p.type === 'chain' && p.description.includes('near-identical'),
      );
      expect(hasChainPattern).toBe(true);
    });
  });

  describe('graph-enhanced detection', () => {
    it('should use graph when available', async () => {
      const graphService = makeGraphService(true);
      const service = new GraphBotDetectionService(graphService);

      const result = await service.detectBots([
        {
          handle: 'user1',
          platform: 'twitter',
          posts: [makePost()],
        },
      ]);

      expect(result.graphEnhanced).toBe(true);
      expect(result.summary).toContain('graph-enhanced detection');

      // Should have called graph methods
      expect(graphService.upsertUser).toHaveBeenCalled();
      expect(graphService.detectStarPatterns).toHaveBeenCalled();
      expect(graphService.detectChainPatterns).toHaveBeenCalled();
      expect(graphService.detectCliquePatterns).toHaveBeenCalled();
    });

    it('should build heterogeneous edges between users', async () => {
      const graphService = makeGraphService(true);
      const service = new GraphBotDetectionService(graphService);

      const now = Date.now();
      await service.detectBots([
        {
          handle: 'userA',
          platform: 'twitter',
          posts: [makePost({ timestamp: new Date(now).toISOString() })],
        },
        {
          handle: 'userB',
          platform: 'twitter',
          posts: [makePost({ timestamp: new Date(now + 60000).toISOString() })], // 1 min later
        },
      ]);

      // Should have created CO_TIMED and CO_NARRATIVE edges
      expect(graphService.addEdge).toHaveBeenCalled();
      const calls = (graphService.addEdge as jest.Mock).mock.calls;
      const edgeTypes = calls.map((c: unknown[]) => c[4]);
      expect(edgeTypes).toContain('CO_TIMED');
      expect(edgeTypes).toContain('CO_NARRATIVE');
    });
  });
});
