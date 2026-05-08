import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
import { NarrativeInsight } from '../../types/narrative-insight.interface';
import { SocialMediaPost } from '../../types/social-media.types';
import { DataConnector } from '../interfaces/data-connector.interface';
import { SourceNode } from '../schemas';
import { TransformOnIngestService } from './transform/transform-on-ingest.service';

interface SearchOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  maxResults?: number;
}

/**
 * Neynar API v2 cast shape.
 */
interface NeynarCast {
  hash: string;
  thread_hash?: string;
  author: {
    fid: number;
    username: string;
    display_name: string;
    pfp_url: string;
    profile?: {
      bio?: {
        text?: string;
      };
    };
    follower_count: number;
    following_count: number;
    active_status?: string;
  };
  text: string;
  timestamp: string;
  reactions: {
    likes_count: number;
    recasts_count: number;
  };
  replies: {
    count: number;
  };
}

interface NeynarSearchResponse {
  result: {
    casts: NeynarCast[];
    next?: { cursor: string };
  };
}

interface NeynarUserResponse {
  result: {
    user: NeynarCast['author'];
  };
}

interface NeynarFeedResponse {
  casts: NeynarCast[];
  next?: { cursor: string };
}

const NEYNAR_BASE = 'https://api.neynar.com/v2/farcaster';

/**
 * Farcaster connector using Neynar v2 API.
 * Requires NEYNAR_API_KEY environment variable (free tier: 1000 req/day).
 * When the key is missing the connector marks itself unavailable and returns
 * empty results gracefully — it will never throw.
 */
@Injectable()
export class FarcasterFreeConnector implements DataConnector, OnModuleInit, OnModuleDestroy {
  platform = 'farcaster' as const;
  private streamConnections: Map<string, NodeJS.Timeout> = new Map();
  private readonly pollingInterval = 600000; // 10 minutes
  private readonly logger = new Logger(FarcasterFreeConnector.name);
  private readonly fetchTimeout = 15_000;
  private readonly maxRetries = 1;
  private neynarApiKey: string | null = null;
  private available = false;

  constructor(
    private configService: ConfigService,
    private transformService: TransformOnIngestService,
  ) {}

