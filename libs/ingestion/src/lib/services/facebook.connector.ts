import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FacebookAdsApi, Page, Post } from "facebook-nodejs-business-sdk";
import {
  SocialMediaConnector,
  SocialMediaPost,
} from "../interfaces/social-media-connector.interface";
import { SourceNode } from "@/schemas/base.schema";
import { EventEmitter } from "events";

interface FacebookPost {
  id: string;
  message?: string;
  created_time: string;
  from?: {
    id: string;
    name: string;
  };
  reactions?: {
    summary: {
      total_count: number;
    };
  };
  shares?: {
    count: number;
  };
  comments?: {
    summary: {
      total_count: number;
    };
  };
  insights?: {
    data: Array<{
      values: Array<{
        value: number;
      }>;
    }>;
  };
  permalink_url?: string;
}

interface SearchOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

@Injectable()
export class FacebookConnector
  implements SocialMediaConnector, OnModuleInit, OnModuleDestroy
{
  platform = "facebook" as const;
  private api: FacebookAdsApi | null = null;
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
      const accessToken = this.configService.getOrThrow<string>(
        "FACEBOOK_ACCESS_TOKEN"
      );
      this.api = FacebookAdsApi.init(accessToken);
    } catch (error) {
      console.error("Error connecting to Facebook:", error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.api = null;
    this.streamConnections.forEach((interval) => {
      clearInterval(interval);
    });
    this.streamConnections.clear();
  }

  async searchContent(
    query: string,
    options?: SearchOptions
  ): Promise<SocialMediaPost[]> {
    if (!this.api) {
      throw new Error("Facebook client not initialized");
    }

    try {
      const pageId = this.configService.getOrThrow("FACEBOOK_PAGE_ID");
      const page = new Page(pageId);

      const params: {
        q: string;
        fields: string[];
        limit: number;
        since?: number;
        until?: number;
      } = {
        q: query,
        fields: [
          "id",
          "message",
          "created_time",
          "from",
          "permalink_url",
          "reactions.summary(total_count)",
          "shares",
          "comments.summary(total_count)",
        ],
        limit: options?.limit || 100,
      };

      if (options?.startDate) {
        params.since = Math.floor(options.startDate.getTime() / 1000);
      }

      if (options?.endDate) {
        params.until = Math.floor(options.endDate.getTime() / 1000);
      }

      const response = await page.getPosts(params);
      if (!response || !response.data) {
        return [];
      }

      return response.data.map((post: any) => {
        const likes = post.reactions?.summary?.total_count || 0;
        const shares = post.shares?.count || 0;
        const comments = post.comments?.summary?.total_count || 0;
        const reach =
          post.insights?.data?.find(
            (insight: any) => insight.name === "post_impressions"
          )?.values[0]?.value || 0;
        const viralityScore =
          reach > 0 ? (likes + shares + comments) / reach : 0;

        return {
          id: post.id,
          text: post.message,
          platform: "facebook",
          url: post.permalink_url || `https://facebook.com/${post.id}`,
          authorId: post.from?.id,
          createdAt: new Date(post.created_time),
          timestamp: new Date(post.created_time),
          engagementMetrics: {
            likes,
            shares,
            comments,
            reach,
            viralityScore,
          },
          metadata: {
            likes,
            shares,
            comments,
          },
        };
      });
    } catch (error) {
      console.error("Error searching Facebook content:", error);
      throw error;
    }
  }

  async getAuthorDetails(authorId: string): Promise<Partial<SourceNode>> {
    try {
      if (!this.api) {
        throw new Error("Facebook client not initialized");
      }

      const page = new Page(authorId);
      const pageData = await page.get([
        "id",
        "name",
        "verification_status",
        "fan_count",
      ]);

      if (!pageData || !pageData.id) {
        throw new Error(`Page ${authorId} not found`);
      }

      return {
        id: pageData.id,
        name: pageData.name,
        platform: this.platform,
        credibilityScore: this.calculateCredibilityScore(pageData),
        verificationStatus:
          pageData.verification_status === "verified"
            ? "verified"
            : "unverified",
      } as Partial<SourceNode>;
    } catch (error) {
      console.error("Error fetching Facebook author details:", error);
      throw error;
    }
  }

  streamContent(keywords: string[]): EventEmitter {
    const emitter = new EventEmitter();
    const streamId = Math.random().toString(36).substring(7);

    const interval = setInterval(async () => {
      try {
        if (!this.api) {
          throw new Error("Facebook client not initialized");
        }

        const posts = await this.searchContent(keywords.join(" OR "), {
          startDate: new Date(Date.now() - 3600000), // Last hour
          limit: 100,
        });

        for (const post of posts) {
          if (this.postMatchesKeywords(post, keywords)) {
            emitter.emit("data", post);
          }
        }
      } catch (error) {
        emitter.emit("error", error);
      }
    }, this.pollingInterval);

    this.streamConnections.set(streamId, interval);
    this.interval = interval;

    // Clean up on end event
    emitter.on("end", () => {
      clearInterval(interval);
      this.streamConnections.delete(streamId);
    });

    return emitter;
  }

  async validateCredentials(): Promise<boolean> {
    try {
      await this.connect();
      const pageId = this.configService.getOrThrow("FACEBOOK_PAGE_ID");
      const page = new Page(pageId);

      // Try to get basic page info to validate credentials
      await page.get(["id", "name"]);
      return true;
    } catch (error) {
      console.error("Facebook credentials validation failed:", error);
      return false;
    }
  }

  private transformPostsToSocialMediaPosts(
    posts: FacebookPost[]
  ): SocialMediaPost[] {
    return posts.map((post) => ({
      id: post.id,
      text: post.message || "",
      timestamp: new Date(post.created_time),
      platform: this.platform,
      authorId: post.from?.id || "",
      authorName: post.from?.name || "",
      url: post.permalink_url || "",
      engagementMetrics: {
        likes: post.reactions?.summary?.total_count || 0,
        shares: post.shares?.count || 0,
        comments: post.comments?.summary?.total_count || 0,
        reach: post.insights?.data?.[0]?.values?.[0]?.value || 0,
        viralityScore: this.calculateViralityScore(post),
      },
    }));
  }

  private calculateViralityScore(post: FacebookPost): number {
    const total =
      (post.reactions?.summary?.total_count || 0) +
      (post.shares?.count || 0) +
      (post.comments?.summary?.total_count || 0);
    const reach = post.insights?.data?.[0]?.values?.[0]?.value || 1;
    return Math.min(total / reach, 1);
  }

  private postMatchesKeywords(
    post: SocialMediaPost,
    keywords: string[]
  ): boolean {
    const postText = post.text.toLowerCase();
    return keywords.some((keyword) => postText.includes(keyword.toLowerCase()));
  }

  private calculateCredibilityScore(pageData: any): number {
    // Basic credibility scoring based on verification and fan count
    const baseScore = pageData.verification_status === "verified" ? 0.8 : 0.5;
    const fanScore = Math.min(pageData.fan_count / 1000000, 0.2); // Up to 0.2 based on fan count
    return Math.min(baseScore + fanScore, 1);
  }
}
