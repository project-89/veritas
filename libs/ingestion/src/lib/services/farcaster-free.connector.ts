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

interface SearchOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  maxResults?: number;
}

/**
 * Searchcaster API cast shape (free public search index, no API key needed).
 */
interface SearchcasterCast {
  body: {
    publishedAt: number; // unix timestamp ms
    username: string;
    data: {
      text: string;
      image?: string;
      replyParentMerkleRoot?: string;
    };
  };
  meta: {
    displayName: string;
    avatar: string;
    isVerifiedAvatar: boolean;
    numReplyChildren: number;
    reactions: {
      count: number;
    };
    recasts: {
      count: number;
    };
    watches: {
      count: number;
    };
    replyParentUsername?: {
      username: string;
    };
  };
  merkleRoot: string;
  uri: string;
}

/**
 * Neynar API v2 cast shape (optional enhancement when NEYNAR_API_KEY is set).
 */
interface NeynarCast {
  hash: string;
  thread_hash: string;
  author: {
    fid: number;
    username: string;
    display_name: string;
    pfp_url: string;
    profile: {
      bio?: {
        text?: string;
      };
    };
    follower_count: number;
    following_count: number;
    verifications: string[];
    active_status: string;
  };
  text: string;
  timestamp: string;
  reactions: {
    likes_count: number;
    recasts_count: number;
    likes: { fid: number; fname: string }[];
    recasts: { fid: number; fname: string }[];
  };
  replies: {
    count: number;
  };
  embeds: { url?: string }[];
}

interface NeynarSearchResponse {
  result: {
    casts: NeynarCast[];
    next?: { cursor: string };
  };
}

interface NeynarUserResponse {
  user: NeynarCast['author'];
}

interface NeynarFeedResponse {
  casts: NeynarCast[];
  next?: { cursor: string };
}

/**
 * API-free Farcaster connector using the Searchcaster public index as primary source.
 * No API key required for basic search.
 * When NEYNAR_API_KEY is set, uses Neynar API v2 for richer data (user profiles, timelines).
 */
