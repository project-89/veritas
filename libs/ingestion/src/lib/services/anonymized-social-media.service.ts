import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { EventEmitter } from 'events';
import { TwitterConnector } from './twitter.connector';
import { FacebookConnector } from './facebook.connector';
import { RedditConnector } from './reddit.connector';
import { DataConnector } from '../interfaces/data-connector.interface';
import { NarrativeInsight } from '../../types/narrative-insight.interface';

// Renamed to avoid name collision with SocialMediaPlatform in social-media.service.ts
export type AnonymizedPlatform = 'twitter' | 'facebook' | 'reddit';

/**
 * Privacy-focused social media service that ensures all data is anonymized during ingestion.
 *
 * This service implements the transform-on-ingest pattern which guarantees that:
 * 1. No personally identifiable information (PII) is ever stored in the system
 * 2. All data is anonymized at the edge before being processed or stored
 * 3. Only anonymized narrative insights are returned to the caller
 *
 * This is the preferred service for production environments where privacy regulations
 * like GDPR, CCPA, or other data protection laws apply.
 */
@Injectable()
export class AnonymizedSocialMediaService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly connectors: DataConnector[];
  private readonly logger = new Logger(AnonymizedSocialMediaService.name);

  constructor(
    private readonly twitterConnector: TwitterConnector,
    private readonly facebookConnector: FacebookConnector,
    private readonly redditConnector: RedditConnector
  ) {
    this.connectors = [twitterConnector, facebookConnector, redditConnector];
  }

  /**
   * Initialize connectors and validate credentials on module init
   */
  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing social media connectors');

    await Promise.all(
      this.connectors.map(async (connector) => {
        try {
          await connector.validateCredentials();
          this.logger.debug(
            `Successfully validated credentials for ${connector.platform}`
          );
        } catch (error: unknown) {
          this.logger.error(
            `Failed to validate credentials for ${connector.platform}:`,
            error instanceof Error ? error.stack : String(error)
          );
        }
      })
    );
  }

  /**
   * Disconnect from all platforms on module destroy
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log('Disconnecting from social media platforms');

    await Promise.all(
      this.connectors.map(async (connector) => {
        try {
          await connector.disconnect();
          this.logger.debug(
            `Successfully disconnected from ${connector.platform}`
          );
        } catch (error: unknown) {
          this.logger.error(
            `Failed to disconnect from ${connector.platform}:`,
            error instanceof Error ? error.stack : String(error)
          );
        }
      })
    );
  }

  /**
   * Search and anonymize content across all platforms in real-time
   *
   * Content is anonymized during ingestion and only privacy-safe narrative insights
   * are returned, ensuring no PII ever reaches the application.
   *
   * @param query - Search query string
   * @param options - Optional search parameters
   * @returns Promise resolving to array of anonymized narrative insights
   */
  async searchAllAndTransform(
    query: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      platforms?: AnonymizedPlatform[];
    }
  ): Promise<NarrativeInsight[]> {
    this.logger.debug(`Searching for "${query}" across platforms`);

    const targetConnectors = options?.platforms
      ? this.connectors.filter((connector) =>
          options.platforms!.includes(connector.platform as AnonymizedPlatform)
        )
      : this.connectors;

    const searchPromises = targetConnectors.map((connector) =>
      connector
        .searchAndTransform(query, {
          startDate: options?.startDate,
          endDate: options?.endDate,
          limit: options?.limit,
        })
        .catch((error: unknown) => {
          this.logger.error(
            `Error searching content on ${connector.platform}:`,
            error instanceof Error ? error.stack : String(error)
          );
          return [];
        })
    );

    const results = await Promise.all(searchPromises);
    const flatResults = results.flat();

    this.logger.debug(
      `Found ${flatResults.length} insights across all platforms`
    );
    return flatResults;
  }

  /**
   * Stream and anonymize content across all platforms in real-time
   *
   * Content is anonymized during streaming and only privacy-safe narrative insights
   * are emitted, ensuring no PII ever reaches the application.
   *
   * @param keywords - Array of keywords to monitor
   * @param options - Optional streaming parameters
   * @returns EventEmitter that emits 'data' events with anonymized NarrativeInsight objects
   */
  streamAllAndTransform(
    keywords: string[],
    options?: {
      platforms?: AnonymizedPlatform[];
    }
  ): EventEmitter {
    this.logger.debug(
      `Setting up streaming for keywords: ${keywords.join(', ')}`
    );

    const outputEmitter = new EventEmitter();

    const targetConnectors = options?.platforms
      ? this.connectors.filter((connector) =>
          options.platforms!.includes(connector.platform as AnonymizedPlatform)
        )
      : this.connectors;

    for (const connector of targetConnectors) {
      try {
        const stream = connector.streamAndTransform(keywords);

        stream.on('data', (insight: NarrativeInsight) => {
          this.logger.debug(
            `Received insight from ${
              connector.platform
            }: ${insight.id.substring(0, 8)}...`
          );
          outputEmitter.emit('data', insight);
        });

        stream.on('error', (error: Error) => {
          this.logger.error(
            `Error in ${connector.platform} stream:`,
            error.stack
          );
          outputEmitter.emit('error', error);
        });
      } catch (error: unknown) {
        this.logger.error(
          `Error setting up ${connector.platform} stream:`,
          error instanceof Error ? error.stack : String(error)
        );
        outputEmitter.emit(
          'error',
          error instanceof Error ? error : new Error(String(error))
        );
      }
    }

    return outputEmitter;
  }
}
