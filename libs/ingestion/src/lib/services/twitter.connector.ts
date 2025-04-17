import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TwitterApi, TweetV2, UserV2, TwitterApiv2 } from 'twitter-api-v2';
import { SocialMediaPost } from '../../types/social-media.types';
import { SourceNode } from '../schemas';
import { EventEmitter } from 'events';
import { TransformOnIngestService } from './transform/transform-on-ingest.service';
import { NarrativeInsight } from '../../types/narrative-insight.interface';
import { TwitterUser } from '../../types/twitter-metrics.interface';
import { BaseSocialMediaConnector } from './base-social-media.connector';

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
};

interface SearchOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

@Injectable()
export class TwitterConnector
  extends BaseSocialMediaConnector
  implements OnModuleInit, OnModuleDestroy
{
  override platform = 'twitter' as const;
  private client: TwitterApi | null = null;
  private v2Client: TwitterApiv2 | null = null;

  constructor(
    protected override readonly configService: ConfigService,
    protected override readonly transformService: TransformOnIngestService
  ) {
    super(configService, transformService);
  }

  async onModuleInit() {
    await this.validateCredentials();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  protected async connectToApi(): Promise<void> {
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

  protected async disconnectFromApi(): Promise<void> {
    this.client = null;
    this.v2Client = null;
  }

  protected async checkCredentialsValidity(): Promise<boolean> {
    try {
      if (!this.v2Client) {
        await this.connect();
      }

      // Simple check to see if we can access the API
      const response = await this.v2Client?.userByUsername('twitter');
      return !!response?.data?.id;
    } catch (error) {
      this.logger.error('Invalid Twitter credentials:', error);
      return false;
    }
  }

  /**
   * Search for content on the platform
   */
  async searchContent(
    query: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      [key: string]: any;
    }
  ): Promise<SocialMediaPost[]> {
    if (!this.v2Client) {
      await this.connect();
    }

    try {
      // Fetch tweets
      const rawTweets = await this.fetchRawTweets(query, options);

      // Transform the raw tweets with user information
      const enrichedTweets = this.enrichTweetsWithUserData(
        rawTweets.tweets,
        rawTweets.includes
      );

      // Convert to social media posts
      return enrichedTweets.map((tweet) =>
        this.transformTweetToSocialMediaPost(tweet)
      );
    } catch (error) {
      this.logger.error('Error searching Twitter content:', error);
      throw error;
    }
  }

  /**
   * Stream content from the platform based on keywords
   */
  streamContent(keywords: string[]): EventEmitter {
    const emitter = new EventEmitter();
    const streamId = Math.random().toString(36).substring(7);

    const interval = setInterval(async () => {
      try {
        if (!this.v2Client) {
          await this.connect();
        }

        // Fetch tweets (kept in memory only)
        const rawTweets = await this.fetchRawTweets(keywords.join(' OR '), {
          startDate: new Date(Date.now() - 3600000), // Last hour
          limit: 100,
        });

        // Transform the raw tweets with user information
        const enrichedTweets = this.enrichTweetsWithUserData(
          rawTweets.tweets,
          rawTweets.includes
        );

        // Filter posts that match keywords
        const filteredTweets = enrichedTweets.filter((tweet) =>
          this.postMatchesKeywords(
            this.transformTweetToSocialMediaPost(tweet),
            keywords
          )
        );

        // Emit each filtered tweet
        for (const tweet of filteredTweets) {
          emitter.emit('data', this.transformTweetToSocialMediaPost(tweet));
        }
      } catch (error) {
        emitter.emit('error', error);
        this.logger.error('Error in Twitter stream:', error);
      }
    }, this.pollingInterval);

    // Keep track of the interval for cleanup
    this.streamConnections.set(streamId, interval);

    // Return the emitter with a close method for cleanup
    const originalEmitter = emitter;
    const wrappedEmitter = Object.assign(originalEmitter, {
      close: () => {
        clearInterval(interval);
        this.streamConnections.delete(streamId);
        originalEmitter.removeAllListeners();
      },
    });

    return wrappedEmitter;
  }

  async getAuthorDetails(authorId: string): Promise<Partial<SourceNode>> {
    try {
      if (!this.v2Client) {
        await this.connect();
      }

      const response = await this.v2Client?.user(authorId, {
        'user.fields': ['username', 'name', 'verified', 'public_metrics'],
      });

      const user = response?.data;
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
   * Fetch raw tweets from Twitter API
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
      const queryParams: any = {
        'tweet.fields': [
          'created_at',
          'public_metrics',
          'author_id',
          'entities',
          'context_annotations',
        ],
        'user.fields': ['username', 'name', 'verified', 'public_metrics'],
        expansions: ['author_id'],
        max_results: options?.limit || 100,
      };

      if (options?.startDate) {
        queryParams.start_time = options.startDate.toISOString();
      }

      if (options?.endDate) {
        queryParams.end_time = options.endDate.toISOString();
      }

      const response = await this.v2Client.search(query, queryParams);

      return {
        tweets: response.data?.data || [],
        includes: response.data?.includes || { users: [] },
      };
    } catch (error) {
      this.logger.error('Error fetching raw tweets:', error);
      throw error;
    }
  }

  /**
   * Enrich tweets with user data from includes
   */
  private enrichTweetsWithUserData(
    tweets: TweetV2[],
    includes: { users?: UserV2[] }
  ): TweetWithIncludes[] {
    if (!tweets || !includes?.users) {
      return tweets as TweetWithIncludes[];
    }

    return tweets.map((tweet) => {
      const authorId = tweet.author_id;
      if (!authorId) {
        return tweet as TweetWithIncludes;
      }

      const user = includes.users?.find((u) => u.id === authorId);
      if (!user) {
        return tweet as TweetWithIncludes;
      }

      return {
        ...tweet,
        includes: {
          users: [user],
        },
      } as TweetWithIncludes;
    });
  }

  /**
   * Transform a Twitter tweet to our standard SocialMediaPost format
   */
  private transformTweetToSocialMediaPost(
    tweet: TweetWithIncludes
  ): SocialMediaPost {
    const user = tweet.includes?.users?.[0] || tweet.user;
    const authorId = tweet.author_id || user?.id_str || 'unknown';
    const authorName = user?.name || 'Unknown User';
    const authorUsername = user?.username || user?.screen_name || 'unknown';
    const verified = user?.verified || false;

    // Extract engagement metrics
    const publicMetrics = (tweet as any).public_metrics || {};

    const timestamp = tweet.created_at
      ? new Date(tweet.created_at)
      : new Date();

    // Create a standardized social media post
    return {
      id: tweet.id,
      text: tweet.text,
      authorId,
      authorName,
      authorUsername,
      verified,
      platform: this.platform,
      timestamp,
      url: `https://twitter.com/${authorUsername}/status/${tweet.id}`,
      engagementMetrics: {
        likes: publicMetrics.like_count || 0,
        shares:
          (publicMetrics.retweet_count || 0) + (publicMetrics.quote_count || 0),
        comments: publicMetrics.reply_count || 0,
        reach: publicMetrics.impression_count || 0,
      },
      metadata: {
        tweetType: (tweet as any).type || 'unknown',
        replyTo: (tweet as any).in_reply_to_user_id || null,
        quotedTweet: (tweet as any).quoted_status_id || null,
      },
    };
  }

  /**
   * Calculate a credibility score for a Twitter user
   */
  private calculateCredibilityScore(user: TwitterUser): number {
    // Simple scoring based on verification status and follower count
    const verificationScore = user.verified ? 0.5 : 0.0;

    // Calculate follower score (0-0.5) based on follower count
    const followerCount = user.public_metrics?.followers_count || 0;
    const followerScore = Math.min(followerCount / 10000, 0.5);

    return verificationScore + followerScore;
  }

  /**
   * Check if a post matches any of the keywords
   */
  private postMatchesKeywords(
    post: SocialMediaPost,
    keywords: string[]
  ): boolean {
    if (!post.text || !keywords.length) {
      return false;
    }

    const text = post.text.toLowerCase();
    return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
  }
}