@Injectable()
export class FarcasterFreeConnector
  implements DataConnector, OnModuleInit, OnModuleDestroy
{
  platform = 'farcaster' as const;
  private streamConnections: Map<string, NodeJS.Timeout> = new Map();
  private readonly pollingInterval = 600000; // 10 minutes
  private readonly logger = new Logger(FarcasterFreeConnector.name);
  private readonly fetchTimeout = 30000;
  private readonly maxRetries = 2;
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
    // Searchcaster is always available (public, no auth)
    // Just verify we can reach it
    try {
      const response = await this.fetchWithTimeout(
        'https://searchcaster.xyz/api/search?text=test&count=1',
      );
      if (response.ok) {
        this.available = true;
        this.logger.log('Farcaster connector connected via Searchcaster');
      } else {
        this.logger.warn(
          `Searchcaster returned status ${response.status} — connector may be degraded`,
        );
        // Still mark available if Neynar is configured
        if (this.neynarApiKey) {
          this.available = true;
          this.logger.log('Falling back to Neynar API for Farcaster');
        }
      }
    } catch (error) {
      if (this.neynarApiKey) {
        this.available = true;
        this.logger.log(
          'Searchcaster unreachable, using Neynar API for Farcaster',
        );
      } else {
        this.logger.warn(
          'Farcaster connector unavailable — Searchcaster unreachable and no NEYNAR_API_KEY',
        );
      }
    }
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
      `Transformed ${insights.length} Farcaster results into insights`,
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
      `Farcaster: ${posts.length} posts, ${insights.length} insights`,
    );
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

    poll();
    const interval = setInterval(poll, this.pollingInterval);
    this.streamConnections.set(streamId, interval);

    emitter.on('end', () => {
      clearInterval(interval);
      this.streamConnections.delete(streamId);
    });

    return emitter;
  }

  async getAuthorDetails(authorId: string): Promise<Partial<SourceNode>> {
    // Prefer Neynar for richer user data
    if (this.neynarApiKey) {
      return this.getAuthorDetailsNeynar(authorId);
    }

    // Fallback: search for recent casts by this user to extract profile info
    return this.getAuthorDetailsFromSearch(authorId);
  }

  /**
   * Fetch a user's timeline posts.
   */
  async getUserTimeline(
    username: string,
    options?: { limit?: number },
  ): Promise<SocialMediaPost[]> {
    const limit = options?.limit ?? 50;

    // Neynar provides a proper user feed endpoint
    if (this.neynarApiKey) {
      return this.getUserTimelineNeynar(username, limit);
    }

    // Fallback: search for casts from this user via Searchcaster
    return this.getUserTimelineSearchcaster(username, limit);
  }

  async validateCredentials(): Promise<boolean> {
    // Check for Neynar API key (optional enhancement)
    this.neynarApiKey =
      this.configService.get<string>('NEYNAR_API_KEY') ||
      process.env['NEYNAR_API_KEY'] ||
      null;

    if (this.neynarApiKey) {
      this.logger.log(
        'Neynar API key detected — Farcaster connector will use enhanced Neynar endpoints',
      );
    } else {
      this.logger.log(
        'No NEYNAR_API_KEY — Farcaster connector will use free Searchcaster index',
      );
    }

    try {
      // Quick connectivity check against Searchcaster
      const response = await this.fetchWithTimeout(
        'https://searchcaster.xyz/api/search?text=gm&count=1',
      );
      if (response.ok) {
        this.available = true;
        this.logger.log('Farcaster connector validated (Searchcaster reachable)');
        return true;
      }
    } catch {
      // Searchcaster down — check if Neynar is available
    }

    if (this.neynarApiKey) {
      try {
        const response = await this.fetchWithTimeout(
          'https://api.neynar.com/v2/farcaster/cast/search?q=gm&limit=1',
          {
            headers: {
              accept: 'application/json',
              'x-api-key': this.neynarApiKey,
            },
          },
        );
        if (response.ok) {
          this.available = true;
          this.logger.log('Farcaster connector validated (Neynar API reachable)');
          return true;
        }
      } catch {
        // Both sources unavailable
      }
    }

    this.logger.debug(
      'Farcaster connector unavailable — no reachable endpoints',
    );
    return false;
  }

  // ---------------------------------------------------------------------------
  // Private helpers — search
  // ---------------------------------------------------------------------------

  private async searchContent(
    query: string,
    options?: SearchOptions,
  ): Promise<SocialMediaPost[]> {
    if (!this.available) return [];

    const limit = options?.maxResults || options?.limit || 25;

    // Try Neynar first if available (better data quality)
    if (this.neynarApiKey) {
      try {
        return await this.searchContentNeynar(query, limit, options);
      } catch (error) {
        this.logger.warn(
          'Neynar search failed, falling back to Searchcaster:',
          error,
        );
      }
    }

    // Searchcaster (free, no key)
    try {
      return await this.searchContentSearchcaster(query, limit, options);
    } catch (error) {
      this.logger.error('Error searching Farcaster via Searchcaster:', error);
      return [];
    }
  }

  private async searchContentSearchcaster(
    query: string,
    limit: number,
    options?: SearchOptions,
  ): Promise<SocialMediaPost[]> {
    const count = Math.min(limit, 100);
    const url = `https://searchcaster.xyz/api/search?text=${encodeURIComponent(query)}&count=${count}`;

    const response = await this.fetchWithRetry(url);
    if (!response.ok) {
      this.logger.warn(`Searchcaster returned status ${response.status}`);
      return [];
    }

    const data = (await response.json()) as { casts: SearchcasterCast[] };
    let casts = data.casts ?? [];

    // Date filter
    if (options?.startDate || options?.endDate) {
      const start = options?.startDate?.getTime() ?? 0;
      const end = options?.endDate?.getTime() ?? Date.now();
      casts = casts.filter((c) => {
        const ts = c.body.publishedAt;
        return ts >= start && ts <= end;
      });
    }

    return casts
      .slice(0, limit)
      .map((c) => this.transformSearchcasterCast(c));
  }

  private async searchContentNeynar(
    query: string,
    limit: number,
    options?: SearchOptions,
  ): Promise<SocialMediaPost[]> {
    const neynarLimit = Math.min(limit, 25);
    const url = `https://api.neynar.com/v2/farcaster/cast/search?q=${encodeURIComponent(query)}&limit=${neynarLimit}`;

    const response = await this.fetchWithRetry(url, {
      headers: {
        accept: 'application/json',
        'x-api-key': this.neynarApiKey!,
      },
    });

    if (!response.ok) {
      throw new Error(`Neynar search returned status ${response.status}`);
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
  }

  // ---------------------------------------------------------------------------
  // Private helpers — user details
  // ---------------------------------------------------------------------------

  private async getAuthorDetailsNeynar(
    username: string,
  ): Promise<Partial<SourceNode>> {
    const url = `https://api.neynar.com/v2/farcaster/user/by_username?username=${encodeURIComponent(username)}`;

    const response = await this.fetchWithRetry(url, {
      headers: {
        accept: 'application/json',
        'x-api-key': this.neynarApiKey!,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Neynar user lookup returned status ${response.status}`,
      );
    }

    const data = (await response.json()) as NeynarUserResponse;
    const user = data.user;

    return {
      id: String(user.fid),
      name: user.display_name || user.username,
      platform: this.platform,
      url: `https://warpcast.com/${user.username}`,
      description: user.profile?.bio?.text ?? '',
      credibilityScore: this.calculateCredibilityScoreFromNeynar(user),
      verificationStatus:
        user.verifications.length > 0 ? 'verified' : 'unverified',
      metadata: {
        fid: user.fid,
        followersCount: user.follower_count,
        followingCount: user.following_count,
        avatar: user.pfp_url,
        activeStatus: user.active_status,
      },
    } as Partial<SourceNode>;
  }

  private async getAuthorDetailsFromSearch(
    username: string,
  ): Promise<Partial<SourceNode>> {
    // Search for recent casts by this user to extract basic info
    const url = `https://searchcaster.xyz/api/search?text=from:${encodeURIComponent(username)}&count=1`;

    try {
      const response = await this.fetchWithRetry(url);
      if (!response.ok) {
        throw new Error(`Searchcaster returned status ${response.status}`);
      }

      const data = (await response.json()) as { casts: SearchcasterCast[] };
      const cast = data.casts?.[0];

      if (!cast) {
        return {
          id: username,
          name: username,
          platform: this.platform,
          url: `https://warpcast.com/${username}`,
        } as Partial<SourceNode>;
      }

      return {
        id: username,
        name: cast.meta.displayName || cast.body.username,
        platform: this.platform,
        url: `https://warpcast.com/${cast.body.username}`,
        credibilityScore: 0.3, // Default for unverified Searchcaster data
        verificationStatus: cast.meta.isVerifiedAvatar
          ? 'verified'
          : 'unverified',
        metadata: {
          avatar: cast.meta.avatar,
        },
      } as Partial<SourceNode>;
    } catch (error) {
      this.logger.error(
        'Error fetching Farcaster author details:',
        error,
      );
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers — user timeline
  // ---------------------------------------------------------------------------

  private async getUserTimelineNeynar(
    username: string,
    limit: number,
  ): Promise<SocialMediaPost[]> {
    // First resolve username to FID
    const userUrl = `https://api.neynar.com/v2/farcaster/user/by_username?username=${encodeURIComponent(username)}`;
    const userResponse = await this.fetchWithRetry(userUrl, {
      headers: {
        accept: 'application/json',
        'x-api-key': this.neynarApiKey!,
      },
    });

    if (!userResponse.ok) {
      this.logger.debug(
        `Neynar user lookup failed for @${username}: status ${userResponse.status}`,
      );
      return [];
    }

    const userData = (await userResponse.json()) as NeynarUserResponse;
    const fid = userData.user.fid;

    // Then fetch their casts
    const neynarLimit = Math.min(limit, 50);
    const feedUrl = `https://api.neynar.com/v2/farcaster/feed/user/${fid}/casts?limit=${neynarLimit}`;
    const feedResponse = await this.fetchWithRetry(feedUrl, {
      headers: {
        accept: 'application/json',
        'x-api-key': this.neynarApiKey!,
      },
    });

    if (!feedResponse.ok) {
      this.logger.debug(
        `Neynar feed failed for FID ${fid}: status ${feedResponse.status}`,
      );
      return [];
    }

    const feedData = (await feedResponse.json()) as NeynarFeedResponse;
    return (feedData.casts ?? [])
      .slice(0, limit)
      .map((c) => this.transformNeynarCast(c));
  }

  private async getUserTimelineSearchcaster(
    username: string,
    limit: number,
  ): Promise<SocialMediaPost[]> {
    const count = Math.min(limit, 100);
    const url = `https://searchcaster.xyz/api/search?text=from:${encodeURIComponent(username)}&count=${count}`;

    try {
      const response = await this.fetchWithRetry(url);
      if (!response.ok) {
        this.logger.debug(
          `Searchcaster timeline failed for @${username}: status ${response.status}`,
        );
        return [];
      }

      const data = (await response.json()) as { casts: SearchcasterCast[] };
      return (data.casts ?? [])
        .slice(0, limit)
        .map((c) => this.transformSearchcasterCast(c));
    } catch (error) {
      this.logger.debug(`Timeline fetch failed for @${username}:`, error);
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers — transform
  // ---------------------------------------------------------------------------

  private transformSearchcasterCast(cast: SearchcasterCast): SocialMediaPost {
    const username = cast.body.username ?? 'unknown';
    const reactions = cast.meta.reactions?.count ?? 0;
    const recasts = cast.meta.recasts?.count ?? 0;
    const replies = cast.meta.numReplyChildren ?? 0;

    return {
      id: cast.merkleRoot,
      text: cast.body.data.text ?? '',
      platform: this.platform,
      authorId: username,
      authorName: cast.meta.displayName || username,
      authorHandle: username,
      url: `https://warpcast.com/${username}/${cast.merkleRoot.slice(0, 10)}`,
      timestamp: new Date(cast.body.publishedAt),
      engagementMetrics: {
        likes: reactions,
        shares: recasts,
        comments: replies,
        reach: 0,
        viralityScore: this.calculateViralityScore(reactions, recasts, replies),
      },
    };
  }

  private transformNeynarCast(cast: NeynarCast): SocialMediaPost {
    const author = cast.author ?? {};
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

  private calculateViralityScore(
    likes: number,
    recasts: number,
    replies: number,
  ): number {
    const total = likes + recasts + replies;
    if (total === 0) return 0;
    return Math.min(Math.log10(total + 1) / 4, 1);
  }

  private calculateCredibilityScoreFromNeynar(
    user: NeynarCast['author'],
  ): number {
    const followers = user.follower_count ?? 0;
    let score = 0.1;
    if (user.verifications.length > 0) score += 0.3;
    if (followers > 1000000) score += 0.4;
    else if (followers > 100000) score += 0.3;
    else if (followers > 10000) score += 0.2;
    else if (followers > 1000) score += 0.1;
    return Math.min(score, 1.0);
  }

  /**
   * Fetch with a timeout (AbortController).
   */
  private async fetchWithTimeout(
    url: string,
    init?: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.fetchTimeout);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Fetch with timeout and retry.
   */
  private async fetchWithRetry(
    url: string,
    init?: RequestInit,
  ): Promise<Response> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, init);
        // Retry on 5xx
        if (response.status >= 500 && attempt < this.maxRetries) {
          this.logger.debug(
            `Farcaster fetch returned ${response.status}, retrying (${attempt + 1}/${this.maxRetries})`,
          );
          await this.delay(1000 * (attempt + 1));
          continue;
        }
        return response;
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.maxRetries) {
          this.logger.debug(
            `Farcaster fetch failed, retrying (${attempt + 1}/${this.maxRetries}): ${lastError.message}`,
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
