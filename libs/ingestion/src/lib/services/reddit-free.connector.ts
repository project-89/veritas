import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';
import { NarrativeInsight } from '../../types/narrative-insight.interface';
import { SocialMediaPost } from '../../types/social-media.types';
import { TransformOnIngestConnector } from '../interfaces/transform-on-ingest-connector.interface';
import { SourceNode } from '../schemas';
import {
  buildClaimQueryPlan,
  extractSignificantQueryTerms,
  looksLikeClaimQuery,
  normalizeSearchMode,
  normalizeSearchText,
  type SearchMode,
} from '../utils/query-intent.util';
import { TransformOnIngestService } from './transform/transform-on-ingest.service';
import { SourceRateLimiter } from './utils/source-rate-limiter';

interface SearchOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  searchMode?: SearchMode;
}

interface RedditJsonPost {
  id: string;
  name: string;
  title: string;
  selftext: string;
  author: string;
  created_utc: number;
  subreddit: string;
  score: number;
  upvote_ratio: number;
  num_comments: number;
  url: string;
  permalink: string;
  is_self: boolean;
  is_video: boolean;
  over_18: boolean;
  spoiler: boolean;
  stickied: boolean;
}

interface RedditJsonResponse {
  data: {
    children: Array<{ kind: string; data: RedditJsonPost }>;
    after: string | null;
    before: string | null;
  };
}

function extractRedditListing(response: unknown): RedditJsonResponse['data'] | null {
  if (!response || typeof response !== 'object') return null;

  const direct = (response as { data?: unknown }).data;
  if (
    direct &&
    typeof direct === 'object' &&
    Array.isArray((direct as { children?: unknown }).children)
  ) {
    return direct as RedditJsonResponse['data'];
  }

  const nested = (direct as { data?: unknown } | undefined)?.data;
  if (
    nested &&
    typeof nested === 'object' &&
    Array.isArray((nested as { children?: unknown }).children)
  ) {
    return nested as RedditJsonResponse['data'];
  }

  return null;
}

/**
 * API-free Reddit connector using Reddit's public JSON API.
 * No API keys required — just a descriptive User-Agent header.
 * Rate limited to ~30 requests/minute.
 */
