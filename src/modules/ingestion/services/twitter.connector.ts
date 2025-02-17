import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  TwitterApi,
  TweetV2,
  UserV2,
  TwitterApiv2,
  Tweetv2TimelineResult,
} from "twitter-api-v2";
import {
  SocialMediaConnector,
  SocialMediaPost,
} from "../interfaces/social-media-connector.interface";
import { SourceNode } from "@/schemas/base.schema";
import { EventEmitter } from "events";

type TweetWithIncludes = TweetV2 & {
  includes?: {
    users?: Array<{
      name: string;
      username: string;
    }>;
  };
};

@Injectable()
export class TwitterConnector
  implements SocialMediaConnector, OnModuleInit, OnModuleDestroy
{
  platform = "twitter" as const;
  private client: TwitterApi | null;
  private v2Client: TwitterApiv2 | null;
  private streamConnections: Map<string, any> = new Map();
  private pollingInterval = 1000; // Assuming a default polling interval
  private interval: NodeJS.Timeout | null = null;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    await this.validateCredentials();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  async connect(): Promise<void> {
    try {
      this.client = new TwitterApi(
        this.configService.getOrThrow("TWITTER_BEARER_TOKEN")
      );
      this.v2Client = this.client.v2;
    } catch (error) {
      console.error("Error connecting to Twitter:", error);
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
  }

  async searchContent(
    query: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    }
  ): Promise<SocialMediaPost[]> {
    try {
      if (!this.v2Client) {
        throw new Error("Twitter client not initialized");
      }
      const response = await this.v2Client.search(query, {
        start_time: options?.startDate?.toISOString(),
        end_time: options?.endDate?.toISOString(),
        max_results: options?.limit || 100,
        "tweet.fields": ["created_at", "public_metrics", "author_id"],
        "user.fields": ["username", "name"],
        expansions: ["author_id"],
      });

      const tweets = response.data;
      if (!tweets || !Array.isArray(tweets)) {
        return [];
      }

      return this.transformTweetsToSocialMediaPosts(tweets, response.includes);
    } catch (error) {
      console.error("Error searching Twitter content:", error);
      throw error;
    }
  }

  async getAuthorDetails(authorId: string): Promise<Partial<SourceNode>> {
    try {
      if (!this.v2Client) {
        throw new Error("Twitter client not initialized");
      }
      const response = await this.v2Client.user(authorId, {
        "user.fields": ["created_at", "public_metrics", "verified"],
      });

      if (!response.data) {
        throw new Error(`User ${authorId} not found`);
      }

      const { id, name, verified } = response.data;
      return {
        id,
        name,
        platform: this.platform,
        credibilityScore: verified ? 0.8 : 0.5,
        verificationStatus: verified ? "verified" : "unverified",
      } as Partial<SourceNode>;
    } catch (error) {
      console.error("Error fetching Twitter author details:", error);
      throw error;
    }
  }

  streamContent(keywords: string[]): EventEmitter {
    const emitter = new EventEmitter();

    this.interval = setInterval(async () => {
      try {
        if (!this.v2Client) {
          throw new Error("Twitter client not initialized");
        }

        const searchResult = await this.v2Client.search({
          query: keywords.join(" OR "),
          "tweet.fields": ["author_id", "created_at", "public_metrics"],
          "user.fields": ["name", "username"],
          expansions: ["author_id"],
        });

        const tweets = searchResult.data;
        if (tweets && Array.isArray(tweets)) {
          const posts = this.transformTweetsToSocialMediaPosts(
            tweets,
            searchResult.includes
          );
          for (const post of posts) {
            emitter.emit("data", post);
          }
        }
      } catch (error) {
        emitter.emit("error", error);
      }
    }, 60000); // Poll every minute

    return emitter;
  }

  async validateCredentials(): Promise<boolean> {
    try {
      if (!this.v2Client) {
        throw new Error("Twitter client not initialized");
      }
      await this.v2Client.me();
      return true;
    } catch (error) {
      console.error("Twitter credentials validation failed:", error);
      return false;
    }
  }

  private transformTweetsToSocialMediaPosts(
    tweets: TweetV2[],
    includes?: { users?: UserV2[] }
  ): SocialMediaPost[] {
    if (!tweets || !Array.isArray(tweets)) return [];

    return tweets.map((tweet) => {
      const author = includes?.users?.find(
        (user: UserV2) => user.id === tweet.author_id
      );

      return this.transformTweetToSocialMediaPost({
        ...tweet,
        includes: {
          users: author
            ? [{ name: author.name, username: author.username }]
            : [],
        },
      });
    });
  }

  private transformTweetToSocialMediaPost(
    tweet: TweetWithIncludes
  ): SocialMediaPost {
    if (!tweet.created_at) {
      throw new Error("Tweet missing required field: created_at");
    }
    if (!tweet.author_id) {
      throw new Error("Tweet missing required field: author_id");
    }

    return {
      id: tweet.id,
      text: tweet.text,
      timestamp: new Date(tweet.created_at),
      platform: this.platform,
      authorId: tweet.author_id,
      engagementMetrics: {
        likes: tweet.public_metrics?.like_count || 0,
        shares: tweet.public_metrics?.retweet_count || 0,
        comments: tweet.public_metrics?.reply_count || 0,
        reach: tweet.public_metrics?.impression_count || 0,
        viralityScore: this.calculateViralityScore(tweet.public_metrics),
      },
    };
  }

  private calculateViralityScore(metrics: any): number {
    if (!metrics) return 0;
    const total =
      metrics.like_count +
      metrics.retweet_count +
      metrics.reply_count +
      metrics.quote_count;
    const reach = metrics.impression_count || 1;
    return Math.min(total / reach, 1);
  }

  private postMatchesKeywords(
    post: SocialMediaPost,
    keywords: string[]
  ): boolean {
    const text = post.text.toLowerCase();
    return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
  }
}
