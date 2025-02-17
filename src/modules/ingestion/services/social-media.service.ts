import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { TwitterConnector } from "./twitter.connector";
import { FacebookConnector } from "./facebook.connector";
import { RedditConnector } from "./reddit.connector";
import { SocialMediaPost } from "../interfaces/social-media-connector.interface";
import { SourceNode } from "@/schemas/base.schema";
import { EventEmitter } from "events";

export type SocialMediaPlatform = "twitter" | "facebook" | "reddit";

@Injectable()
export class SocialMediaService implements OnModuleInit, OnModuleDestroy {
  private readonly connectors: Array<
    TwitterConnector | FacebookConnector | RedditConnector
  >;

  constructor(
    private readonly twitterConnector: TwitterConnector,
    private readonly facebookConnector: FacebookConnector,
    private readonly redditConnector: RedditConnector
  ) {
    this.connectors = [twitterConnector, facebookConnector, redditConnector];
  }

  async onModuleInit() {
    await Promise.all(
      this.connectors.map(async (connector) => {
        try {
          await connector.validateCredentials();
        } catch (error) {
          console.error(
            `Failed to validate credentials for ${connector.platform}:`,
            error
          );
        }
      })
    );
  }

  async onModuleDestroy() {
    await Promise.all(
      this.connectors.map(async (connector) => {
        try {
          await connector.disconnect();
        } catch (error) {
          console.error(
            `Failed to disconnect from ${connector.platform}:`,
            error
          );
        }
      })
    );
  }

  async searchAllPlatforms(
    query: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      platforms?: SocialMediaPlatform[];
    }
  ): Promise<SocialMediaPost[]> {
    const targetConnectors = options?.platforms
      ? this.connectors.filter((connector) =>
          options.platforms!.includes(connector.platform as SocialMediaPlatform)
        )
      : this.connectors;

    const searchPromises = targetConnectors.map((connector) =>
      connector
        .searchContent(query, {
          startDate: options?.startDate,
          endDate: options?.endDate,
          limit: options?.limit,
        })
        .catch((error) => {
          console.error(
            `Error searching content on ${connector.platform}:`,
            error
          );
          return [];
        })
    );

    const results = await Promise.all(searchPromises);
    return results.flat();
  }

  async getAuthorDetails(
    authorId: string,
    platform: SocialMediaPlatform
  ): Promise<Partial<SourceNode>> {
    const connector = this.connectors.find((c) => c.platform === platform);
    if (!connector) {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    return connector.getAuthorDetails(authorId);
  }

  async *streamAllPlatforms(
    keywords: string[],
    options?: {
      platforms?: SocialMediaPlatform[];
    }
  ): AsyncGenerator<SocialMediaPost> {
    const targetConnectors = options?.platforms
      ? this.connectors.filter((connector) =>
          options.platforms!.includes(connector.platform as SocialMediaPlatform)
        )
      : this.connectors;

    const emitter = new EventEmitter();
    let hasError = false;

    for (const connector of targetConnectors) {
      try {
        const stream = connector.streamContent(keywords);
        stream.on("data", (post: SocialMediaPost) => {
          if (!hasError) {
            emitter.emit("data", post);
          }
        });
        stream.on("error", (error: Error) => {
          hasError = true;
          console.error(`Error in ${connector.platform} stream:`, error);
          emitter.emit("error", error);
        });
      } catch (error) {
        hasError = true;
        console.error(`Error setting up ${connector.platform} stream:`, error);
        emitter.emit("error", error);
      }
    }

    try {
      while (!hasError) {
        const post: SocialMediaPost = await new Promise((resolve, reject) => {
          emitter.once("data", resolve);
          emitter.once("error", reject);
        });
        yield post;
      }
    } catch (error) {
      console.error("Error in stream:", error);
      throw error;
    } finally {
      emitter.removeAllListeners();
      await Promise.all(
        targetConnectors.map((connector) => connector.disconnect())
      );
    }
  }
}
