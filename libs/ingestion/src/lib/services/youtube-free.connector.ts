import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
import { readFile, unlink } from 'fs/promises';
import { DataConnector } from '../interfaces/data-connector.interface';
import { SocialMediaPost } from '../../types/social-media.types';
import { SourceNode } from '../schemas';
import { TransformOnIngestService } from './transform/transform-on-ingest.service';
import { NarrativeInsight } from '../../types/narrative-insight.interface';
import { SubprocessUtil } from './utils/subprocess.util';

interface SearchOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  maxResults?: number;
  /** Fetch video transcripts/subtitles via yt-dlp (slower but richer content). Default: true */
  fetchTranscripts?: boolean;
}

const TRANSCRIPT_MAX_CHARS = 5000;
const TRANSCRIPT_TEMP_PREFIX = '/tmp/veritas-yt-';

interface YtDlpVideoInfo {
  id: string;
  title: string;
  description: string;
  upload_date: string; // YYYYMMDD
  uploader: string;
  uploader_id: string;
  channel_id: string;
  webpage_url: string;
  view_count: number;
  like_count: number;
  comment_count: number;
  duration: number;
  categories?: string[];
  tags?: string[];
}

interface YtDlpChannelInfo {
  id: string;
  channel: string;
  uploader: string;
  channel_follower_count: number;
  description: string;
  webpage_url: string;
}

/**
 * API-free YouTube connector using yt-dlp CLI.
 * No API key required — uses yt-dlp for video search, metadata, and subtitles.
 * Requires yt-dlp to be installed: `pip install yt-dlp` or `brew install yt-dlp`
 */
