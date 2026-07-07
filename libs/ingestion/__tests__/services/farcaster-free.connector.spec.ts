import { ConfigService } from '@nestjs/config';
import { FarcasterFreeConnector } from '../../src/lib/services/farcaster-free.connector';
import { TransformOnIngestService } from '../../src/lib/services/transform/transform-on-ingest.service';
import { SourceRateLimiter } from '../../src/lib/services/utils/source-rate-limiter';

function noop(): void {
  // Intentional no-op for logger spies in negative-path tests.
}

describe('FarcasterFreeConnector', () => {
  let connector: FarcasterFreeConnector;
  let configService: Partial<ConfigService>;
  let transformService: Partial<TransformOnIngestService>;
  let fetchMock: jest.Mock;
  let originalFetch: typeof global.fetch;

  const mockCast = {
    hash: '0xabc123def456',
    author: {
      fid: 42,
      username: 'caster',
      display_name: 'Caster',
      pfp_url: '',
      follower_count: 100,
      following_count: 50,
    },
    text: 'project89 cast',
    timestamp: '2026-07-01T00:00:00Z',
    reactions: { likes_count: 3, recasts_count: 1 },
    replies: { count: 2 },
  };

  function makeAvailable(): void {
    (connector as unknown as { neynarApiKey: string | null }).neynarApiKey = 'test-key';
    (connector as unknown as { available: boolean }).available = true;
  }

  beforeEach(() => {
    jest.clearAllMocks();

    // Use a zero-delay limiter so tests don't wait out the real pacing.
    SourceRateLimiter.setInstance(
      new SourceRateLimiter({ farcaster: { minIntervalMs: 0, maxConcurrent: 100 } }),
    );

    configService = {
      get: jest.fn().mockReturnValue(undefined),
    };

    transformService = {
      transformBatch: jest.fn().mockResolvedValue([{ id: 'insight-1', contentHash: 'h1' }]),
    };

    originalFetch = global.fetch;
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;

    connector = new FarcasterFreeConnector(
      configService as ConfigService,
      transformService as TransformOnIngestService,
    );

    const logger = (
      connector as unknown as {
        logger: {
          debug: (...args: unknown[]) => void;
          warn: (...args: unknown[]) => void;
          error: (...args: unknown[]) => void;
        };
      }
    ).logger;
    jest.spyOn(logger, 'debug').mockImplementation(noop);
    jest.spyOn(logger, 'warn').mockImplementation(noop);
    jest.spyOn(logger, 'error').mockImplementation(noop);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  afterAll(() => {
    SourceRateLimiter.setInstance(null);
  });

  describe('searchWithRawData', () => {
    it('throws when NEYNAR_API_KEY is not set instead of returning []', async () => {
      await expect(connector.searchWithRawData('project89')).rejects.toThrow(
        'Farcaster search failed: NEYNAR_API_KEY is not set',
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws when the Neynar API request fails', async () => {
      makeAvailable();
      fetchMock.mockResolvedValue({ ok: false, status: 403 });

      await expect(connector.searchWithRawData('project89')).rejects.toThrow(
        'Farcaster search failed: Neynar search returned HTTP 403',
      );
    });

    it('returns empty results when the API responds fine with no matches', async () => {
      makeAvailable();
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ result: { casts: [] } }),
      });

      const result = await connector.searchWithRawData('no matches');

      expect(result).toEqual({ posts: [], insights: [] });
      expect(transformService.transformBatch).not.toHaveBeenCalled();
    });

    it('returns posts and insights when casts are found', async () => {
      makeAvailable();
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ result: { casts: [mockCast] } }),
      });

      const { posts, insights } = await connector.searchWithRawData('project89');

      expect(posts).toHaveLength(1);
      expect(posts[0]).toMatchObject({
        id: '0xabc123def456',
        platform: 'farcaster',
        authorHandle: 'caster',
        text: 'project89 cast',
      });
      expect(insights).toHaveLength(1);
    });
  });
});
