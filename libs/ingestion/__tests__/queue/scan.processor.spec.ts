import { ScanProcessor } from '../../src/lib/queue/scan.processor';
import { ScanJobRepository } from '../../src/lib/repositories/scan-job.repository';
import { IngestionService } from '../../src/lib/services/ingestion.service';

describe('ScanProcessor', () => {
  let processor: ScanProcessor;
  let scanJobRepo: jest.Mocked<ScanJobRepository>;
  let ingestionService: jest.Mocked<IngestionService>;

  const mockConnector = {
    platform: 'reddit',
    searchWithRawData: jest.fn().mockResolvedValue({
      posts: [
        {
          id: 'p1',
          text: 'test post',
          platform: 'reddit',
          authorName: 'user1',
          authorHandle: 'user1',
          timestamp: new Date(),
          url: 'https://reddit.com/r/test/1',
          engagementMetrics: { likes: 10, shares: 2, comments: 3, reach: 100, viralityScore: 0.5 },
        },
      ],
      insights: [
        {
          id: 'i1',
          sentiment: { score: 0.5, label: 'positive', confidence: 0.8 },
          themes: ['test'],
        },
      ],
    }),
  };

  beforeEach(() => {
    // Reset call history AND default success behavior before each test
    mockConnector.searchWithRawData.mockClear();
    mockConnector.searchWithRawData.mockResolvedValue({
      posts: [
        {
          id: 'p1',
          text: 'test post',
          platform: 'reddit',
          authorName: 'user1',
          authorHandle: 'user1',
          timestamp: new Date(),
          url: 'https://reddit.com/r/test/1',
          engagementMetrics: { likes: 10, shares: 2, comments: 3, reach: 100, viralityScore: 0.5 },
        },
      ],
      insights: [
        {
          id: 'i1',
          sentiment: { score: 0.5, label: 'positive', confidence: 0.8 },
          themes: ['test'],
        },
      ],
    });

    scanJobRepo = {
      getExistingPostKeys: jest.fn().mockResolvedValue([]),
      updateConnectorStatus: jest.fn().mockResolvedValue(undefined),
      addConnectorResults: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ScanJobRepository>;

    ingestionService = {
      getConnector: jest.fn().mockReturnValue(mockConnector),
    } as unknown as jest.Mocked<IngestionService>;

    processor = new ScanProcessor(ingestionService, scanJobRepo);
  });

  it('should process a connector job successfully', async () => {
    const job = {
      data: {
        scanId: 'scan-1',
        connector: 'reddit',
        query: 'test',
        options: {},
      },
    } as any;

    const result = await processor.process(job);

    expect(ingestionService.getConnector).toHaveBeenCalledWith('reddit');
    expect(scanJobRepo.updateConnectorStatus).toHaveBeenCalledTimes(2); // running + done
    expect(scanJobRepo.addConnectorResults).toHaveBeenCalledTimes(1);
    expect(result).toHaveProperty('postCount', 1);
  });

  it('serves a fresh cache entry without hitting the connector', async () => {
    const cachedPosts = [{ id: 'cached-1', text: 'cached post', platform: 'reddit' }];
    const fetchCache = {
      getFresh: jest.fn().mockResolvedValue(cachedPosts),
      save: jest.fn().mockResolvedValue(undefined),
    };
    processor = new ScanProcessor(
      ingestionService,
      scanJobRepo,
      fetchCache as unknown as ConstructorParameters<typeof ScanProcessor>[2],
    );

    const job = {
      data: { scanId: 'scan-1', connector: 'reddit', query: 'test', options: {} },
    } as any;

    const result = await processor.process(job);

    expect(fetchCache.getFresh).toHaveBeenCalledTimes(1);
    expect(result).toHaveProperty('postCount', 1);
    expect(mockConnector.searchWithRawData).not.toHaveBeenCalled();
    expect(scanJobRepo.addConnectorResults).toHaveBeenCalledWith('scan-1', 'reddit', cachedPosts);
    expect(fetchCache.save).not.toHaveBeenCalled();
  });

  it('populates the cache after a fresh fetch', async () => {
    const fetchCache = {
      getFresh: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(undefined),
    };
    processor = new ScanProcessor(
      ingestionService,
      scanJobRepo,
      fetchCache as unknown as ConstructorParameters<typeof ScanProcessor>[2],
    );

    const job = {
      data: { scanId: 'scan-1', connector: 'reddit', query: 'test', options: {} },
    } as any;

    await processor.process(job);

    expect(mockConnector.searchWithRawData).toHaveBeenCalled();
    expect(fetchCache.save).toHaveBeenCalledWith(
      'reddit',
      expect.any(String),
      expect.arrayContaining([expect.objectContaining({ id: 'p1' })]),
    );
  });

  it('should handle connector not found', async () => {
    ingestionService.getConnector.mockReturnValue(undefined);

    const job = {
      data: { scanId: 'scan-1', connector: 'unknown', query: 'test', options: {} },
    } as any;

    await expect(processor.process(job)).rejects.toThrow('not found');
    expect(scanJobRepo.updateConnectorStatus).toHaveBeenCalledWith(
      'scan-1',
      'unknown',
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('should handle connector search failure', async () => {
    mockConnector.searchWithRawData.mockRejectedValue(new Error('Network error'));

    const job = {
      data: { scanId: 'scan-1', connector: 'reddit', query: 'test', options: {} },
    } as any;

    await expect(processor.process(job)).rejects.toThrow('Network error');
    expect(scanJobRepo.updateConnectorStatus).toHaveBeenCalledWith(
      'scan-1',
      'reddit',
      expect.objectContaining({ status: 'failed', error: 'Network error' }),
    );
  });

  it('should fall back to searchAndTransform when searchWithRawData not available', async () => {
    const fallbackConnector = {
      platform: 'youtube',
      searchAndTransform: jest
        .fn()
        .mockResolvedValue([
          { id: 'i1', sentiment: { score: 0, label: 'neutral', confidence: 0.5 } },
        ]),
    };
    ingestionService.getConnector.mockReturnValue(fallbackConnector as any);

    const job = {
      data: { scanId: 'scan-1', connector: 'youtube', query: 'test', options: {} },
    } as any;

    const result = await processor.process(job);

    expect(fallbackConnector.searchAndTransform).toHaveBeenCalled();
    expect(scanJobRepo.addConnectorResults).toHaveBeenCalled();
    expect(result).toHaveProperty('postCount', 0); // searchAndTransform returns insights, not posts
  });

  it('should serialize posts correctly', async () => {
    const job = {
      data: { scanId: 'scan-1', connector: 'reddit', query: 'test', options: {} },
    } as any;

    await processor.process(job);

    const addedPosts = (scanJobRepo.addConnectorResults as jest.Mock).mock.calls[0][2];
    expect(addedPosts).toHaveLength(1);
    expect(addedPosts[0]).toHaveProperty('id', 'p1');
    expect(addedPosts[0]).toHaveProperty('platform', 'reddit');
    expect(addedPosts[0]).toHaveProperty('text', 'test post');
    expect(addedPosts[0]).toHaveProperty('engagement');
  });

  it('should preserve distinct posts that share text prefixes but have different urls', async () => {
    mockConnector.searchWithRawData.mockResolvedValue({
      posts: [
        {
          id: 'v1',
          text: 'Rexas Finance scam investigation transcript opening repeated across videos but video one has unique details',
          platform: 'youtube',
          authorName: 'channel-a',
          authorHandle: 'channel-a',
          timestamp: new Date('2026-01-01T00:00:00Z'),
          url: 'https://youtube.com/watch?v=video-one',
          engagementMetrics: { likes: 10, shares: 2, comments: 3, reach: 100, viralityScore: 0.5 },
        },
        {
          id: 'v2',
          text: 'Rexas Finance scam investigation transcript opening repeated across videos but video two has other evidence',
          platform: 'youtube',
          authorName: 'channel-b',
          authorHandle: 'channel-b',
          timestamp: new Date('2026-01-02T00:00:00Z'),
          url: 'https://youtube.com/watch?v=video-two',
          engagementMetrics: { likes: 7, shares: 1, comments: 1, reach: 80, viralityScore: 0.3 },
        },
      ],
      insights: [
        {
          id: 'i1',
          sentiment: { score: -0.6, label: 'negative', confidence: 0.8 },
          themes: ['scam'],
        },
        {
          id: 'i2',
          sentiment: { score: -0.5, label: 'negative', confidence: 0.8 },
          themes: ['investigation'],
        },
      ],
    });

    const job = {
      data: { scanId: 'scan-1', connector: 'youtube', query: 'rexas', options: {} },
    } as any;

    const result = await processor.process(job);

    const addedPosts = (scanJobRepo.addConnectorResults as jest.Mock).mock.calls[0][2];
    expect(result.postCount).toBe(2);
    expect(addedPosts).toHaveLength(2);
  });

  it('should not suppress posts just because earlier scans for the same query already saw them', async () => {
    scanJobRepo.getExistingPostKeys.mockResolvedValue(['url:https://reddit.com/r/test/1']);

    const job = {
      data: {
        scanId: 'scan-1',
        connector: 'reddit',
        query: 'project89',
        options: { timeRange: '30d' },
      },
    } as any;

    const result = await processor.process(job);

    const addedPosts = (scanJobRepo.addConnectorResults as jest.Mock).mock.calls[0][2];
    expect(result.postCount).toBe(1);
    expect(addedPosts).toHaveLength(1);
    expect(addedPosts[0]).toHaveProperty('id', 'p1');
  });

  describe('progress events', () => {
    let scanEvents: { emit: jest.Mock };

    beforeEach(() => {
      scanEvents = { emit: jest.fn() };
      processor = new ScanProcessor(
        ingestionService,
        scanJobRepo,
        undefined,
        scanEvents as unknown as ConstructorParameters<typeof ScanProcessor>[3],
      );
    });

    it('emits running and done events on a successful run', async () => {
      const job = {
        data: { scanId: 'scan-1', connector: 'reddit', query: 'test', options: {} },
      } as any;

      await processor.process(job);

      expect(scanEvents.emit).toHaveBeenCalledTimes(2);
      expect(scanEvents.emit).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          kind: 'scan-status',
          scanId: 'scan-1',
          connector: 'reddit',
          status: 'running',
        }),
      );
      expect(scanEvents.emit).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          kind: 'scan-status',
          scanId: 'scan-1',
          connector: 'reddit',
          status: 'done',
          postCount: 1,
        }),
      );
    });

    it('emits a failed event when the connector throws', async () => {
      mockConnector.searchWithRawData.mockRejectedValue(new Error('Network error'));

      const job = {
        data: { scanId: 'scan-1', connector: 'reddit', query: 'test', options: {} },
      } as any;

      await expect(processor.process(job)).rejects.toThrow('Network error');

      expect(scanEvents.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'scan-status',
          scanId: 'scan-1',
          connector: 'reddit',
          status: 'failed',
          error: 'Network error',
        }),
      );
    });

    it('emits a done event on a cache hit', async () => {
      const cachedPosts = [{ id: 'cached-1', text: 'cached post', platform: 'reddit' }];
      const fetchCache = {
        getFresh: jest.fn().mockResolvedValue(cachedPosts),
        save: jest.fn().mockResolvedValue(undefined),
      };
      processor = new ScanProcessor(
        ingestionService,
        scanJobRepo,
        fetchCache as unknown as ConstructorParameters<typeof ScanProcessor>[2],
        scanEvents as unknown as ConstructorParameters<typeof ScanProcessor>[3],
      );

      const job = {
        data: { scanId: 'scan-1', connector: 'reddit', query: 'test', options: {} },
      } as any;

      await processor.process(job);

      expect(scanEvents.emit).toHaveBeenLastCalledWith(
        expect.objectContaining({
          kind: 'scan-status',
          scanId: 'scan-1',
          connector: 'reddit',
          status: 'done',
          postCount: 1,
        }),
      );
    });
  });
});
