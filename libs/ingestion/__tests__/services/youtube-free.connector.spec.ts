import { ConfigService } from '@nestjs/config';
import { YouTubeFreeConnector } from '../../src/lib/services/youtube-free.connector';
import { TransformOnIngestService } from '../../src/lib/services/transform/transform-on-ingest.service';
import { SubprocessUtil } from '../../src/lib/services/utils/subprocess.util';

describe('YouTubeFreeConnector', () => {
  let connector: YouTubeFreeConnector;
  let configService: Partial<ConfigService>;
  let transformService: Partial<TransformOnIngestService>;
  let subprocessUtil: Partial<SubprocessUtil>;

  const mockVideoInfo = {
    id: 'dQw4w9WgXcQ',
    title: 'Test Video Title',
    description: 'A test video description',
    upload_date: '20231115',
    uploader: 'TestChannel',
    uploader_id: 'UC_test_id',
    channel_id: 'UC_channel_123',
    webpage_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    view_count: 1000000,
    like_count: 50000,
    comment_count: 5000,
    duration: 212,
    categories: ['Music'],
    tags: ['test', 'video'],
  };

  const mockChannelInfo = {
    id: 'UC_channel_123',
    channel: 'TestChannel',
    uploader: 'TestChannel',
    channel_follower_count: 500000,
    description: 'A test channel',
    webpage_url: 'https://www.youtube.com/channel/UC_channel_123',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    configService = {
      get: jest.fn().mockReturnValue(undefined),
    };

    transformService = {
      transformBatch: jest.fn().mockResolvedValue([
        { id: 'insight-1', contentHash: 'h1' },
      ]),
    };

    subprocessUtil = {
      exec: jest.fn().mockResolvedValue({
        stdout: '2024.01.01',
        stderr: '',
        exitCode: 0,
      }),
      execJsonLines: jest.fn().mockResolvedValue([mockVideoInfo]),
      checkAvailability: jest.fn().mockResolvedValue(true),
    };

    connector = new YouTubeFreeConnector(
      configService as ConfigService,
      transformService as TransformOnIngestService,
      subprocessUtil as SubprocessUtil
    );
  });

  describe('constructor', () => {
    it('should default ytDlpPath to "yt-dlp"', () => {
      expect((connector as any).ytDlpPath).toBe('yt-dlp');
    });

    it('should use custom path from config', () => {
      (configService.get as jest.Mock).mockReturnValue('/usr/local/bin/yt-dlp');

      const custom = new YouTubeFreeConnector(
        configService as ConfigService,
        transformService as TransformOnIngestService,
        subprocessUtil as SubprocessUtil
      );

      expect((custom as any).ytDlpPath).toBe('/usr/local/bin/yt-dlp');
    });
  });

  describe('connect', () => {
    it('should succeed when yt-dlp is available', async () => {
      (subprocessUtil.checkAvailability as jest.Mock).mockResolvedValue(true);

      await expect(connector.connect()).resolves.not.toThrow();
      expect(subprocessUtil.checkAvailability).toHaveBeenCalledWith('yt-dlp');
    });

    it('should throw when yt-dlp is not available', async () => {
      (subprocessUtil.checkAvailability as jest.Mock).mockResolvedValue(false);

      await expect(connector.connect()).rejects.toThrow(
        'yt-dlp is not installed'
      );
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
    it('should search with yt-dlp and transform results', async () => {
      const insights = await connector.searchAndTransform('test query');

      expect(subprocessUtil.execJsonLines).toHaveBeenCalledWith(
        'yt-dlp',
        expect.arrayContaining([
          'ytsearch25:test query',
          '--dump-json',
          '--no-download',
          '--flat-playlist',
        ]),
        { timeout: 60000 }
      );

      expect(transformService.transformBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'dQw4w9WgXcQ',
            platform: 'youtube',
            authorId: 'UC_channel_123',
          }),
        ])
      );

      expect(insights).toHaveLength(1);
    });

    it('should use limit from options', async () => {
      await connector.searchAndTransform('query', { limit: 25 });

      const args = (subprocessUtil.execJsonLines as jest.Mock).mock.calls[0][1];
      expect(args[0]).toBe('ytsearch25:query');
    });

    it('should use maxResults from options', async () => {
      await connector.searchAndTransform('query', {
        maxResults: 5,
      } as any);

      const args = (subprocessUtil.execJsonLines as jest.Mock).mock.calls[0][1];
      expect(args[0]).toBe('ytsearch5:query');
    });

    it('should add date filters when specified', async () => {
      await connector.searchAndTransform('query', {
        startDate: new Date(2024, 0, 1),
        endDate: new Date(2024, 5, 30),
      });

      const args = (subprocessUtil.execJsonLines as jest.Mock).mock.calls[0][1];
      expect(args).toContain('--dateafter');
      expect(args).toContain('20240101');
      expect(args).toContain('--datebefore');
      expect(args).toContain('20240630');
    });

    it('retries long claim-style searches with a compact query when the first search returns no results', async () => {
      (subprocessUtil.execJsonLines as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([mockVideoInfo]);

      await connector.searchAndTransform('Chinese sent iran 500 DF-41 missiles to Iran', {
        searchMode: 'claim',
      } as any);

      expect(subprocessUtil.execJsonLines).toHaveBeenCalledTimes(2);
      expect((subprocessUtil.execJsonLines as jest.Mock).mock.calls[1][1][0]).toBe(
        'ytsearch25:500 df-41 china iran missile send',
      );
    });

    it('should correctly transform video metadata to SocialMediaPost', async () => {
      (subprocessUtil.execJsonLines as jest.Mock).mockResolvedValue([
        mockVideoInfo,
      ]);

      // Access the private method indirectly through searchAndTransform
      await connector.searchAndTransform('test');

      const posts = (transformService.transformBatch as jest.Mock).mock
        .calls[0][0];
      const post = posts[0];

      expect(post.text).toContain('Test Video Title');
      expect(post.text).toContain('A test video description');
      expect(post.engagementMetrics.likes).toBe(50000);
      expect(post.engagementMetrics.comments).toBe(5000);
      expect(post.engagementMetrics.reach).toBe(1000000);
      expect(post.engagementMetrics.shares).toBe(0);
      expect(post.url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    });

    it('should handle missing video fields gracefully', async () => {
      (subprocessUtil.execJsonLines as jest.Mock).mockResolvedValue([
        {
          id: 'vid1',
          title: 'Title only',
          description: null,
          upload_date: '',
          uploader: '',
          uploader_id: '',
          channel_id: '',
          webpage_url: '',
          view_count: 0,
          like_count: 0,
          comment_count: 0,
          duration: 0,
        },
      ]);

      await connector.searchAndTransform('test');

      const posts = (transformService.transformBatch as jest.Mock).mock
        .calls[0][0];
      expect(posts[0].authorId).toBe('');
      expect(posts[0].engagementMetrics.viralityScore).toBe(0);
    });

    it('should propagate yt-dlp errors', async () => {
      (subprocessUtil.execJsonLines as jest.Mock).mockRejectedValue(
        new Error('Command exited with code 1: yt-dlp error')
      );

      await expect(connector.searchAndTransform('test')).rejects.toThrow(
        'yt-dlp error'
      );
    });
  });

  describe('streamAndTransform', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return an EventEmitter and do initial check', async () => {
      const emitter = connector.streamAndTransform(['test', 'keyword']);

      expect(emitter).toBeDefined();
      expect(typeof emitter.on).toBe('function');

      // Let the initial async check complete
      await jest.advanceTimersByTimeAsync(0);

      expect(subprocessUtil.execJsonLines).toHaveBeenCalled();
      emitter.emit('end');
    });

    it('should emit data events with transformed insights', (done) => {
      // Mock searchContent to bypass the complex subprocess chain
      const mockPost = {
        id: 'yt-1',
        text: 'test video',
        platform: 'youtube',
        authorId: 'ch-1',
        timestamp: new Date(),
        engagementMetrics: { likes: 0, shares: 0, comments: 0, reach: 0, viralityScore: 0 },
      };
      (connector as any).searchContent = jest.fn().mockResolvedValue([mockPost]);

      // Use real timers for this test since the async chain is complex
      jest.useRealTimers();

      const emitter = connector.streamAndTransform(['test']);
      const timeoutId = setTimeout(() => {
        emitter.emit('end');
        done(new Error('Timed out waiting for data event'));
      }, 3000);

      emitter.on('data', (insight: unknown) => {
        clearTimeout(timeoutId);
        expect(insight).toEqual(expect.objectContaining({ id: 'insight-1' }));
        emitter.emit('end');
        done();
      });
    }, 10000);

    it('should emit error events on failure', async () => {
      (subprocessUtil.execJsonLines as jest.Mock).mockRejectedValue(
        new Error('yt-dlp crash')
      );

      const errorHandler = jest.fn();
      const emitter = connector.streamAndTransform(['test']);
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
    it('should return channel details from yt-dlp', async () => {
      (subprocessUtil.exec as jest.Mock).mockResolvedValue({
        stdout: JSON.stringify(mockChannelInfo) + '\n',
        stderr: '',
        exitCode: 0,
      });

      const details = await connector.getAuthorDetails('UC_channel_123');

      expect(details).toMatchObject({
        id: 'UC_channel_123',
        name: 'TestChannel',
        platform: 'youtube',
        verificationStatus: 'unverified',
      });
      expect(details.credibilityScore).toBeGreaterThan(0);
      expect((details as any).metadata?.followerCount).toBe(500000);
    });

    it('should throw when yt-dlp returns non-zero exit code', async () => {
      (subprocessUtil.exec as jest.Mock).mockResolvedValue({
        stdout: '',
        stderr: 'channel not found',
        exitCode: 1,
      });

      await expect(
        connector.getAuthorDetails('UC_nonexistent')
      ).rejects.toThrow('yt-dlp failed');
    });

    it('should throw when yt-dlp returns empty output', async () => {
      (subprocessUtil.exec as jest.Mock).mockResolvedValue({
        stdout: '\n\n',
        stderr: '',
        exitCode: 0,
      });

      await expect(connector.getAuthorDetails('UC_empty')).rejects.toThrow(
        'No output from yt-dlp'
      );
    });

    it('should calculate credibility score based on followers', async () => {
      // Test high follower count
      const bigChannel = { ...mockChannelInfo, channel_follower_count: 2000000 };
      (subprocessUtil.exec as jest.Mock).mockResolvedValue({
        stdout: JSON.stringify(bigChannel),
        stderr: '',
        exitCode: 0,
      });

      const details = await connector.getAuthorDetails('UC_big');
      expect(details.credibilityScore).toBe(0.5); // 0.1 + 0.4
    });
  });

  describe('validateCredentials', () => {
    it('should return true when yt-dlp version check succeeds', async () => {
      (subprocessUtil.exec as jest.Mock).mockResolvedValue({
        stdout: '2024.01.01\n',
        stderr: '',
        exitCode: 0,
      });

      const result = await connector.validateCredentials();
      expect(result).toBe(true);
    });

    it('should return false when yt-dlp version check fails', async () => {
      (subprocessUtil.exec as jest.Mock).mockResolvedValue({
        stdout: '',
        stderr: 'error',
        exitCode: 1,
      });

      const result = await connector.validateCredentials();
      expect(result).toBe(false);
    });

    it('should return false when exec throws', async () => {
      (subprocessUtil.exec as jest.Mock).mockRejectedValue(
        new Error('not installed')
      );

      const result = await connector.validateCredentials();
      expect(result).toBe(false);
    });
  });
});
