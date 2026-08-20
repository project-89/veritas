import type { TransformOnIngestService } from '../../src/lib/services/transform/transform-on-ingest.service';
import { WikipediaEventsConnector } from '../../src/lib/services/wikipedia-events.connector';
import { SourceRateLimiter } from '@veritas/shared/utils';

function noop(): void {
  // Intentional no-op for logger spies in negative-path tests.
}

describe('WikipediaEventsConnector', () => {
  let connector: WikipediaEventsConnector;
  let transformService: { transformBatch: jest.Mock };
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

    transformService = {
      transformBatch: jest
        .fn()
        .mockImplementation(async (posts: unknown[]) =>
          posts.map((_, i) => ({ id: `insight-${i}`, contentHash: `h${i}` })),
        ),
    };

    connector = new WikipediaEventsConnector(
      transformService as unknown as TransformOnIngestService,
    );

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
      // Insights now come from TransformOnIngestService like every other
      // connector, rather than being hand-built here with neutral sentiment
      // and no entities.
      expect(transformService.transformBatch).toHaveBeenCalledTimes(1);
      const sent = transformService.transformBatch.mock.calls[0]![0] as Array<{
        platform: string;
      }>;
      expect(sent[0]!.platform).toBe('wikipedia');
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

      // Themes are the classifier's job now, so the assertion is alignment:
      // one insight per post, in order.
      expect(insights).toHaveLength(posts.length);
      expect(posts[0]!.text).toBe('alpha');
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
