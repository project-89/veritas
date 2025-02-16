import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TwitterApi, TweetV2, UserV2 } from "twitter-api-v2";
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
  private client: TwitterApi;
  private streamConnections: Map<string, any> = new Map();
  private pollingInterval = 1000; // Assuming a default polling interval

  constructor(private configService: ConfigService) {
    this.client = new TwitterApi(
      this.configService.getOrThrow("TWITTER_BEARER_TOKEN")
    );
  }

  async onModuleInit() {
    await this.validateCredentials();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  async connect(): Promise<void> {
    if (!this.client) {
      this.client = new TwitterApi(
        this.configService.getOrThrow("TWITTER_BEARER_TOKEN")
      );
    }
  }

  async disconnect(): Promise<void> {
    // Close all active streams
    for (const [key, stream] of this.streamConnections) {
      await stream.close();
      this.streamConnections.delete(key);
    }
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
      const response = await this.client.v2.search({
        query,
        start_time: options?.startDate?.toISOString(),
        end_time: options?.endDate?.toISOString(),
        max_results: options?.limit || 100,
        "tweet.fields": ["created_at", "public_metrics", "author_id"],
        "user.fields": ["username", "name"],
        expansions: ["author_id"],
      });

      return this.transformTweetsToSocialMediaPosts(response.tweets);
    } catch (error) {
      console.error("Error searching Twitter content:", error);
      throw error;
    }
  }

  async getAuthorDetails(authorId: string): Promise<Partial<SourceNode>> {
    try {
      const response = await this.client.v2.user(authorId, {
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

  async *streamContent(keywords: string[]): AsyncGenerator<SocialMediaPost> {
    const emitter = new EventEmitter();
    const streamKey = keywords.join(",");
    let lastTweetTime = new Date();

    const interval = setInterval(async () => {
      try {
        const tweets = await this.searchContent(keywords.join(" OR "), {
          startDate: lastTweetTime,
          limit: 100,
        });

        for (const tweet of tweets) {
          if (this.tweetMatchesKeywords(tweet, keywords)) {
            emitter.emit("tweet", tweet);
          }
        }

        if (tweets.length > 0) {
          lastTweetTime = tweets[tweets.length - 1].timestamp;
        }
      } catch (error) {
        console.error("Error in Twitter stream:", error);
        emitter.emit("error", error);
      }
    }, this.pollingInterval);

    this.streamConnections.set(streamKey, interval);

    try {
      while (true) {
        const tweet = await new Promise<SocialMediaPost>((resolve, reject) => {
          emitter.once("tweet", resolve);
          emitter.once("error", reject);
        });
        yield tweet;
      }
    } catch (error) {
      console.error("Error in stream:", error);
    } finally {
      clearInterval(interval);
      this.streamConnections.delete(streamKey);
      emitter.removeAllListeners();
    }
  }

  async validateCredentials(): Promise<boolean> {
    try {
      await this.client.v2.me();
      return true;
    } catch (error) {
      console.error("Twitter credentials validation failed:", error);
      return false;
    }
  }

  private transformTweetsToSocialMediaPosts(
    tweets: TweetV2[]
  ): SocialMediaPost[] {
    if (!tweets) return [];
    return tweets.map((tweet) =>
      this.transformTweetToSocialMediaPost(tweet as TweetWithIncludes)
    );
  }

  private transformTweetToSocialMediaPost(
    tweet: TweetWithIncludes
  ): SocialMediaPost {
    const author = tweet.includes?.users?.[0];
    return {
      id: tweet.id,
      text: tweet.text,
      timestamp: tweet.created_at ? new Date(tweet.created_at) : new Date(),
      platform: this.platform,
      authorId: tweet.author_id || "",
      authorName: author?.name || author?.username || "",
      url: `https://twitter.com/i/web/status/${tweet.id}`,
      engagement: {
        likes: tweet.public_metrics?.like_count || 0,
        shares: tweet.public_metrics?.retweet_count || 0,
        comments: tweet.public_metrics?.reply_count || 0,
        reach: tweet.public_metrics?.impression_count || 0,
      },
    };
  }

  private tweetMatchesKeywords(
    post: SocialMediaPost,
    keywords: string[]
  ): boolean {
    const tweetText = post.text.toLowerCase();
    return keywords.some((keyword) =>
      tweetText.includes(keyword.toLowerCase())
    );
  }
}
