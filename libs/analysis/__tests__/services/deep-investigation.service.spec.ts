import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  DeepInvestigationService,
  UserPost,
  DeepInvestigationResult,
} from '../../src/lib/services/deep-investigation.service';

function makeUserPost(overrides: Partial<UserPost> = {}): UserPost {
  return {
    text: overrides.text ?? 'default post text',
    timestamp: overrides.timestamp ?? '2025-06-01T12:00:00Z',
    platform: overrides.platform ?? 'twitter',
    url: overrides.url,
    engagement: overrides.engagement ?? { likes: 5, comments: 1, shares: 0 },
    sentiment: overrides.sentiment ?? { score: 0, label: 'neutral' },
  };
}

describe('DeepInvestigationService', () => {
  let service: DeepInvestigationService;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    delete process.env['GEMINI_API_KEY'];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeepInvestigationService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<DeepInvestigationService>(DeepInvestigationService);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('investigate', () => {
    it('should handle empty user timelines', async () => {
      const result = await service.investigate('test topic', new Map());
      expect(result.topic).toBe('test topic');
      expect(result.users).toEqual([]);
      expect(result.originAnalysis.firstMover).toBe('unknown');
    });

    it('should analyze users and return structured results', async () => {
      const timelines = new Map<string, { topicPosts: UserPost[]; historicalPosts: UserPost[] }>();

      timelines.set('user_alpha', {
        topicPosts: [
          makeUserPost({ text: 'This topic is important', timestamp: '2025-06-01T10:00:00Z', sentiment: { score: 0.5, label: 'positive' } }),
          makeUserPost({ text: 'More about this topic', timestamp: '2025-06-01T14:00:00Z', sentiment: { score: 0.3, label: 'positive' } }),
        ],
        historicalPosts: [
          makeUserPost({ text: 'Random other post', timestamp: '2025-05-15T08:00:00Z' }),
          makeUserPost({ text: 'Another random post', timestamp: '2025-05-20T09:00:00Z' }),
        ],
      });

      timelines.set('user_beta', {
        topicPosts: [
          makeUserPost({ text: 'I agree about this topic', timestamp: '2025-06-01T12:00:00Z', sentiment: { score: 0.4, label: 'positive' } }),
        ],
        historicalPosts: [
          makeUserPost({ text: 'Some history', timestamp: '2025-05-01T08:00:00Z' }),
        ],
      });

      const result = await service.investigate('test topic', timelines);

      expect(result.topic).toBe('test topic');
      expect(result.users).toHaveLength(2);

      // Check user structure
      for (const user of result.users) {
        expect(user.user.handle).toBeDefined();
        expect(user.user.topicPosts.length).toBeGreaterThan(0);
        expect(typeof user.influenceScore).toBe('number');
        expect(user.influenceScore).toBeGreaterThanOrEqual(0);
        expect(user.influenceScore).toBeLessThanOrEqual(1);
        expect(Array.isArray(user.flags)).toBe(true);
        expect(user.user.profile).toBeDefined();
        expect(user.user.profile.summary).toBeDefined();
      }
    });

    it('should identify the first mover', async () => {
      const timelines = new Map<string, { topicPosts: UserPost[]; historicalPosts: UserPost[] }>();

      timelines.set('late_user', {
        topicPosts: [makeUserPost({ timestamp: '2025-06-05T12:00:00Z' })],
        historicalPosts: [],
      });
      timelines.set('first_user', {
        topicPosts: [makeUserPost({ timestamp: '2025-06-01T08:00:00Z' })],
        historicalPosts: [],
      });
      timelines.set('middle_user', {
        topicPosts: [makeUserPost({ timestamp: '2025-06-03T10:00:00Z' })],
        historicalPosts: [],
      });

      const result = await service.investigate('test', timelines);

      expect(result.originAnalysis.firstMover).toBe('first_user');
      expect(result.originAnalysis.propagationChain[0]).toBe('first_user');
      expect(result.originAnalysis.propagationChain).toHaveLength(3);
    });

    it('should sort users by influence score', async () => {
      const timelines = new Map<string, { topicPosts: UserPost[]; historicalPosts: UserPost[] }>();

      // Low engagement user
      timelines.set('small_user', {
        topicPosts: [makeUserPost({ engagement: { likes: 1, comments: 0, shares: 0 } })],
        historicalPosts: [],
      });

      // High engagement user
      timelines.set('big_user', {
        topicPosts: Array.from({ length: 10 }, (_, i) =>
          makeUserPost({
            engagement: { likes: 1000, comments: 200, shares: 100 },
            timestamp: new Date(Date.now() - i * 3600000).toISOString(),
          }),
        ),
        historicalPosts: [],
      });

      const result = await service.investigate('test', timelines);

      expect(result.users[0]!.user.handle).toBe('big_user');
    });

    it('should detect narrative shifts', async () => {
      const timelines = new Map<string, { topicPosts: UserPost[]; historicalPosts: UserPost[] }>();

      timelines.set('flip_flopper', {
        topicPosts: [
          makeUserPost({ timestamp: '2025-06-01T10:00:00Z', sentiment: { score: 0.8, label: 'positive' } }),
          makeUserPost({ timestamp: '2025-06-02T10:00:00Z', sentiment: { score: 0.6, label: 'positive' } }),
          makeUserPost({ timestamp: '2025-06-03T10:00:00Z', sentiment: { score: -0.7, label: 'negative' } }),
          makeUserPost({ timestamp: '2025-06-04T10:00:00Z', sentiment: { score: -0.5, label: 'negative' } }),
        ],
        historicalPosts: [],
      });

      const result = await service.investigate('test', timelines);

      const user = result.users.find((u) => u.user.handle === 'flip_flopper')!;
      expect(user.user.narrativeEvolution.length).toBeGreaterThan(0);
      expect(user.user.narrativeEvolution[0]!.fromStance).toBe('positive');
      expect(user.user.narrativeEvolution[0]!.toStance).toBe('negative');
    });
  });

  describe('flag detection', () => {
    it('should flag burst posting', async () => {
      const now = Date.now();
      const timelines = new Map<string, { topicPosts: UserPost[]; historicalPosts: UserPost[] }>();

      // 5 posts within 2 minutes
      timelines.set('bot_user', {
        topicPosts: Array.from({ length: 6 }, (_, i) =>
          makeUserPost({
            text: `Burst post ${i}`,
            timestamp: new Date(now - (6 - i) * 20000).toISOString(), // 20 sec apart
          }),
        ),
        historicalPosts: [],
      });

      const result = await service.investigate('test', timelines);
      const user = result.users.find((u) => u.user.handle === 'bot_user')!;
      expect(user.flags.some((f) => f.includes('Burst posting'))).toBe(true);
    });

    it('should flag repetitive content', async () => {
      const timelines = new Map<string, { topicPosts: UserPost[]; historicalPosts: UserPost[] }>();

      timelines.set('spam_user', {
        topicPosts: Array.from({ length: 10 }, (_, i) =>
          makeUserPost({
            text: 'Exact same message copied over and over',
            timestamp: new Date(Date.now() - i * 3600000).toISOString(),
          }),
        ),
        historicalPosts: [],
      });

      const result = await service.investigate('test', timelines);
      const user = result.users.find((u) => u.user.handle === 'spam_user')!;
      expect(user.flags.some((f) => f.includes('Repetitive content'))).toBe(true);
    });
  });

  describe('coordination detection', () => {
    it('should detect temporal clustering', async () => {
      const baseTime = new Date('2025-06-01T12:00:00Z').getTime();
      const timelines = new Map<string, { topicPosts: UserPost[]; historicalPosts: UserPost[] }>();

      // 5 users all posting within 10 minutes of each other
      for (let i = 0; i < 5; i++) {
        timelines.set(`coordinated_${i}`, {
          topicPosts: [
            makeUserPost({
              timestamp: new Date(baseTime + i * 2 * 60000).toISOString(), // 2 min apart
            }),
          ],
          historicalPosts: [],
        });
      }

      const result = await service.investigate('test', timelines);
      expect(result.coordination.clusters.length).toBeGreaterThan(0);
    });

    it('should not flag naturally spread adoption', async () => {
      const timelines = new Map<string, { topicPosts: UserPost[]; historicalPosts: UserPost[] }>();

      // Users spread over days
      for (let i = 0; i < 5; i++) {
        timelines.set(`organic_${i}`, {
          topicPosts: [
            makeUserPost({
              timestamp: new Date(Date.now() - i * 24 * 3600000).toISOString(), // 1 day apart
            }),
          ],
          historicalPosts: [],
        });
      }

      const result = await service.investigate('test', timelines);
      // Should not have temporal coordination clusters (spread > 30 min window)
      const temporalClusters = result.coordination.clusters.filter(
        (c) => !c.pattern.includes('suspicious'),
      );
      expect(temporalClusters).toHaveLength(0);
    });
  });

  describe('cui bono', () => {
    it('should return fallback when no LLM available', async () => {
      const timelines = new Map<string, { topicPosts: UserPost[]; historicalPosts: UserPost[] }>();
      timelines.set('user1', {
        topicPosts: [makeUserPost()],
        historicalPosts: [],
      });

      const result = await service.investigate('test', timelines);
      expect(result.cuiBono).toBeDefined();
      expect(result.cuiBono.summary).toContain('Unable to determine');
    });
  });
});
