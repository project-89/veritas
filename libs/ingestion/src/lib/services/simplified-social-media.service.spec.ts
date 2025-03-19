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

interface NarrativeInsight {
  id: string;
  contentHash: string;
  sourceHash: string;
  platform: string;
  timestamp: Date;
  themes: string[];
  entities: any[];
  sentiment: any;
  engagement: any;
  narrativeScore: number;
  processedAt: Date;
  expiresAt: Date;
}

/**
 * Modern-style connector interface that implements transform-on-ingest pattern directly
 */
class ModernPlatformConnector {
  constructor(public platform: string) {}

  // Setup methods
  validateCredentials = jest.fn().mockResolvedValue(true);
  disconnect = jest.fn().mockResolvedValue(undefined);

  // Direct transform methods - these are the preferred approach
  searchAndTransform = jest.fn().mockResolvedValue([
    {
      id: 'insight-1',
      contentHash: 'hash-1',
      sourceHash: 'hash-2',
      platform: this.platform,
      timestamp: new Date(),
      themes: ['tech', 'innovation'],
      entities: [{ name: 'AI', type: 'technology', relevance: 0.9 }],
      sentiment: { score: 0.5, label: 'positive', confidence: 0.8 },
      engagement: { total: 1000, breakdown: { likes: 800, shares: 200 } },
      narrativeScore: 0.7,
      processedAt: new Date(),
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
    },
  ]);

  streamAndTransform = jest.fn().mockImplementation(() => {
    const emitter = new EventEmitter();
    process.nextTick(() => {
      emitter.emit('data', {
        id: 'insight-2',
        contentHash: 'hash-3',
        sourceHash: 'hash-4',
        platform: this.platform,
        timestamp: new Date(),
        themes: ['politics', 'economy'],
        entities: [{ name: 'Economy', type: 'topic', relevance: 0.8 }],
        sentiment: { score: -0.2, label: 'negative', confidence: 0.7 },
        engagement: { total: 500, breakdown: { likes: 300, shares: 200 } },
        narrativeScore: 0.5,
        processedAt: new Date(),
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      });
    });
    return emitter;
  });

  // Legacy methods - these are only kept for compatibility
  searchContent = jest.fn().mockResolvedValue([]);
  getAuthorDetails = jest.fn().mockResolvedValue({
    id: 'author123',
    name: 'Test Author',
    platform: this.platform,
  });
  streamContent = jest.fn().mockImplementation(() => new EventEmitter());
}

/**
 * Service that coordinates transform-on-ingest operations across platforms
 */
class TransformOnIngestService {
  private readonly connectors: ModernPlatformConnector[];

  constructor(
    private readonly twitterConnector: ModernPlatformConnector,
    private readonly facebookConnector: ModernPlatformConnector,
    private readonly redditConnector: ModernPlatformConnector
  ) {
    this.connectors = [twitterConnector, facebookConnector, redditConnector];
  }

  async onModuleInit(): Promise<void> {
    await Promise.all(
      this.connectors.map(async (connector) => {
        try {
          await connector.validateCredentials();
        } catch (error: unknown) {
          console.error(
            `Failed to validate credentials for ${connector.platform}:`,
            error
          );
        }
      })
    );
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(
      this.connectors.map(async (connector) => {
        try {
          await connector.disconnect();
        } catch (error: unknown) {
          console.error(
            `Failed to disconnect from ${connector.platform}:`,
            error
          );
        }
      })
    );
  }

