import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventEmitter } from "events";
import Snoowrap, { Submission, RedditUser } from "snoowrap";
import {
  SocialMediaConnector,
  SocialMediaPost,
} from "../interfaces/social-media-connector.interface";
import { SourceNode } from "@/schemas/base.schema";

@Injectable()
export class RedditConnector
  implements SocialMediaConnector, OnModuleInit, OnModuleDestroy
{
  platform = "reddit" as const;
  private client: Snoowrap | null = null;
  private streamConnections: Map<string, NodeJS.Timeout> = new Map();
  private readonly pollingInterval = 60000; // 1 minute
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
      this.client = new Snoowrap({
        userAgent: "Veritas/1.0.0",
        clientId: this.configService.getOrThrow("REDDIT_CLIENT_ID"),
        clientSecret: this.configService.getOrThrow("REDDIT_CLIENT_SECRET"),
        username: this.configService.get("REDDIT_USERNAME"),
        password: this.configService.get("REDDIT_PASSWORD"),
      });

      // Verify connection by making a test call
      await this.client.getMe();
    } catch (error) {
      this.client = null;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.client = null;
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
      if (!this.client) {
        throw new Error("Reddit client not initialized");
      }

      const response = await this.client.search({
        query,
        sort: "new",
        limit: options?.limit || 100,
        time: this.getTimeFilter(options?.startDate, options?.endDate),
      });

      return this.transformPostsToSocialMediaPosts(response);
    } catch (error) {
      console.error("Error searching Reddit content:", error);
      throw error;
    }
  }

  async getAuthorDetails(authorId: string): Promise<Partial<SourceNode>> {
    try {
      if (!this.client) {
        throw new Error("Reddit client not initialized");
      }

      const userData = await this.client.getUser(authorId);

      return {
        id: userData.id,
        name: userData.name,
        platform: this.platform,
        credibilityScore: this.calculateCredibilityScore(userData),
        verificationStatus: userData.has_verified_email
          ? "verified"
          : "unverified",
      } as Partial<SourceNode>;
    } catch (error) {
      console.error("Error fetching Reddit author details:", error);
      throw error;
    }
  }

  streamContent(keywords: string[]): EventEmitter {
    const emitter = new EventEmitter();

    this.interval = setInterval(async () => {
      try {
        if (!this.client) {
          throw new Error("Reddit client not initialized");
        }

        const query = keywords.join(" OR ");
        const submissions = await this.client.search({
          query,
          sort: "new",
          time: "hour",
        });
        const posts = this.transformPostsToSocialMediaPosts(submissions);

        for (const post of posts) {
          emitter.emit("data", post);
        }
      } catch (error) {
        emitter.emit("error", error);
      }
    }, 60000); // Poll every minute

    return emitter;
  }

  async validateCredentials(): Promise<boolean> {
    try {
      if (!this.client) {
        await this.connect();
      }
      if (!this.client) {
        return false;
      }
      await this.client.getMe();
      return true;
    } catch (error) {
      console.error("Reddit credentials validation failed:", error);
      return false;
    }
  }

  private transformPostsToSocialMediaPosts(
    posts: Submission[]
  ): SocialMediaPost[] {
    return posts.map((post) => ({
      id: post.id,
      text: post.selftext || post.title || "",
      timestamp: new Date(post.created_utc * 1000),
      platform: this.platform,
      authorId: post.author,
      authorName: post.author,
      url: `https://reddit.com${post.permalink}`,
      engagementMetrics: {
        likes: post.score || 0,
        shares: 0, // Reddit doesn't have direct share counts
        comments: post.num_comments || 0,
        reach: post.view_count || 0,
        viralityScore: this.calculateViralityScore(post),
      },
    }));
  }

  private calculateViralityScore(post: Submission): number {
    const total = (post.score || 0) + (post.num_comments || 0);
    const reach = post.view_count || 1;
    return Math.min(total / reach, 1);
  }

  private postMatchesKeywords(
    post: SocialMediaPost,
    keywords: string[]
  ): boolean {
    const postText = post.text.toLowerCase();
    return keywords.some((keyword) => postText.includes(keyword.toLowerCase()));
  }

  private calculateCredibilityScore(userData: RedditUser): number {
    const karmaScore = Math.min(
      (userData.link_karma + userData.comment_karma) / 100000,
      0.3
    );
    const accountAgeScore = Math.min(
      (Date.now() / 1000 - userData.created_utc) / (365 * 24 * 60 * 60),
      0.2
    );
    const verificationScore = userData.has_verified_email ? 0.2 : 0;
    const modScore = userData.is_mod ? 0.2 : 0;
    const goldScore = userData.is_gold ? 0.1 : 0;

    return Math.min(
      karmaScore + accountAgeScore + verificationScore + modScore + goldScore,
      1
    );
  }

  private getTimeFilter(
    startDate?: Date,
    endDate?: Date
  ): "hour" | "day" | "week" | "month" | "year" | "all" {
    if (!startDate) return "all";

    const now = Date.now();
    const diff = now - startDate.getTime();
    const days = diff / (1000 * 60 * 60 * 24);

    if (days <= 1) return "day";
    if (days <= 7) return "week";
    if (days <= 30) return "month";
    if (days <= 365) return "year";
    return "all";
  }
}
