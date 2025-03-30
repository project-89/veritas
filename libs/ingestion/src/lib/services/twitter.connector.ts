import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  TwitterApi,
  TweetV2,
  UserV2,
  TwitterApiv2,
  Tweetv2TimelineResult,
} from 'twitter-api-v2';
import {
  SocialMediaConnector,
  SocialMediaPost,
} from '../interfaces/social-media-connector.interface';
import { TransformOnIngestConnector } from '../interfaces/transform-on-ingest-connector.interface';
import { SourceNode } from '@veritas/shared';
import { EventEmitter } from 'events';
import { TransformOnIngestService } from './transform/transform-on-ingest.service';
import { NarrativeInsight } from '../../types/narrative-insight.interface';

type TweetWithIncludes = TweetV2 & {
  includes?: {
    users?: Array<{
      name: string;
      username: string;
    }>;
  };
  user?: {
    id_str: string;
    name: string;
    screen_name: string;
    verified: boolean;
  };
  public_metrics?: {
    like_count?: number;
    retweet_count?: number;
    reply_count?: number;
    impression_count?: number;
  };
};

interface SearchOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

@Injectable()
export class TwitterConnector
  implements TransformOnIngestConnector, OnModuleInit, OnModuleDestroy
{
  platform = 'twitter' as const;
  private client: TwitterApi | null = null;
  private v2Client: TwitterApiv2 | null = null;
  private streamConnections: Map<string, any> = new Map();
  private pollingInterval = 60000; // 1 minute polling interval
  private interval: NodeJS.Timeout | null = null;
  private readonly logger = new Logger(TwitterConnector.name);

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
      this.client = new TwitterApi(
        this.configService.getOrThrow('TWITTER_BEARER_TOKEN')
      );
      this.v2Client = this.client.v2;
    } catch (error) {
      this.logger.error('Error connecting to Twitter:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.client = null;
    this.v2Client = null;

    this.streamConnections.forEach((connection) => {
      if (connection && typeof connection.close === 'function') {
        connection.close();
      }
    });
    this.streamConnections.clear();
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
      if (!this.v2Client) {
        throw new Error('Twitter client not initialized');
      }

      // Fetch tweets (kept in memory only)
      const rawTweets = await this.fetchRawTweets(query, options);

      // Transform to SocialMediaPost format (for backward compatibility)
      return this.transformTweetsToSocialMediaPosts(
        rawTweets.tweets,
        rawTweets.includes
      );
    } catch (error) {
      this.logger.error('Error searching Twitter content:', error);
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
    if (!this.v2Client) {
      await this.connect();
    }

    try {
      this.logger.log(`Searching Twitter for: ${query}`);

      // Fetch tweets (kept in memory only)
      const rawTweets = await this.fetchRawTweets(query, options);

      // Transform the raw tweets with user information into a format suitable for transformation
      const enrichedTweets = this.enrichTweetsWithUserData(
        rawTweets.tweets,
        rawTweets.includes
      );

      // Transform immediately - no raw storage
      const insights = await this.transformService.transformBatch(
        enrichedTweets
      );

      this.logger.log(
        `Transformed ${insights.length} Twitter tweets into anonymized insights`
      );

      // Return only anonymized insights
      return insights;
    } catch (error) {
      this.logger.error('Error searching Twitter content:', error);
      throw error;
    }
  }

  /**
   * Fetch raw tweets from Twitter (in-memory only, no storage)
   * Private method to keep raw data contained
   */
  private async fetchRawTweets(
    query: string,
    options?: SearchOptions
  ): Promise<{ tweets: TweetV2[]; includes: { users?: UserV2[] } }> {
    if (!this.v2Client) {
      throw new Error('Twitter client not initialized');
    }

    try {
      const response = await this.v2Client.search(query, {
        start_time: options?.startDate?.toISOString(),
        end_time: options?.endDate?.toISOString(),
        max_results: options?.limit || 100,
        'tweet.fields': ['created_at', 'public_metrics', 'author_id'],
        'user.fields': ['username', 'name', 'verified'],
        expansions: ['author_id'],
      });

      const tweets = response.data.data || [];
      const includes = response.data.includes || { users: [] };

      return { tweets, includes };
    } catch (error) {
      this.logger.error('Error fetching raw Twitter tweets:', error);
      throw error;
    }
  }

  /**
   * Enriches tweets with user data for more complete transformation
   */
  private enrichTweetsWithUserData(
    tweets: TweetV2[],
    includes: { users?: UserV2[] }
  ): any[] {
    if (!tweets || !Array.isArray(tweets)) {
      return [];
    }

    const userMap = new Map<string, UserV2>();
    if (includes?.users) {
      for (const user of includes.users) {
        userMap.set(user.id, user);
      }
    }

    return tweets.map((tweet) => {
      const user = tweet.author_id ? userMap.get(tweet.author_id) : undefined;
      return {
        ...tweet,
        user: user
          ? {
              id_str: user.id,
              name: user.name,
              screen_name: user.username,
              verified: user.verified,
            }
          : undefined,
      };
    });
  }

  async getAuthorDetails(authorId: string): Promise<Partial<SourceNode>> {
    try {
      if (!this.v2Client) {
        throw new Error('Twitter client not initialized');
      }

      const response = await this.v2Client.user(authorId, {
        'user.fields': ['username', 'name', 'verified', 'public_metrics'],
      });

      const user = response.data;
      if (!user || !user.id) {
        throw new Error(`User ${authorId} not found`);
      }

      return {
        id: user.id,
        name: user.name,
        platform: this.platform,
        credibilityScore: this.calculateCredibilityScore(user),
        verificationStatus: user.verified ? 'verified' : 'unverified',
      } as Partial<SourceNode>;
    } catch (error) {
      this.logger.error('Error fetching Twitter author details:', error);
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
        if (!this.v2Client) {
          throw new Error('Twitter client not initialized');
        }

        // Fetch tweets (kept in memory only)
        const rawTweets = await this.fetchRawTweets(keywords.join(' OR '), {
          startDate: new Date(Date.now() - 3600000), // Last hour
          limit: 100,
        });

        const posts = this.transformTweetsToSocialMediaPosts(
          rawTweets.tweets,
          rawTweets.includes
        );

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
            `Emitted ${filteredPosts.length} posts from Twitter stream`
          );
        }
      } catch (error) {
        emitter.emit('error', error);
        this.logger.error('Error in Twitter stream:', error);
      }
    }, this.pollingInterval);

    this.streamConnections.set(streamId, interval);
    this.interval = interval;

    // Clean up on end event
    emitter.on('end', () => {
      clearInterval(interval);
      this.streamConnections.delete(streamId);
      this.logger.log(`Closed Twitter stream: ${streamId}`);
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
        if (!this.v2Client) {
          throw new Error('Twitter client not initialized');
        }

        // Fetch tweets (kept in memory only)
        const rawTweets = await this.fetchRawTweets(keywords.join(' OR '), {
          startDate: new Date(Date.now() - 3600000), // Last hour
          limit: 100,
        });

        // Transform the raw tweets with user information into a format suitable for transformation
        const enrichedTweets = this.enrichTweetsWithUserData(
          rawTweets.tweets,
          rawTweets.includes
        );

        // Filter posts that match keywords
        const filteredTweets = enrichedTweets.filter((tweet: any) =>
          this.postMatchesKeywords(
            this.transformTweetToSocialMediaPost(tweet),
            keywords
          )
        );

        if (filteredTweets.length > 0) {
          // Transform immediately using transform-on-ingest
          const insights = await this.transformService.transformBatch(
            filteredTweets
          );

          // Emit anonymized insights only
          for (const insight of insights) {
            emitter.emit('data', insight);
          }

          this.logger.debug(
            `Emitted ${insights.length} anonymized insights from Twitter stream`
          );
        }
      } catch (error) {
        emitter.emit('error', error);
        this.logger.error('Error in Twitter stream:', error);
      }
    }, this.pollingInterval);

    this.streamConnections.set(streamId, interval);
    this.interval = interval;

    // Clean up on end event
    emitter.on('end', () => {
      clearInterval(interval);
      this.streamConnections.delete(streamId);
      this.logger.log(`Closed Twitter stream: ${streamId}`);
    });

    return emitter;
  }

  async validateCredentials(): Promise<boolean> {
    try {
      await this.connect();
      const response = await this.v2Client?.me();

      if (!response || !response.data || !response.data.id) {
        this.logger.error('Twitter validation failed: Invalid credentials');
        return false;
      }

      this.logger.log(
        `Twitter credentials validated successfully for user: ${response.data.username}`
      );
      return true;
    } catch (error) {
      this.logger.error('Error validating Twitter credentials:', error);
      return false;
    }
  }

  private transformTweetsToSocialMediaPosts(
    tweets: TweetV2[],
    includes?: { users?: UserV2[] }
  ): SocialMediaPost[] {
    if (!tweets || !Array.isArray(tweets)) {
      return [];
    }

    const userMap = new Map<string, UserV2>();
    if (includes?.users) {
      for (const user of includes.users) {
        userMap.set(user.id, user);
      }
    }

    return tweets.map((tweet) => {
      const tweetWithUser: TweetWithIncludes = { ...tweet };
      if (tweet.author_id && userMap.has(tweet.author_id)) {
        const user = userMap.get(tweet.author_id)!;
        tweetWithUser.includes = {
          users: [
            {
              name: user.name,
              username: user.username,
            },
          ],
        };
      }
      return this.transformTweetToSocialMediaPost(tweetWithUser);
    });
  }

  private transformTweetToSocialMediaPost(
    tweet: TweetWithIncludes
  ): SocialMediaPost {
    const metrics = tweet.public_metrics || {};

    return {
      id: tweet.id,
      text: tweet.text,
      timestamp: tweet.created_at ? new Date(tweet.created_at) : new Date(),
      platform: this.platform,
      authorId: tweet.author_id || '',
      authorName: tweet.user ? tweet.user.name : undefined,
      authorHandle: tweet.user ? tweet.user.screen_name : undefined,
      url: `https://twitter.com/i/web/status/${tweet.id}`,
      engagementMetrics: {
        likes: Number(metrics.like_count) || 0,
        shares: Number(metrics.retweet_count) || 0,
        comments: Number(metrics.reply_count) || 0,
        reach: Number(metrics.impression_count) || 0,
        viralityScore: this.calculateViralityScore(metrics),
      },
    };
  }

  private calculateViralityScore(metrics: any): number {
    const likes = metrics.like_count || 0;
    const retweets = metrics.retweet_count || 0;
    const replies = metrics.reply_count || 0;
    const impressions = metrics.impression_count || 0;

    if (impressions > 0) {
      return (likes + retweets * 2 + replies) / impressions;
    }
    return 0;
  }

  private calculateCredibilityScore(user: any): number {
    // Simple credibility calculation based on verified status and other metrics
    let score = 0.5; // Base score

    if (user.verified) {
      score += 0.3; // Verified accounts get a boost
    }

    // Add more sophisticated credibility scoring logic here as needed

    return Math.min(1.0, score); // Ensure score is between 0 and 1
  }

  private postMatchesKeywords(
    post: SocialMediaPost,
    keywords: string[]
  ): boolean {
    const text = post.text.toLowerCase();
    return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
  }
}
