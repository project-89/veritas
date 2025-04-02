import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { EventEmitter } from 'events';
import { SocialMediaPost } from '../../types/social-media.types';
import { SocialMediaConnector } from '../interfaces/social-media-connector.interface';
import { DataConnector } from '../interfaces/data-connector.interface';
import { SourceNode } from '../schemas';

export type SocialMediaPlatform = 'twitter' | 'facebook' | 'reddit';

/**
 * Original social media service implementation that directly returns raw social media data.
 *
 * IMPORTANT: This service operates with raw data and should NOT be used in production environments
 * where privacy regulations apply. For production use, use the TransformedSocialMediaService which
 * follows the transform-on-ingest pattern and ensures all data is anonymized at the edge.
 *
 * @deprecated Use TransformedSocialMediaService instead, which implements the transform-on-ingest
 * pattern for privacy-compliant data handling
 */
@Injectable()
export class SocialMediaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SocialMediaService.name);
  private readonly connectors: SocialMediaConnector[];

  constructor(
    // Connectors injected via NestJS DI
    private readonly twitterConnector: SocialMediaConnector,
    private readonly facebookConnector: SocialMediaConnector,
    private readonly redditConnector: SocialMediaConnector
  ) {
    // Initialize the connector array
    this.connectors = [
      twitterConnector,
      facebookConnector,
      redditConnector,
      // Add additional social media connectors here
    ];
  }

  async onModuleInit() {
    // Validate credentials for all connectors
    await Promise.all(
      this.connectors.map(async (connector) => {
        try {
          await connector.validateCredentials();
        } catch (error) {
          this.logger.error(
            `Failed to validate credentials for ${connector.platform}`,
            error
          );
        }
      })
    );
  }

  async onModuleDestroy() {
    // Disconnect all connectors
    await Promise.all(
      this.connectors.map((connector) => connector.disconnect())
    );
  }

  /**
   * Search for content across all platforms
   *
   * WARNING: This method returns raw data that may contain PII.
   * For privacy-compliant data handling, use TransformedSocialMediaService instead.
   */
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
        .catch((error: Error) => {
          this.logger.error(
            `Error searching ${connector.platform}: ${error.message}`,
            error.stack
          );
          return [] as SocialMediaPost[];
        })
    );

    const results = await Promise.all(searchPromises);
    return results.flat();
  }

  /**
   * Stream content from all platforms based on keywords
   *
   * WARNING: This method returns raw data that may contain PII.
   * For privacy-compliant data handling, use TransformedSocialMediaService instead.
   */
  streamAllPlatforms(
    keywords: string[],
    options?: {
      platforms?: SocialMediaPlatform[];
    }
  ): EventEmitter {
    const emitter = new EventEmitter();

    // Filter connectors by platform if specified
    const targetConnectors = options?.platforms
      ? this.connectors.filter((connector) =>
          options.platforms!.includes(connector.platform as SocialMediaPlatform)
        )
      : this.connectors;

    let hasError = false;

    targetConnectors.forEach((connector) => {
      try {
        const stream = connector.streamContent(keywords);
        stream.on('data', (post: SocialMediaPost) => {
          if (!hasError) {
            emitter.emit('data', post);
          }
        });
        stream.on('error', (error) => {
          this.logger.error(`Error from ${connector.platform} stream:`, error);
          emitter.emit('error', error);
        });
      } catch (error) {
        hasError = true;
        this.logger.error(
          `Failed to start ${connector.platform} stream:`,
          error
        );
        emitter.emit('error', error);
      }
    });

    return emitter;
  }

  /**
   * Get details about an author from a specified platform
   *
   * WARNING: This method returns raw data that may contain PII.
   * For privacy-compliant data handling, use TransformedSocialMediaService instead.
   */
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
}
