import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { RedditFreeConnector } from '../../src/lib/services/reddit-free.connector';
import { TransformOnIngestService } from '../../src/lib/services/transform/transform-on-ingest.service';
import { SourceRateLimiter } from '../../src/lib/services/utils/source-rate-limiter';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('RedditFreeConnector', () => {
  let connector: RedditFreeConnector;
  let configService: Partial<ConfigService>;
  let transformService: Partial<TransformOnIngestService>;
  let mockAxiosInstance: { get: jest.Mock };

  const mockRedditResponse = {
    data: {
      children: [
        {
          kind: 't3',
          data: {
            id: 'abc123',
            name: 't3_abc123',
            title: 'Test Post Title',
            selftext: 'This is the post body',
            author: 'testuser',
            created_utc: 1700000000,
            subreddit: 'test',
            score: 150,
            upvote_ratio: 0.95,
            num_comments: 42,
            url: 'https://reddit.com/r/test/abc123',
            permalink: '/r/test/comments/abc123/test_post/',
            is_self: true,
            is_video: false,
            over_18: false,
            spoiler: false,
            stickied: false,
          },
        },
        {
          kind: 't3',
          data: {
            id: 'def456',
            name: 't3_def456',
            title: 'Another Post',
            selftext: '',
            author: 'otheruser',
            created_utc: 1700001000,
            subreddit: 'test',
            score: 10,
            upvote_ratio: 0.8,
            num_comments: 3,
            url: 'https://reddit.com/r/test/def456',
            permalink: '/r/test/comments/def456/another_post/',
            is_self: true,
            is_video: false,
            over_18: false,
            spoiler: false,
            stickied: false,
          },
        },
      ],
      after: null,
      before: null,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Use a zero-delay limiter so tests don't wait out the real pacing.
    SourceRateLimiter.setInstance(
      new SourceRateLimiter({ reddit: { minIntervalMs: 0, maxConcurrent: 100 } }),
    );

    mockAxiosInstance = {
      get: jest.fn(),
    };
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);

    configService = {
      get: jest.fn().mockReturnValue(undefined),
    };

    transformService = {
      transformBatch: jest.fn().mockResolvedValue([
        { id: 'insight-1', contentHash: 'hash1' },
        { id: 'insight-2', contentHash: 'hash2' },
      ]),
    };

    connector = new RedditFreeConnector(
      configService as ConfigService,
      transformService as TransformOnIngestService,
    );
  });

  afterAll(() => {
    SourceRateLimiter.setInstance(null);
  });

  describe('constructor', () => {
    it('should create axios client with default user agent', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://www.reddit.com',
          headers: expect.objectContaining({
            'User-Agent': 'web:veritas.osint:v1.0 (narrative intelligence research tool)',
            Accept: 'application/json',
          }),
        }),
      );
    });

    it('uses the oauth.reddit.com base URL when client credentials are configured', () => {
      jest.clearAllMocks();
      const oauthConfig: Partial<ConfigService> = {
        get: jest.fn((key: string) => {
          if (key === 'REDDIT_CLIENT_ID') return 'id123';
          if (key === 'REDDIT_CLIENT_SECRET') return 'secret456';
          return undefined;
        }),
      };
      new RedditFreeConnector(
        oauthConfig as ConfigService,
        transformService as TransformOnIngestService,
      );
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: 'https://oauth.reddit.com' }),
      );
    });

    it('acquires an OAuth token and strips the .json suffix in OAuth mode', async () => {
      jest.clearAllMocks();
      const oauthConfig: Partial<ConfigService> = {
        get: jest.fn((key: string) => {
          if (key === 'REDDIT_CLIENT_ID') return 'id123';
          if (key === 'REDDIT_CLIENT_SECRET') return 'secret456';
          return undefined;
        }),
      };
      mockedAxios.create.mockReturnValue(mockAxiosInstance as any);
      mockedAxios.post = jest
        .fn()
        .mockResolvedValue({ data: { access_token: 'tok', expires_in: 3600 } });
      mockAxiosInstance.get.mockResolvedValue(mockRedditResponse);

      const oauthConnector = new RedditFreeConnector(
        oauthConfig as ConfigService,
        transformService as TransformOnIngestService,
      );
      await oauthConnector.searchContent('bitcoin', { limit: 2 });

      // Token fetched from www.reddit.com/api/v1/access_token with basic auth
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://www.reddit.com/api/v1/access_token',
        expect.stringContaining('grant_type=client_credentials'),
        expect.objectContaining({ auth: { username: 'id123', password: 'secret456' } }),
      );
      // Request path has no .json suffix and carries the bearer token
      const [calledPath, calledConfig] = mockAxiosInstance.get.mock.calls[0];
      expect(calledPath).not.toContain('.json');
      expect(calledPath).toContain('/search?');
      expect(calledConfig).toEqual(
        expect.objectContaining({ headers: { Authorization: 'Bearer tok' } }),
      );
    });

    it('should use custom user agent from config', () => {
      (configService.get as jest.Mock).mockReturnValue('CustomBot/2.0');

      new RedditFreeConnector(
        configService as ConfigService,
        transformService as TransformOnIngestService,
      );

      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'CustomBot/2.0',
          }),
        }),
      );
    });
  });

  describe('connect', () => {
    it('should succeed when Reddit JSON API is reachable', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockRedditResponse });

      await expect(connector.connect()).resolves.not.toThrow();
    });

    it('should not throw when Reddit JSON API is unreachable', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Network error'));

      await expect(connector.connect()).resolves.not.toThrow();
    });
  });

  describe('disconnect', () => {
    it('should clear all stream connections', async () => {
      // Set up a fake stream connection
      const fakeInterval = setInterval(() => undefined, 10000);
      (connector as any).streamConnections.set('test', fakeInterval);

      await connector.disconnect();

      expect((connector as any).streamConnections.size).toBe(0);
      clearInterval(fakeInterval);
    });
  });

  describe('searchContent', () => {
    it('should return transformed social media posts', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockRedditResponse });

      const posts = await connector.searchContent('post');

      expect(posts).toHaveLength(2);
      expect(posts[0]!).toMatchObject({
        id: 'abc123',
        text: 'This is the post body',
        platform: 'reddit',
        authorId: 'testuser',
        authorName: 'testuser',
        url: 'https://reddit.com/r/test/comments/abc123/test_post/',
      });
      expect(posts[0]!.engagementMetrics).toBeDefined();
      expect(posts[0]!.engagementMetrics.comments).toBe(42);
    });

    it('should use title as text when selftext is empty', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockRedditResponse });

      const posts = await connector.searchContent('test');

      expect(posts[1]!.text).toBe('Another Post');
    });

    it('should respect limit option', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockRedditResponse });

      const posts = await connector.searchContent('test', { limit: 1 });

      expect(posts).toHaveLength(1);
    });

    it('should paginate when limit exceeds 100', async () => {
      const page1 = {
        data: {
          children: Array(100).fill(mockRedditResponse.data.children[0]),
          after: 'cursor_abc',
          before: null,
        },
      };
      const page2 = {
        data: {
          children: [mockRedditResponse.data.children[1]],
          after: null,
          before: null,
        },
      };

      mockAxiosInstance.get
        .mockResolvedValueOnce({ data: page1 })
        .mockResolvedValueOnce({ data: page2 });

      const posts = await connector.searchContent('test', { limit: 150 });

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
      expect(posts).toHaveLength(101);
    });

    it('should stop pagination when no more results', async () => {
      const emptyPage = {
        data: { children: [], after: null, before: null },
      };
      mockAxiosInstance.get.mockResolvedValue({ data: emptyPage });

      const posts = await connector.searchContent('test');

      expect(posts).toHaveLength(0);
    });

    it('should return an empty result when Reddit returns an unexpected payload shape', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: { unexpected: true } });

      const posts = await connector.searchContent('https://rexas.com/');

      expect(posts).toEqual([]);
    });

    it('should tolerate nested listing payloads without crashing', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          data: mockRedditResponse.data,
        },
      });

      const posts = await connector.searchContent('post');

      expect(posts).toHaveLength(2);
    });

    it('should apply time filter based on startDate', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockRedditResponse });

      // startDate within the last day maps to Reddit's "day" filter
      const recentDate = new Date(Date.now() - 12 * 60 * 60 * 1000);
      await connector.searchContent('test', { startDate: recentDate });

      const url = mockAxiosInstance.get.mock.calls[0][0] as string;
      expect(url).toContain('t=day');
    });

    it('filters out broad incidental matches for long claim-style queries', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          data: {
            children: [
              {
                kind: 't3',
                data: {
                  ...mockRedditResponse.data.children[0]!.data,
                  id: 'broad-1',
                  title: 'China and Iran tensions rise again',
                  selftext: 'General discussion with no missile details.',
                },
              },
              {
                kind: 't3',
                data: {
                  ...mockRedditResponse.data.children[0]!.data,
                  id: 'match-1',
                  title: 'Chinese sent DF41 missiles to Iran',
                  selftext: 'Claim alleges 500 missiles were moved overnight.',
                },
              },
            ],
            after: null,
            before: null,
          },
        },
      });

      const posts = await connector.searchContent('Chinese sent iran 500 DF-41 missiles to Iran', {
        searchMode: 'claim',
      });

      expect(posts.map((post) => post.id)).toEqual(['match-1']);
    });

    it('should throw on API errors', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('429 Too Many Requests'));

      await expect(connector.searchContent('test')).rejects.toThrow('429 Too Many Requests');
    });
  });

  describe('searchAndTransform', () => {
    it('should search and pass results to transform service', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockRedditResponse });

      const insights = await connector.searchAndTransform('post');

      expect(transformService.transformBatch).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ platform: 'reddit' })]),
      );
      expect(insights).toHaveLength(2);
    });

    it('should propagate errors from searchContent', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('API error'));

      await expect(connector.searchAndTransform('query')).rejects.toThrow('API error');
    });
  });

  describe('streamContent', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return an EventEmitter', () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockRedditResponse });

      const emitter = connector.streamContent(['test']);

      expect(emitter).toBeDefined();
      expect(typeof emitter.on).toBe('function');

      emitter.emit('end');
    });

    it('should emit data events for matching posts on interval', async () => {
      jest.spyOn(connector, 'searchContent').mockResolvedValue([
        {
          id: 'abc123',
          text: 'This is the post body',
          platform: 'reddit',
          authorId: 'testuser',
          authorName: 'testuser',
          authorHandle: 'testuser',
          url: 'https://reddit.com/r/test/comments/abc123/test_post/',
          timestamp: new Date(),
          engagementMetrics: {
            likes: 1,
            shares: 0,
            comments: 0,
            reach: 1,
            viralityScore: 0.1,
          },
        },
      ] as any);

      // Use a keyword that matches the mock post content
      const emitter = connector.streamContent(['post body']);
      const dataHandler = jest.fn();
      emitter.on('data', dataHandler);

      // Advance past one polling interval
      await jest.advanceTimersByTimeAsync(60000);

      expect(dataHandler).toHaveBeenCalled();
      emitter.emit('end');
    });

    it('should emit error events on failure', async () => {
      jest.spyOn(connector, 'searchContent').mockRejectedValue(new Error('Network failure'));

      const emitter = connector.streamContent(['test']);
      const errorHandler = jest.fn();
      emitter.on('error', errorHandler);

      await jest.advanceTimersByTimeAsync(60000);

      expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
      emitter.emit('end');
    });

    it('should clean up on end event', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockRedditResponse });

      const emitter = connector.streamContent(['test']);

      expect((connector as any).streamConnections.size).toBe(1);

      emitter.emit('end');

      expect((connector as any).streamConnections.size).toBe(0);
    });
  });

  describe('postMatchesKeywords (stream relevance filter)', () => {
    function matches(text: string, query: string): boolean {
      return (
        connector as unknown as {
          postMatchesKeywords: (post: { text: string }, query: string) => boolean;
        }
      ).postMatchesKeywords({ text }, query);
    }

    it('matches on whole words', () => {
      expect(matches('A breakthrough in AI research today', 'AI')).toBe(true);
    });

    it('excludes posts that only share a substring with the query', () => {
      // "AI" is a substring of "blockchain"/"chain"/"maintain" but never a word.
      expect(matches('The blockchain will maintain the whole chain of custody', 'AI')).toBe(false);
    });
  });

  describe('getAuthorDetails', () => {
    it('should return author details from Reddit user API', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          data: {
            id: 'user123',
            name: 'testuser',
            link_karma: 5000,
            comment_karma: 10000,
            created: Date.now() / 1000 - 3 * 365 * 24 * 3600, // 3 years ago
            has_verified_email: true,
          },
        },
      });

      const details = await connector.getAuthorDetails('testuser');

      expect(details).toMatchObject({
        id: 'user123',
        name: 'testuser',
        platform: 'reddit',
        verificationStatus: 'verified',
      });
      expect(details.credibilityScore).toBeGreaterThan(0);
      expect(details.credibilityScore).toBeLessThanOrEqual(1);
    });

    it('should mark unverified when email not verified', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          data: {
            id: 'u2',
            name: 'nomail',
            link_karma: 100,
            comment_karma: 100,
            created: Date.now() / 1000 - 30 * 24 * 3600,
            has_verified_email: false,
          },
        },
      });

      const details = await connector.getAuthorDetails('nomail');

      expect(details.verificationStatus).toBe('unverified');
    });

    it('should throw on API errors', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('404 Not Found'));

      await expect(connector.getAuthorDetails('deleted_user')).rejects.toThrow('404 Not Found');
    });
  });

  describe('validateCredentials', () => {
    it('should return true when connect succeeds', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockRedditResponse });

      const result = await connector.validateCredentials();

      expect(result).toBe(true);
    });

    it('should return true even if connect warns (non-throw path)', async () => {
      // connect() catches errors internally, so validateCredentials always returns true
      mockAxiosInstance.get.mockRejectedValue(new Error('Unreachable'));

      const result = await connector.validateCredentials();

      expect(result).toBe(true);
    });
  });

  describe('rate limiting', () => {
    it('should route every request through the shared per-source rate limiter', async () => {
      const scheduleSpy = jest.spyOn(SourceRateLimiter.instance, 'schedule');
      mockAxiosInstance.get.mockResolvedValue({ data: mockRedditResponse });

      await connector.searchContent('test');

      expect(scheduleSpy).toHaveBeenCalledWith('reddit', expect.any(Function));
      expect(scheduleSpy).toHaveBeenCalledTimes(mockAxiosInstance.get.mock.calls.length);
    });

    it('should notify the limiter when Reddit responds with HTTP 429', async () => {
      const notifySpy = jest.spyOn(SourceRateLimiter.instance, 'notifyRateLimited');
      const rateLimitError = Object.assign(new Error('Request failed with status code 429'), {
        isAxiosError: true,
        response: { status: 429, headers: { 'retry-after': '30' } },
      });
      mockAxiosInstance.get.mockRejectedValue(rateLimitError);

      await expect(connector.searchContent('test')).rejects.toThrow('429');

      expect(notifySpy).toHaveBeenCalledWith('reddit', 30_000);
    });

    it('should not notify the limiter for non-429 errors', async () => {
      const notifySpy = jest.spyOn(SourceRateLimiter.instance, 'notifyRateLimited');
      mockAxiosInstance.get.mockRejectedValue(new Error('Network error'));

      await expect(connector.searchContent('test')).rejects.toThrow('Network error');

      expect(notifySpy).not.toHaveBeenCalled();
    });
  });
});
