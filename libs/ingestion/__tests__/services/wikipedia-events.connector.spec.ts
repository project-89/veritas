import { WikipediaEventsConnector } from '../../src/lib/services/wikipedia-events.connector';
import { SourceRateLimiter } from '../../src/lib/services/utils/source-rate-limiter';

function noop(): void {
  // Intentional no-op for logger spies in negative-path tests.
}

describe('WikipediaEventsConnector', () => {
  let connector: WikipediaEventsConnector;
  let fetchMock: jest.Mock;
  let originalFetch: typeof global.fetch;

  const eventsHtml =
    '<ul>' +
    '<li><a href="/wiki/Project89">Project89 investigation</a> reveals coordinated narrative activity across platforms.</li>' +
    '<li>Officials announce an unrelated infrastructure programme in a distant region.</li>' +
    '</ul>';

  beforeEach(() => {
    jest.clearAllMocks();

    // Use a zero-delay limiter so tests don't wait out the real pacing.
    SourceRateLimiter.setInstance(
      new SourceRateLimiter({ wikipedia: { minIntervalMs: 0, maxConcurrent: 100 } }),
    );

    originalFetch = global.fetch;
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;

    connector = new WikipediaEventsConnector();

    const logger = (
      connector as unknown as {
        logger: {
          warn: (...args: unknown[]) => void;
          error: (...args: unknown[]) => void;
        };
      }
    ).logger;
    jest.spyOn(logger, 'warn').mockImplementation(noop);
    jest.spyOn(logger, 'error').mockImplementation(noop);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  afterAll(() => {
    SourceRateLimiter.setInstance(null);
  });

  describe('searchAndTransform', () => {
    it('throws when the Wikipedia API request fails', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 500 });

      await expect(connector.searchAndTransform('project89')).rejects.toThrow(
        'Wikipedia search failed: Wikipedia API returned HTTP 500',
      );
    });

    it('throws when the API responds without page content', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await expect(connector.searchAndTransform('project89')).rejects.toThrow(
        'Wikipedia search failed: Wikipedia API returned no Current Events page content',
      );
    });

    it('returns an empty array when the page loads but nothing matches the query', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ parse: { text: { '*': eventsHtml } } }),
      });

      const insights = await connector.searchAndTransform('zzz-no-match-term');

      expect(insights).toEqual([]);
    });

    it('returns insights for events matching the query', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ parse: { text: { '*': eventsHtml } } }),
      });

      const insights = await connector.searchAndTransform('project89');

      expect(insights).toHaveLength(1);
      expect(insights[0]).toMatchObject({ platform: 'wikipedia' });
    });

    it('excludes events that only share a substring with the query', async () => {
      // "AI" is a substring of "maintain"/"chain" but not a whole word — the
      // old includes()-based matcher would have wrongly matched this event.
      const substringHtml =
        '<ul>' +
        '<li>Officials pledge to maintain the supply chain across the region despite disruptions.</li>' +
        '</ul>';
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ parse: { text: { '*': substringHtml } } }),
      });

      const insights = await connector.searchAndTransform('AI');

      expect(insights).toEqual([]);
    });
  });

  describe('searchWithRawData', () => {
    it('returns posts alongside insights so the scan can store them', async () => {
      // Regression: without this, ScanProcessor hardcodes posts: [] and every
      // Wikipedia event was silently discarded from the scan.
      const fetchSpy = jest
        .spyOn(connector as unknown as { fetchAndParse: () => Promise<unknown> }, 'fetchAndParse')
        .mockResolvedValue([
          { text: 'Romania shuts down a reactor', url: 'https://x/1', category: 'Disasters' },
          { text: 'Second event happened', url: 'https://x/2', category: 'Politics' },
        ] as never);

      const result = await connector.searchWithRawData('reactor');

      expect(result.posts).toHaveLength(2);
      expect(result.insights).toHaveLength(2);
      expect(result.posts[0]!.text).toBe('Romania shuts down a reactor');
      expect(result.posts[0]!.platform).toBe('wikipedia');
      // ONE fetch — pairing two separate fetches could mismatch if the portal
      // page changed between them.
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('keeps posts and insights index-aligned', async () => {
      jest
        .spyOn(connector as unknown as { fetchAndParse: () => Promise<unknown> }, 'fetchAndParse')
        .mockResolvedValue([
          { text: 'alpha', url: 'https://x/a', category: 'A' },
          { text: 'beta', url: 'https://x/b', category: 'B' },
        ] as never);

      const { posts, insights } = await connector.searchWithRawData('anything');

      expect(insights[0]!.themes).toEqual(['A']);
      expect(insights[1]!.themes).toEqual(['B']);
      expect(posts[1]!.text).toBe('beta');
    });

    it('returns empty pairs when nothing matched', async () => {
      jest
        .spyOn(connector as unknown as { fetchAndParse: () => Promise<unknown> }, 'fetchAndParse')
        .mockResolvedValue([] as never);

      await expect(connector.searchWithRawData('nothing')).resolves.toEqual({
        posts: [],
        insights: [],
      });
    });
  });
});