  /**
   * Search and transform content across all platforms
   * This is the preferred approach as it transforms data during ingestion
   */
  async searchAllAndTransform(
    query: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      platforms?: string[];
    }
  ): Promise<NarrativeInsight[]> {
    const targetConnectors = options?.platforms
      ? this.connectors.filter((connector) =>
          options.platforms!.includes(connector.platform)
        )
      : this.connectors;

    const searchPromises = targetConnectors.map((connector) =>
      connector
        .searchAndTransform(query, {
          startDate: options?.startDate,
          endDate: options?.endDate,
          limit: options?.limit,
        })
        .catch((error: unknown) => {
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

  /**
   * Stream and transform content across all platforms
   * This is the preferred approach as it transforms data during ingestion
   */
  streamAllAndTransform(
    keywords: string[],
    options?: {
      platforms?: string[];
    }
  ): EventEmitter {
    const outputEmitter = new EventEmitter();

    const targetConnectors = options?.platforms
      ? this.connectors.filter((connector) =>
          options.platforms!.includes(connector.platform)
        )
      : this.connectors;

    for (const connector of targetConnectors) {
      try {
        const stream = connector.streamAndTransform(keywords);

        stream.on('data', (insight: NarrativeInsight) => {
          outputEmitter.emit('data', insight);
        });

        stream.on('error', (error: Error) => {
          console.error(`Error in ${connector.platform} stream:`, error);
          outputEmitter.emit('error', error);
        });
      } catch (error: unknown) {
        console.error(`Error setting up ${connector.platform} stream:`, error);
        outputEmitter.emit('error', error);
      }
    }

    return outputEmitter;
  }
}

describe('TransformOnIngestService', () => {
  let service: TransformOnIngestService;
  let twitterConnector: ModernPlatformConnector;
  let facebookConnector: ModernPlatformConnector;
  let redditConnector: ModernPlatformConnector;

  beforeEach(() => {
    twitterConnector = new ModernPlatformConnector('twitter');
    facebookConnector = new ModernPlatformConnector('facebook');
    redditConnector = new ModernPlatformConnector('reddit');

    service = new TransformOnIngestService(
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

        // Should not throw
        await service.onModuleInit();
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

        // Should not throw
        await service.onModuleDestroy();
      });
    });
  });

  describe('searchAllAndTransform', () => {
    it('should search with date range options', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await service.searchAllAndTransform('test', { startDate, endDate });

      expect(twitterConnector.searchAndTransform).toHaveBeenCalledWith(
        'test',
        expect.objectContaining({
          startDate,
          endDate,
        })
      );
    });

    it('should search with limit option', async () => {
      const limit = 10;

      await service.searchAllAndTransform('test', { limit });

      expect(twitterConnector.searchAndTransform).toHaveBeenCalledWith(
        'test',
        expect.objectContaining({ limit })
      );
    });

    it('should handle empty results from all platforms', async () => {
      jest.spyOn(twitterConnector, 'searchAndTransform').mockResolvedValue([]);
      jest.spyOn(facebookConnector, 'searchAndTransform').mockResolvedValue([]);
      jest.spyOn(redditConnector, 'searchAndTransform').mockResolvedValue([]);

      const results = await service.searchAllAndTransform('test');

      expect(results).toEqual([]);
    });

    it('should handle mixed success and failure across platforms', async () => {
      const mockInsight = {
        id: 'test-insight',
        contentHash: 'hash1',
        sourceHash: 'hash2',
        platform: 'facebook',
        timestamp: new Date(),
        themes: ['test'],
        entities: [],
        sentiment: { score: 0, label: 'neutral', confidence: 0.5 },
        engagement: { total: 0, breakdown: {} },
        narrativeScore: 0,
        processedAt: new Date(),
        expiresAt: new Date(),
      };

      // Clear all mock implementations first
      jest.spyOn(twitterConnector, 'searchAndTransform').mockReset();
      jest.spyOn(facebookConnector, 'searchAndTransform').mockReset();
      jest.spyOn(redditConnector, 'searchAndTransform').mockReset();

      // Now set specific behaviors
      jest
        .spyOn(twitterConnector, 'searchAndTransform')
        .mockRejectedValue(new Error('API Error'));
      jest
        .spyOn(facebookConnector, 'searchAndTransform')
        .mockResolvedValue([mockInsight]);
      jest.spyOn(redditConnector, 'searchAndTransform').mockResolvedValue([]);

      const results = await service.searchAllAndTransform('test');

      // Only check the length to avoid date comparison issues
      expect(results.length).toBe(1);
      expect(results[0].id).toBe(mockInsight.id);
      expect(results[0].platform).toBe(mockInsight.platform);
    });

    it('should search content across all platforms', async () => {
      const query = 'test query';
      const options = {
        startDate: new Date(),
        endDate: new Date(),
        limit: 10,
      };

      const results = await service.searchAllAndTransform(query, options);

      expect(twitterConnector.searchAndTransform).toHaveBeenCalledWith(
        query,
        options
      );
      expect(facebookConnector.searchAndTransform).toHaveBeenCalledWith(
        query,
        options
      );
      expect(redditConnector.searchAndTransform).toHaveBeenCalledWith(
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

      await service.searchAllAndTransform(query, options);

      expect(twitterConnector.searchAndTransform).toHaveBeenCalled();
      expect(facebookConnector.searchAndTransform).toHaveBeenCalled();
      expect(redditConnector.searchAndTransform).not.toHaveBeenCalled();
    });

    it('should handle platform errors gracefully', async () => {
      jest
        .spyOn(twitterConnector, 'searchAndTransform')
        .mockRejectedValueOnce(new Error('API Error'));

      const results = await service.searchAllAndTransform('test');

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('streamAllAndTransform', () => {
    it('should set up streams for all platforms', () => {
      service.streamAllAndTransform(['test']);

      expect(twitterConnector.streamAndTransform).toHaveBeenCalledWith([
        'test',
      ]);
      expect(facebookConnector.streamAndTransform).toHaveBeenCalledWith([
        'test',
      ]);
      expect(redditConnector.streamAndTransform).toHaveBeenCalledWith(['test']);
    });

    it('should set up streams for specific platforms when specified', () => {
      service.streamAllAndTransform(['test'], {
        platforms: ['twitter', 'facebook'],
      });

      expect(twitterConnector.streamAndTransform).toHaveBeenCalled();
      expect(facebookConnector.streamAndTransform).toHaveBeenCalled();
      expect(redditConnector.streamAndTransform).not.toHaveBeenCalled();
    });

    it('should forward data events from platform streams', (done) => {
      // Create a mock emitter that will emit our test data
      const mockEmitter = new EventEmitter();

      // Create a simple mock insight
      const mockInsight = {
        id: 'insight-test',
        contentHash: 'hash-test',
        sourceHash: 'source-hash-test',
        platform: 'facebook',
        timestamp: new Date(),
        themes: ['test-theme'],
        entities: [],
        sentiment: { score: 0, label: 'neutral', confidence: 0.5 },
        engagement: { total: 0, breakdown: {} },
        narrativeScore: 0,
        processedAt: new Date(),
        expiresAt: new Date(),
      };

      // Mock the Twitter connector to use our mock emitter
      jest
        .spyOn(facebookConnector, 'streamAndTransform')
        .mockReturnValue(mockEmitter);

      // Set up the stream with just the 'facebook' platform to avoid cross-platform issues
      const stream = service.streamAllAndTransform(['test'], {
        platforms: ['facebook'],
      });

      // Listen for data events
      stream.on('data', (insight) => {
        // Only check the ID to confirm data is being forwarded
        expect(insight.id).toBe(mockInsight.id);
        done();
      });

      // Trigger the data event
      mockEmitter.emit('data', mockInsight);
    });

    it('should forward error events from platform streams', (done) => {
      // Create a mock error
      const mockError = new Error('Stream error');

      // Create a mock emitter that will emit our test error
      const mockEmitter = new EventEmitter();
      jest
        .spyOn(twitterConnector, 'streamAndTransform')
        .mockReturnValue(mockEmitter);

      // Set up the stream
      const stream = service.streamAllAndTransform(['test']);

      // Listen for error events
      stream.on('error', (error) => {
        expect(error).toEqual(mockError);
        done();
      });

      // Trigger the error event
      mockEmitter.emit('error', mockError);
    });
  });
});
