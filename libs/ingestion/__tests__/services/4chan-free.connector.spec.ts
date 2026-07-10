import { FourChanFreeConnector } from '../../src/lib/services/4chan-free.connector';
import { TransformOnIngestService } from '../../src/lib/services/transform/transform-on-ingest.service';
import { SourceRateLimiter } from '../../src/lib/services/utils/source-rate-limiter';

function noop(): void {
  // Intentional no-op for logger spies in negative-path tests.
}

describe('FourChanFreeConnector', () => {
  let connector: FourChanFreeConnector;
  let transformService: Partial<TransformOnIngestService>;
  let fetchMock: jest.Mock;
  let originalFetch: typeof global.fetch;

  const matchingCatalog = [
    {
      page: 1,
      threads: [
        {
          no: 123,
          sub: 'Project89 discussion',
          com: 'What is going on with <b>project89</b>?',
          time: 1_700_000_000,
          replies: 5,
          images: 1,
        },
      ],
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Use a zero-delay limiter so tests don't wait out the real pacing.
    SourceRateLimiter.setInstance(
      new SourceRateLimiter({ '4chan': { minIntervalMs: 0, maxConcurrent: 100 } }),
    );

    transformService = {
      transformBatch: jest.fn().mockResolvedValue([{ id: 'insight-1', contentHash: 'h1' }]),
    };

    originalFetch = global.fetch;
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;

    connector = new FourChanFreeConnector(transformService as TransformOnIngestService);

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

  describe('searchContent', () => {
    it('throws when every board catalog fetch fails', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(connector.searchContent('project89')).rejects.toThrow(
        '4chan search failed: all 4 board catalogs failed: HTTP 500: Internal Server Error',
      );
    });

    it('keeps results and does not throw when only some boards fail', async () => {
      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes('/pol/')) {
          return { ok: true, status: 200, json: async () => matchingCatalog };
        }
        return { ok: false, status: 500, statusText: 'Internal Server Error' };
      });

      const posts = await connector.searchContent('project89');

      expect(posts).toHaveLength(1);
      expect(posts[0]).toMatchObject({
        id: 'pol-123',
        platform: '4chan',
        authorHandle: 'Anonymous',
      });
    });

    it('returns an empty array when boards respond fine but nothing matches', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          {
            page: 1,
            threads: [
              {
                no: 456,
                sub: 'Unrelated thread',
                com: 'Nothing to see here',
                time: 1_700_000_000,
              },
            ],
          },
        ],
      });

      const posts = await connector.searchContent('project89');

      expect(posts).toEqual([]);
    });

    it('returns an empty array for an empty query without fetching', async () => {
      const posts = await connector.searchContent('   ');

      expect(posts).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('excludes off-topic threads that only share a substring with the query', async () => {
      // "AI" is a substring of "chain"/"blockchain" but not a whole word — the
      // old includes()-based matcher would have wrongly matched these threads.
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          {
            page: 1,
            threads: [
              {
                no: 789,
                sub: 'Blockchain gains',
                com: 'The whole chain is available and maintained by the campaign',
                time: 1_700_000_000,
              },
            ],
          },
        ],
      });

      const posts = await connector.searchContent('AI');

      expect(posts).toEqual([]);
    });
  });
});
