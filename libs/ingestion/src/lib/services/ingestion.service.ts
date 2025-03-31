import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ContentService, SourceService } from '@veritas/database';
import { SocialMediaConnector } from '../interfaces/social-media-connector.interface';
import { TransformOnIngestConnector } from '../interfaces/transform-on-ingest-connector.interface';
import { RedditConnector } from './reddit.connector';
import { FacebookConnector } from './facebook.connector';
import { RSSConnector } from './rss.connector';
import { WebScraperConnector } from './web-scraper.connector';
import { YouTubeConnector } from './youtube.connector';

@Injectable()
export class IngestionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IngestionService.name);
  private connectors: Map<string, SocialMediaConnector> = new Map();
  private transformConnectors: Map<string, TransformOnIngestConnector> =
    new Map();

  constructor(
    private redditConnector: RedditConnector,
    private facebookConnector: FacebookConnector,
    private rssFeedConnector: RSSConnector,
    private webScraperConnector: WebScraperConnector,
    private youtubeConnector: YouTubeConnector,
    private contentService: ContentService,
    private sourceService: SourceService
  ) {}

  async onModuleInit() {
    // Register all available connectors
    await this.registerConnector(this.redditConnector);
    await this.registerConnector(this.facebookConnector);
    await this.registerConnector(this.rssFeedConnector);
    await this.registerConnector(this.webScraperConnector);
    await this.registerConnector(this.youtubeConnector);
  }

  async onModuleDestroy() {
    // Disconnect all connectors
    for (const connector of this.connectors.values()) {
      await connector.disconnect();
    }
  }

  /**
   * Register a social media connector with the service
   */
  private async registerConnector(
    connector: SocialMediaConnector
  ): Promise<void> {
    try {
      await connector.connect();
      this.connectors.set(connector.platform, connector);

      // If the connector also supports transform on ingest, register it for that too
      if (
        'searchAndTransform' in connector &&
        'streamAndTransform' in connector
      ) {
        this.transformConnectors.set(
          connector.platform,
          connector as unknown as TransformOnIngestConnector
        );
      }

      this.logger.log(
        `Registered connector for platform: ${connector.platform}`
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to register connector for platform: ${connector.platform}`,
        error.stack
      );
    }
  }

  /**
   * Get a registered connector by platform
   */
  getConnector(platform: string): SocialMediaConnector | undefined {
    return this.connectors.get(platform);
  }

  /**
   * Get a registered transform connector by platform
   */
  getTransformConnector(
    platform: string
  ): TransformOnIngestConnector | undefined {
    return this.transformConnectors.get(platform);
  }

  /**
   * Get all registered connectors
   */
  getAllConnectors(): SocialMediaConnector[] {
    return Array.from(this.connectors.values());
  }

  /**
   * Get all registered transform connectors
   */
  getAllTransformConnectors(): TransformOnIngestConnector[] {
    return Array.from(this.transformConnectors.values());
  }
}
