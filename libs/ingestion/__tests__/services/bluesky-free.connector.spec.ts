import { BlueskyFreeConnector } from '../../src/lib/services/bluesky-free.connector';
import { TransformOnIngestService } from '../../src/lib/services/transform/transform-on-ingest.service';
import { SourceRateLimiter } from '../../src/lib/services/utils/source-rate-limiter';

function noop(): void {
  // Intentional no-op for logger spies in negative-path tests.
}

describe('BlueskyFreeConnector', () => {
  let connector: BlueskyFreeConnector;
  let transformService: Partial<TransformOnIngestService>;
  let fetchMock: jest.Mock;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();

    // Use a zero-delay limiter so tests don't wait out the real pacing.
    SourceRateLimiter.setInstance(
      new SourceRateLimiter({ bluesky: { minIntervalMs: 0, maxConcurrent: 100 } }),
    );

    transformService = {
      transformBatch: jest.fn().mockResolvedValue([]),
    };

    connector = new BlueskyFreeConnector(transformService as TransformOnIngestService);

    originalFetch = global.fetch;
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  afterAll(() => {
    SourceRateLimiter.setInstance(null);
  });

  it('returns an empty result for HTTP 400 search queries without retrying', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
    });

    const logger = (
      connector as unknown as {
        logger: { debug: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
      }
    ).logger;
    const debugSpy = jest.spyOn(logger, 'debug').mockImplementation(noop);
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(noop);

    const posts = await connector.searchContent('https://rexas.com/');

    expect(posts).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(debugSpy).toHaveBeenCalledWith(
      'Bluesky rejected query "https://rexas.com/" with HTTP 400',
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('returns an empty array when the API responds fine with no matches', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ posts: [] }),
    });

    const posts = await connector.searchContent('no matches');

    expect(posts).toEqual([]);
  });

  it('throws when the search request fails outright', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    });

    const logger = (
      connector as unknown as {
        logger: { debug: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
      }
    ).logger;
    jest.spyOn(logger, 'debug').mockImplementation(noop);
    jest.spyOn(logger, 'error').mockImplementation(noop);

    await expect(connector.searchContent('project89')).rejects.toThrow(
      'Bluesky search failed: HTTP 503: Service Unavailable',
    );
  });
});
