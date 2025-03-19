import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
import Snoowrap, { Submission, RedditUser } from 'snoowrap';
import {
  SocialMediaConnector,
  SocialMediaPost,
} from '../interfaces/social-media-connector.interface';
import { TransformOnIngestConnector } from '../interfaces/transform-on-ingest-connector.interface';
import { SourceNode } from '@veritas/shared';
import { TransformOnIngestService } from './transform/transform-on-ingest.service';
import { NarrativeInsight } from '../../types/narrative-insight.interface';

interface SearchOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

@Injectable()
export class RedditConnector
  implements TransformOnIngestConnector, OnModuleInit, OnModuleDestroy
{
  platform = 'reddit' as const;
  private client: Snoowrap | null = null;
  private streamConnections: Map<string, NodeJS.Timeout> = new Map();
  private readonly pollingInterval = 60000; // 1 minute
  private interval: NodeJS.Timeout | null = null;
  private readonly logger = new Logger(RedditConnector.name);

  constructor(
    private configService: ConfigService,
    private transformService: TransformOnIngestService
  ) {}

  async onModuleInit() {
    await this.validateCredentials();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  async connect(): Promise<void> {
    try {
      this.client = new Snoowrap({
        userAgent: 'Veritas/1.0.0',
        clientId: this.configService.getOrThrow('REDDIT_CLIENT_ID'),
        clientSecret: this.configService.getOrThrow('REDDIT_CLIENT_SECRET'),
        username: this.configService.get('REDDIT_USERNAME'),
        password: this.configService.get('REDDIT_PASSWORD'),
      });

      // Verify connection by making a test call
      await this.client.getMe();
    } catch (error) {
      this.client = null;
      this.logger.error('Error connecting to Reddit:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.streamConnections.forEach((interval) => {
      clearInterval(interval);
    });
    this.streamConnections.clear();

    this.client = null;
  }

  /**
   * Original searchContent method for backward compatibility
   * Implements SocialMediaConnector interface
   */
  async searchContent(
    query: string,
    options?: SearchOptions
  ): Promise<SocialMediaPost[]> {
    try {
      if (!this.client) {
        throw new Error('Reddit client not initialized');
      }

      // Fetch posts (kept in memory only)
      const rawPosts = await this.fetchRawPosts(query, options);

      // Transform to SocialMediaPost format (for backward compatibility)
      return this.transformPostsToSocialMediaPosts(rawPosts);
    } catch (error) {
      this.logger.error('Error searching Reddit content:', error);
      throw error;
    }
  }

  /**
   * Enhanced searchAndTransform method that returns anonymized insights
   * Implements TransformOnIngestConnector interface
   */
  async searchAndTransform(
    query: string,
    options?: SearchOptions
  ): Promise<NarrativeInsight[]> {
    if (!this.client) {
      throw new Error('Reddit client not initialized');
    }

    try {
      this.logger.log(`Searching Reddit for: ${query}`);

      // Fetch posts (kept in memory only)
      const rawPosts = await this.fetchRawPosts(query, options);

      // Transform immediately - no raw storage
      const insights = await this.transformService.transform(
        rawPosts,
        this.platform
      );

      this.logger.log(
        `Transformed ${insights.length} Reddit posts into anonymized insights`
      );

      // Return only anonymized insights
      return insights;
    } catch (error) {
      this.logger.error('Error searching Reddit content:', error);
      throw error;
    }
  }

  /**
   * Fetch raw posts from Reddit (in-memory only, no storage)
   * Private method to keep raw data contained
   */
  private async fetchRawPosts(
    query: string,
    options?: SearchOptions
  ): Promise<Submission[]> {
    if (!this.client) {
      throw new Error('Reddit client not initialized');
    }

    try {
      // Reddit's API returns Submission objects that are fully populated
      const posts = await this.client.search({
        query,
        sort: 'new',
        limit: options?.limit || 100,
        time: this.getTimeFilter(options?.startDate, options?.endDate),
      });

      // Enrich the submissions with additional data for transformation
      const enrichedPosts = await this.enrichSubmissions(posts);

      return enrichedPosts;
    } catch (error) {
      this.logger.error('Error fetching raw Reddit posts:', error);
      throw error;
    }
  }

  /**
   * Enrich Reddit submissions with additional data for better transformation
   */
  private async enrichSubmissions(submissions: Submission[]): Promise<any[]> {
    // For Reddit, the Submission objects already contain most of the data we need
    // Here we map them to a format that's more suitable for our transform service
    return submissions.map((post) => ({
      id: post.id,
      title: post.title,
      selftext: post.selftext,
      author: post.author.name,
      created_utc: post.created_utc,
      subreddit: post.subreddit.display_name,
      score: post.score,
      upvote_ratio: post.upvote_ratio,
      num_comments: post.num_comments,
      url: post.url,
      permalink: post.permalink,
      is_self: post.is_self,
      is_video: post.is_video,
      over_18: post.over_18,
      spoiler: post.spoiler,
      stickied: post.stickied,
    }));
  }

  async getAuthorDetails(authorId: string): Promise<Partial<SourceNode>> {
    try {
      if (!this.client) {
        throw new Error('Reddit client not initialized');
      }

      const userData = await this.client.getUser(authorId).fetch();

      return {
        id: userData.id,
        name: userData.name,
        platform: this.platform,
        credibilityScore: this.calculateCredibilityScore(userData),
        verificationStatus: userData.has_verified_email
          ? 'verified'
          : 'unverified',
      } as Partial<SourceNode>;
    } catch (error) {
      this.logger.error('Error fetching Reddit author details:', error);
      throw error;
    }
  }

  /**
   * Original streamContent method for backward compatibility
   * Implements SocialMediaConnector interface
   */
  streamContent(keywords: string[]): EventEmitter {
    const emitter = new EventEmitter();
    const streamId = Math.random().toString(36).substring(7);

    const interval = setInterval(async () => {
      try {
        if (!this.client) {
          throw new Error('Reddit client not initialized');
        }

        // Fetch posts (kept in memory only)
        const rawPosts = await this.fetchRawPosts(keywords.join(' OR '), {
          startDate: new Date(Date.now() - 3600000), // Last hour
          limit: 100,
        });

        const posts = this.transformPostsToSocialMediaPosts(rawPosts);

        // Filter posts that match keywords
        const filteredPosts = posts.filter((post) =>
          this.postMatchesKeywords(post, keywords)
        );

        if (filteredPosts.length > 0) {
          // Emit posts
          for (const post of filteredPosts) {
            emitter.emit('data', post);
          }

          this.logger.debug(
            `Emitted ${filteredPosts.length} posts from Reddit stream`
          );
        }
      } catch (error) {
        emitter.emit('error', error);
        this.logger.error('Error in Reddit stream:', error);
      }
    }, this.pollingInterval);

    this.streamConnections.set(streamId, interval);
    this.interval = interval;

    // Clean up on end event
    emitter.on('end', () => {
      clearInterval(interval);
      this.streamConnections.delete(streamId);
      this.logger.log(`Closed Reddit stream: ${streamId}`);
    });

    return emitter;
  }

  /**
   * Enhanced streamAndTransform method that streams anonymized insights
   * Implements TransformOnIngestConnector interface
   */
  streamAndTransform(keywords: string[]): EventEmitter {
    const emitter = new EventEmitter();
    const streamId = Math.random().toString(36).substring(7);

    const interval = setInterval(async () => {
      try {
        if (!this.client) {
          throw new Error('Reddit client not initialized');
        }

        // Fetch posts (kept in memory only)
        const rawPosts = await this.fetchRawPosts(keywords.join(' OR '), {
          startDate: new Date(Date.now() - 3600000), // Last hour
          limit: 100,
        });

        if (rawPosts.length > 0) {
          // Transform immediately - no raw storage
          const insights = await this.transformService.transform(
            rawPosts,
            this.platform
          );

          // Emit only anonymized insights
          for (const insight of insights) {
            emitter.emit('data', insight);
          }

          this.logger.debug(
            `Emitted ${insights.length} anonymized insights from Reddit stream`
          );
        }
      } catch (error) {
        emitter.emit('error', error);
        this.logger.error('Error in Reddit stream:', error);
      }
    }, this.pollingInterval);

    this.streamConnections.set(`transform-${streamId}`, interval);

    // Clean up on end event
    emitter.on('end', () => {
      clearInterval(interval);
      this.streamConnections.delete(`transform-${streamId}`);
      this.logger.log(`Closed transformed Reddit stream: ${streamId}`);
    });

    return emitter;
  }

  async validateCredentials(): Promise<boolean> {
    try {
      await this.connect();

      if (!this.client) {
        this.logger.error(
          'Reddit validation failed: Client initialization failed'
        );
        return false;
      }

      const me = await this.client.getMe();

      if (!me || !me.name) {
        this.logger.error(
          'Reddit validation failed: Could not retrieve user info'
        );
        return false;
      }

      this.logger.log(
        `Reddit credentials validated successfully for user: ${me.name}`
      );
      return true;
    } catch (error) {
      this.logger.error('Error validating Reddit credentials:', error);
      return false;
    }
  }

  private transformPostsToSocialMediaPosts(
    posts: Submission[]
  ): SocialMediaPost[] {
    return posts.map((post) => ({
      id: post.id,
      text: post.selftext || post.title,
      platform: this.platform,
      authorId: post.author.name,
      authorName: post.author.name,
      url: `https://reddit.com${post.permalink}`,
      timestamp: new Date(post.created_utc * 1000),
      engagementMetrics: {
        likes: Math.round(post.score * post.upvote_ratio),
        shares: 0, // Reddit doesn't provide share counts
        comments: post.num_comments,
        reach: post.score / post.upvote_ratio, // Estimate total views based on score and ratio
        viralityScore: this.calculateViralityScore(post),
      },
    }));
  }

  private calculateViralityScore(post: Submission): number {
    // Simple virality score based on upvote ratio and comment count
    // Higher ratio and more comments = more viral
    return post.upvote_ratio * 0.5 + Math.min(post.num_comments / 100, 0.5);
  }

  private postMatchesKeywords(
    post: SocialMediaPost,
    keywords: string[]
  ): boolean {
    const text = post.text.toLowerCase();
    return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
  }

  private calculateCredibilityScore(userData: RedditUser): number {
    // Calculate a credibility score (0-1) based on Reddit user metrics

    // Calculate karma ratio (positive value means more post karma than comment karma)
    const totalKarma = userData.link_karma + userData.comment_karma;
    const karmaRatio = totalKarma > 0 ? userData.link_karma / totalKarma : 0.5;

    // Account age in years
    const accountAgeYears =
      (Date.now() / 1000 - userData.created) / (60 * 60 * 24 * 365);

    // Normalize account age (max 5 years)
    const normalizedAge = Math.min(accountAgeYears / 5, 1);

    // Verified email bonus
    const verifiedBonus = userData.has_verified_email ? 0.1 : 0;

    // Base score depends on total karma (logarithmic scale)
    const karmaScore = Math.min(Math.log10(totalKarma + 1) / 4, 0.5);

    // Combine factors
    let score = karmaScore + normalizedAge * 0.3 + verifiedBonus;

    // Adjust based on karma ratio - balanced users (near 0.5) are more credible
    score += (1 - Math.abs(karmaRatio - 0.5) * 2) * 0.1;

    // Ensure score is in 0-1 range
    return Math.min(Math.max(score, 0), 1);
  }

  private getTimeFilter(
    startDate?: Date,
    endDate?: Date
  ): 'hour' | 'day' | 'week' | 'month' | 'year' | 'all' {
    if (!startDate) return 'all';

    const now = new Date();
    const diffHours = (now.getTime() - startDate.getTime()) / (60 * 60 * 1000);

    if (diffHours <= 24) return 'hour';
    if (diffHours <= 24 * 7) return 'day';
    if (diffHours <= 24 * 30) return 'week';
    if (diffHours <= 24 * 90) return 'month';
    if (diffHours <= 24 * 365) return 'year';
    return 'all';
  }
}
