import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FacebookAdsApi, Page, Post } from "facebook-nodejs-business-sdk";
import {
  SocialMediaConnector,
  SocialMediaPost,
} from "../interfaces/social-media-connector.interface";
import { SourceNode } from "@/schemas/base.schema";
import { EventEmitter } from "events";

@Injectable()
export class FacebookConnector
  implements SocialMediaConnector, OnModuleInit, OnModuleDestroy
{
  platform = "facebook" as const;
  private api: FacebookAdsApi;
  private streamConnections: Map<string, NodeJS.Timeout> = new Map();
  private readonly pollingInterval = 60000; // 1 minute

  constructor(private configService: ConfigService) {
    this.api = FacebookAdsApi.init(
      this.configService.getOrThrow("FACEBOOK_ACCESS_TOKEN")
    );
  }

  async onModuleInit() {
    await this.validateCredentials();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  async connect(): Promise<void> {
    if (!this.api) {
      this.api = FacebookAdsApi.init(
        this.configService.getOrThrow("FACEBOOK_ACCESS_TOKEN")
      );
    }
  }

  async disconnect(): Promise<void> {
    // Clear all polling intervals
    for (const [key, interval] of this.streamConnections) {
      clearInterval(interval);
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
      const pageId = this.configService.getOrThrow("FACEBOOK_PAGE_ID");
      const page = new Page(pageId);

      const params: {
        fields: string[];
        limit: number;
        since?: number;
        until?: number;
      } = {
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

      const posts = await page.getPosts(params);
      return this.transformPostsToSocialMediaPosts(posts.data);
    } catch (error) {
      console.error("Error searching Facebook content:", error);
      throw error;
    }
  }

  async getAuthorDetails(authorId: string): Promise<Partial<SourceNode>> {
    try {
      const page = new Page(authorId);
      const pageData = await page.get([
        "id",
        "name",
        "verification_status",
        "fan_count",
      ]);

      return {
        id: pageData.id,
        name: pageData.name,
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

  async *streamContent(keywords: string[]): AsyncGenerator<SocialMediaPost> {
    const emitter = new EventEmitter();
    const streamKey = keywords.join(",");
    let lastPostTime = new Date();

    const interval = setInterval(async () => {
      try {
        const posts = await this.searchContent(keywords.join(" OR "), {
          startDate: lastPostTime,
          limit: 100,
        });

        for (const post of posts) {
          if (this.postMatchesKeywords(post, keywords)) {
            emitter.emit("post", post);
          }
        }

        if (posts.length > 0) {
          lastPostTime = posts[posts.length - 1].timestamp;
        }
      } catch (error) {
        console.error("Error in Facebook stream:", error);
        emitter.emit("error", error);
      }
    }, this.pollingInterval);

    this.streamConnections.set(streamKey, interval);

    try {
      while (true) {
        const post = await new Promise<SocialMediaPost>((resolve, reject) => {
          emitter.once("post", resolve);
          emitter.once("error", reject);
        });
        yield post;
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
      const pageId = this.configService.getOrThrow("FACEBOOK_PAGE_ID");
      const page = new Page(pageId);
      await page.get(["id"]);
      return true;
    } catch (error) {
      console.error("Facebook credentials validation failed:", error);
      return false;
    }
  }

  private transformPostsToSocialMediaPosts(posts: Post[]): SocialMediaPost[] {
    return posts.map((post) => ({
      id: post.id,
      text: post.message || "",
      timestamp: new Date(post.created_time),
      platform: this.platform,
      authorId: post.from?.id || "",
      authorName: post.from?.name || "",
      url: post.permalink_url || "",
      engagement: {
        likes: post.reactions?.summary?.total_count || 0,
        shares: post.shares?.count || 0,
        comments: post.comments?.summary?.total_count || 0,
        reach: post.insights?.data?.[0]?.values?.[0]?.value || 0,
      },
    }));
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
