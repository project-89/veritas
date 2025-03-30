import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FacebookConnector } from './facebook.connector';
import { FacebookAdsApi, Page, Post } from 'facebook-nodejs-business-sdk';
import { SocialMediaPost } from '../interfaces/social-media-connector.interface';
import { NarrativeInsight } from '../interfaces/narrative-insight.interface';
import { EventEmitter } from 'events';
import { Logger } from '@nestjs/common';
import * as crypto from 'crypto';

// Type declaration for the facebook-nodejs-business-sdk module
declare module 'facebook-nodejs-business-sdk' {
  export class FacebookAdsApi {
    static init(accessToken: string): any;
  }
  export class Page {
    constructor(id: string, api?: any);
    get(options?: any): Promise<any>;
    getPosts(options?: any): Promise<{ data: Post[] }>;
  }
  export interface Post {
    id: string;
    message?: string;
    created_time: string;
    from?: {
      id: string;
      name: string;
    };
    permalink_url?: string;
    reactions?: {
      summary: {
        total_count: number;
      };
    };
    shares?: {
      count: number;
    };
    comments?: {
      summary: {
        total_count: number;
      };
    };
    insights?: {
      data: Array<{
        name?: string;
        values: Array<{
          value: number;
        }>;
      }>;
    };
  }
}

// Define mockSourceNode locally instead of importing
const mockSourceNode = {
  id: 'test-source-123',
  name: 'Test Source',
  platform: 'facebook',
  url: 'https://facebook.com/test-account',
  description: 'Test account for unit tests',
  verificationStatus: 'verified',
  credibilityScore: 0.85,
  metadata: {
    followerCount: 10000,
    location: 'Test Location',
    userId: '123456789',
    screenName: 'test_account',
    verified: true,
    profileImageUrl: 'https://example.com/profile.jpg',
  },
};

jest.mock('facebook-nodejs-business-sdk');

beforeAll(() => {
  jest.useFakeTimers();
});

afterAll(() => {
  jest.useRealTimers();
});

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

