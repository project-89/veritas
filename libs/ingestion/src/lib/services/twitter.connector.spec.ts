import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TwitterConnector } from './twitter.connector';
import { TwitterApi, TweetV2, UserV2, TwitterApiv2 } from 'twitter-api-v2';
import { SocialMediaPost } from '../interfaces/social-media-connector.interface';
import { NarrativeInsight } from '../interfaces/narrative-insight.interface';
import { EventEmitter } from 'events';
import { Logger } from '@nestjs/common';
import * as crypto from 'crypto';

jest.mock('twitter-api-v2');

// Mock NarrativeRepository
class MockNarrativeRepository {
  async save(): Promise<void> {
    return Promise.resolve();
  }

  async saveMany(): Promise<void> {
    return Promise.resolve();
  }

  async findByContentHash(): Promise<NarrativeInsight | null> {
    return null;
  }
}

// Mock source node
const mockSourceNode = {
  id: 'source123',
  name: 'Test Source',
  platform: 'twitter',
  url: 'https://twitter.com/test',
  description: 'Test description',
  verificationStatus: 'verified',
  credibilityScore: 0.8,
  metadata: {},
};

// Mock TransformOnIngestService
class MockTransformOnIngestService {
  logger = new Logger('MockTransformOnIngestService');
  hashSalt = 'test-salt';
  retentionPeriodDays = 30;
  configService = new ConfigService();
  narrativeRepository = new MockNarrativeRepository();

  transform(post: SocialMediaPost): NarrativeInsight {
    return {
      id: `insight-${post.id}`,
      contentHash: this.hashContent(post.text, post.timestamp),
      sourceHash: this.hashSource(post.authorId, post.platform),
      platform: post.platform,
      timestamp: post.timestamp,
      themes: ['test-theme'],
      entities: [],
      sentiment: { score: 0, label: 'neutral', confidence: 1 },
      engagement: {
        total: 0,
        breakdown: {},
      },
      narrativeScore: 0.5,
      processedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    };
  }

  async transformBatch(posts: SocialMediaPost[]): Promise<NarrativeInsight[]> {
    return posts.map((post) => this.transform(post));
  }

  async storeInsight(insight: NarrativeInsight): Promise<void> {
    return Promise.resolve();
  }

  hashContent(text: string, timestamp: Date): string {
    const content = `${text}|${timestamp.toISOString()}`;
    return crypto
      .createHash('sha256')
      .update(content + this.hashSalt)
      .digest('hex');
  }

  hashSource(authorId: string, platform: string): string {
    const source = `${authorId}|${platform}`;
    return crypto
      .createHash('sha256')
      .update(source + this.hashSalt)
      .digest('hex');
  }

  async saveInsights(): Promise<void> {
    return Promise.resolve();
  }

  async createDataNode(): Promise<string> {
    return 'mock-node-id';
  }

  async createRelationship(): Promise<void> {
    return Promise.resolve();
  }

  async cleanupExpiredData(): Promise<void> {
    return Promise.resolve();
  }

  // Additional methods required by the interface
  extractThemes(): string[] {
    return ['test-theme'];
  }

  extractEntities(): any[] {
    return [];
  }

  analyzeSentiment(): { score: number; label: string; confidence: number } {
    return { score: 0, label: 'neutral', confidence: 1 };
  }

  calculateNarrativeScore(): number {
    return 0.5;
  }

  calculateTotalEngagement(metrics: any): number {
    return Object.values(metrics || {}).reduce(
      (sum: number, value: any) => sum + (Number(value) || 0),
      0
    );
  }

  normalizeEngagementMetrics(metrics: any): {
    total: number;
    breakdown: Record<string, number>;
  } {
    const total = this.calculateTotalEngagement(metrics);
    return {
      total,
      breakdown: metrics || {},
    };
  }
}

