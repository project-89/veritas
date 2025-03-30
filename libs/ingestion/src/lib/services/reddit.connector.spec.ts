// Create a mock instance
const mockSnoowrapInstance = {
  search: jest.fn(),
  getUser: jest.fn(),
  getMe: jest.fn(),
};

// Mock the Snoowrap constructor
const MockSnoowrap = jest.fn().mockImplementation(() => mockSnoowrapInstance);

jest.mock('snoowrap', () => ({
  __esModule: true,
  default: MockSnoowrap,
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedditConnector } from './reddit.connector';
import { Submission, RedditUser } from 'snoowrap';
import { SocialMediaPost } from '../interfaces/social-media-connector.interface';
import { EventEmitter } from 'events';
import { NarrativeInsight } from '../interfaces/narrative-insight.interface';
import { Logger } from '@nestjs/common';
import * as crypto from 'crypto';

// Type declaration for Snoowrap
declare module 'snoowrap' {
  export interface Submission {
    id: string;
    title: string;
    selftext: string;
    author: string;
    created_utc: number;
    permalink: string;
    score: number;
    num_comments: number;
    view_count: number;
    subreddit_name_prefixed: string;
    clicked?: boolean;
    comments?: any[];
    content_categories?: string[];
    contest_mode?: boolean;
  }

  export interface RedditUser {
    id: string;
    name: string;
    created_utc: number;
    link_karma: number;
    comment_karma: number;
    has_verified_email: boolean;
    is_mod: boolean;
    is_gold: boolean;
    has_mod_mail?: boolean;
    has_subscribed?: boolean;
    has_verified_mail?: boolean;
    hide_from_robots?: boolean;
  }

  export default class Snoowrap {
    constructor(options: {
      userAgent: string;
      clientId: string;
      clientSecret: string;
      username?: string;
      password?: string;
      refreshToken?: string;
    });

    getMe(): Promise<RedditUser>;
    getUser(username: string): Promise<RedditUser>;
    search(query: string, options?: any): Promise<Submission[]>;
  }
}

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
  private readonly logger = new Logger('MockTransformOnIngestService');
  private readonly hashSalt = 'test-salt';
  private readonly retentionPeriodDays = 30;
  private readonly configService = new ConfigService();
  private readonly narrativeRepository = new MockNarrativeRepository();

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

  private hashContent(text: string, timestamp: Date): string {
    const content = `${text}|${timestamp.toISOString()}`;
    return crypto
      .createHash('sha256')
      .update(content + this.hashSalt)
      .digest('hex');
  }

  private hashSource(authorId: string, platform: string): string {
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

  private extractThemes(): string[] {
    return ['test-theme'];
  }

  private extractEntities(): any[] {
    return [];
  }

  private analyzeSentiment(): {
    score: number;
    label: string;
    confidence: number;
  } {
    return { score: 0, label: 'neutral', confidence: 1 };
  }

  private calculateNarrativeScore(): number {
    return 0.5;
  }

  private calculateTotalEngagement(metrics: any): number {
    return Object.values(metrics || {}).reduce(
      (sum: number, value: any) => sum + (Number(value) || 0),
      0
    );
  }

  private normalizeEngagementMetrics(metrics: any): {
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

// Mock source node
const mockSourceNode = {
  id: 'source123',
  name: 'Test Source',
  platform: 'reddit',
  url: 'https://reddit.com/r/test',
  description: 'Test description',
  verificationStatus: 'verified',
  credibilityScore: 0.8,
  metadata: {},
};

describe('RedditConnector', () => {
  let connector: RedditConnector;
  let configService: ConfigService;
  let mockTransformService: MockTransformOnIngestService;

  const mockSubmission: Submission = {
    id: '123',
    title: 'Test Title',
    selftext: 'Test content',
    author: 'testauthor',
    created_utc: Date.now() / 1000,
    permalink: '/r/test/comments/123/test_post',
    score: 100,
    num_comments: 25,
    view_count: 1000,
    subreddit_name_prefixed: 'r/test',
  } as Submission;

  const mockUser: RedditUser = {
    id: 'author123',
    name: 'testauthor',
    created_utc: Date.now() / 1000,
    link_karma: 1000,
    comment_karma: 500,
    has_verified_email: true,
    is_mod: true,
    is_gold: true,
  } as RedditUser;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTransformService = new MockTransformOnIngestService();

    const mockConfigService = {
      get: jest.fn((key: string) => {
        switch (key) {
          case 'REDDIT_USERNAME':
            return 'test-username';
          case 'REDDIT_PASSWORD':
            return 'test-password';
          default:
            return undefined;
        }
      }),
      getOrThrow: jest.fn((key: string) => {
        switch (key) {
          case 'REDDIT_CLIENT_ID':
            return 'test-client-id';
          case 'REDDIT_CLIENT_SECRET':
            return 'test-client-secret';
          default:
            throw new Error(`Configuration ${key} not found`);
        }
      }),
    };

    mockSnoowrapInstance.search.mockResolvedValue([mockSubmission]);
    mockSnoowrapInstance.getUser.mockResolvedValue(mockUser);
    mockSnoowrapInstance.getMe.mockResolvedValue(mockUser);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedditConnector,
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

    connector = module.get<RedditConnector>(RedditConnector);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('connect', () => {
    it('should initialize Reddit client with correct credentials', async () => {
      await connector.connect();
      expect(MockSnoowrap).toHaveBeenCalledWith({
        userAgent: 'Veritas/1.0.0',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        username: 'test-username',
        password: 'test-password',
      });
    });

    it('should handle connection errors', async () => {
      const mockError = new Error('Connection failed');
      mockSnoowrapInstance.getMe.mockRejectedValueOnce(mockError);

      const errorConnector = new RedditConnector(
        configService,
        mockTransformService
      );
      await expect(errorConnector.connect()).rejects.toThrow(
        'Connection failed'
      );
    });
  });

  describe('searchContent', () => {
    beforeEach(async () => {
      await connector.connect();
    });

    it('should search submissions and transform them to social media posts', async () => {
      const query = 'test query';
      const options = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-02'),
        limit: 10,
      };

      const results = await connector.searchContent(query, options);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: mockSubmission.id,
        text: expect.stringContaining(mockSubmission.selftext),
        platform: 'reddit',
        authorId: mockSubmission.author,
        authorName: mockSubmission.author,
        url: `https://reddit.com${mockSubmission.permalink}`,
        engagementMetrics: {
          likes: mockSubmission.score,
          shares: 0,
          comments: mockSubmission.num_comments,
          reach: mockSubmission.view_count,
          viralityScore: expect.any(Number),
        },
      });
    });

    it('should handle search errors', async () => {
      const mockError = new Error('API Error');
      mockSnoowrapInstance.search.mockRejectedValueOnce(mockError);

      await expect(connector.searchContent('test')).rejects.toThrow(
        'API Error'
      );
    });
  });

  describe('getAuthorDetails', () => {
    beforeEach(async () => {
      await connector.connect();
    });

    it('should fetch and transform user details', async () => {
      const authorId = 'testauthor';

      const result = await connector.getAuthorDetails(authorId);

      expect(result).toMatchObject({
        id: mockUser.id,
        name: mockUser.name,
        platform: 'reddit',
        credibilityScore: expect.any(Number),
        verificationStatus: 'verified',
      });
    });

    it('should handle non-existent users', async () => {
      const mockError = new Error('User not found');
      mockSnoowrapInstance.getUser.mockRejectedValueOnce(mockError);

      await expect(connector.getAuthorDetails('nonexistent')).rejects.toThrow(
        'User not found'
      );
    });
  });

  describe('validateCredentials', () => {
    it('should validate credentials by attempting connection', async () => {
      const result = await connector.validateCredentials();
      expect(result).toBe(true);
    });

    it('should return false for invalid credentials', async () => {
      const mockError = new Error('Invalid credentials');
      mockSnoowrapInstance.getMe.mockRejectedValueOnce(mockError);

      const result = await connector.validateCredentials();
      expect(result).toBe(false);
    });
  });

  describe('streamContent', () => {
    beforeEach(async () => {
      await connector.connect();
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should stream submissions matching keywords', async () => {
      const keywords = ['test'];
      const stream = connector.streamContent(keywords);
      const mockCallback = jest.fn();

      stream.on('data', mockCallback);

      // Fast-forward time to trigger the interval
      jest.advanceTimersByTime(60000);

      // Wait for promises to resolve
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockSnoowrapInstance.search).toHaveBeenCalled();
      expect(mockCallback).toHaveBeenCalled();
    });

    it('should handle streaming errors gracefully', async () => {
      const mockError = new Error('Stream error');
      mockSnoowrapInstance.search.mockRejectedValueOnce(mockError);

      const stream = connector.streamContent(['test']);
      const errorCallback = jest.fn();

      stream.on('error', errorCallback);

      // Fast-forward time to trigger the interval
      jest.advanceTimersByTime(60000);

      // Wait for promises to reject
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(errorCallback).toHaveBeenCalled();
    });
  });

  // Add tests for TransformOnIngest methods
  describe('searchAndTransform', () => {
    beforeEach(async () => {
      await connector.connect();
    });

    it('should search content and transform it to narrative insights', async () => {
      const result = await connector.searchAndTransform('test');
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('contentHash');
      expect(result[0]).toHaveProperty('sourceHash');
      expect(result[0]).toHaveProperty('platform', 'reddit');
    });
  });

  describe('streamAndTransform', () => {
    it('should stream content and transform it to narrative insights', () => {
      const emitter = connector.streamAndTransform(['test']);
      expect(emitter).toBeInstanceOf(EventEmitter);
    });
  });
});