@Injectable()
export class YouTubeFreeConnector
  implements DataConnector, OnModuleInit, OnModuleDestroy
{
  platform = 'youtube' as const;
  private streamConnections: Map<string, NodeJS.Timeout> = new Map();
  private readonly pollingInterval = 600000; // 10 minutes (slower than API)
  private readonly logger = new Logger(YouTubeFreeConnector.name);
  private ytDlpPath: string;

  constructor(
    private configService: ConfigService,
    private transformService: TransformOnIngestService,
    private subprocessUtil: SubprocessUtil
  ) {
    this.ytDlpPath = this.configService.get<string>('YT_DLP_PATH') || 'yt-dlp';
  }

  async onModuleInit() {
    await this.validateCredentials();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  async connect(): Promise<void> {
    const available = await this.subprocessUtil.checkAvailability(
      this.ytDlpPath
    );
    if (!available) {
      throw new Error(
        `yt-dlp is not installed or not found at "${this.ytDlpPath}". ` +
          'Install it with: pip install yt-dlp (or brew install yt-dlp)'
      );
    }
    this.logger.log('yt-dlp is available for YouTube API-free connector');
  }

  async disconnect(): Promise<void> {
    this.streamConnections.forEach((interval) => {
      clearInterval(interval);
    });
    this.streamConnections.clear();
    this.logger.log('Disconnected YouTube API-free connector');
  }

  async searchAndTransform(
    query: string,
    options?: SearchOptions
  ): Promise<NarrativeInsight[]> {
    try {
      this.logger.log(`Searching YouTube (API-free) for: ${query}`);

      const posts = await this.searchContent(query, options);
      const insights = await this.transformService.transformBatch(posts);

      this.logger.log(
        `Transformed ${insights.length} YouTube results into anonymized insights`
      );

      return insights;
    } catch (error) {
      this.logger.error(
        'Error searching and transforming YouTube content:',
        error
      );
      throw error;
    }
  }

  async searchWithRawData(
    query: string,
    options?: SearchOptions
  ): Promise<{ posts: SocialMediaPost[]; insights: NarrativeInsight[] }> {
    try {
      this.logger.log(`Searching YouTube (with raw data) for: ${query}`);
      const posts = await this.searchContent(query, options);
      if (posts.length === 0) return { posts: [], insights: [] };
      const insights = await this.transformService.transformBatch(posts);
      this.logger.log(`YouTube: ${posts.length} posts, ${insights.length} insights`);
      return { posts, insights };
    } catch (error) {
      this.logger.error('Error in YouTube searchWithRawData:', error);
      throw error;
    }
  }

  streamAndTransform(keywords: string[]): EventEmitter {
    const emitter = new EventEmitter();
    const streamId = Math.random().toString(36).substring(7);

    const checkForContent = async () => {
      try {
        const posts = await this.searchContent(keywords.join(' '), {
          limit: 10,
        });

        if (posts.length > 0) {
          const insights = await this.transformService.transformBatch(posts);

          for (const insight of insights) {
            emitter.emit('data', insight);
          }

          this.logger.debug(
            `Emitted ${insights.length} anonymized insights from YouTube stream`
          );
        }
      } catch (error) {
        emitter.emit('error', error);
        this.logger.error('Error in YouTube stream:', error);
      }
    };

    // Initial check
    checkForContent();

    const interval = setInterval(checkForContent, this.pollingInterval);
    this.streamConnections.set(streamId, interval);

    emitter.on('end', () => {
      clearInterval(interval);
      this.streamConnections.delete(streamId);
      this.logger.log(`Closed YouTube stream: ${streamId}`);
    });

    return emitter;
  }

  async getAuthorDetails(authorId: string): Promise<Partial<SourceNode>> {
    try {
      const result = await this.subprocessUtil.exec(
        this.ytDlpPath,
        [
          `https://www.youtube.com/channel/${authorId}`,
          '--dump-json',
          '--playlist-items',
          '0',
          '--no-download',
        ],
        { timeout: 30000 }
      );

      if (result.exitCode !== 0) {
        throw new Error(`yt-dlp failed: ${result.stderr}`);
      }

      // yt-dlp may return multiple JSON lines for a channel; take the first
      const firstLine = result.stdout.split('\n').find((l) => l.trim());
      if (!firstLine) {
        throw new Error(`No output from yt-dlp for channel ${authorId}`);
      }

      const channelInfo = JSON.parse(firstLine) as YtDlpChannelInfo;

      return {
        id: authorId,
        name: channelInfo.channel || channelInfo.uploader || '',
        platform: this.platform,
        url: channelInfo.webpage_url || `https://www.youtube.com/channel/${authorId}`,
        description: channelInfo.description || '',
        credibilityScore: this.calculateCredibilityScore(channelInfo),
        verificationStatus: 'unverified',
        metadata: {
          followerCount: channelInfo.channel_follower_count,
        },
      } as Partial<SourceNode>;
    } catch (error) {
      this.logger.error('Error fetching YouTube channel details:', error);
      throw error;
    }
  }

  async validateCredentials(): Promise<boolean> {
    try {
      const result = await this.subprocessUtil.exec(
        this.ytDlpPath,
        ['--version'],
        { timeout: 10000 }
      );

      if (result.exitCode === 0) {
        this.logger.log(
          `YouTube API-free connector validated (yt-dlp version: ${result.stdout.trim()})`
        );
        return true;
      }

      this.logger.error('yt-dlp version check failed');
      return false;
    } catch (error) {
      this.logger.error(
        'YouTube API-free connector validation failed. Is yt-dlp installed?',
        error
      );
      return false;
    }
  }

  // --- Private helpers ---

  private async searchContent(
    query: string,
    options?: SearchOptions
  ): Promise<SocialMediaPost[]> {
    const limit = options?.maxResults || options?.limit || 10;
    const fetchTranscripts = options?.fetchTranscripts ?? true;

    try {
      const args = [
        `ytsearch${limit}:${query}`,
        '--dump-json',
        '--no-download',
        '--flat-playlist',
      ];

      // Add date filter if specified
      if (options?.startDate) {
        args.push(
          '--dateafter',
          this.formatYtDlpDate(options.startDate)
        );
      }
      if (options?.endDate) {
        args.push(
          '--datebefore',
          this.formatYtDlpDate(options.endDate)
        );
      }

      const videos = await this.subprocessUtil.execJsonLines<YtDlpVideoInfo>(
        this.ytDlpPath,
        args,
        { timeout: 60000 }
      );

      // Second pass: fetch transcripts in batches of 5 to limit concurrency
      const transcriptMap = new Map<string, string>();
      if (fetchTranscripts) {
        const TRANSCRIPT_CONCURRENCY = 5;
        for (let i = 0; i < videos.length; i += TRANSCRIPT_CONCURRENCY) {
          const batch = videos.slice(i, i + TRANSCRIPT_CONCURRENCY);
          const batchResults = await Promise.allSettled(
            batch.map((video) => this.getVideoTranscript(video.id))
          );

          for (let j = 0; j < batch.length; j++) {
            const result = batchResults[j]!;
            if (result.status === 'fulfilled' && result.value) {
              transcriptMap.set(batch[j]!.id, result.value);
            }
          }
        }

        this.logger.log(
          `Fetched transcripts for ${transcriptMap.size}/${videos.length} videos`
        );
      }

      let posts = videos.map((video) =>
        this.transformVideoToSocialMediaPost(video, transcriptMap.get(video.id))
      );

      // Post-fetch date filter — yt-dlp's --dateafter/--datebefore may not work
      // with --flat-playlist, so filter results here as a safety net
      if (options?.startDate || options?.endDate) {
        const start = options.startDate?.getTime() ?? 0;
        const end = options.endDate?.getTime() ?? Date.now();
        const before = posts.length;
        posts = posts.filter((p) => {
          const ts = p.timestamp.getTime();
          return ts >= start && ts <= end;
        });
        if (posts.length < before) {
          this.logger.debug(
            `Filtered YouTube results by date: ${before} → ${posts.length} (${options.startDate?.toISOString()} to ${options.endDate?.toISOString()})`,
          );
        }
      }

      return posts;
    } catch (error) {
      this.logger.error('Error searching YouTube with yt-dlp:', error);
      throw error;
    }
  }

  private transformVideoToSocialMediaPost(
    video: YtDlpVideoInfo,
    transcript?: string
  ): SocialMediaPost {
    // Prefer transcript over description when available for richer content
    const body = transcript || video.description;
    const text = [video.title, body]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, transcript ? TRANSCRIPT_MAX_CHARS : 2000);

    // Extract username from uploader_id (e.g., "@username" or "UCxxxx")
    const handle = video.uploader_id?.startsWith('@')
      ? video.uploader_id
      : video.uploader || video.uploader_id || 'unknown';

    return {
      id: video.id,
      text,
      platform: this.platform,
      authorId: video.channel_id || video.uploader_id || '',
      authorName: video.uploader || handle,
      authorHandle: handle,
      url: video.webpage_url || `https://www.youtube.com/watch?v=${video.id}`,
      timestamp: this.parseYtDlpDate(video.upload_date),
      engagementMetrics: {
        likes: video.like_count || 0,
        shares: 0,
        comments: video.comment_count || 0,
        reach: video.view_count || 0,
        viralityScore: this.calculateVideoViralityScore(video),
      },
    };
  }

  /**
   * Fetch auto-generated or manual subtitles for a video using yt-dlp.
   * Downloads a .vtt file to /tmp, reads it, cleans the VTT formatting,
   * and returns plain text. Returns empty string if no subtitles available.
   */
  async getVideoTranscript(videoId: string): Promise<string> {
    const outputTemplate = `${TRANSCRIPT_TEMP_PREFIX}${videoId}`;
    const vttPath = `${outputTemplate}.en.vtt`;
    const url = `https://www.youtube.com/watch?v=${videoId}`;

    try {
      const result = await this.subprocessUtil.exec(
        this.ytDlpPath,
        [
          '--skip-download',
          '--write-subs',
          '--write-auto-subs',
          '--sub-lang', 'en',
          '--sub-format', 'vtt',
          '-o', outputTemplate,
          url,
        ],
        { timeout: 30000 }
      );

      if (result.exitCode !== 0) {
        this.logger.debug(
          `No subtitles available for video ${videoId}: ${result.stderr}`
        );
        return '';
      }

      // Read the downloaded VTT file
      let vttContent: string;
      try {
        vttContent = await readFile(vttPath, 'utf-8');
      } catch {
        this.logger.debug(`No subtitle file found at ${vttPath} for video ${videoId}`);
        return '';
      }

      // Clean up the temp file
      await unlink(vttPath).catch(() => {
        /* ignore cleanup errors */
      });

      return this.cleanVttSubtitles(vttContent);
    } catch (error) {
      this.logger.debug(`Failed to fetch transcript for video ${videoId}:`, error);
      return '';
    }
  }

  /**
   * Strip VTT formatting to produce clean plain text.
   * Removes WEBVTT header, timestamps, positioning tags, <c> tags,
   * and deduplicates consecutive identical lines.
   */
  private cleanVttSubtitles(vttContent: string): string {
    const lines = vttContent.split('\n');
    const textLines: string[] = [];
    let previousLine = '';

    for (const rawLine of lines) {
      let line = rawLine.trim();

      // Skip WEBVTT header, NOTE blocks, and empty lines
      if (
        line === 'WEBVTT' ||
        line.startsWith('Kind:') ||
        line.startsWith('Language:') ||
        line.startsWith('NOTE') ||
        line === ''
      ) {
        continue;
      }

      // Skip timestamp lines (e.g., "00:00:01.000 --> 00:00:04.000")
      if (/^\d{2}:\d{2}:\d{2}\.\d{3}\s*-->/.test(line)) {
        continue;
      }

      // Skip numeric cue identifiers
      if (/^\d+$/.test(line)) {
        continue;
      }

      // Strip positioning/alignment tags like <c>, </c>, <00:00:01.000>, align:start, position:0%
      line = line.replace(/<\/?c[^>]*>/g, '');
      line = line.replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, '');
      line = line.replace(/align:\w+/g, '');
      line = line.replace(/position:\d+%/g, '');
      line = line.trim();

      if (!line) continue;

      // Deduplicate consecutive identical lines (common in auto-subs)
      if (line !== previousLine) {
        textLines.push(line);
        previousLine = line;
      }
    }

    return textLines.join(' ').slice(0, TRANSCRIPT_MAX_CHARS);
  }

  private calculateVideoViralityScore(video: YtDlpVideoInfo): number {
    const views = video.view_count || 0;
    const likes = video.like_count || 0;
    const comments = video.comment_count || 0;

    if (views === 0) return 0;

    const engagementRate = (likes + comments) / views;
    return Math.min(engagementRate * 10, 1);
  }

  private calculateCredibilityScore(
    channelInfo: YtDlpChannelInfo
  ): number {
    const followers = channelInfo.channel_follower_count || 0;

    let score = 0.1;
    if (followers > 1000000) score += 0.4;
    else if (followers > 100000) score += 0.3;
    else if (followers > 10000) score += 0.2;
    else if (followers > 1000) score += 0.1;

    return Math.min(score, 1.0);
  }

  private parseYtDlpDate(dateStr: string): Date {
    if (!dateStr || dateStr.length !== 8) return new Date();
    const year = parseInt(dateStr.slice(0, 4));
    const month = parseInt(dateStr.slice(4, 6)) - 1;
    const day = parseInt(dateStr.slice(6, 8));
    return new Date(year, month, day);
  }

  private formatYtDlpDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }
}
