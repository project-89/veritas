import axios from 'axios';
import { GdeltConnector } from '../../src/lib/services/gdelt.connector';

jest.mock('axios');

// Pass-through the rate limiter so tests don't incur the 5.5s pacing delay.
jest.mock('../../src/lib/services/utils/source-rate-limiter', () => ({
  SourceRateLimiter: {
    instance: {
      schedule: (_platform: string, fn: () => unknown) => fn(),
      notifyRateLimited: jest.fn(),
    },
  },
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

function gdeltResponse(articles: unknown[]) {
  return { status: 200, data: JSON.stringify({ articles }) };
}

describe('GdeltConnector', () => {
  let connector: GdeltConnector;
  let transformService: { transformBatch: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    transformService = { transformBatch: jest.fn().mockResolvedValue([{ id: 'insight-1' }]) };
    connector = new GdeltConnector(transformService as never);
  });

  it('transforms GDELT articles into posts (domain as author)', async () => {
    mockedAxios.get.mockResolvedValue(
      gdeltResponse([
        {
          url: 'https://reuters.com/tech/ai-rules',
          title: 'EU adopts sweeping AI regulation',
          domain: 'reuters.com',
          seendate: '20260710T120000Z',
          language: 'English',
          sourcecountry: 'United States',
        },
      ]),
    );

    const posts = await connector.searchContent('artificial intelligence regulation');

    expect(posts).toHaveLength(1);
    expect(posts[0]!.platform).toBe('gdelt');
    expect(posts[0]!.text).toBe('EU adopts sweeping AI regulation');
    expect(posts[0]!.authorHandle).toBe('reuters.com');
    expect(posts[0]!.url).toBe('https://reuters.com/tech/ai-rules');
    // seendate parsed to a real timestamp
    expect(posts[0]!.timestamp.getUTCFullYear()).toBe(2026);
  });

  it('does NOT title-filter — keeps relevant articles whose headline lacks the query terms', async () => {
    mockedAxios.get.mockResolvedValue(
      gdeltResponse([
        {
          url: 'https://x.com/a',
          title: 'Brussels passes new tech rules',
          domain: 'x.com',
          seendate: '20260710T120000Z',
        },
      ]),
    );
    // Title has none of "artificial/intelligence/regulation" — must still be kept
    // (GDELT already matched the query against article content server-side).
    const posts = await connector.searchContent('artificial intelligence regulation');
    expect(posts).toHaveLength(1);
  });

  it('returns [] for an empty/stopword-only query without calling the API', async () => {
    const posts = await connector.searchContent('the a is');
    expect(posts).toEqual([]);
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('degrades to [] on 429 (does not throw)', async () => {
    mockedAxios.get.mockResolvedValue({ status: 429, data: 'Please limit requests' });
    await expect(connector.searchContent('climate change')).resolves.toEqual([]);
  });

  it('degrades to [] on network/timeout error (does not throw)', async () => {
    mockedAxios.get.mockRejectedValue(new Error('timeout of 20000ms exceeded'));
    await expect(connector.searchContent('climate change')).resolves.toEqual([]);
  });

  it('returns [] when GDELT responds with non-JSON text', async () => {
    mockedAxios.get.mockResolvedValue({
      status: 200,
      data: 'Please limit requests to one every 5 seconds',
    });
    await expect(connector.searchContent('climate change')).resolves.toEqual([]);
  });

  it('searchWithRawData returns posts + insights', async () => {
    mockedAxios.get.mockResolvedValue(
      gdeltResponse([
        {
          url: 'https://bbc.com/a',
          title: 'Climate summit opens',
          domain: 'bbc.com',
          seendate: '20260710T120000Z',
        },
      ]),
    );
    const result = await connector.searchWithRawData('climate change');
    expect(result.posts).toHaveLength(1);
    expect(transformService.transformBatch).toHaveBeenCalledWith(result.posts);
    expect(result.insights).toHaveLength(1);
  });
});
