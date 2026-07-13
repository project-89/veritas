import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventEmitter } from 'events';
import { NarrativeInsight } from '../../types/narrative-insight.interface';
import { SocialMediaPost } from '../../types/social-media.types';
import { DataConnector } from '../interfaces/data-connector.interface';
import { SourceNode } from '../schemas';
import { buildSearchQuery, extractSignificantTerms, matchesQuery } from '../utils/query-match.util';
import { TransformOnIngestService } from './transform/transform-on-ingest.service';
import { SourceRateLimiter } from './utils/source-rate-limiter';

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

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const candidate = error as { status?: unknown };
  return typeof candidate.status === 'number' ? candidate.status : null;
}

// public.api.bsky.app now 403s on searchPosts; api.bsky.app serves the same
// unauthenticated AppView endpoints (searchPosts/getProfile/getAuthorFeed) and
// returns real data. Env-overridable in case the host changes again.
const BSKY_PUBLIC_API = process.env['BSKY_APPVIEW_API'] ?? 'https://api.bsky.app/xrpc';

/**
 * API-free Bluesky connector using the AT Protocol public API.
 * No authentication required for reading public posts.
 */
@Injectable()
export class BlueskyFreeConnector implements DataConnector, OnModuleInit, OnModuleDestroy {
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
    this.streamConnections.forEach((interval) => {
      clearInterval(interval);
    });
    this.streamConnections.clear();
  }

  async searchAndTransform(query: string, options?: SearchOptions): Promise<NarrativeInsight[]> {
    const posts = await this.searchContent(query, options);
    const insights = await this.transformService.transformBatch(posts);
    this.logger.log(`Transformed ${insights.length} Bluesky results into insights`);
    return insights;
  }

  async searchWithRawData(
    query: string,
    options?: SearchOptions,
  ): Promise<{ posts: SocialMediaPost[]; insights: NarrativeInsight[] }> {
    const posts = await this.searchContent(query, options);
    if (posts.length === 0) return { posts: [], insights: [] };
    const insights = await this.transformService.transformBatch(posts);
    this.logger.log(`Bluesky: ${posts.length} posts, ${insights.length} insights`);
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
  async getUserTimeline(handle: string, options?: { limit?: number }): Promise<SocialMediaPost[]> {
    const limit = options?.limit ?? 50;
    const normalizedHandle = handle.trim().replace(/^@/, '');
    if (!normalizedHandle) return [];
    if (!normalizedHandle.startsWith('did:') && !normalizedHandle.includes('.')) {
      this.logger.debug(`Skipping invalid Bluesky actor handle: @${normalizedHandle}`);
      return [];
    }
    try {
      const url = `${BSKY_PUBLIC_API}/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(normalizedHandle)}&limit=${limit}`;
      const data = await this.fetchWithRetry<BlueskyFeedResponse>(url);

      if (!Array.isArray(data.feed)) return [];
      return data.feed.map((item) => this.transformToSocialMediaPost(item.post));
    } catch (error) {
      const status = getErrorStatus(error);
      if (status === 400 || status === 404) {
        this.logger.debug(`No Bluesky timeline available for @${normalizedHandle} (${status})`);
        return [];
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.debug(`Timeline fetch failed for @${normalizedHandle}: ${message}`);
      return [];
    }
  }

  async validateCredentials(): Promise<boolean> {
    try {
      // Public API — just verify it's reachable
      const response = await fetch(`${BSKY_PUBLIC_API}/app.bsky.feed.searchPosts?q=test&limit=1`, {
        signal: AbortSignal.timeout(10_000),
      });
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

  async searchContent(query: string, options?: SearchOptions): Promise<SocialMediaPost[]> {
    const limit = options?.maxResults || options?.limit || 25;

    try {
      // Reduce natural-language questions to significant terms; Bluesky search
      // is literal, so the raw question returns almost nothing.
      const searchQuery = buildSearchQuery(query);
      const url = `${BSKY_PUBLIC_API}/app.bsky.feed.searchPosts?q=${encodeURIComponent(searchQuery)}&limit=${Math.min(limit, 100)}`;
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

      const transformed = posts.slice(0, limit).map((p) => this.transformToSocialMediaPost(p));
      // Relevance safety-net: Bluesky search can return loosely-related posts;
      // require the query's significant terms to actually appear (word-boundary,
      // stopword-aware). Skipped when the query has no significant terms.
      if (extractSignificantTerms(query).length === 0) return transformed;
      return transformed.filter((p) => matchesQuery(p.text, query));
    } catch (error) {
      const status = getErrorStatus(error);
      if (status === 400) {
        this.logger.debug(`Bluesky rejected query "${query}" with HTTP 400`);
        return [];
      }
      this.logger.error('Error searching Bluesky:', error);
      throw new Error(
        `Bluesky search failed: ${error instanceof Error ? error.message : String(error)}`,
      );
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
        return await SourceRateLimiter.instance.schedule('bluesky', async () => {
          const response = await fetch(url, {
            headers: {
              Accept: 'application/json',
            },
            signal: AbortSignal.timeout(15_000),
          });

          if (!response.ok) {
            if (response.status === 429) {
              SourceRateLimiter.instance.notifyRateLimited(
                'bluesky',
                SourceRateLimiter.retryAfterMsFrom(response.headers),
              );
            }
            const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as Error & {
              status?: number;
            };
            error.status = response.status;
            throw error;
          }

          return (await response.json()) as T;
        });
      } catch (err) {
        const status = getErrorStatus(err);
        const retryable = status === null || status >= 500 || status === 429;
        if (attempt === 0 && retryable) {
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
    const total = (post.likeCount ?? 0) + (post.repostCount ?? 0) + (post.replyCount ?? 0);
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