@Injectable()
export class RedditFreeConnector
  implements TransformOnIngestConnector, OnModuleInit, OnModuleDestroy
{
  platform = 'reddit' as const;
  private client: AxiosInstance;
  private streamConnections: Map<string, NodeJS.Timeout> = new Map();
  private readonly pollingInterval = 60000; // 1 minute
  private readonly logger = new Logger(RedditFreeConnector.name);

  constructor(
    private configService: ConfigService,
    private transformService: TransformOnIngestService,
  ) {
    const userAgent =
      this.configService.get<string>('REDDIT_USER_AGENT') || 'Veritas/1.0.0 (API-free connector)';

    this.client = axios.create({
      baseURL: 'https://www.reddit.com',
      headers: {
        'User-Agent': userAgent,
        Accept: 'application/json',
      },
      timeout: 15000,
    });
  }

  async onModuleInit() {
    await this.validateCredentials();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  async connect(): Promise<void> {
    // No-op for API-free connector; verify reachability
    try {
      await this.rateLimitedRequest('/r/test.json?limit=1');
      this.logger.log('Reddit public JSON API is reachable');
    } catch {
      this.logger.warn(
        'Reddit public JSON API may not be reachable, but connector will still attempt requests',
      );
    }
  }

  async disconnect(): Promise<void> {
    this.streamConnections.forEach((interval) => {
      clearInterval(interval);
    });
    this.streamConnections.clear();
  }

  async searchContent(query: string, options?: SearchOptions): Promise<SocialMediaPost[]> {
    try {
      const limit = options?.limit || 100;
      const timeFilter = this.getTimeFilter(options?.startDate, options?.endDate);
      const searchMode = normalizeSearchMode(
        options?.searchMode ?? (looksLikeClaimQuery(query) ? 'claim' : 'topic'),
      );
      const claimPlan = searchMode === 'claim' ? buildClaimQueryPlan(query) : null;
      const effectiveQuery =
        claimPlan?.compactQuery && claimPlan.compactQuery.length > 0
          ? claimPlan.compactQuery
          : query;

      const allPosts: RedditJsonPost[] = [];
      let after: string | null = null;
      const maxPages = Math.ceil(limit / 100);

      for (let page = 0; page < maxPages; page++) {
        const params = new URLSearchParams({
          q: effectiveQuery,
          sort: 'new',
          limit: String(Math.min(100, limit - allPosts.length)),
          t: timeFilter,
          raw_json: '1',
        });

        if (after) {
          params.set('after', after);
        }

        const response = await this.rateLimitedRequest<RedditJsonResponse>(
          `/search.json?${params.toString()}`,
        );

        const listing = extractRedditListing(response);
        if (!listing) {
          this.logger.debug(
            `Reddit search returned unexpected payload shape for query "${query}" on page ${page + 1}`,
          );
          break;
        }

        const children = listing.children;
        if (!children || children.length === 0) break;

        allPosts.push(...children.map((child) => child.data));
        after = listing.after;

        if (!after || allPosts.length >= limit) break;
      }

      let filteredPosts = allPosts;

      if (options?.startDate || options?.endDate) {
        const start = options.startDate?.getTime() ?? 0;
        const end = options.endDate?.getTime() ?? Date.now();
        filteredPosts = filteredPosts.filter((post) => {
          const timestamp = post.created_utc * 1000;
          return timestamp >= start && timestamp <= end;
        });
      }

      filteredPosts = filteredPosts.filter((post) =>
        this.postMatchesQuery(post, query, searchMode),
      );

      return this.transformPostsToSocialMediaPosts(filteredPosts.slice(0, limit));
    } catch (error) {
      this.logger.error('Error searching Reddit content:', error);
      throw error;
    }
  }

  async searchAndTransform(query: string, options?: SearchOptions): Promise<NarrativeInsight[]> {
    try {
      this.logger.log(`Searching Reddit (API-free) for: ${query}`);

      const socialMediaPosts = await this.searchContent(query, options);

      const insights = await this.transformService.transformBatch(socialMediaPosts);

      this.logger.log(`Transformed ${insights.length} Reddit posts into anonymized insights`);

      return insights;
    } catch (error) {
      this.logger.error('Error searching Reddit content:', error);
      throw error;
    }
  }

  /**
   * Search and return both raw posts AND transformed insights.
   * This preserves the original post data for the frontend dashboard.
   */
  async searchWithRawData(
    query: string,
    options?: SearchOptions,
  ): Promise<{ posts: SocialMediaPost[]; insights: NarrativeInsight[] }> {
    try {
      this.logger.log(`Searching Reddit (with raw data) for: ${query}`);

      const posts = await this.searchContent(query, options);

      if (posts.length === 0) {
        return { posts: [], insights: [] };
      }

      const insights = await this.transformService.transformBatch(posts);

      this.logger.log(`Reddit: ${posts.length} posts, ${insights.length} insights`);

      return { posts, insights };
    } catch (error) {
      this.logger.error('Error in Reddit searchWithRawData:', error);
      throw error;
    }
  }

  streamContent(keywords: string[]): EventEmitter {
    const emitter = new EventEmitter();
    const streamId = Math.random().toString(36).substring(7);

    const interval = setInterval(async () => {
      try {
        const posts = await this.searchContent(keywords.join(' OR '), {
          startDate: new Date(Date.now() - 3600000), // Last hour
          limit: 100,
        });

        const filteredPosts = posts.filter((post) => this.postMatchesKeywords(post, keywords));

        for (const post of filteredPosts) {
          emitter.emit('data', post);
        }

        if (filteredPosts.length > 0) {
          this.logger.debug(`Emitted ${filteredPosts.length} posts from Reddit stream`);
        }
      } catch (error) {
        emitter.emit('error', error);
        this.logger.error('Error in Reddit stream:', error);
      }
    }, this.pollingInterval);
    interval.unref?.();

    this.streamConnections.set(streamId, interval);

    emitter.on('end', () => {
      clearInterval(interval);
      this.streamConnections.delete(streamId);
      this.logger.log(`Closed Reddit stream: ${streamId}`);
    });

    return emitter;
  }

  streamAndTransform(keywords: string[]): EventEmitter {
    const emitter = new EventEmitter();
    const streamId = Math.random().toString(36).substring(7);

    const interval = setInterval(async () => {
      try {
        const posts = await this.searchContent(keywords.join(' OR '), {
          startDate: new Date(Date.now() - 3600000),
          limit: 100,
        });

        const filteredPosts = posts.filter((post) => this.postMatchesKeywords(post, keywords));

        if (filteredPosts.length > 0) {
          const insights = await this.transformService.transformBatch(filteredPosts);

          for (const insight of insights) {
            emitter.emit('data', insight);
          }

          this.logger.debug(`Emitted ${insights.length} anonymized insights from Reddit stream`);
        }
      } catch (error) {
        emitter.emit('error', error);
        this.logger.error('Error in Reddit stream:', error);
      }
    }, this.pollingInterval);
    interval.unref?.();

    this.streamConnections.set(`transform-${streamId}`, interval);

    emitter.on('end', () => {
      clearInterval(interval);
      this.streamConnections.delete(`transform-${streamId}`);
      this.logger.log(`Closed transformed Reddit stream: ${streamId}`);
    });

    return emitter;
  }

  /**
   * Fetch a user's post history from Reddit.
   * Uses the public /user/{username}/submitted.json endpoint.
   */
  async getUserTimeline(
    username: string,
    options?: { limit?: number; before?: string },
  ): Promise<SocialMediaPost[]> {
    const limit = Math.min(options?.limit ?? 50, 100);
    const params = new URLSearchParams({
      limit: String(limit),
      sort: 'new',
      raw_json: '1',
    });
    if (options?.before) params.set('before', options.before);

    try {
      const response = await this.rateLimitedRequest<{
        data: {
          children: Array<{
            data: {
              id: string;
              title: string;
              selftext: string;
              author: string;
              subreddit: string;
              score: number;
              num_comments: number;
              upvote_ratio: number;
              created_utc: number;
              permalink: string;
            };
          }>;
        };
      }>(`/user/${encodeURIComponent(username)}/submitted.json?${params.toString()}`);

      const posts: SocialMediaPost[] = [];
      for (const child of response.data.children) {
        const d = child.data;
        posts.push({
          id: d.id,
          authorId: d.author,
          authorName: d.author,
          authorHandle: d.author,
          platform: this.platform,
          text: d.title + (d.selftext ? `\n${d.selftext}` : ''),
          timestamp: new Date(d.created_utc * 1000),
          url: `https://www.reddit.com${d.permalink}`,
          engagementMetrics: {
            likes: d.score,
            shares: 0,
            comments: d.num_comments,
            reach: Math.round(d.score / Math.max(d.upvote_ratio, 0.01)),
            viralityScore: d.upvote_ratio,
          },
        });
      }

      this.logger.debug(`Fetched ${posts.length} posts from u/${username}`);
      return posts;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.debug(`Timeline unavailable for u/${username}: ${msg}`);
      return [];
    }
  }

  async getAuthorDetails(authorId: string): Promise<Partial<SourceNode>> {
    try {
      const response = await this.rateLimitedRequest<{
        data: {
          id: string;
          name: string;
          link_karma: number;
          comment_karma: number;
          created: number;
          has_verified_email: boolean;
        };
      }>(`/user/${encodeURIComponent(authorId)}/about.json`);

      const userData = response.data;

      return {
        id: userData.id,
        name: userData.name || authorId,
        platform: this.platform,
        credibilityScore: this.calculateCredibilityScore(userData),
        verificationStatus: userData.has_verified_email ? 'verified' : 'unverified',
      } as Partial<SourceNode>;
    } catch (error) {
      this.logger.error('Error fetching Reddit author details:', error);
      throw error;
    }
  }

  async validateCredentials(): Promise<boolean> {
    try {
      await this.connect();
      this.logger.log('Reddit API-free connector validated successfully (no credentials needed)');
      return true;
    } catch (error) {
      this.logger.error('Reddit API-free connector validation failed:', error);
      return false;
    }
  }

  // --- Private helpers ---

  private async rateLimitedRequest<T>(path: string): Promise<T> {
    try {
      const response = await SourceRateLimiter.instance.schedule('reddit', () =>
        this.client.get<T>(path),
      );
      return response.data;
    } catch (error) {
      this.notifyIfRateLimited(error);
      throw error;
    }
  }

  /** Signal the shared limiter when Reddit responds with HTTP 429. */
  private notifyIfRateLimited(error: unknown): void {
    if (!error || typeof error !== 'object') return;
    const response = (
      error as { response?: { status?: unknown; headers?: Record<string, unknown> } }
    ).response;
    if (!response || response.status !== 429) return;

    const retryAfter = response.headers?.['retry-after'];
    SourceRateLimiter.instance.notifyRateLimited(
      'reddit',
      SourceRateLimiter.retryAfterMsFrom({
        get: () => (typeof retryAfter === 'string' ? retryAfter : null),
      }),
    );
  }

  private transformPostsToSocialMediaPosts(posts: RedditJsonPost[]): SocialMediaPost[] {
    return posts.map((post) => ({
      id: post.id,
      text: post.selftext || post.title,
      platform: this.platform,
      authorId: post.author,
      authorName: post.author,
      authorHandle: post.author,
      url: `https://reddit.com${post.permalink}`,
      timestamp: new Date(post.created_utc * 1000),
      engagementMetrics: {
        likes: Math.round(post.score * (post.upvote_ratio || 1)),
        shares: 0,
        comments: post.num_comments,
        reach: post.upvote_ratio > 0 ? Math.round(post.score / post.upvote_ratio) : post.score,
        viralityScore: this.calculateViralityScore(post),
      },
    }));
  }

  private calculateViralityScore(post: RedditJsonPost): number {
    return (post.upvote_ratio || 0.5) * 0.5 + Math.min(post.num_comments / 100, 0.5);
  }

  private calculateCredibilityScore(userData: {
    link_karma: number;
    comment_karma: number;
    created: number;
    has_verified_email: boolean;
  }): number {
    const totalKarma = userData.link_karma + userData.comment_karma;
    const karmaRatio = totalKarma > 0 ? userData.link_karma / totalKarma : 0.5;
    const accountAgeYears = (Date.now() / 1000 - userData.created) / (60 * 60 * 24 * 365);
    const normalizedAge = Math.min(accountAgeYears / 5, 1);
    const verifiedBonus = userData.has_verified_email ? 0.1 : 0;
    const karmaScore = Math.min(Math.log10(totalKarma + 1) / 4, 0.5);

    let score = karmaScore + normalizedAge * 0.3 + verifiedBonus;
    score += (1 - Math.abs(karmaRatio - 0.5) * 2) * 0.1;

    return Math.min(Math.max(score, 0), 1);
  }

  private postMatchesKeywords(post: SocialMediaPost, keywords: string[]): boolean {
    const text = post.text.toLowerCase();
    return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
  }

  private postMatchesQuery(post: RedditJsonPost, query: string, searchMode: SearchMode): boolean {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return true;

    const haystack = normalizeSearchText(
      [post.title, post.selftext, post.url, post.subreddit].filter(Boolean).join(' '),
    );

    if (!haystack) return false;
    if (haystack.includes(normalizedQuery)) return true;

    const terms = extractSignificantQueryTerms(query);
    if (terms.length <= 3 && searchMode !== 'claim') {
      return true;
    }

    const matchedTerms = terms.filter((term) => this.haystackIncludesTerm(haystack, term));
    if (searchMode === 'claim') {
      const plan = buildClaimQueryPlan(query);
      const matchedActors = plan.actorTerms.filter((term) =>
        this.haystackIncludesTerm(haystack, term),
      );
      const matchedEvidence = plan.evidenceTerms.filter((term) =>
        this.haystackIncludesTerm(haystack, term),
      );
      const matchedActions = plan.actionTerms.filter((term) =>
        this.haystackIncludesTerm(haystack, term),
      );
      const matchedAnchors = plan.anchorTerms.filter((term) =>
        this.haystackIncludesTerm(haystack, term),
      );

      const requiredActorMatches = Math.min(plan.actorTerms.length, 2);
      if (requiredActorMatches > 0 && matchedActors.length < requiredActorMatches) {
        return false;
      }
      if (plan.evidenceTerms.length > 0 && matchedEvidence.length === 0) {
        return false;
      }
      if (
        plan.actionTerms.length > 0 &&
        matchedActions.length === 0 &&
        matchedAnchors.length === 0
      ) {
        return false;
      }
      if (plan.anchorTerms.length > 0 && matchedAnchors.length === 0) {
        return false;
      }

      const claimMatchedTerms = plan.searchTerms.filter((term) =>
        this.haystackIncludesTerm(haystack, term),
      );
      const requiredMatches = Math.min(
        plan.searchTerms.length,
        Math.max(3, Math.ceil(plan.searchTerms.length * 0.75)),
      );
      return claimMatchedTerms.length >= requiredMatches;
    }

    const anchorTerms = terms.filter((term) => /\d/.test(term) || term.includes('-'));
    const matchedAnchors = anchorTerms.filter((term) => this.haystackIncludesTerm(haystack, term));

    if (anchorTerms.length > 0 && matchedAnchors.length === 0) {
      return false;
    }

    const requiredMatches = Math.min(4, Math.max(3, Math.ceil(terms.length / 2)));
    return matchedTerms.length >= requiredMatches;
  }

  private haystackIncludesTerm(haystack: string, term: string): boolean {
    if (haystack.includes(term)) return true;
    const collapsedHaystack = haystack.replace(/-/g, '');
    const collapsedTerm = term.replace(/-/g, '');
    return collapsedTerm.length > 0 && collapsedHaystack.includes(collapsedTerm);
  }

  private getTimeFilter(
    startDate?: Date,
    endDate?: Date,
  ): 'hour' | 'day' | 'week' | 'month' | 'year' | 'all' {
    void endDate;
    if (!startDate) return 'all';

    const now = new Date();
    const diffHours = (now.getTime() - startDate.getTime()) / (60 * 60 * 1000);

    // Reddit time filters: hour=1h, day=24h, week=7d, month=30d, year=365d
    if (diffHours <= 1) return 'hour';
    if (diffHours <= 24) return 'day';
    if (diffHours <= 24 * 7) return 'week';
    if (diffHours <= 24 * 30) return 'month';
    if (diffHours <= 24 * 365) return 'year';
    return 'all';
  }
}
