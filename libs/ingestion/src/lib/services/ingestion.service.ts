import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ContentService, SourceService } from '@veritas/database';
import { DataConnector } from '../interfaces/data-connector.interface';
import { RedditConnector } from './reddit.connector';
import { FacebookConnector } from './facebook.connector';
import { RSSConnector } from './rss.connector';
import { WebScraperConnector } from './web-scraper.connector';
import { YouTubeConnector } from './youtube.connector';

@Injectable()
export class IngestionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IngestionService.name);
  private connectors: Map<string, DataConnector> = new Map();

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
   * Register a data connector with the service
   */
  private async registerConnector(connector: DataConnector): Promise<void> {
    try {
      await connector.connect();
      this.connectors.set(connector.platform, connector);

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
  getConnector(platform: string): DataConnector | undefined {
    return this.connectors.get(platform);
  }

  /**
   * Get all registered connectors
   */
  getAllConnectors(): DataConnector[] {
    return Array.from(this.connectors.values());
  }
}
