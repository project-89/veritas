import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { EventEmitter } from 'events';
import { DataConnector } from '../interfaces/data-connector.interface';
import { SocialMediaPost } from '../../types/social-media.types';
import { SourceNode } from '../schemas';
import { TransformOnIngestService } from './transform/transform-on-ingest.service';
import { NarrativeInsight } from '../../types/narrative-insight.interface';

interface SearchOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  maxResults?: number;
}

/** Bluesky post from AT Protocol public API. */
interface BlueskyPost {
  uri: string;
  cid: string;
  author: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
    description?: string;
  };
  record: {
    text: string;
    createdAt: string;
  };
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
}

interface BlueskySearchResponse {
  posts: BlueskyPost[];
  cursor?: string;
}

interface BlueskyProfileResponse {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  description?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
}

interface BlueskyFeedResponse {
  feed: Array<{
    post: BlueskyPost;
  }>;
  cursor?: string;
}

const BSKY_PUBLIC_API = 'https://public.api.bsky.app/xrpc';

/**
 * API-free Bluesky connector using the AT Protocol public API.
 * No authentication required for reading public posts.
 */
@Injectable()
export class BlueskyFreeConnector
  implements DataConnector, OnModuleInit, OnModuleDestroy
{
  platform = 'bluesky' as const;
  private streamConnections: Map<string, NodeJS.Timeout> = new Map();
  private readonly pollingInterval = 600000; // 10 minutes
  private readonly logger = new Logger(BlueskyFreeConnector.name);

  constructor(private transformService: TransformOnIngestService) {}

  async onModuleInit() {
    await this.validateCredentials();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  async connect(): Promise<void> {
    this.logger.log('Bluesky public API connector ready (no auth needed)');
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
      `Transformed ${insights.length} Bluesky results into insights`,
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
      `Bluesky: ${posts.length} posts, ${insights.length} insights`,
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

    poll();
    const interval = setInterval(poll, this.pollingInterval);
    this.streamConnections.set(streamId, interval);

    emitter.on('end', () => {
      clearInterval(interval);
      this.streamConnections.delete(streamId);
    });

    return emitter;
  }

  async getAuthorDetails(handle: string): Promise<Partial<SourceNode>> {
    try {
      const url = `${BSKY_PUBLIC_API}/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`;
      const data = await this.fetchWithRetry<BlueskyProfileResponse>(url);

      return {
        id: data.did,
        name: data.displayName || data.handle,
        platform: this.platform,
        url: `https://bsky.app/profile/${data.handle}`,
        description: data.description ?? '',
        credibilityScore: this.calculateCredibilityScore(data),
        verificationStatus: 'unverified',
        metadata: {
          followersCount: data.followersCount ?? 0,
          followingCount: data.followsCount ?? 0,
          postsCount: data.postsCount ?? 0,
          avatar: data.avatar,
        },
      } as Partial<SourceNode>;
    } catch (error) {
      this.logger.error(`Error fetching Bluesky profile for ${handle}:`, error);
      throw error;
    }
  }

  /**
   * Fetch a user's timeline posts.
   */
  async getUserTimeline(
    handle: string,
    options?: { limit?: number },
  ): Promise<SocialMediaPost[]> {
    const limit = options?.limit ?? 50;
    try {
      const url = `${BSKY_PUBLIC_API}/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(handle)}&limit=${limit}`;
      const data = await this.fetchWithRetry<BlueskyFeedResponse>(url);

      if (!Array.isArray(data.feed)) return [];
      return data.feed.map((item) => this.transformToSocialMediaPost(item.post));
    } catch (error) {
      this.logger.debug(`Timeline fetch failed for @${handle}:`, error);
      return [];
    }
  }

  async validateCredentials(): Promise<boolean> {
    try {
      // Public API — just verify it's reachable
      const response = await fetch(
        `${BSKY_PUBLIC_API}/app.bsky.feed.searchPosts?q=test&limit=1`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (response.ok) {
        this.logger.log('Bluesky public API connector validated');
        return true;
      }
      this.logger.warn(`Bluesky API returned HTTP ${response.status}`);
      return false;
    } catch {
      this.logger.debug('Bluesky public API not reachable');
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  async searchContent(
    query: string,
    options?: SearchOptions,
  ): Promise<SocialMediaPost[]> {
    const limit = options?.maxResults || options?.limit || 25;

    try {
      const url = `${BSKY_PUBLIC_API}/app.bsky.feed.searchPosts?q=${encodeURIComponent(query)}&limit=${Math.min(limit, 100)}`;
      const data = await this.fetchWithRetry<BlueskySearchResponse>(url);

      if (!Array.isArray(data.posts)) return [];

      let posts = data.posts;

      // Date filter
      if (options?.startDate || options?.endDate) {
        const start = options?.startDate?.getTime() ?? 0;
        const end = options?.endDate?.getTime() ?? Date.now();
        posts = posts.filter((p) => {
          const ts = new Date(p.record.createdAt).getTime();
          return ts >= start && ts <= end;
        });
      }

      return posts.slice(0, limit).map((p) => this.transformToSocialMediaPost(p));
    } catch (error) {
      this.logger.error('Error searching Bluesky:', error);
      return [];
    }
  }

  private transformToSocialMediaPost(post: BlueskyPost): SocialMediaPost {
    const author = post.author ?? {};
    // Extract rkey from URI: at://did:plc:xyz/app.bsky.feed.post/abc -> abc
    const rkey = post.uri?.split('/').pop() ?? '';

    return {
      id: post.uri || post.cid,
      text: post.record?.text ?? '',
      platform: this.platform,
      authorId: author.did ?? '',
      authorName: author.displayName || author.handle || '',
      authorHandle: author.handle || 'unknown',
      url: `https://bsky.app/profile/${author.handle}/post/${rkey}`,
      timestamp: new Date(post.record?.createdAt ?? Date.now()),
      engagementMetrics: {
        likes: post.likeCount ?? 0,
        shares: post.repostCount ?? 0,
        comments: post.replyCount ?? 0,
        reach: 0,
        viralityScore: this.calculateViralityScore(post),
      },
    };
  }

  private async fetchWithRetry<T>(url: string): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(15_000),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return (await response.json()) as T;
      } catch (err) {
        if (attempt === 0) {
          this.logger.debug(`Bluesky fetch attempt 1 failed, retrying: ${err}`);
          continue;
        }
        throw err;
      }
    }

    // Unreachable, but satisfies TS
    throw new Error('Bluesky fetch failed after 2 attempts');
  }

  private calculateViralityScore(post: BlueskyPost): number {
    const total =
      (post.likeCount ?? 0) +
      (post.repostCount ?? 0) +
      (post.replyCount ?? 0);
    if (total === 0) return 0;
    return Math.min(Math.log10(total + 1) / 4, 1);
  }

  private calculateCredibilityScore(profile: BlueskyProfileResponse): number {
    const followers = profile.followersCount ?? 0;
    let score = 0.1;
    if (followers > 1000000) score += 0.4;
    else if (followers > 100000) score += 0.3;
    else if (followers > 10000) score += 0.2;
    else if (followers > 1000) score += 0.1;
    return Math.min(score, 1.0);
  }
}
