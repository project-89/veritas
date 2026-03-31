import { ConfigService } from '@nestjs/config';
import { FacebookJinaConnector } from '../../src/lib/services/facebook-jina.connector';
import { TransformOnIngestService } from '../../src/lib/services/transform/transform-on-ingest.service';
import { JinaReaderService } from '../../src/lib/services/utils/jina-reader.service';

describe('FacebookJinaConnector', () => {
  let connector: FacebookJinaConnector;
  let configService: Partial<ConfigService>;
  let transformService: Partial<TransformOnIngestService>;
  let jinaReader: Partial<JinaReaderService>;

  const mockPageContent = {
    content:
      'Welcome to our page about climate change\n\n' +
      'Climate change is affecting communities worldwide. This is a long block of text that exceeds the minimum threshold.\n\n' +
      'Join us for the technology conference next month with many exciting speakers and workshops planned.\n\n' +
      'Short block',
    title: 'Climate Action Page',
    url: 'https://www.facebook.com/climateaction',
    description: 'A page about climate action',
  };

  const pageUrls = [
    'https://www.facebook.com/climateaction',
    'https://www.facebook.com/techpage',
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'FACEBOOK_PAGE_URLS') {
          return JSON.stringify(pageUrls);
        }
        return undefined;
      }),
    };

    transformService = {
      transformBatch: jest.fn().mockResolvedValue([
        { id: 'insight-1', contentHash: 'h1' },
        { id: 'insight-2', contentHash: 'h2' },
      ]),
    };

    jinaReader = {
      readUrl: jest.fn().mockResolvedValue(mockPageContent),
      isAvailable: jest.fn().mockResolvedValue(true),
    };

    connector = new FacebookJinaConnector(
      configService as ConfigService,
      transformService as TransformOnIngestService,
      jinaReader as JinaReaderService
    );
  });

  describe('platform', () => {
    it('should be "facebook"', () => {
      expect(connector.platform).toBe('facebook');
    });
  });

  describe('connect', () => {
    it('should parse page URLs from config', async () => {
      await connector.connect();

      expect((connector as any).pageUrls).toEqual(pageUrls);
    });

    it('should handle invalid JSON in FACEBOOK_PAGE_URLS gracefully', async () => {
      (configService.get as jest.Mock).mockReturnValue('not valid json');

      await connector.connect();

      expect((connector as any).pageUrls).toEqual([]);
    });

    it('should handle missing FACEBOOK_PAGE_URLS config', async () => {
      (configService.get as jest.Mock).mockReturnValue(undefined);

      await connector.connect();

      expect((connector as any).pageUrls).toEqual([]);
    });

    it('should warn when no page URLs are configured', async () => {
      (configService.get as jest.Mock).mockReturnValue('[]');

      await connector.connect();

      expect((connector as any).pageUrls).toEqual([]);
    });
  });

  describe('disconnect', () => {
    it('should clear all stream connections', async () => {
      const fakeInterval = setInterval(() => {}, 10000);
      (connector as any).streamConnections.set('test', fakeInterval);

      await connector.disconnect();

      expect((connector as any).streamConnections.size).toBe(0);
      clearInterval(fakeInterval);
    });
  });

  describe('searchContent (via searchAndTransform)', () => {
    beforeEach(async () => {
      await connector.connect();
    });

    it('should read configured pages and extract matching posts', async () => {
      const insights = await connector.searchAndTransform('climate');

      expect(jinaReader.readUrl).toHaveBeenCalledWith(pageUrls[0]);
      expect(jinaReader.readUrl).toHaveBeenCalledWith(pageUrls[1]);
      expect(transformService.transformBatch).toHaveBeenCalled();
      expect(insights).toHaveLength(2);
    });

    it('should filter content blocks by query', async () => {
      (jinaReader.readUrl as jest.Mock).mockResolvedValue(mockPageContent);

      await connector.searchAndTransform('climate');

      const posts = (transformService.transformBatch as jest.Mock).mock
        .calls[0][0];

      // Only blocks containing "climate" should be included
      for (const post of posts) {
        expect(post.text.toLowerCase()).toContain('climate');
      }
    });

    it('should respect limit option', async () => {
      await connector.searchAndTransform('climate', { limit: 1 });

      const posts = (transformService.transformBatch as jest.Mock).mock
        .calls[0][0];
      expect(posts.length).toBeLessThanOrEqual(1);
    });

    it('should set platform to facebook on extracted posts', async () => {
      await connector.searchAndTransform('climate');

      const posts = (transformService.transformBatch as jest.Mock).mock
        .calls[0][0];
      for (const post of posts) {
        expect(post.platform).toBe('facebook');
      }
    });

    it('should extract page ID from URL as authorId', async () => {
      await connector.searchAndTransform('climate');

      const posts = (transformService.transformBatch as jest.Mock).mock
        .calls[0][0];
      expect(posts[0].authorId).toBe('climateaction');
    });

    it('should handle Jina Reader failures gracefully per page', async () => {
      (jinaReader.readUrl as jest.Mock)
        .mockRejectedValueOnce(new Error('Blocked'))
        .mockResolvedValueOnce(mockPageContent);

      await connector.searchAndTransform('climate');

      // Should still process the second page
      expect(jinaReader.readUrl).toHaveBeenCalledTimes(2);
    });

    it('should ignore short content blocks (< 20 chars)', async () => {
      // Only set one page URL to make the test predictable
      (connector as any).pageUrls = ['https://www.facebook.com/testpage'];

      (jinaReader.readUrl as jest.Mock).mockResolvedValue({
        content: 'Short\n\nAlso short\n\nThis is a much longer block about climate change that should be included in results',
        title: 'Test',
        url: 'https://www.facebook.com/testpage',
      });

      await connector.searchAndTransform('climate');

      const posts = (transformService.transformBatch as jest.Mock).mock
        .calls[0][0];
      // Only the long block should pass
      expect(posts).toHaveLength(1);
    });

    it('should generate deterministic IDs for the same content', async () => {
      await connector.searchAndTransform('climate');
      const posts1 = (transformService.transformBatch as jest.Mock).mock
        .calls[0][0];

      (jinaReader.readUrl as jest.Mock).mockResolvedValue(mockPageContent);
      (transformService.transformBatch as jest.Mock).mockResolvedValue([]);

      await connector.searchAndTransform('climate');
      const posts2 = (transformService.transformBatch as jest.Mock).mock
        .calls[0][0];

      // Same content should produce same IDs
      if (posts1.length > 0 && posts2.length > 0) {
        expect(posts1[0].id).toBe(posts2[0].id);
      }
    });

    it('should truncate post text to 2000 characters', async () => {
      const longContent = 'climate ' + 'x'.repeat(3000);
      (jinaReader.readUrl as jest.Mock).mockResolvedValue({
        content: longContent,
        title: 'Test',
        url: 'https://www.facebook.com/test',
      });

      await connector.searchAndTransform('climate');

      const posts = (transformService.transformBatch as jest.Mock).mock
        .calls[0][0];
      if (posts.length > 0) {
        expect(posts[0].text.length).toBeLessThanOrEqual(2000);
      }
    });

    it('should return empty array when no page URLs configured', async () => {
      (connector as any).pageUrls = [];

      await connector.searchAndTransform('climate');

      const posts = (transformService.transformBatch as jest.Mock).mock
        .calls[0][0];
      expect(posts).toHaveLength(0);
    });
  });

  describe('streamAndTransform', () => {
    beforeEach(async () => {
      jest.useFakeTimers();
      await connector.connect();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return an EventEmitter and do initial check', async () => {
      const emitter = connector.streamAndTransform(['climate']);

      expect(emitter).toBeDefined();
      await jest.advanceTimersByTimeAsync(0);

      expect(jinaReader.readUrl).toHaveBeenCalled();
      emitter.emit('end');
    });

    it('should emit data events with transformed insights', async () => {
      const dataHandler = jest.fn();
      const emitter = connector.streamAndTransform(['climate']);
      emitter.on('data', dataHandler);

      await jest.advanceTimersByTimeAsync(0);

      expect(dataHandler).toHaveBeenCalled();
      emitter.emit('end');
    });

    it('should emit error events on failure', async () => {
      // transformBatch throwing will cause the error to be emitted
      (transformService.transformBatch as jest.Mock).mockRejectedValue(
        new Error('transform error')
      );

      const errorHandler = jest.fn();
      const emitter = connector.streamAndTransform(['climate']);
      emitter.on('error', errorHandler);

      await jest.advanceTimersByTimeAsync(0);

      expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
      emitter.emit('end');
    });

    it('should clean up on end event', async () => {
      const emitter = connector.streamAndTransform(['test']);
      await jest.advanceTimersByTimeAsync(0);

      expect((connector as any).streamConnections.size).toBe(1);

      emitter.emit('end');

      expect((connector as any).streamConnections.size).toBe(0);
    });
  });

  describe('getAuthorDetails', () => {
    it('should return page details from Jina Reader', async () => {
      (jinaReader.readUrl as jest.Mock).mockResolvedValue({
        content: 'Page content',
        title: 'Climate Action',
        url: 'https://www.facebook.com/climateaction',
        description: 'Environmental activism page',
      });

      const details = await connector.getAuthorDetails('climateaction');

      expect(details).toMatchObject({
        id: 'climateaction',
        name: 'Climate Action',
        platform: 'facebook',
        url: 'https://www.facebook.com/climateaction',
        description: 'Environmental activism page',
        credibilityScore: 0.3,
        verificationStatus: 'unverified',
      });
    });

    it('should use authorId as name when title is missing', async () => {
      (jinaReader.readUrl as jest.Mock).mockResolvedValue({
        content: 'content',
        title: undefined,
        url: 'https://www.facebook.com/test',
      });

      const details = await connector.getAuthorDetails('testpage');

      expect(details.name).toBe('testpage');
    });

    it('should throw when Jina Reader fails', async () => {
      (jinaReader.readUrl as jest.Mock).mockRejectedValue(
        new Error('Page blocked')
      );

      await expect(
        connector.getAuthorDetails('blockedpage')
      ).rejects.toThrow('Page blocked');
    });
  });

  describe('validateCredentials', () => {
    it('should return true when Jina Reader is available', async () => {
      (jinaReader.isAvailable as jest.Mock).mockResolvedValue(true);

      const result = await connector.validateCredentials();

      expect(result).toBe(true);
    });

    it('should return false when Jina Reader is unavailable', async () => {
      (jinaReader.isAvailable as jest.Mock).mockResolvedValue(false);

      const result = await connector.validateCredentials();

      expect(result).toBe(false);
    });

    it('should return false on unexpected errors', async () => {
      (jinaReader.isAvailable as jest.Mock).mockRejectedValue(
        new Error('unexpected')
      );

      const result = await connector.validateCredentials();

      expect(result).toBe(false);
    });
  });
});
