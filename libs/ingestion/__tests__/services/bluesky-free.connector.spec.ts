import { BlueskyFreeConnector } from '../../src/lib/services/bluesky-free.connector';
import { TransformOnIngestService } from '../../src/lib/services/transform/transform-on-ingest.service';

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
});
