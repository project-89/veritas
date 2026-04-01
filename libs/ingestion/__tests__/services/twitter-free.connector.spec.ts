import { ConfigService } from '@nestjs/config';
import { TwitterFreeConnector } from '../../src/lib/services/twitter-free.connector';
import { TransformOnIngestService } from '../../src/lib/services/transform/transform-on-ingest.service';
import { EventEmitter } from 'events';

// Mock the scraper module
const mockSearchTweets = jest.fn();
const mockGetProfile = jest.fn();
const mockIsLoggedIn = jest.fn();
const mockLogin = jest.fn();
const mockLogout = jest.fn();
const mockSetCookies = jest.fn();

jest.mock('@haruhunab1320/twitter-scraper', () => ({
  Scraper: jest.fn().mockImplementation(() => ({
    searchTweets: mockSearchTweets,
    getProfile: mockGetProfile,
    isLoggedIn: mockIsLoggedIn,
    login: mockLogin,
    logout: mockLogout,
    setCookies: mockSetCookies,
  })),
  SearchMode: { Latest: 1, Top: 0, Photos: 2, Videos: 3 },
}));

describe('TwitterFreeConnector', () => {
  let connector: TwitterFreeConnector;
  let mockConfigService: Partial<ConfigService>;
  let mockTransformService: Partial<TransformOnIngestService>;

  const mockTweet = {
    id: '123456',
    text: 'Test tweet about AI',
    userId: 'user1',
    username: 'testuser',
    name: 'Test User',
    timeParsed: new Date('2026-01-15T10:00:00Z'),
    permanentUrl: 'https://twitter.com/testuser/status/123456',
    likes: 100,
    retweets: 50,
    replies: 25,
    views: 10000,
    hashtags: ['AI'],
    mentions: [],
    photos: [],
    videos: [],
    urls: [],
    thread: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfigService = {
      get: jest.fn((key: string) => {
        const config: Record<string, string> = {
          TWITTER_USERNAME: 'testuser',
          TWITTER_PASSWORD: 'testpass',
        };
        return config[key];
      }),
    };
    mockTransformService = {
      transformBatch: jest.fn().mockResolvedValue([{ id: 'insight-1' }]),
      transform: jest.fn().mockResolvedValue({ id: 'insight-1' }),
    };
    connector = new TwitterFreeConnector(
      mockConfigService as ConfigService,
      mockTransformService as unknown as TransformOnIngestService,
    );
  });

  describe('connectToApi', () => {
    it('should login with username/password', async () => {
      mockIsLoggedIn.mockResolvedValue(false);
      mockLogin.mockResolvedValue(undefined);
      await (connector as any).connectToApi();
      expect(mockLogin).toHaveBeenCalledWith('testuser', 'testpass', undefined, undefined);
    });

    it('should authenticate with cookies when available', async () => {
      (mockConfigService.get as jest.Mock).mockImplementation((key: string) => {
        if (key === 'TWITTER_COOKIES') return '["cookie1=val1", "cookie2=val2"]';
        return undefined;
      });
      mockSetCookies.mockResolvedValue(undefined);
      mockIsLoggedIn.mockResolvedValue(true);
      connector = new TwitterFreeConnector(
        mockConfigService as ConfigService,
        mockTransformService as unknown as TransformOnIngestService,
      );
      await (connector as any).connectToApi();
      expect(mockSetCookies).toHaveBeenCalledWith(['cookie1=val1', 'cookie2=val2']);
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it('should throw when no credentials configured', async () => {
      (mockConfigService.get as jest.Mock).mockReturnValue(undefined);
      connector = new TwitterFreeConnector(
        mockConfigService as ConfigService,
        mockTransformService as unknown as TransformOnIngestService,
      );
      await expect((connector as any).connectToApi()).rejects.toThrow('Twitter connector requires authentication');
    });
  });

  describe('checkCredentialsValidity', () => {
    it('should return true when logged in', async () => {
      mockIsLoggedIn.mockResolvedValue(true);
      expect(await (connector as any).checkCredentialsValidity()).toBe(true);
    });

    it('should return false on error', async () => {
      mockIsLoggedIn.mockRejectedValue(new Error('fail'));
      expect(await (connector as any).checkCredentialsValidity()).toBe(false);
    });
  });

  describe('searchContent', () => {
    it('should search tweets and return SocialMediaPost array', async () => {
      async function* gen() { yield mockTweet; }
      mockSearchTweets.mockReturnValue(gen());
      const results = await connector.searchContent('AI', { limit: 10 });
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: '123456',
        text: 'Test tweet about AI',
        platform: 'twitter',
        authorId: 'user1',
        authorHandle: 'testuser',
        engagementMetrics: { likes: 100, shares: 50, comments: 25, reach: 10000 },
      });
    });

    it('should respect limit', async () => {
      async function* gen() { for (let i = 0; i < 100; i++) yield { ...mockTweet, id: `t${i}` }; }
      mockSearchTweets.mockReturnValue(gen());
      const results = await connector.searchContent('test', { limit: 5 });
      expect(results).toHaveLength(5);
    });

    it('should filter by date range', async () => {
      async function* gen() {
        yield { ...mockTweet, id: 'old', timeParsed: new Date('2025-01-01') };
        yield { ...mockTweet, id: 'mid', timeParsed: new Date('2026-03-15') };
        yield { ...mockTweet, id: 'new', timeParsed: new Date('2026-06-01') };
      }
      mockSearchTweets.mockReturnValue(gen());
      const results = await connector.searchContent('test', {
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-04-01'),
      });
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe('mid');
    });

    it('should handle missing optional fields', async () => {
      async function* gen() {
        yield { id: '999', text: 'Minimal', hashtags: [], mentions: [], photos: [], videos: [], urls: [], thread: [] };
      }
      mockSearchTweets.mockReturnValue(gen());
      const results = await connector.searchContent('test');
      expect(results[0]).toMatchObject({ id: '999', authorId: '', engagementMetrics: { likes: 0, shares: 0 } });
    });
  });

  describe('getAuthorDetails', () => {
    it('should fetch profile and map to SourceNode', async () => {
      mockGetProfile.mockResolvedValue({
        userId: 'u1', username: 'johndoe', name: 'John Doe',
        biography: 'Dev', followersCount: 5000, isVerified: false, isBlueVerified: true,
      });
      const result = await connector.getAuthorDetails('johndoe');
      expect(result).toMatchObject({ id: 'u1', name: 'John Doe', platform: 'twitter', verificationStatus: 'verified' });
    });
  });

  describe('streamContent', () => {
    it('should return an EventEmitter with close', () => {
      jest.useFakeTimers();
      const stream = connector.streamContent(['test']);
      expect(stream).toBeInstanceOf(EventEmitter);
      expect(typeof (stream as any).close).toBe('function');
      (stream as any).close();
      jest.useRealTimers();
    });
  });

  describe('disconnectFromApi', () => {
    it('should call logout', async () => {
      mockLogout.mockResolvedValue(undefined);
      await (connector as any).disconnectFromApi();
      expect(mockLogout).toHaveBeenCalled();
    });
  });
});
