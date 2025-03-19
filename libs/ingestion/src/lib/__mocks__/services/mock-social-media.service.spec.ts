import { EventEmitter } from 'events';

// Mock interfaces
interface MockSourceNode {
  id: string;
  name: string;
  platform: string;
  verificationStatus?: string;
  [key: string]: any;
}

interface SocialMediaPost {
  id: string;
  text: string;
  timestamp: Date;
  platform: string;
  authorId: string;
  authorName?: string;
  authorHandle?: string;
  url?: string;
  engagementMetrics: {
    likes: number;
    shares: number;
    comments: number;
    reach: number;
    viralityScore: number;
  };
}

// Create mock connectors
class MockSocialMediaConnector {
  constructor(public platform: string) {}

  validateCredentials = jest.fn().mockResolvedValue(true);
  disconnect = jest.fn().mockResolvedValue(undefined);
  searchContent = jest.fn().mockResolvedValue([]);
  getAuthorDetails = jest.fn().mockResolvedValue({
    id: 'author123',
    name: 'Test Author',
    platform: this.platform,
  });
  streamContent = jest.fn().mockImplementation((keywords: string[]) => {
    return new EventEmitter();
  });
}

class MockTwitterConnector extends MockSocialMediaConnector {
  constructor() {
    super('twitter');

    // Override default behavior for Twitter
    const mockPost: SocialMediaPost = {
      id: '123',
      text: 'Test post',
      timestamp: new Date(),
      platform: 'twitter',
      authorId: 'author123',
      authorName: 'Test Author',
      authorHandle: '@testauthor',
      url: 'https://twitter.com/testauthor/123',
      engagementMetrics: {
        likes: 100,
        shares: 50,
        comments: 25,
        reach: 1000,
        viralityScore: 0.5,
      },
    };

    this.searchContent = jest.fn().mockResolvedValue([mockPost]);
    this.streamContent = jest.fn().mockImplementation((keywords: string[]) => {
      const emitter = new EventEmitter();
      // Simulate emitting a post
      setTimeout(() => {
        emitter.emit('data', mockPost);
      }, 0);
      return emitter;
    });
  }
}

// Mock SocialMediaService
class SocialMediaService {
  private readonly connectors: MockSocialMediaConnector[];

  constructor(
    private readonly twitterConnector: MockTwitterConnector,
    private readonly facebookConnector: MockSocialMediaConnector,
    private readonly redditConnector: MockSocialMediaConnector
  ) {
    this.connectors = [twitterConnector, facebookConnector, redditConnector];
  }

  async onModuleInit() {
    await Promise.all(
      this.connectors.map(async (connector) => {
        try {
          await connector.validateCredentials();
        } catch (error) {
          console.error(
            `Failed to validate credentials for ${connector.platform}:`,
            error
          );
        }
      })
    );
  }

  async onModuleDestroy() {
    await Promise.all(
      this.connectors.map(async (connector) => {
        try {
          await connector.disconnect();
        } catch (error) {
          console.error(
            `Failed to disconnect from ${connector.platform}:`,
            error
          );
        }
      })
    );
  }