describe('FacebookConnector', () => {
  let connector: FacebookConnector;
  let configService: ConfigService;
  let facebookApi: jest.Mocked<FacebookAdsApi>;
  let mockTransformService: MockTransformOnIngestService;

  const mockPost: Post = {
    id: '123',
    message: 'Test post',
    created_time: new Date().toISOString(),
    from: {
      id: 'author123',
      name: 'Test Author',
    },
    permalink_url: 'https://facebook.com/testauthor/posts/123',
    reactions: {
      summary: {
        total_count: 100,
      },
    },
    shares: {
      count: 50,
    },
    comments: {
      summary: {
        total_count: 25,
      },
    },
    insights: {
      data: [
        {
          values: [
            {
              value: 1000,
            },
          ],
        },
      ],
    },
  };

  const mockPage = {
    id: 'author123',
    name: 'Test Page',
    verification_status: 'verified',
    fan_count: 10000,
  };

  const configValues = {
    FACEBOOK_ACCESS_TOKEN: 'test-token',
    FACEBOOK_APP_ID: 'test-app-id',
    FACEBOOK_APP_SECRET: 'test-app-secret',
    FACEBOOK_PAGE_ID: 'test-page-id',
  };

  const mockConfig = {
    get: jest.fn((key: keyof typeof configValues) => configValues[key]),
    getOrThrow: jest.fn((key: keyof typeof configValues) => {
      const value = configValues[key];
      if (value === undefined) {
        throw new Error(`Configuration ${key} not found`);
      }
      return value;
    }),
    has: jest.fn(),
    set: jest.fn(),
    validate: jest.fn(),
    validationSchema: {},
    validationOptions: {},
    load: jest.fn(),
    loadConfig: jest.fn(),
    watch: jest.fn(),
    watchBootstrap: jest.fn(),
    onModuleDestroy: jest.fn(),
    internalConfig: {},
    isCacheEnabled: true,
    cache: new Map(),
    _changes$: { subscribe: jest.fn() },
    _getFromCache: jest.fn(),
    _getFromProcess: jest.fn(),
    _getFromEnv: jest.fn(),
    _getFromFile: jest.fn(),
    _getGlobalEnvVariableValue: jest.fn(),
  } as unknown as ConfigService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTransformService = new MockTransformOnIngestService();

    // Mock Facebook API
    const mockFacebookApi = {
      getPage: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(mockPage),
        getPosts: jest.fn().mockResolvedValue({
          data: [mockPost],
        }),
      }),
    };

    (FacebookAdsApi.init as jest.Mock).mockReturnValue(mockFacebookApi);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FacebookConnector,
        {
          provide: ConfigService,
          useValue: mockConfig,
        },
        {
          provide: 'TransformOnIngestService',
          useValue: mockTransformService,
        },
      ],
    }).compile();

    connector = module.get<FacebookConnector>(FacebookConnector);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(async () => {
    await connector.disconnect();
    jest.clearAllMocks();
  });

  describe('connect', () => {
    it('should initialize Facebook client with correct credentials', async () => {
      await connector.connect();

      expect(FacebookAdsApi.init).toHaveBeenCalledWith('test-token');
    });

    it('should handle connection errors', async () => {
      (FacebookAdsApi.init as jest.Mock).mockImplementation(() => {
        throw new Error('Connection failed');
      });

      await expect(connector.connect()).rejects.toThrow('Connection failed');
    });
  });

  describe('searchContent', () => {
    it('should search posts and transform them to social media posts', async () => {
      const mockPost = {
        id: '123',
        message: 'Test post',
        created_time: '2023-01-01T00:00:00Z',
        from: {
          id: 'author123',
          name: 'Test Author',
        },
        permalink_url: 'https://facebook.com/posts/123',
        reactions: { summary: { total_count: 10 } },
        shares: { count: 5 },
        comments: { summary: { total_count: 3 } },
        insights: {
          data: [
            {
              name: 'post_impressions',
              values: [{ value: 1000 }],
            },
          ],
        },
      };

      const mockPageInstance = {
        getPosts: jest.fn().mockResolvedValue({
          data: [mockPost],
        }),
      };

      const mockPageConstructor = jest.fn(() => mockPageInstance);
      (Page as unknown as jest.Mock).mockImplementation(mockPageConstructor);

      (FacebookAdsApi.init as jest.Mock).mockReturnValue({
        getPage: jest.fn().mockReturnValue(mockPageInstance),
      });

      const connector = new FacebookConnector(mockConfig, mockTransformService);
      await connector.connect();

      const results = await connector.searchContent('test');

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: mockPost.id,
        text: mockPost.message,
        platform: 'facebook',
        timestamp: expect.any(Date),
        engagementMetrics: {
          likes: mockPost.reactions.summary.total_count,
          shares: mockPost.shares.count,
          comments: mockPost.comments.summary.total_count,
          reach: mockPost.insights.data[0].values[0].value,
          viralityScore: expect.any(Number),
        },
      });
    });

    it('should handle search errors', async () => {
      const mockError = new Error('API Error');
      const mockPageInstance = {
        getPosts: jest.fn().mockRejectedValue(mockError),
      };

      const mockPageConstructor = jest.fn(() => mockPageInstance);
      (Page as unknown as jest.Mock).mockImplementation(mockPageConstructor);

      (FacebookAdsApi.init as jest.Mock).mockReturnValue({
        getPage: jest.fn().mockReturnValue(mockPageInstance),
      });

      const connector = new FacebookConnector(mockConfig, mockTransformService);
      await connector.connect();

      await expect(connector.searchContent('test')).rejects.toThrow(
        'API Error'
      );
    });
  });

  describe('getAuthorDetails', () => {
    it('should fetch and transform page details', async () => {
      const mockPageData = {
        id: '123',
        name: 'Test Page',
        verification_status: 'verified',
        fan_count: 1000,
      };

      const mockPageInstance = {
        get: jest.fn().mockResolvedValue(mockPageData),
      };

      const mockPageConstructor = jest.fn(() => mockPageInstance);
      (Page as unknown as jest.Mock).mockImplementation(mockPageConstructor);

      (FacebookAdsApi.init as jest.Mock).mockReturnValue({
        getPage: jest.fn().mockReturnValue(mockPageInstance),
      });

      const connector = new FacebookConnector(mockConfig, mockTransformService);
      await connector.connect();

      const result = await connector.getAuthorDetails('123');

      expect(mockPageInstance.get).toHaveBeenCalled();
      expect(result).toMatchObject({
        id: '123',
        name: 'Test Page',
        platform: 'facebook',
        credibilityScore: expect.any(Number),
        verificationStatus: 'verified',
      });
    });

    it('should handle non-existent pages', async () => {
      const mockError = new Error('Page not found');
      const mockPageInstance = {
        get: jest.fn().mockRejectedValue(mockError),
      };

      const mockPageConstructor = jest.fn(() => mockPageInstance);
      (Page as unknown as jest.Mock).mockImplementation(mockPageConstructor);

      (FacebookAdsApi.init as jest.Mock).mockReturnValue({
        getPage: jest.fn().mockReturnValue(mockPageInstance),
      });

      const connector = new FacebookConnector(mockConfig, mockTransformService);
      await connector.connect();

      await expect(connector.getAuthorDetails('nonexistent')).rejects.toThrow(
        'Page not found'
      );
    });
  });

  describe('streamContent', () => {
    it('should stream posts matching keywords', async () => {
      const mockPosts = [
        {
          id: '123',
          message: 'Test post with keyword',
          created_time: '2023-01-01T00:00:00Z',
          from: {
            id: 'author123',
            name: 'Test Author',
          },
          permalink_url: 'https://facebook.com/posts/123',
          reactions: { summary: { total_count: 10 } },
          shares: { count: 5 },
          comments: { summary: { total_count: 3 } },
        },
      ];

      const mockPageInstance = {
        getPosts: jest.fn().mockResolvedValue({
          data: mockPosts,
        }),
      };

      const mockPageConstructor = jest.fn(() => mockPageInstance);
      (Page as unknown as jest.Mock).mockImplementation(mockPageConstructor);

      (FacebookAdsApi.init as jest.Mock).mockReturnValue({
        getPage: jest.fn().mockReturnValue(mockPageInstance),
      });

      const connector = new FacebookConnector(mockConfig, mockTransformService);
      await connector.connect();

      const stream = connector.streamContent(['keyword']);
      const mockCallback = jest.fn();
      stream.on('data', mockCallback);

      // Advance timers to trigger the polling
      jest.advanceTimersByTime(60000);

      // Wait for promises to resolve
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockPageInstance.getPosts).toHaveBeenCalled();
      expect(mockCallback).toHaveBeenCalled();
    });

    it('should handle stream errors', async () => {
      const mockError = new Error('Stream error');
      const mockPageInstance = {
        getPosts: jest.fn().mockRejectedValue(mockError),
      };

      const mockPageConstructor = jest.fn(() => mockPageInstance);
      (Page as unknown as jest.Mock).mockImplementation(mockPageConstructor);

      (FacebookAdsApi.init as jest.Mock).mockReturnValue({
        getPage: jest.fn().mockReturnValue(mockPageInstance),
      });

      const connector = new FacebookConnector(mockConfig, mockTransformService);
      await connector.connect();

      const stream = connector.streamContent(['keyword']);
      const errorCallback = jest.fn();
      stream.on('error', errorCallback);

      // Advance timers to trigger the polling
      jest.advanceTimersByTime(60000);

      // Wait for promises to reject
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(errorCallback).toHaveBeenCalled();
    });
  });

  describe('validateCredentials', () => {
    it('should validate credentials by checking page access', async () => {
      const mockPageInstance = {
        get: jest.fn().mockResolvedValue(mockPage),
      };

      const mockPageConstructor = jest.fn(() => mockPageInstance);
      (Page as unknown as jest.Mock).mockImplementation(mockPageConstructor);

      (FacebookAdsApi.init as jest.Mock).mockReturnValue({
        getPage: jest.fn().mockReturnValue(mockPageInstance),
      });

      const connector = new FacebookConnector(mockConfig, mockTransformService);
      await connector.connect();

      const result = await connector.validateCredentials();

      expect(result).toBe(true);
      expect(mockPageInstance.get).toHaveBeenCalled();
    });

    it('should return false for invalid credentials', async () => {
      const mockError = new Error('Invalid credentials');
      const mockPageInstance = {
        get: jest.fn().mockRejectedValue(mockError),
      };

      const mockPageConstructor = jest.fn(() => mockPageInstance);
      (Page as unknown as jest.Mock).mockImplementation(mockPageConstructor);

      (FacebookAdsApi.init as jest.Mock).mockReturnValue({
        getPage: jest.fn().mockReturnValue(mockPageInstance),
      });

      const connector = new FacebookConnector(mockConfig, mockTransformService);
      await connector.connect();

      const result = await connector.validateCredentials();

      expect(result).toBe(false);
    });
  });

  // Add tests for TransformOnIngest methods
  describe('searchAndTransform', () => {
    it('should search content and transform it to narrative insights', async () => {
      const mockPosts = [
        {
          id: '123',
          message: 'Test post with keyword',
          created_time: '2023-01-01T00:00:00Z',
          from: {
            id: 'author123',
            name: 'Test Author',
          },
          permalink_url: 'https://facebook.com/posts/123',
          reactions: { summary: { total_count: 10 } },
          shares: { count: 5 },
          comments: { summary: { total_count: 3 } },
        },
      ];

      const mockPageInstance = {
        getPosts: jest.fn().mockResolvedValue({
          data: mockPosts,
        }),
      };

      const mockPageConstructor = jest.fn(() => mockPageInstance);
      (Page as unknown as jest.Mock).mockImplementation(mockPageConstructor);

      (FacebookAdsApi.init as jest.Mock).mockReturnValue({
        getPage: jest.fn().mockReturnValue(mockPageInstance),
      });

      const connector = new FacebookConnector(mockConfig, mockTransformService);
      await connector.connect();

      const result = await connector.searchAndTransform('test');
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('contentHash');
      expect(result[0]).toHaveProperty('sourceHash');
      expect(result[0]).toHaveProperty('platform', 'facebook');
    });
  });

  describe('streamAndTransform', () => {
    it('should stream content and transform it to narrative insights', () => {
      const connector = new FacebookConnector(mockConfig, mockTransformService);
      const emitter = connector.streamAndTransform(['test']);
      expect(emitter).toBeInstanceOf(EventEmitter);
    });
  });
});
