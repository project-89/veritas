import { Profile, Scraper, SearchMode, Tweet } from '@haruhunab1320/twitter-scraper';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
import { SocialMediaPost } from '../../types/social-media.types';
import { SourceNode } from '../schemas';
import { matchesQuery } from '../utils/query-match.util';
import { BaseSocialMediaConnector } from './base-social-media.connector';
import { TransformOnIngestService } from './transform/transform-on-ingest.service';
import { SourceRateLimiter } from './utils/source-rate-limiter';

/**
 * API-free Twitter/X connector using @haruhunab1320/twitter-scraper.
 * Uses Twitter's internal API via a free account — no paid API key needed.
 *
 * Authentication options (configure via env vars):
 * - TWITTER_USERNAME + TWITTER_PASSWORD (+ optional TWITTER_EMAIL, TWITTER_2FA_SECRET)
 * - TWITTER_COOKIES (JSON array of cookie strings)
 */
@Injectable()
export class TwitterFreeConnector
  extends BaseSocialMediaConnector
  implements OnModuleInit, OnModuleDestroy
{
  override platform = 'twitter' as const;
  private scraper: Scraper;
  private readonly pollingInterval = 60000;

  constructor(
    protected override readonly configService: ConfigService,
    protected override readonly transformService: TransformOnIngestService,
  ) {
    super(configService, transformService);
    this.scraper = new Scraper();
  }

  async onModuleInit() {
    await this.validateCredentials();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  protected async connectToApi(): Promise<void> {
    // Try cookie-based auth first
    const cookiesJson = this.configService.get<string>('TWITTER_COOKIES');
    if (cookiesJson) {
      try {
        const cookies: string[] = JSON.parse(cookiesJson);
        await this.scraper.setCookies(cookies);
        if (await this.scraper.isLoggedIn()) {
          this.logger.log('Twitter scraper authenticated via cookies');
          return;
        }
      } catch (error: unknown) {
        this.logger.warn(
          `Failed to authenticate with cookies: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Fall back to username/password login
    const username = this.configService.get<string>('TWITTER_USERNAME');
    const password = this.configService.get<string>('TWITTER_PASSWORD');

    if (username && password) {
      const email = this.configService.get<string>('TWITTER_EMAIL');
      const twoFactorSecret = this.configService.get<string>('TWITTER_2FA_SECRET');
      await this.scraper.login(username, password, email, twoFactorSecret);
      this.logger.log(`Twitter scraper authenticated as @${username}`);
      return;
    }

    throw new Error(
      'Twitter connector requires authentication. Set either:\n' +
        '  - TWITTER_USERNAME + TWITTER_PASSWORD (free Twitter account)\n' +
        '  - TWITTER_COOKIES (JSON array of cookie strings from browser)',
    );
  }

  protected async disconnectFromApi(): Promise<void> {
    await this.scraper.logout();
  }

  protected async checkCredentialsValidity(): Promise<boolean> {
    try {
      return await this.scraper.isLoggedIn();
    } catch {
      return false;
    }
  }

  async searchContent(
    query: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      [key: string]: unknown;
    },
  ): Promise<SocialMediaPost[]> {
    if (!this.isConnected) {
      throw new Error(
        'Twitter search failed: connector is not authenticated. ' +
          'Set TWITTER_COOKIES or TWITTER_USERNAME + TWITTER_PASSWORD.',
      );
    }

    const limit = options?.limit || 50;
    const perQueryLimit = Math.ceil(limit / 3);

    try {
      const seenIds = new Set<string>();
      const allTweets: Tweet[] = [];
      const queryFailures: string[] = [];

      // Search multiple query variations to cast a wider net
      const baseQuery = query.replace(/^[@#]/, '');
      const withUnderscore = baseQuery.includes('_')
        ? baseQuery
        : baseQuery.replace(/(\d+)/, '_$1');
      const withoutUnderscore = baseQuery.replace(/_/g, '');
      const uniqueQueries = [
        ...new Set(
          [
            query, // exact as typed
            baseQuery, // stripped prefix
            `@${baseQuery}`, // as mention
            `#${baseQuery}`, // as hashtag
            withUnderscore !== baseQuery ? `@${withUnderscore}` : null, // @project_89
            withUnderscore !== baseQuery ? withUnderscore : null, // project_89
            withoutUnderscore !== baseQuery ? withoutUnderscore : null, // project89
            `"${baseQuery}"`, // exact phrase match
          ].filter(Boolean),
        ),
      ] as string[];

      this.logger.log(
        `Searching Twitter with ${uniqueQueries.length} query variations: ${uniqueQueries.join(', ')}`,
      );

      for (const q of uniqueQueries) {
        if (!q) {
          continue;
        }
        try {
          // The shared limiter paces query variations; one schedule() per
          // query since generator pulls can't be individually wrapped.
          await SourceRateLimiter.instance.schedule('twitter', async () => {
            const generator = this.scraper.searchTweets(q, perQueryLimit, SearchMode.Latest);
            for await (const tweet of generator) {
              if (tweet.id && !seenIds.has(tweet.id)) {
                seenIds.add(tweet.id);
                allTweets.push(tweet);
              }
              if (allTweets.length >= limit) break;
            }
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          queryFailures.push(message);
          this.logger.warn(`Twitter search query "${q}" failed: ${message}`);
        }
        if (allTweets.length >= limit) break;
      }

      // Also try to fetch the account timeline if the query looks like a username
      const usernameMatch = query.match(/^@?(\w+)$/);
      if (usernameMatch && allTweets.length < limit) {
        try {
          const username = usernameMatch[1];
          if (!username) {
            throw new Error('Username match missing capture group');
          }
          this.logger.log(`Also fetching timeline for @${username}`);
          await SourceRateLimiter.instance.schedule('twitter', async () => {
            let timelineCount = 0;
            for await (const tweet of this.scraper.getTweets(
              username,
              Math.min(30, limit - allTweets.length),
            )) {
              if (tweet.id && !seenIds.has(tweet.id)) {
                seenIds.add(tweet.id);
                allTweets.push(tweet);
              }
              if (++timelineCount >= 30 || allTweets.length >= limit) break;
            }
          });
        } catch {
          // Timeline fetch is best-effort
        }
      }

      // Total failure: every query variation errored and nothing was collected
      // (including the best-effort timeline fetch) — fail loudly instead of
      // reporting a misleading "0 results".
      if (allTweets.length === 0 && queryFailures.length === uniqueQueries.length) {
        throw new Error(
          `Twitter search failed: all ${uniqueQueries.length} query variations failed: ${queryFailures[0]}`,
        );
      }

      this.logger.log(
        `Found ${allTweets.length} unique tweets across ${uniqueQueries.length} queries`,
      );

      // Filter by date client-side
      let filtered = allTweets;
      if (options?.startDate) {
        const start = options.startDate.getTime();
        filtered = filtered.filter((t) => t.timeParsed && t.timeParsed.getTime() >= start);
      }
      if (options?.endDate) {
        const end = options.endDate.getTime();
        filtered = filtered.filter((t) => t.timeParsed && t.timeParsed.getTime() <= end);
      }

      return filtered.map((tweet) => this.transformTweetToSocialMediaPost(tweet));
    } catch (error: unknown) {
      this.logger.error(
        'Error searching Twitter:',
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  streamContent(keywords: string[]): EventEmitter {
    const emitter = new EventEmitter();
    const streamId = Math.random().toString(36).substring(7);

    const interval = setInterval(async () => {
      try {
        const posts = await this.searchContent(keywords.join(' OR '), {
          startDate: new Date(Date.now() - 3600000),
          limit: 100,
        });

        const filteredPosts = posts.filter((post) =>
          this.postMatchesKeywords(post, keywords.join(' ')),
        );

        for (const post of filteredPosts) {
          emitter.emit('data', post);
        }
      } catch (error) {
        emitter.emit('error', error);
        this.logger.error('Error in Twitter stream:', error);
      }
    }, this.pollingInterval);
    interval.unref?.();

    this.streamConnections.set(streamId, interval);

    const wrappedEmitter = Object.assign(emitter, {
      close: () => {
        clearInterval(interval);
        this.streamConnections.delete(streamId);
        emitter.removeAllListeners();
      },
    });

    return wrappedEmitter;
  }

  /**
   * Fetch a user's tweet timeline.
   */
  async getUserTimeline(
    username: string,
    options?: { limit?: number },
  ): Promise<SocialMediaPost[]> {
    const limit = options?.limit ?? 50;
    const posts: SocialMediaPost[] = [];

    try {
      const cleanUsername = username.replace(/^@/, '');
      await SourceRateLimiter.instance.schedule('twitter', async () => {
        const tweets = this.scraper.getTweets(cleanUsername, Math.min(limit, 200));

        for await (const tweet of tweets) {
          if (posts.length >= limit) break;
          if (!tweet.text) continue;

          posts.push({
            id: tweet.id ?? `tw-${Date.now()}-${posts.length}`,
            authorId: tweet.userId ?? cleanUsername,
            authorName: tweet.username ?? cleanUsername,
            authorHandle: tweet.username ?? cleanUsername,
            platform: this.platform,
            text: tweet.text,
            timestamp: tweet.timeParsed ?? new Date(),
            url: tweet.id ? `https://x.com/${cleanUsername}/status/${tweet.id}` : undefined,
            engagementMetrics: {
              likes: tweet.likes ?? 0,
              shares: tweet.retweets ?? 0,
              comments: tweet.replies ?? 0,
              reach: tweet.views ?? 0,
              viralityScore: 0,
            },
          });
        }
      });

      this.logger.debug(`Fetched ${posts.length} tweets from @${cleanUsername}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.debug(`Timeline unavailable for @${username}: ${msg}`);
    }

    return posts;
  }

  async getAuthorDetails(authorId: string): Promise<Partial<SourceNode>> {
    try {
      const profile = await SourceRateLimiter.instance.schedule('twitter', () =>
        this.scraper.getProfile(authorId),
      );
      const profileMedia = profile as Profile & {
        avatar?: string;
        banner?: string;
        profile_image_url_https?: string;
        profile_banner_url?: string;
      };

      return {
        id: profile.userId,
        name: profile.name || authorId,
        platform: this.platform,
        url: `https://twitter.com/${profile.username}`,
        description: profile.biography || '',
        credibilityScore: this.calculateCredibilityScore(profile),
        verificationStatus:
          profile.isVerified || profile.isBlueVerified ? 'verified' : 'unverified',
        metadata: {
          followersCount: profile.followersCount,
          followingCount: profile.followingCount,
          tweetsCount: profile.tweetsCount,
          isBlueVerified: profile.isBlueVerified,
          avatar: profileMedia.avatar ?? profileMedia.profile_image_url_https ?? null,
          banner: profileMedia.banner ?? profileMedia.profile_banner_url ?? null,
        },
      } as Partial<SourceNode>;
    } catch (error: unknown) {
      this.logger.error(
        'Error fetching Twitter author details:',
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  // --- Private helpers ---

  private transformTweetToSocialMediaPost(tweet: Tweet): SocialMediaPost {
    return {
      id: tweet.id || '',
      text: tweet.text || '',
      platform: this.platform,
      authorId: tweet.userId || '',
      authorName: tweet.name || '',
      authorHandle: tweet.username || '',
      url: tweet.permanentUrl || `https://twitter.com/${tweet.username}/status/${tweet.id}`,
      timestamp: tweet.timeParsed || new Date(),
      engagementMetrics: {
        likes: tweet.likes || 0,
        shares: tweet.retweets || 0,
        comments: tweet.replies || 0,
        reach: tweet.views || 0,
        viralityScore: this.calculateTweetViralityScore(tweet),
      },
    };
  }

  private calculateTweetViralityScore(tweet: Tweet): number {
    const views = tweet.views || 0;
    if (views === 0) return 0;

    const engagement = (tweet.likes || 0) + (tweet.retweets || 0) + (tweet.replies || 0);
    return Math.min((engagement / views) * 10, 1);
  }

  private calculateCredibilityScore(profile: Profile): number {
    const verificationScore = profile.isVerified ? 0.5 : profile.isBlueVerified ? 0.3 : 0.0;
    const followerScore = Math.min((profile.followersCount || 0) / 10000, 0.5);
    return verificationScore + followerScore;
  }

  private postMatchesKeywords(post: SocialMediaPost, query: string): boolean {
    if (!post.text || !query.trim()) return false;
    return matchesQuery(post.text, query);
  }
}
