import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { EventEmitter } from 'events';
import { SocialMediaConnector } from '../interfaces/social-media-connector.interface';
import { NarrativeInsight } from '../../types/narrative-insight.interface';
import { SourceNode } from '../schemas';

export type SocialMediaPlatform = 'twitter' | 'facebook' | 'reddit';

/**
 * Privacy-compliant social media service that implements the transform-on-ingest pattern.
 * This service only returns anonymized narrative insights, never raw social media data.
 *
 * Unlike the original SocialMediaService, this implementation ensures all data is
 * transformed and anonymized before it's returned or stored, making it compliant
 * with privacy regulations.
 */
@Injectable()
export class TransformedSocialMediaService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TransformedSocialMediaService.name);
  private readonly connectors: SocialMediaConnector[];

  constructor(
    // Connectors injected via NestJS DI - they should extend BaseSocialMediaConnector
    private readonly twitterConnector: SocialMediaConnector,
    private readonly facebookConnector: SocialMediaConnector,
    private readonly redditConnector: SocialMediaConnector
  ) {
    // Initialize the connector array
    this.connectors = [twitterConnector, facebookConnector, redditConnector];
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

    this.logger.log('TransformedSocialMediaService initialized');
  }

  async onModuleDestroy() {
    // Disconnect all connectors
    await Promise.all(
      this.connectors.map((connector) => connector.disconnect())
    );

    this.logger.log('TransformedSocialMediaService destroyed');
  }

  /**
   * Search for content across all platforms and return anonymized insights
   */
  async searchAcrossPlatforms(
    query: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      platforms?: SocialMediaPlatform[];
    }
  ): Promise<NarrativeInsight[]> {
    // Filter connectors by platform if specified
    const targetConnectors = options?.platforms
      ? this.connectors.filter((connector) =>
          options.platforms!.includes(connector.platform as SocialMediaPlatform)
        )
      : this.connectors;

    // Execute searches in parallel
    const searchPromises = targetConnectors.map((connector) =>
      connector
        .searchAndTransform(query, {
          startDate: options?.startDate,
          endDate: options?.endDate,
          limit: options?.limit,
        })
        .catch((error: Error) => {
          this.logger.error(
            `Error searching ${connector.platform}: ${error.message}`,
            error.stack
          );
          return [] as NarrativeInsight[];
        })
    );

    // Wait for all searches to complete
    const results = await Promise.all(searchPromises);

    // Combine and sort by timestamp (newest first)
    const allInsights = results.flat();
    return allInsights.sort(
      (a: NarrativeInsight, b: NarrativeInsight) =>
        b.timestamp.getTime() - a.timestamp.getTime()
    );
  }

  /**
   * Stream content from all platforms based on keywords, transforming into anonymized insights
   */
  streamAcrossPlatforms(
    keywords: string[],
    options?: {
      platforms?: SocialMediaPlatform[];
    }
  ): EventEmitter {
    const emitter = new EventEmitter();
    let hasError = false;

    // Filter connectors by platform if specified
    const targetConnectors = options?.platforms
      ? this.connectors.filter((connector) =>
          options.platforms!.includes(connector.platform as SocialMediaPlatform)
        )
      : this.connectors;

    this.logger.log(
      `Starting stream for keywords [${keywords.join(
        ', '
      )}] across platforms: ` +
        targetConnectors.map((c) => c.platform).join(', ')
    );

    // Set up streams for each connector
    targetConnectors.forEach((connector) => {
      try {
        const stream = connector.streamAndTransform(keywords);

        // Forward anonymized insights
        stream.on('data', (insight: NarrativeInsight) => {
          if (!hasError) {
            emitter.emit('data', insight);
          }
        });

        // Forward errors
        stream.on('error', (error: Error) => {
          this.logger.error(`Error from ${connector.platform} stream:`, error);
          emitter.emit('error', {
            platform: connector.platform,
            message: error.message,
            timestamp: new Date(),
          });
        });
      } catch (error: any) {
        hasError = true;
        this.logger.error(
          `Failed to start ${connector.platform} stream: ${error.message}`,
          error.stack
        );
        emitter.emit('error', {
          platform: connector.platform,
          message: error.message,
          timestamp: new Date(),
        });
      }
    });

    return emitter;
  }

  /**
   * Get anonymized profile details about an author from a specified platform
   * This returns a privacy-compliant source node with hashed identifiers
   */
  async getAnonymizedSourceDetails(
    authorId: string,
    platform: SocialMediaPlatform
  ): Promise<Partial<SourceNode>> {
    const connector = this.connectors.find((c) => c.platform === platform);
    if (!connector) {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    try {
      return await connector.getAuthorDetails(authorId);
    } catch (error: any) {
      this.logger.error(
        `Error getting author details from ${platform}: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }
}
