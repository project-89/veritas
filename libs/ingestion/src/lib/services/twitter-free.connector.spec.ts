import { ConfigService } from '@nestjs/config';
import { TwitterFreeConnector } from './twitter-free.connector';
import { TransformOnIngestService } from './transform/transform-on-ingest.service';
import { SubprocessUtil } from './utils/subprocess.util';

describe('TwitterFreeConnector', () => {
  let connector: TwitterFreeConnector;
  let configService: Partial<ConfigService>;
  let transformService: Partial<TransformOnIngestService>;
  let subprocessUtil: Partial<SubprocessUtil>;

  const mockTweets = [
    {
      id: '1234567890',
      text: 'This is a test tweet about climate change',
      created_at: '2024-01-15T12:00:00Z',
      author_id: 'author_123',
      author_name: 'Test User',
      author_username: 'testuser',
      like_count: 100,
      retweet_count: 25,
      reply_count: 10,
      quote_count: 5,
      impression_count: 50000,
      url: 'https://twitter.com/testuser/status/1234567890',
    },
    {
      id: '9876543210',
      text: 'Another tweet about technology',
      created_at: '2024-01-16T08:30:00Z',
      author_id: 'author_456',
      author_name: 'Other User',
      author_username: 'otheruser',
      like_count: 50,
      retweet_count: 10,
      reply_count: 3,
      quote_count: 2,
      impression_count: 10000,
      url: 'https://twitter.com/otheruser/status/9876543210',
    },
  ];

  const mockUser = {
    id: 'author_123',
    name: 'Test User',
    username: 'testuser',
    followers_count: 15000,
    following_count: 500,
    verified: true,
    description: 'A test user account',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    configService = {
      get: jest.fn().mockReturnValue(undefined),
    };

    transformService = {
      transformBatch: jest.fn().mockResolvedValue([
        { id: 'insight-1', contentHash: 'h1' },
      ]),
      transform: jest.fn().mockResolvedValue({ id: 'insight-1' }),
    };

    subprocessUtil = {
      exec: jest.fn().mockResolvedValue({
        stdout: 'testuser',
        stderr: '',
        exitCode: 0,
      }),
      checkAvailability: jest.fn().mockResolvedValue(true),
    };

    connector = new TwitterFreeConnector(
      configService as ConfigService,
      transformService as TransformOnIngestService,
      subprocessUtil as SubprocessUtil
    );
  });

  describe('constructor', () => {
    it('should default birdPath to "bird"', () => {
      expect((connector as any).birdPath).toBe('bird');
    });

    it('should use custom path from config', () => {
      (configService.get as jest.Mock).mockReturnValue('/usr/local/bin/bird');

      const custom = new TwitterFreeConnector(
        configService as ConfigService,
        transformService as TransformOnIngestService,
        subprocessUtil as SubprocessUtil
      );

      expect((custom as any).birdPath).toBe('/usr/local/bin/bird');
    });
  });

  describe('connectToApi', () => {
    it('should succeed when bird CLI is available and cookies are valid', async () => {
      (subprocessUtil.checkAvailability as jest.Mock).mockResolvedValue(true);
      (subprocessUtil.exec as jest.Mock).mockResolvedValue({
        stdout: 'testuser',
        stderr: '',
        exitCode: 0,
      });

      await expect(
        (connector as any).connectToApi()
      ).resolves.not.toThrow();
    });

    it('should throw when bird CLI is not available', async () => {
      (subprocessUtil.checkAvailability as jest.Mock).mockResolvedValue(false);

      await expect((connector as any).connectToApi()).rejects.toThrow(
        'bird CLI is not installed'
      );
    });

    it('should throw when cookies are invalid', async () => {
      (subprocessUtil.checkAvailability as jest.Mock).mockResolvedValue(true);
      (subprocessUtil.exec as jest.Mock).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 1,
      });

      await expect((connector as any).connectToApi()).rejects.toThrow(
        'bird CLI cookies are invalid'
      );
    });
  });

  describe('checkCredentialsValidity', () => {
    it('should return true when whoami succeeds with output', async () => {
      (subprocessUtil.exec as jest.Mock).mockResolvedValue({
        stdout: 'testuser\n',
        stderr: '',
        exitCode: 0,
      });

      const result = await (connector as any).checkCredentialsValidity();
      expect(result).toBe(true);
      expect(subprocessUtil.exec).toHaveBeenCalledWith(
        'bird',
        ['whoami'],
        { timeout: 15000 }
      );
    });

    it('should return false when whoami returns empty stdout', async () => {
      (subprocessUtil.exec as jest.Mock).mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      const result = await (connector as any).checkCredentialsValidity();
      expect(result).toBe(false);
    });

    it('should return false when whoami fails', async () => {
      (subprocessUtil.exec as jest.Mock).mockResolvedValue({
        stdout: '',
        stderr: 'error',
        exitCode: 1,
      });

      const result = await (connector as any).checkCredentialsValidity();
      expect(result).toBe(false);
    });

    it('should return false on exception', async () => {
      (subprocessUtil.exec as jest.Mock).mockRejectedValue(
        new Error('timeout')
      );

      const result = await (connector as any).checkCredentialsValidity();
      expect(result).toBe(false);
    });
  });

  describe('searchContent', () => {
    it('should search using bird CLI and return transformed posts', async () => {
      (subprocessUtil.exec as jest.Mock).mockResolvedValue({
        stdout: JSON.stringify(mockTweets),
        stderr: '',
        exitCode: 0,
      });

      const posts = await connector.searchContent('climate change');

      expect(subprocessUtil.exec).toHaveBeenCalledWith(
        'bird',
        ['search', 'climate change', '--count', '50', '--format', 'json'],
        { timeout: 30000 }
      );

      expect(posts).toHaveLength(2);
      expect(posts[0]).toMatchObject({
        id: '1234567890',
        text: 'This is a test tweet about climate change',
        platform: 'twitter',
        authorId: 'author_123',
        authorName: 'Test User',
        authorHandle: 'testuser',
      });
    });

    it('should respect limit option', async () => {
      (subprocessUtil.exec as jest.Mock).mockResolvedValue({
        stdout: JSON.stringify(mockTweets),
        stderr: '',
        exitCode: 0,
      });

      await connector.searchContent('test', { limit: 10 });

      const args = (subprocessUtil.exec as jest.Mock).mock.calls[0][1];
      expect(args).toContain('10');
    });

    it('should parse newline-delimited JSON when array parse fails', async () => {
      (subprocessUtil.exec as jest.Mock).mockResolvedValue({
        stdout: mockTweets.map((t) => JSON.stringify(t)).join('\n'),
        stderr: '',
        exitCode: 0,
      });

      const posts = await connector.searchContent('test');

      expect(posts).toHaveLength(2);
    });

    it('should filter by startDate', async () => {
      (subprocessUtil.exec as jest.Mock).mockResolvedValue({
        stdout: JSON.stringify(mockTweets),
        stderr: '',
        exitCode: 0,
      });

      const posts = await connector.searchContent('test', {
        startDate: new Date('2024-01-16T00:00:00Z'),
      });

      expect(posts).toHaveLength(1);
      expect(posts[0]!.id).toBe('9876543210');
    });

    it('should filter by endDate', async () => {
      (subprocessUtil.exec as jest.Mock).mockResolvedValue({
        stdout: JSON.stringify(mockTweets),
        stderr: '',
        exitCode: 0,
      });

      const posts = await connector.searchContent('test', {
        endDate: new Date('2024-01-15T23:59:59Z'),
      });

      expect(posts).toHaveLength(1);
      expect(posts[0]!.id).toBe('1234567890');
    });

    it('should throw when bird search returns non-zero exit code', async () => {
      (subprocessUtil.exec as jest.Mock).mockResolvedValue({
        stdout: '',
        stderr: 'rate limited',
        exitCode: 1,
      });

      await expect(connector.searchContent('test')).rejects.toThrow(
        'bird search failed'
      );
    });

    it('should calculate engagement metrics correctly', async () => {
      (subprocessUtil.exec as jest.Mock).mockResolvedValue({
        stdout: JSON.stringify([mockTweets[0]]),
        stderr: '',
        exitCode: 0,
      });

      const posts = await connector.searchContent('test');
      const metrics = posts[0]!.engagementMetrics;

      expect(metrics.likes).toBe(100);
      expect(metrics.shares).toBe(30); // retweet_count + quote_count
      expect(metrics.comments).toBe(10);
      expect(metrics.reach).toBe(50000);
      expect(metrics.viralityScore).toBeGreaterThan(0);
      expect(metrics.viralityScore).toBeLessThanOrEqual(1);
    });

    it('should handle tweets with zero impressions', async () => {
      const zeroImpressionTweet = {
        ...mockTweets[0],
        impression_count: 0,
      };
      (subprocessUtil.exec as jest.Mock).mockResolvedValue({
        stdout: JSON.stringify([zeroImpressionTweet]),
        stderr: '',
        exitCode: 0,
      });

      const posts = await connector.searchContent('test');
      expect(posts[0]!.engagementMetrics.viralityScore).toBe(0);
    });
  });

  describe('streamContent', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return an EventEmitter with close method', () => {
      (subprocessUtil.exec as jest.Mock).mockResolvedValue({
        stdout: JSON.stringify(mockTweets),
        stderr: '',
        exitCode: 0,
      });

      const emitter = connector.streamContent(['test']);

      expect(emitter).toBeDefined();
      expect(typeof emitter.on).toBe('function');
      expect(typeof (emitter as any).close).toBe('function');

      (emitter as any).close();
    });

    it('should emit matching posts on polling interval', async () => {
      jest.useRealTimers();

      // Mock the searchContent method directly to avoid timer/async issues
      const mockPosts = [
        {
          id: '1',
          text: 'A tweet about climate change',
          platform: 'twitter',
          authorId: 'a1',
          authorName: 'User',
          timestamp: new Date(),
          engagementMetrics: {
            likes: 10,
            shares: 5,
            comments: 2,
            reach: 100,
            viralityScore: 0.1,
          },
        },
      ];
      jest.spyOn(connector, 'searchContent').mockResolvedValue(mockPosts);

      // Use a very short polling interval for testing
      (connector as any).pollingInterval = 50;

      const dataHandler = jest.fn();
      const emitter = connector.streamContent(['climate']);
      emitter.on('data', dataHandler);

      // Wait for the interval to fire
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(dataHandler).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('climate') })
      );
      (emitter as any).close();

      jest.useFakeTimers();
    });

    it('should emit error events on search failure', async () => {
      (subprocessUtil.exec as jest.Mock).mockRejectedValue(
        new Error('bird crash')
      );

      const errorHandler = jest.fn();
      const emitter = connector.streamContent(['test']);
      emitter.on('error', errorHandler);

      await jest.advanceTimersByTimeAsync(60000);

      expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
      (emitter as any).close();
    });
  });

  describe('getAuthorDetails', () => {
    it('should return user details from bird CLI', async () => {
      (subprocessUtil.exec as jest.Mock).mockResolvedValue({
        stdout: JSON.stringify(mockUser),
        stderr: '',
        exitCode: 0,
      });

      const details = await connector.getAuthorDetails('testuser');

      expect(subprocessUtil.exec).toHaveBeenCalledWith(
        'bird',
        ['user', 'testuser', '--format', 'json'],
        { timeout: 15000 }
      );

      expect(details).toMatchObject({
        id: 'author_123',
        name: 'Test User',
        platform: 'twitter',
        url: 'https://twitter.com/testuser',
        verificationStatus: 'verified',
      });
    });

    it('should calculate credibility score with verification bonus', async () => {
      (subprocessUtil.exec as jest.Mock).mockResolvedValue({
        stdout: JSON.stringify(mockUser),
        stderr: '',
        exitCode: 0,
      });

      const details = await connector.getAuthorDetails('testuser');

      // verified (0.5) + min(15000/10000, 0.5) = 0.5 + 0.5 = 1.0
      expect(details.credibilityScore).toBe(1.0);
    });

    it('should calculate lower credibility for unverified low-follower accounts', async () => {
      (subprocessUtil.exec as jest.Mock).mockResolvedValue({
        stdout: JSON.stringify({
          ...mockUser,
          verified: false,
          followers_count: 100,
        }),
        stderr: '',
        exitCode: 0,
      });

      const details = await connector.getAuthorDetails('smalluser');
      // not verified (0) + min(100/10000, 0.5) = 0.01
      expect(details.credibilityScore).toBeLessThan(0.5);
    });

    it('should throw when bird user lookup fails', async () => {
      (subprocessUtil.exec as jest.Mock).mockResolvedValue({
        stdout: '',
        stderr: 'user not found',
        exitCode: 1,
      });

      await expect(connector.getAuthorDetails('ghost')).rejects.toThrow(
        'bird user lookup failed'
      );
    });
  });
});
