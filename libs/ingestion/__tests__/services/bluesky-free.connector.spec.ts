import { BlueskyFreeConnector } from '../../src/lib/services/bluesky-free.connector';
import { TransformOnIngestService } from '../../src/lib/services/transform/transform-on-ingest.service';

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

    connector = new BlueskyFreeConnector(
      transformService as TransformOnIngestService,
    );

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

    const debugSpy = jest.spyOn((connector as any).logger, 'debug').mockImplementation(() => {});
    const errorSpy = jest.spyOn((connector as any).logger, 'error').mockImplementation(() => {});

    const posts = await connector.searchContent('https://rexas.com/');

    expect(posts).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(debugSpy).toHaveBeenCalledWith('Bluesky rejected query "https://rexas.com/" with HTTP 400');
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
