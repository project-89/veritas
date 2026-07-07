import { ConfigService } from '@nestjs/config';
import { TelegramFreeConnector } from '../../src/lib/services/telegram-free.connector';
import { TransformOnIngestService } from '../../src/lib/services/transform/transform-on-ingest.service';
import { SourceRateLimiter } from '../../src/lib/services/utils/source-rate-limiter';

function noop(): void {
  // Intentional no-op for logger spies in negative-path tests.
}

describe('TelegramFreeConnector', () => {
  let connector: TelegramFreeConnector;
  let configService: Partial<ConfigService>;
  let transformService: Partial<TransformOnIngestService>;
  let fetchMock: jest.Mock;
  let originalFetch: typeof global.fetch;
  let configValues: Record<string, string | undefined>;

  const channelHtml =
    '<meta property="og:title" content="Chan One">' +
    '<div class="tgme_widget_message_wrap">' +
    '<div data-post="chan1/101">' +
    '<div class="tgme_widget_message_text js-message_text">project89 is trending today</div>' +
    '<span class="tgme_widget_message_views">1.2K</span>' +
    '<a><time datetime="2026-07-01T00:00:00+00:00"></time></a>' +
    '</div></div>';

  function createConnector(): TelegramFreeConnector {
    const created = new TelegramFreeConnector(
      configService as ConfigService,
      transformService as TransformOnIngestService,
    );
    const logger = (
      created as unknown as {
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
    return created;
  }

  function getChannels(target: TelegramFreeConnector): string[] {
    return (target as unknown as { channels: string[] }).channels;
  }

  function markAvailable(target: TelegramFreeConnector): void {
    (target as unknown as { available: boolean }).available = true;
  }

  beforeEach(() => {
    jest.clearAllMocks();

    // Use a zero-delay limiter so tests don't wait out the real pacing.
    SourceRateLimiter.setInstance(
      new SourceRateLimiter({ telegram: { minIntervalMs: 0, maxConcurrent: 100 } }),
    );

    configValues = {};
    configService = {
      get: jest.fn((key: string) => configValues[key]),
    };

    transformService = {
      transformBatch: jest.fn().mockResolvedValue([{ id: 'insight-1', contentHash: 'h1' }]),
    };

    originalFetch = global.fetch;
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;

    connector = createConnector();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  afterAll(() => {
    SourceRateLimiter.setInstance(null);
  });

  describe('channel configuration', () => {
    it('parses TELEGRAM_CHANNELS as a comma-separated list, stripping @ prefixes', () => {
      configValues['TELEGRAM_CHANNELS'] = '@chan1, chan2,,  @chan3 ';

      const configured = createConnector();

      expect(getChannels(configured)).toEqual(['chan1', 'chan2', 'chan3']);
    });

    it('falls back to the curated channel list when TELEGRAM_CHANNELS is unset', () => {
      expect(getChannels(connector).length).toBeGreaterThan(0);
      expect(getChannels(connector)).toContain('bbcnews');
    });
  });

  describe('searchWithRawData', () => {
    it('throws when the connector is unavailable instead of returning []', async () => {
      await expect(connector.searchWithRawData('project89')).rejects.toThrow(
        'Telegram search failed: connector unavailable',
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws when every configured channel fails to fetch', async () => {
      configValues['TELEGRAM_CHANNELS'] = 'chan1,chan2';
      connector = createConnector();
      markAvailable(connector);

      fetchMock.mockResolvedValue({ ok: false, status: 404 });

      await expect(connector.searchWithRawData('project89')).rejects.toThrow(
        'Telegram search failed: all 2 channels failed: Failed to fetch channel @chan1: HTTP 404',
      );
    });

    it('keeps results and does not throw when only some channels fail', async () => {
      configValues['TELEGRAM_CHANNELS'] = 'chan1,chan2';
      connector = createConnector();
      markAvailable(connector);

      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes('chan1')) {
          return { ok: true, status: 200, text: async () => channelHtml };
        }
        return { ok: false, status: 500 };
      });

      const { posts } = await connector.searchWithRawData('project89');

      expect(posts).toHaveLength(1);
      expect(posts[0]).toMatchObject({
        id: 'chan1_101',
        platform: 'telegram',
        authorHandle: 'chan1',
      });
    });

    it('returns empty results when channels respond fine but nothing matches the query', async () => {
      configValues['TELEGRAM_CHANNELS'] = 'chan1';
      connector = createConnector();
      markAvailable(connector);

      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => channelHtml });

      const result = await connector.searchWithRawData('completely-unrelated-topic');

      expect(result).toEqual({ posts: [], insights: [] });
    });

    it('logs that search is channel monitoring, not platform-wide search', async () => {
      configValues['TELEGRAM_CHANNELS'] = 'chan1';
      connector = createConnector();
      markAvailable(connector);

      const logger = (
        connector as unknown as { logger: { debug: (...args: unknown[]) => void } }
      ).logger;
      const debugSpy = jest.spyOn(logger, 'debug').mockImplementation(noop);

      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => channelHtml });

      await connector.searchWithRawData('project89');

      expect(debugSpy).toHaveBeenCalledWith(
        'Telegram: filtering 1 configured channels for "project89" — this is channel monitoring, not platform-wide search',
      );
    });
  });
});