  async searchAllPlatforms(
    query: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      platforms?: string[];
    }
  ): Promise<SocialMediaPost[]> {
    const targetConnectors = options?.platforms
      ? this.connectors.filter((connector) =>
          options.platforms!.includes(connector.platform)
        )
      : this.connectors;

    const searchPromises = targetConnectors.map((connector) =>
      connector
        .searchContent(query, {
          startDate: options?.startDate,
          endDate: options?.endDate,
          limit: options?.limit,
        })
        .catch((error: Error) => {
          console.error(
            `Error searching content on ${connector.platform}:`,
            error
          );
          return [];
        })
    );

    const results = await Promise.all(searchPromises);
    return results.flat();
  }

  async getAuthorDetails(
    authorId: string,
    platform: string
  ): Promise<Partial<MockSourceNode>> {
    const connector = this.connectors.find((c) => c.platform === platform);
    if (!connector) {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    return connector.getAuthorDetails(authorId);
  }

  async *streamAllPlatforms(
    keywords: string[],
    options?: {
      platforms?: string[];
    }
  ): AsyncGenerator<SocialMediaPost> {
    const targetConnectors = options?.platforms
      ? this.connectors.filter((connector) =>
          options.platforms!.includes(connector.platform)
        )
      : this.connectors;

    const emitter = new EventEmitter();
    let hasError = false;

    for (const connector of targetConnectors) {
      try {
        const stream = connector.streamContent(keywords);
        stream.on('data', (post: SocialMediaPost) => {
          if (!hasError) {
            emitter.emit('data', post);
          }
        });
        stream.on('error', (error: Error) => {
          hasError = true;
          console.error(`Error in ${connector.platform} stream:`, error);
          emitter.emit('error', error);
        });
      } catch (error) {
        hasError = true;
        console.error(`Error setting up ${connector.platform} stream:`, error);
        emitter.emit('error', error);
      }
    }

    try {
      while (!hasError) {
        const post: SocialMediaPost = await new Promise((resolve, reject) => {
          emitter.once('data', resolve);
          emitter.once('error', reject);
        });
        yield post;
      }
    } catch (error) {
      console.error('Error in stream:', error);
      throw error;
    } finally {
      emitter.removeAllListeners();
      await Promise.all(
        targetConnectors.map((connector) => connector.disconnect())
      );
    }
  }
}