describe('TwitterConnector', () => {
  let connector: TwitterConnector;
  let configService: ConfigService;
  let twitterApi: jest.Mocked<TwitterApi>;
  let mockTransformService: MockTransformOnIngestService;

  const mockTweet: TweetV2 & { public_metrics?: any } = {
    id: '123',
    text: 'Test tweet',
    edit_history_tweet_ids: ['123'],
    created_at: new Date().toISOString(),
    public_metrics: {
      like_count: 100,
      retweet_count: 50,
      reply_count: 25,
      quote_count: 10,
      impression_count: 1000,
    },
    author_id: 'author123',
  };

  const mockUser: UserV2 = {
    id: 'author123',
    name: 'Test Author',
    username: 'testauthor',
    verified: true,
    public_metrics: {
      followers_count: 1000,
      following_count: 500,
      tweet_count: 1000,
    },
  };

  beforeEach(async () => {
    mockTransformService = new MockTransformOnIngestService();

    const mockConfigService = {
      get: jest.fn((key: string) => {
        switch (key) {
          case 'TWITTER_API_KEY':
            return 'test-api-key';
          case 'TWITTER_API_SECRET':
            return 'test-api-secret';
          case 'TWITTER_ACCESS_TOKEN':
            return 'test-access-token';
          case 'TWITTER_ACCESS_SECRET':
            return 'test-access-secret';
          default:
            return undefined;
        }
      }),
      getOrThrow: jest.fn((key: string) => {
        switch (key) {
          case 'TWITTER_BEARER_TOKEN':
            return 'test-bearer-token';
          default:
            throw new Error(`Configuration ${key} not found`);
        }
      }),
    };

    // Mock Twitter API
    const mockTwitterApiV2 = {
      search: jest.fn().mockResolvedValue({
        data: [mockTweet],
        includes: {
          users: [mockUser],
        },
      }),
      user: jest.fn().mockResolvedValue({
        data: mockUser,
      }),
      me: jest.fn().mockResolvedValue({
        data: mockUser,
      }),
    } as unknown as TwitterApiv2;

    (TwitterApi as jest.MockedClass<typeof TwitterApi>).mockImplementation(
      () =>
        ({
          v2: mockTwitterApiV2,
        } as unknown as TwitterApi)
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwitterConnector,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: 'TransformOnIngestService',
          useValue: mockTransformService,
        },
      ],
    }).compile();

    connector = module.get<TwitterConnector>(TwitterConnector);
    configService = module.get<ConfigService>(ConfigService);
    twitterApi = new TwitterApi('test-bearer-token') as jest.Mocked<TwitterApi>;

    // Connect before running tests
    await connector.connect();
  });

  describe('connect', () => {
    it('should initialize Twitter client with correct credentials', async () => {
      await connector.connect();
      expect(TwitterApi).toHaveBeenCalledWith('test-bearer-token');
    });

    it('should handle connection errors', async () => {
      (
        TwitterApi as jest.MockedClass<typeof TwitterApi>
      ).mockImplementationOnce(() => {
        throw new Error('Connection failed');
      });
      const errorConnector = new TwitterConnector(
        configService,
        mockTransformService
      );
      await expect(errorConnector.connect()).rejects.toThrow(
        'Connection failed'
      );
    });
  });

  describe('searchContent', () => {
    it('should search tweets and transform them to social media posts', async () => {
      const result = await connector.searchContent('test');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: mockTweet.id,
        text: mockTweet.text,
        timestamp: expect.any(Date),
        platform: 'twitter',
        engagementMetrics: {
          likes: mockTweet.public_metrics.like_count,
          shares: mockTweet.public_metrics.retweet_count,
          comments: mockTweet.public_metrics.reply_count,
          reach: mockTweet.public_metrics.impression_count,
          viralityScore: expect.any(Number),
        },
      });
    });

    it('should handle search errors', async () => {
      const mockError = new Error('API Error');
      const mockTwitterApiV2 = {
        search: jest.fn().mockRejectedValue(mockError),
      } as unknown as TwitterApiv2;

      (
        TwitterApi as jest.MockedClass<typeof TwitterApi>
      ).mockImplementationOnce(
        () =>
          ({
            v2: mockTwitterApiV2,
          } as unknown as TwitterApi)
      );

      const errorConnector = new TwitterConnector(
        configService,
        mockTransformService
      );
      await errorConnector.connect();
      await expect(errorConnector.searchContent('test')).rejects.toThrow(
        'API Error'
      );
    });
  });

  describe('getAuthorDetails', () => {
    it('should fetch and transform user details', async () => {
      const authorId = 'author123';
      const mockTwitterApiV2 = {
        user: jest.fn().mockResolvedValue({
          data: mockUser,
        }),
      } as unknown as TwitterApiv2;

      (
        TwitterApi as jest.MockedClass<typeof TwitterApi>
      ).mockImplementationOnce(
        () =>
          ({
            v2: mockTwitterApiV2,
          } as unknown as TwitterApi)
      );

      const testConnector = new TwitterConnector(
        configService,
        mockTransformService
      );
      await testConnector.connect();
      const result = await testConnector.getAuthorDetails(authorId);
      expect(mockTwitterApiV2.user).toHaveBeenCalledWith(authorId, {
        'user.fields': ['created_at', 'public_metrics', 'verified'],
      });
      expect(result).toMatchObject({
        id: authorId,
        name: mockUser.name,
        platform: 'twitter',
        credibilityScore: expect.any(Number),
        verificationStatus: 'verified',
      });
    });

    it('should handle non-existent users', async () => {
      const mockError = new Error('User not found');
      jest.spyOn(twitterApi.v2, 'user').mockRejectedValueOnce(mockError);
      await expect(connector.getAuthorDetails('nonexistent')).rejects.toThrow(
        'User not found'
      );
    });
  });

  describe('validateCredentials', () => {
    it('should validate credentials by attempting connection', async () => {
      const result = await connector.validateCredentials();
      expect(result).toBe(true);
      expect(twitterApi.v2.me).toHaveBeenCalled();
    });

    it('should return false for invalid credentials', async () => {
      jest
        .spyOn(twitterApi.v2, 'me')
        .mockRejectedValueOnce(new Error('Invalid credentials'));
      const result = await connector.validateCredentials();
      expect(result).toBe(false);
    });
  });

  describe('streamContent', () => {
    beforeEach(() => {
      // Override the polling interval for testing
      jest.useFakeTimers();
    });

    afterEach(async () => {
      jest.useRealTimers();
      await connector.disconnect();
    });

    it('should stream tweets matching keywords', async () => {
      const mockTwitterApiV2 = {
        search: jest.fn().mockResolvedValue({
          data: [mockTweet],
          includes: { users: [mockUser] },
        }),
        me: jest.fn().mockResolvedValue({ data: mockUser }),
      } as unknown as TwitterApiv2;

      (
        TwitterApi as jest.MockedClass<typeof TwitterApi>
      ).mockImplementationOnce(
        () =>
          ({
            v2: mockTwitterApiV2,
          } as unknown as TwitterApi)
      );

      const testConnector = new TwitterConnector(
        configService,
        mockTransformService
      );
      await testConnector.connect();

      const stream = testConnector.streamContent(['test']);
      const mockCallback = jest.fn();
      stream.on('data', mockCallback);

      // Advance timers to trigger the polling
      jest.advanceTimersByTime(60000);

      expect(mockTwitterApiV2.search).toHaveBeenCalled();
      // Wait for the promises to resolve
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockCallback).toHaveBeenCalled();
    });

    it('should handle stream errors', async () => {
      const mockError = new Error('Stream error');
      const mockTwitterApiV2 = {
        search: jest.fn().mockRejectedValue(mockError),
        me: jest.fn().mockResolvedValue({ data: mockUser }),
      } as unknown as TwitterApiv2;

      (
        TwitterApi as jest.MockedClass<typeof TwitterApi>
      ).mockImplementationOnce(
        () =>
          ({
            v2: mockTwitterApiV2,
          } as unknown as TwitterApi)
      );

      const errorConnector = new TwitterConnector(
        configService,
        mockTransformService
      );
      await errorConnector.connect();

      const stream = errorConnector.streamContent(['test']);
      const errorCallback = jest.fn();
      stream.on('error', errorCallback);

      // Advance timers to trigger the polling
      jest.advanceTimersByTime(60000);

      // Wait for the promises to reject
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(errorCallback).toHaveBeenCalled();
    });
  });

  // Add tests for TransformOnIngest methods
  describe('searchAndTransform', () => {
    it('should search content and transform it to narrative insights', async () => {
      const result = await connector.searchAndTransform('test');
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('contentHash');
      expect(result[0]).toHaveProperty('sourceHash');
      expect(result[0]).toHaveProperty('platform', 'twitter');
    });
  });

  describe('streamAndTransform', () => {
    it('should stream content and transform it to narrative insights', () => {
      const emitter = connector.streamAndTransform(['test']);
      expect(emitter).toBeInstanceOf(EventEmitter);
    });
  });
});
