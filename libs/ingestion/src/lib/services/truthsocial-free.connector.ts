import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
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
}

/**
 * Truth Social post as returned by truthbrush CLI (JSON output).
 * Fields based on Mastodon-compatible API (Truth Social is a Mastodon fork).
 */
interface TruthPost {
  id: string;
  content: string;
  created_at: string;
  url: string;
  replies_count: number;
  reblogs_count: number;
  favourites_count: number;
  account: {
    id: string;
    username: string;
    display_name: string;
    acct: string;
    url: string;
    avatar: string;
    header: string;
    followers_count: number;
    following_count: number;
    statuses_count: number;
    verified: boolean;
    note: string;
  };
}

/**
 * API-free Truth Social connector using truthbrush CLI (Stanford Internet Observatory).
 * No API key required — uses truthbrush for search, user timelines, and metadata.
 * Requires: `pip install truthbrush`
 * Auth: TRUTHSOCIAL_USERNAME + TRUTHSOCIAL_PASSWORD env vars, or TRUTHSOCIAL_TOKEN
 */
@Injectable()
export class TruthSocialFreeConnector
  implements DataConnector, OnModuleInit, OnModuleDestroy
{
  platform = 'truthsocial' as const;
  private streamConnections: Map<string, NodeJS.Timeout> = new Map();
  private readonly pollingInterval = 600000; // 10 minutes
  private readonly logger = new Logger(TruthSocialFreeConnector.name);
  private truthbrushPath: string;
  private available = false;

  constructor(
    private configService: ConfigService,
    private transformService: TransformOnIngestService,
    private subprocessUtil: SubprocessUtil,
  ) {
    this.truthbrushPath =
      this.configService.get<string>('TRUTHBRUSH_PATH') || 'truthbrush';
  }

  async onModuleInit() {
    await this.validateCredentials();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  async connect(): Promise<void> {
    const result = await this.subprocessUtil.exec(
      this.truthbrushPath,
      ['--help'],
      { timeout: 10000 },
    );
    if (result.exitCode !== 0) {
      throw new Error(
        `truthbrush is not installed or not found at "${this.truthbrushPath}". ` +
          'Install it with: pip install truthbrush',
      );
    }
    this.available = true;
    this.logger.log('truthbrush is available for Truth Social connector');
  }

  async disconnect(): Promise<void> {
    this.streamConnections.forEach((interval) => clearInterval(interval));
    this.streamConnections.clear();
  }

  async searchAndTransform(
    query: string,
    options?: SearchOptions,
  ): Promise<NarrativeInsight[]> {
    const posts = await this.searchContent(query, options);
    const insights = await this.transformService.transformBatch(posts);
    this.logger.log(
      `Transformed ${insights.length} Truth Social results into insights`,
    );
    return insights;
  }

  async searchWithRawData(
    query: string,
    options?: SearchOptions,
  ): Promise<{ posts: SocialMediaPost[]; insights: NarrativeInsight[] }> {
    const posts = await this.searchContent(query, options);
    if (posts.length === 0) return { posts: [], insights: [] };
    const insights = await this.transformService.transformBatch(posts);
    this.logger.log(
      `Truth Social: ${posts.length} posts, ${insights.length} insights`,
    );
    return { posts, insights };
  }

  streamAndTransform(keywords: string[]): EventEmitter {
    const emitter = new EventEmitter();
    const streamId = Math.random().toString(36).substring(7);

    const poll = async () => {
      try {
        const posts = await this.searchContent(keywords.join(' '), { limit: 10 });
        if (posts.length > 0) {
          const insights = await this.transformService.transformBatch(posts);
          for (const insight of insights) {
            emitter.emit('data', insight);
          }
        }
      } catch (error) {
        emitter.emit('error', error);
      }
    };

    void poll();
    const interval = setInterval(poll, this.pollingInterval);
    interval.unref?.();
    this.streamConnections.set(streamId, interval);

    emitter.on('end', () => {
      clearInterval(interval);
      this.streamConnections.delete(streamId);
    });

    return emitter;
  }

  async getAuthorDetails(authorId: string): Promise<Partial<SourceNode>> {
    if (!this.available) return {} as Partial<SourceNode>;
    try {
      const result = await this.subprocessUtil.exec(
        this.truthbrushPath,
        ['user', authorId],
        { timeout: 30000 },
      );

      if (result.exitCode !== 0) {
        throw new Error(`truthbrush user failed: ${result.stderr}`);
      }

      const firstLine = result.stdout.split('\n').find((l) => l.trim());
      if (!firstLine) throw new Error('No output from truthbrush user');

      const user = JSON.parse(firstLine) as TruthPost['account'];

      return {
        id: user.id,
        name: user.display_name || user.username,
        platform: this.platform,
        url: user.url || `https://truthsocial.com/@${user.username}`,
        description: this.stripHtml(user.note ?? ''),
        credibilityScore: this.calculateCredibilityScore(user),
        verificationStatus: user.verified ? 'verified' : 'unverified',
        metadata: {
          followersCount: user.followers_count,
          followingCount: user.following_count,
          postsCount: user.statuses_count,
          avatar: user.avatar,
          banner: user.header,
        },
      } as Partial<SourceNode>;
    } catch (error) {
      this.logger.error('Error fetching Truth Social author details:', error);
      throw error;
    }
  }

  /**
   * Fetch a user's timeline posts.
   */
  async getUserTimeline(
    username: string,
    options?: { limit?: number },
  ): Promise<SocialMediaPost[]> {
    if (!this.available) return [];
    const limit = options?.limit ?? 50;
    try {
      const result = await this.subprocessUtil.exec(
        this.truthbrushPath,
        ['statuses', username],
        { timeout: 60000 },
      );

      if (result.exitCode !== 0) {
        this.logger.debug(`truthbrush statuses failed for @${username}: ${result.stderr}`);
        return [];
      }

      const posts = this.parseJsonLines(result.stdout);
      return posts.slice(0, limit).map((p) => this.transformToSocialMediaPost(p));
    } catch (error) {
      this.logger.debug(`Timeline fetch failed for @${username}:`, error);
      return [];
    }
  }

  async validateCredentials(): Promise<boolean> {
    try {
      const result = await this.subprocessUtil.exec(
        this.truthbrushPath,
        ['--help'],
        { timeout: 10000 },
      );

      if (result.exitCode === 0) {
        const hasUsername = !!(
          this.configService.get<string>('TRUTHSOCIAL_USERNAME') ||
          process.env['TRUTHSOCIAL_USERNAME']
        );
        const hasToken = !!(
          this.configService.get<string>('TRUTHSOCIAL_TOKEN') ||
          process.env['TRUTHSOCIAL_TOKEN']
        );

        if (!hasUsername && !hasToken) {
          this.available = false;
          this.logger.log(
            'Truth Social: truthbrush installed but no credentials. Set TRUTHSOCIAL_USERNAME + TRUTHSOCIAL_PASSWORD or TRUTHSOCIAL_TOKEN to enable.',
          );
          return false;
        }

        this.available = true;
        this.logger.log('Truth Social connector validated (truthbrush + credentials available)');
        return true;
      }

      this.logger.debug('truthbrush not available — Truth Social connector disabled');
      return false;
    } catch {
      this.logger.debug('truthbrush not installed — Truth Social connector disabled');
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async searchContent(
    query: string,
    options?: SearchOptions,
  ): Promise<SocialMediaPost[]> {
    if (!this.available) return [];

    const limit = options?.maxResults || options?.limit || 20;

    try {
      // truthbrush search <query> --searchtype statuses --json
      const result = await this.subprocessUtil.exec(
        this.truthbrushPath,
        ['search', query, '--searchtype', 'statuses'],
        { timeout: 60000 },
      );

      if (result.exitCode !== 0) {
        this.logger.warn(`Truth Social search failed: ${result.stderr}`);
        return [];
      }

      let posts = this.parseJsonLines(result.stdout);

      // Date filter
      if (options?.startDate || options?.endDate) {
        const start = options.startDate?.getTime() ?? 0;
        const end = options.endDate?.getTime() ?? Date.now();
        posts = posts.filter((p) => {
          const ts = new Date(p.created_at).getTime();
          return ts >= start && ts <= end;
        });
      }

      return posts.slice(0, limit).map((p) => this.transformToSocialMediaPost(p));
    } catch (error) {
      this.logger.error('Error searching Truth Social:', error);
      return [];
    }
  }

  private transformToSocialMediaPost(post: TruthPost): SocialMediaPost {
    const text = this.stripHtml(post.content ?? '');
    const account = post.account ?? {};

    return {
      id: post.id,
      text,
      platform: this.platform,
      authorId: account.id ?? '',
      authorName: account.display_name || account.username || '',
      authorHandle: account.username || account.acct || 'unknown',
      url: post.url || `https://truthsocial.com/@${account.username}/${post.id}`,
      timestamp: new Date(post.created_at),
      engagementMetrics: {
        likes: post.favourites_count ?? 0,
        shares: post.reblogs_count ?? 0,
        comments: post.replies_count ?? 0,
        reach: 0,
        viralityScore: this.calculateViralityScore(post),
      },
    };
  }

  private parseJsonLines(stdout: string): TruthPost[] {
    const posts: TruthPost[] = [];
    for (const line of stdout.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        // Could be a single post or an array
        if (Array.isArray(parsed)) {
          posts.push(...parsed);
        } else {
          posts.push(parsed);
        }
      } catch {
        // Skip malformed lines
      }
    }
    return posts;
  }

  /** Strip HTML tags from Truth Social content (Mastodon uses HTML in content field) */
  private stripHtml(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private calculateViralityScore(post: TruthPost): number {
    const total =
      (post.favourites_count ?? 0) +
      (post.reblogs_count ?? 0) +
      (post.replies_count ?? 0);
    if (total === 0) return 0;
    return Math.min(Math.log10(total + 1) / 4, 1);
  }

  private calculateCredibilityScore(
    account: TruthPost['account'],
  ): number {
    const followers = account.followers_count ?? 0;
    let score = 0.1;
    if (account.verified) score += 0.3;
    if (followers > 1000000) score += 0.4;
    else if (followers > 100000) score += 0.3;
    else if (followers > 10000) score += 0.2;
    else if (followers > 1000) score += 0.1;
    return Math.min(score, 1.0);
  }
}
