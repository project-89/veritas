import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { getAllFeeds, getFeedsForQuery } from '../../src/lib/config/rss-feed-catalog';
import { RSSConnector } from '../../src/lib/services/rss.connector';
import { TransformOnIngestService } from '../../src/lib/services/transform/transform-on-ingest.service';

jest.mock('axios');
jest.mock('../../src/lib/config/rss-feed-catalog', () => ({
  getAllFeeds: jest.fn().mockReturnValue([]),
  getFeedsForQuery: jest.fn().mockReturnValue([]),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedGetAllFeeds = getAllFeeds as jest.MockedFunction<typeof getAllFeeds>;
const mockedGetFeedsForQuery = getFeedsForQuery as jest.MockedFunction<typeof getFeedsForQuery>;

describe('RSSConnector', () => {
  let connector: RSSConnector;
  let configService: Partial<ConfigService>;
  let transformService: Partial<TransformOnIngestService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockedGetAllFeeds.mockReturnValue([]);
    mockedGetFeedsForQuery.mockReturnValue([]);
    mockedAxios.isAxiosError.mockImplementation((error: unknown): error is any =>
      Boolean((error as any)?.isAxiosError),
    );

    configService = {
      get: jest.fn().mockReturnValue(undefined),
    };

    transformService = {
      transformBatch: jest.fn().mockResolvedValue([]),
    };

    connector = new RSSConnector(
      configService as ConfigService,
      transformService as TransformOnIngestService,
    );

    Object.assign((connector as any).logger, {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    });
  });

  describe('searchContent', () => {
    it('matches items with structured category values without throwing', async () => {
      mockedGetFeedsForQuery.mockReturnValue([
        {
          name: 'Mock Feed',
          url: 'https://example.com/feed.xml',
          category: 'world_news',
          tier: 1,
          language: 'en',
        },
      ]);

      jest.spyOn(connector as any, 'fetchFeedItems').mockResolvedValue({
        items: [
          {
            title: 'Threat analysis',
            link: 'https://example.com/posts/1',
            categories: [{ name: 'Project89' }, { term: 'watchlist' }],
          },
        ],
        failure: null,
      });

      const posts = await connector.searchContent('Project89');

      expect(posts).toHaveLength(1);
      expect(posts[0]).toMatchObject({
        id: 'https://example.com/posts/1',
        text: 'Threat analysis',
      });
    });

    it('falls back to a valid timestamp when feed dates are malformed', async () => {
      mockedGetFeedsForQuery.mockReturnValue([
        {
          name: 'Mock Feed',
          url: 'https://example.com/feed.xml',
          category: 'world_news',
          tier: 1,
          language: 'en',
        },
      ]);

      jest.spyOn(connector as any, 'fetchFeedItems').mockResolvedValue({
        items: [
          {
            title: 'Malformed date item',
            link: 'https://example.com/posts/2',
            pubDate: 'not-a-date',
          },
        ],
        failure: null,
      });

      const posts = await connector.searchContent('malformed');

      expect(posts).toHaveLength(1);
      expect(posts[0]?.timestamp).toBeInstanceOf(Date);
      expect(Number.isFinite(posts[0]!.timestamp.getTime())).toBe(true);
    });

    it('returns an empty array when feeds respond fine but nothing matches the query', async () => {
      mockedGetFeedsForQuery.mockReturnValue([
        {
          name: 'Mock Feed',
          url: 'https://example.com/feed.xml',
          category: 'world_news',
          tier: 1,
          language: 'en',
        },
      ]);

      jest.spyOn(connector as any, 'fetchFeedItems').mockResolvedValue({
        items: [
          {
            title: 'Unrelated headline',
            link: 'https://example.com/posts/3',
          },
        ],
        failure: null,
      });

      const posts = await connector.searchContent('project89');

      expect(posts).toEqual([]);
    });

    it('throws when every feed fails or is suppressed and nothing was collected', async () => {
      mockedGetFeedsForQuery.mockReturnValue([
        {
          name: 'Feed A',
          url: 'https://example.com/a.xml',
          category: 'world_news',
          tier: 1,
          language: 'en',
        },
        {
          name: 'Feed B',
          url: 'https://example.com/b.xml',
          category: 'world_news',
          tier: 1,
          language: 'en',
        },
      ]);

      jest
        .spyOn(connector as any, 'fetchFeedItems')
        .mockResolvedValueOnce({
          items: [],
          failure: 'https://example.com/a.xml failed (HTTP 404)',
        })
        .mockResolvedValueOnce({
          items: [],
          failure: 'https://example.com/b.xml suppressed after repeated failures (HTTP 404)',
        });

      await expect(connector.searchContent('project89')).rejects.toThrow(
        'RSS search failed: all 2 feeds failed or were suppressed: https://example.com/a.xml failed (HTTP 404)',
      );
    });

    it('keeps partial results when only some feeds fail', async () => {
      mockedGetFeedsForQuery.mockReturnValue([
        {
          name: 'Feed A',
          url: 'https://example.com/a.xml',
          category: 'world_news',
          tier: 1,
          language: 'en',
        },
        {
          name: 'Feed B',
          url: 'https://example.com/b.xml',
          category: 'world_news',
          tier: 1,
          language: 'en',
        },
      ]);

      jest
        .spyOn(connector as any, 'fetchFeedItems')
        .mockResolvedValueOnce({
          items: [{ title: 'Project89 update', link: 'https://example.com/posts/4' }],
          failure: null,
        })
        .mockResolvedValueOnce({
          items: [],
          failure: 'https://example.com/b.xml failed (HTTP 500)',
        });

      const posts = await connector.searchContent('project89');

      expect(posts).toHaveLength(1);
      expect(posts[0]).toMatchObject({ text: 'Project89 update' });
    });
  });

  describe('fetchFeedItems', () => {
    it('suppresses repeated fetch attempts after a feed failure', async () => {
      const parseString = jest
        .spyOn((connector as any).parser, 'parseString')
        .mockResolvedValue({ items: [] } as any);

      mockedAxios.get.mockRejectedValue(
        Object.assign(new Error('Not found'), {
          isAxiosError: true,
          response: { status: 404 },
        }),
      );

      await (connector as any).fetchFeedItems('https://example.com/feed.xml');
      await (connector as any).fetchFeedItems('https://example.com/feed.xml');

      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
      expect(parseString).not.toHaveBeenCalled();
    });

    it('sanitizes malformed feed XML before parsing', async () => {
      const parseString = jest.spyOn((connector as any).parser, 'parseString').mockResolvedValue({
        items: [
          {
            title: 'Project89 update',
            link: 'https://example.com/posts/2',
          },
        ],
      } as any);

      mockedAxios.get.mockResolvedValue({
        data: '\uFEFFnoise before xml<rss><channel><item><title>A & B</title></item></channel></rss>',
      } as any);

      await (connector as any).fetchFeedItems('https://example.com/feed.xml');

      expect(parseString).toHaveBeenCalledWith(
        '<rss><channel><item><title>A &amp; B</title></item></channel></rss>',
      );
    });
  });
});
