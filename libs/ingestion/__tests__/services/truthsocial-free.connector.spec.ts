import { ConfigService } from '@nestjs/config';
import { TransformOnIngestService } from '../../src/lib/services/transform/transform-on-ingest.service';
import { TruthSocialFreeConnector } from '../../src/lib/services/truthsocial-free.connector';
import { SubprocessUtil } from '../../src/lib/services/utils/subprocess.util';

function noop(): void {
  // Intentional no-op for logger spies in negative-path tests.
}

describe('TruthSocialFreeConnector', () => {
  let connector: TruthSocialFreeConnector;
  let configService: Partial<ConfigService>;
  let transformService: Partial<TransformOnIngestService>;
  let subprocessUtil: Partial<SubprocessUtil>;

  function markAvailable(): void {
    (connector as unknown as { available: boolean }).available = true;
  }

  beforeEach(() => {
    jest.clearAllMocks();

    configService = {
      get: jest.fn().mockReturnValue(undefined),
    };

    transformService = {
      transformBatch: jest.fn().mockResolvedValue([{ id: 'insight-1', contentHash: 'h1' }]),
    };

    subprocessUtil = {
      exec: jest.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
    };

    connector = new TruthSocialFreeConnector(
      configService as ConfigService,
      transformService as TransformOnIngestService,
      subprocessUtil as SubprocessUtil,
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

  describe('searchWithRawData', () => {
    it('throws when the connector is unavailable instead of returning []', async () => {
      await expect(connector.searchWithRawData('project89')).rejects.toThrow(
        'Truth Social search failed: connector unavailable',
      );
      expect(subprocessUtil.exec).not.toHaveBeenCalled();
    });

    it('throws when truthbrush exits non-zero', async () => {
      markAvailable();
      (subprocessUtil.exec as jest.Mock).mockResolvedValue({
        stdout: '',
        stderr: 'login failed',
        exitCode: 1,
      });

      await expect(connector.searchWithRawData('project89')).rejects.toThrow(
        'Truth Social search failed: truthbrush search exited with code 1: login failed',
      );
    });

    it('returns empty results when the search succeeds but finds nothing', async () => {
      markAvailable();
      (subprocessUtil.exec as jest.Mock).mockResolvedValue({
        stdout: '\n',
        stderr: '',
        exitCode: 0,
      });

      const result = await connector.searchWithRawData('no matches');

      expect(result).toEqual({ posts: [], insights: [] });
      expect(transformService.transformBatch).not.toHaveBeenCalled();
    });
  });

  describe('relevance filtering', () => {
    /** truthbrush emits one JSON object per line. */
    function mockPosts(...texts: string[]): void {
      markAvailable();
      const lines = texts
        .map((content, i) =>
          JSON.stringify({
            id: `p${i}`,
            content: `<p>${content}</p>`,
            created_at: '2026-07-20T12:00:00.000Z',
            account: { id: `a${i}`, username: `user${i}`, display_name: `User ${i}` },
            favourites_count: 0,
            reblogs_count: 0,
            replies_count: 0,
          }),
        )
        .join('\n');
      (subprocessUtil.exec as jest.Mock).mockResolvedValue({
        stdout: lines,
        stderr: '',
        exitCode: 0,
      });
    }

    it('drops posts that do not match a topic query', async () => {
      // Truth Social search returns what IT considers a match; without a local
      // safety net the off-topic ones reach the narrative stage.
      mockPosts(
        'Fascinating thread on whether AI is conscious and what sentience means',
        '1,043 $BTC transferred from unknown wallet to Coinbase',
        'Is AI conscious? Nobody agrees on the answer',
      );

      const { posts } = await connector.searchWithRawData('Is AI conscious?');

      expect(posts).toHaveLength(2);
      expect(posts.every((p) => /conscious/i.test(p.text))).toBe(true);
      expect(posts.some((p) => /BTC/.test(p.text))).toBe(false);
    });

    it('keeps everything for a bare handle lookup', async () => {
      // A user's posts need not contain their own handle as a word.
      mockPosts('Just had coffee', 'Markets are wild today');

      const { posts } = await connector.searchWithRawData('realDonaldTrump');

      expect(posts).toHaveLength(2);
    });

    it('keeps everything when the query has no significant terms', async () => {
      mockPosts('Anything at all', 'Something else');

      const { posts } = await connector.searchWithRawData('who is it');

      expect(posts).toHaveLength(2);
    });

    it('applies the limit to relevant posts, not to discarded ones', async () => {
      // Filtering after slicing would spend the cap on posts about to be
      // dropped, silently starving the result set.
      mockPosts(
        'crypto wallet transfer alert',
        'another crypto wallet alert',
        'AI conscious debate continues',
        'more on whether AI is conscious',
      );

      const { posts } = await connector.searchWithRawData('Is AI conscious?', { limit: 2 });

      expect(posts).toHaveLength(2);
      expect(posts.every((p) => /conscious/i.test(p.text))).toBe(true);
    });
  });
});