  async onModuleInit() {
    await this.validateCredentials();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  async connect(): Promise<void> {
    if (!this.neynarApiKey) {
      this.logger.debug('NEYNAR_API_KEY not set — Farcaster connector unavailable');
      this.available = false;
      return;
    }

    try {
      const response = await this.fetchWithTimeout(`${NEYNAR_BASE}/cast/search?q=gm&limit=1`, {
        headers: this.neynarHeaders(),
      });
      if (response.ok) {
        this.available = true;
        this.logger.log('Farcaster connector connected via Neynar v2 API');
      } else {
        this.available = false;
        this.logger.warn(
          `Neynar API returned status ${response.status} — Farcaster connector unavailable`,
        );
      }
    } catch {
      this.available = false;
      this.logger.warn('Neynar API unreachable — Farcaster connector unavailable');
    }
  }

  async disconnect(): Promise<void> {
    this.streamConnections.forEach((interval) => {
      clearInterval(interval);
    });
    this.streamConnections.clear();
  }

  async searchAndTransform(query: string, options?: SearchOptions): Promise<NarrativeInsight[]> {
    const posts = await this.searchContent(query, options);
    if (posts.length === 0) return [];
    const insights = await this.transformService.transformBatch(posts);
    this.logger.log(`Transformed ${insights.length} Farcaster results into insights`);
    return insights;
  }

  async searchWithRawData(
    query: string,
    options?: SearchOptions,
  ): Promise<{ posts: SocialMediaPost[]; insights: NarrativeInsight[] }> {
    const posts = await this.searchContent(query, options);
    if (posts.length === 0) return { posts: [], insights: [] };
    const insights = await this.transformService.transformBatch(posts);
    this.logger.log(`Farcaster: ${posts.length} posts, ${insights.length} insights`);
    return { posts, insights };
  }

  streamAndTransform(keywords: string[]): EventEmitter {
    const emitter = new EventEmitter();
    const streamId = Math.random().toString(36).substring(7);

    const poll = async () => {
      try {
        const posts = await this.searchContent(keywords.join(' '), {
          limit: 10,
        });
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
    if (!this.available || !this.neynarApiKey) {
      return {
        id: authorId,
        name: authorId,
        platform: this.platform,
        url: `https://warpcast.com/${authorId}`,
      } as Partial<SourceNode>;
    }

    try {
      const url = `${NEYNAR_BASE}/user/by_username?username=${encodeURIComponent(authorId)}`;
      const response = await this.fetchWithRetry(url, {
        headers: this.neynarHeaders(),
      });

      if (!response.ok) {
        this.logger.debug(`Neynar user lookup returned status ${response.status} for @${authorId}`);
        return {
          id: authorId,
          name: authorId,
          platform: this.platform,
          url: `https://warpcast.com/${authorId}`,
        } as Partial<SourceNode>;
      }

      const data = (await response.json()) as NeynarUserResponse;
      const user = data.result.user;

      return {
        id: String(user.fid),
        name: user.display_name || user.username,
        platform: this.platform,
        url: `https://warpcast.com/${user.username}`,
        description: user.profile?.bio?.text ?? '',
        credibilityScore: this.calculateCredibilityScore(user),
        verificationStatus: 'unverified',
        metadata: {
          fid: user.fid,
          followersCount: user.follower_count,
          followingCount: user.following_count,
          avatar: user.pfp_url,
          activeStatus: user.active_status,
        },
      } as Partial<SourceNode>;
    } catch (error) {
      this.logger.debug(`Error fetching author details for @${authorId}:`, error);
      return {
        id: authorId,
        name: authorId,
        platform: this.platform,
        url: `https://warpcast.com/${authorId}`,
      } as Partial<SourceNode>;
    }
  }

  /**
   * Fetch a user's timeline posts.
   */
  async getUserTimeline(
    username: string,
    options?: { limit?: number },
  ): Promise<SocialMediaPost[]> {
    if (!this.available || !this.neynarApiKey) return [];

    const limit = options?.limit ?? 50;

    try {
      // Resolve username to FID
      const userUrl = `${NEYNAR_BASE}/user/by_username?username=${encodeURIComponent(username)}`;
      const userResponse = await this.fetchWithRetry(userUrl, {
        headers: this.neynarHeaders(),
      });

      if (!userResponse.ok) {
        this.logger.debug(
          `Neynar user lookup failed for @${username}: status ${userResponse.status}`,
        );
        return [];
      }

      const userData = (await userResponse.json()) as NeynarUserResponse;
      const fid = userData.result.user.fid;

      // Fetch their casts
      const neynarLimit = Math.min(limit, 50);
      const feedUrl = `${NEYNAR_BASE}/feed/user/casts?fid=${fid}&limit=${neynarLimit}`;
      const feedResponse = await this.fetchWithRetry(feedUrl, {
        headers: this.neynarHeaders(),
      });

      if (!feedResponse.ok) {
        this.logger.debug(`Neynar feed failed for FID ${fid}: status ${feedResponse.status}`);
        return [];
      }

      const feedData = (await feedResponse.json()) as NeynarFeedResponse;
      return (feedData.casts ?? []).slice(0, limit).map((c) => this.transformNeynarCast(c));
    } catch (error) {
      this.logger.debug(`Timeline fetch failed for @${username}:`, error);
      return [];
    }
  }

  async validateCredentials(): Promise<boolean> {
    this.neynarApiKey =
      this.configService.get<string>('NEYNAR_API_KEY') || process.env['NEYNAR_API_KEY'] || null;

    if (!this.neynarApiKey) {
      this.logger.debug('NEYNAR_API_KEY not set — Farcaster connector unavailable');
      this.available = false;
      return false;
    }

    try {
      const response = await this.fetchWithTimeout(`${NEYNAR_BASE}/cast/search?q=gm&limit=1`, {
        headers: this.neynarHeaders(),
      });
      if (response.ok) {
        this.available = true;
        this.logger.log('Farcaster connector validated (Neynar v2 API reachable)');
        return true;
      }
      this.logger.warn(`Neynar API returned status ${response.status} during validation`);
    } catch {
      this.logger.debug('Neynar API unreachable during validation');
    }

    this.available = false;
    return false;
  }

  // ---------------------------------------------------------------------------
  // Private helpers — search
  // ---------------------------------------------------------------------------

  private async searchContent(query: string, options?: SearchOptions): Promise<SocialMediaPost[]> {
    if (!this.available || !this.neynarApiKey) return [];

    const limit = options?.maxResults || options?.limit || 25;

    try {
      const neynarLimit = Math.min(limit, 25);
      const url = `${NEYNAR_BASE}/cast/search?q=${encodeURIComponent(query)}&limit=${neynarLimit}`;

      const response = await this.fetchWithRetry(url, {
        headers: this.neynarHeaders(),
      });

      if (!response.ok) {
        this.logger.warn(`Neynar search returned status ${response.status}`);
        return [];
      }

      const data = (await response.json()) as NeynarSearchResponse;
      let casts = data.result?.casts ?? [];

      // Date filter
      if (options?.startDate || options?.endDate) {
        const start = options?.startDate?.getTime() ?? 0;
        const end = options?.endDate?.getTime() ?? Date.now();
        casts = casts.filter((c) => {
          const ts = new Date(c.timestamp).getTime();
          return ts >= start && ts <= end;
        });
      }

      return casts.slice(0, limit).map((c) => this.transformNeynarCast(c));
    } catch (error) {
      this.logger.error('Error searching Farcaster via Neynar:', error);
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers — transform
  // ---------------------------------------------------------------------------

  private transformNeynarCast(cast: NeynarCast): SocialMediaPost {
    const author = cast.author ?? ({} as NeynarCast['author']);
    const likes = cast.reactions?.likes_count ?? 0;
    const recasts = cast.reactions?.recasts_count ?? 0;
    const replies = cast.replies?.count ?? 0;

    return {
      id: cast.hash,
      text: cast.text ?? '',
      platform: this.platform,
      authorId: String(author.fid ?? ''),
      authorName: author.display_name || author.username || '',
      authorHandle: author.username || 'unknown',
      url: `https://warpcast.com/${author.username || 'unknown'}/${cast.hash.slice(0, 10)}`,
      timestamp: new Date(cast.timestamp),
      engagementMetrics: {
        likes,
        shares: recasts,
        comments: replies,
        reach: 0,
        viralityScore: this.calculateViralityScore(likes, recasts, replies),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers — scoring & fetch utilities
  // ---------------------------------------------------------------------------

  private calculateViralityScore(likes: number, recasts: number, replies: number): number {
    const total = likes + recasts + replies;
    if (total === 0) return 0;
    return Math.min(Math.log10(total + 1) / 4, 1);
  }

  private calculateCredibilityScore(user: NeynarCast['author']): number {
    const followers = user.follower_count ?? 0;
    let score = 0.1;
    if (followers > 1000000) score += 0.4;
    else if (followers > 100000) score += 0.3;
    else if (followers > 10000) score += 0.2;
    else if (followers > 1000) score += 0.1;
    return Math.min(score, 1.0);
  }

  private neynarHeaders(): Record<string, string> {
    if (!this.neynarApiKey) {
      throw new Error('NEYNAR_API_KEY not configured');
    }
    return {
      accept: 'application/json',
      'x-api-key': this.neynarApiKey,
    };
  }

  /**
   * Fetch with a 15s timeout (AbortController).
   */
  private async fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.fetchTimeout);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Fetch with timeout and retry once on failure.
   */
  private async fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, init);
        // Retry on 5xx
        if (response.status >= 500 && attempt < this.maxRetries) {
          this.logger.debug(
            `Neynar fetch returned ${response.status}, retrying (${attempt + 1}/${this.maxRetries})`,
          );
          await this.delay(1000 * (attempt + 1));
          continue;
        }
        return response;
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.maxRetries) {
          this.logger.debug(
            `Neynar fetch failed, retrying (${attempt + 1}/${this.maxRetries}): ${lastError.message}`,
          );
          await this.delay(1000 * (attempt + 1));
        }
      }
    }
    throw lastError ?? new Error('Fetch failed after retries');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