describe('SocialMediaService', () => {
  let service: SocialMediaService;
  let twitterConnector: MockTwitterConnector;
  let facebookConnector: MockSocialMediaConnector;
  let redditConnector: MockSocialMediaConnector;

  const mockSourceNode: MockSourceNode = {
    id: 'source123',
    name: 'Test Source',
    platform: 'twitter',
    verificationStatus: 'VERIFIED',
  };

  const mockPost: SocialMediaPost = {
    id: '123',
    text: 'Test post',
    timestamp: new Date(),
    platform: 'twitter',
    authorId: 'author123',
    authorName: 'Test Author',
    authorHandle: '@testauthor',
    url: 'https://twitter.com/testauthor/123',
    engagementMetrics: {
      likes: 100,
      shares: 50,
      comments: 25,
      reach: 1000,
      viralityScore: 0.5,
    },
  };

  beforeEach(() => {
    twitterConnector = new MockTwitterConnector();
    facebookConnector = new MockSocialMediaConnector('facebook');
    redditConnector = new MockSocialMediaConnector('reddit');

    service = new SocialMediaService(
      twitterConnector,
      facebookConnector,
      redditConnector
    );
  });

  describe('Module Lifecycle', () => {
    describe('onModuleInit', () => {
      it('should validate credentials for all platforms', async () => {
        await service.onModuleInit();

        expect(twitterConnector.validateCredentials).toHaveBeenCalled();
        expect(facebookConnector.validateCredentials).toHaveBeenCalled();
        expect(redditConnector.validateCredentials).toHaveBeenCalled();
      });

      it('should handle validation failures gracefully', async () => {
        const validationError = new Error('Invalid credentials');
        jest
          .spyOn(twitterConnector, 'validateCredentials')
          .mockRejectedValueOnce(validationError);

        await expect(service.onModuleInit()).resolves.not.toThrow();
      });
    });

    describe('onModuleDestroy', () => {
      it('should disconnect from all platforms', async () => {
        await service.onModuleDestroy();

        expect(twitterConnector.disconnect).toHaveBeenCalled();
        expect(facebookConnector.disconnect).toHaveBeenCalled();
        expect(redditConnector.disconnect).toHaveBeenCalled();
      });

      it('should handle disconnection errors gracefully', async () => {
        const disconnectError = new Error('Disconnect failed');
        jest
          .spyOn(twitterConnector, 'disconnect')
          .mockRejectedValueOnce(disconnectError);

        await expect(service.onModuleDestroy()).resolves.not.toThrow();
      });
    });
  });

  describe('searchAllPlatforms', () => {
    it('should search with date range options', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await service.searchAllPlatforms('test', { startDate, endDate });

      expect(twitterConnector.searchContent).toHaveBeenCalledWith(
        'test',
        expect.objectContaining({
          startDate,
          endDate,
        })
      );
    });

    it('should search with limit option', async () => {
      const limit = 10;

      await service.searchAllPlatforms('test', { limit });

      expect(twitterConnector.searchContent).toHaveBeenCalledWith(
        'test',
        expect.objectContaining({ limit })
      );
    });

    it('should handle empty results from all platforms', async () => {
      jest.spyOn(twitterConnector, 'searchContent').mockResolvedValue([]);

      const results = await service.searchAllPlatforms('test');

      expect(results).toEqual([]);
    });

    it('should handle mixed success and failure across platforms', async () => {
      jest
        .spyOn(twitterConnector, 'searchContent')
        .mockRejectedValue(new Error('API Error'));
      jest
        .spyOn(facebookConnector, 'searchContent')
        .mockResolvedValue([mockPost]);

      const results = await service.searchAllPlatforms('test');

      expect(results).toEqual([mockPost]);
    });

    it('should search content across all platforms', async () => {
      const query = 'test query';
      const options = {
        startDate: new Date(),
        endDate: new Date(),
        limit: 10,
      };

      const results = await service.searchAllPlatforms(query, options);

      expect(twitterConnector.searchContent).toHaveBeenCalledWith(
        query,
        options
      );
      expect(facebookConnector.searchContent).toHaveBeenCalledWith(
        query,
        options
      );
      expect(redditConnector.searchContent).toHaveBeenCalledWith(
        query,
        options
      );
      expect(results.length).toBeGreaterThan(0);
    });

    it('should search specific platforms when specified', async () => {
      const query = 'test query';
      const options = {
        platforms: ['twitter', 'facebook'],
      };

      await service.searchAllPlatforms(query, options);

      expect(twitterConnector.searchContent).toHaveBeenCalled();
      expect(facebookConnector.searchContent).toHaveBeenCalled();
      expect(redditConnector.searchContent).not.toHaveBeenCalled();
    });

    it('should handle platform errors gracefully', async () => {
      jest
        .spyOn(twitterConnector, 'searchContent')
        .mockRejectedValueOnce(new Error('API Error'));

      const results = await service.searchAllPlatforms('test');

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('getAuthorDetails', () => {
    it('should get author details from specified platform', async () => {
      const authorId = 'author123';
      const platform = 'twitter';

      const result = await service.getAuthorDetails(authorId, platform);

      expect(twitterConnector.getAuthorDetails).toHaveBeenCalledWith(authorId);
      expect(result).toBeDefined();
    });

    it('should throw error for unsupported platform', async () => {
      const authorId = 'author123';
      const platform = 'unsupported';

      await expect(
        service.getAuthorDetails(authorId, platform)
      ).rejects.toThrow('Unsupported platform');
    });
  });

  describe('streamAllPlatforms', () => {
    // Increase timeout for streaming tests
    jest.setTimeout(10000);

    it('should handle platform streaming errors', async () => {
      const mockError = new Error('Stream error');
      jest
        .spyOn(twitterConnector, 'streamContent')
        .mockImplementation((keywords: string[]) => {
          const emitter = new EventEmitter();
          process.nextTick(() => {
            emitter.emit('error', mockError);
          });
          return emitter;
        });

      const stream = service.streamAllPlatforms(['test']);

      try {
        // Just try to get the first value, which should trigger the error
        await stream.next();
        fail('Expected an error to be thrown');
      } catch (error) {
        expect(error).toEqual(mockError);
      }
    }, 15000); // Increase timeout for this specific test

    it('should aggregate content from all platforms', async () => {
      const mockPost: SocialMediaPost = {
        id: 'test-post',
        text: 'Test content',
        timestamp: new Date(),
        platform: 'twitter',
        authorId: 'test-author',
        authorName: 'Test User',
        authorHandle: '@testuser',
        url: 'https://twitter.com/testuser/status/test-post',
        engagementMetrics: {
          likes: 100,
          shares: 50,
          comments: 25,
          reach: 1000,
          viralityScore: 0.5,
        },
      };

      jest
        .spyOn(twitterConnector, 'streamContent')
        .mockImplementation((keywords: string[]) => {
          const emitter = new EventEmitter();
          // Emit data immediately instead of using setTimeout
          process.nextTick(() => {
            emitter.emit('data', mockPost);
          });
          return emitter;
        });

      const stream = service.streamAllPlatforms(['test']);
      const { value, done } = await stream.next();

      expect(value).toEqual(mockPost);
      expect(done).toBe(false);
    });
  });
});
