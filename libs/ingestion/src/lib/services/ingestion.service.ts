import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { DatabaseService } from '@veritas/database';
import { DataConnector } from '../interfaces/data-connector.interface';
import { RedditConnector } from './reddit.connector';
import { FacebookConnector } from './facebook.connector';
import { RSSConnector } from './rss.connector';
import { WebScraperConnector } from './web-scraper.connector';
import { YouTubeConnector } from './youtube.connector';
import { Repository } from '@veritas/database';
import { NarrativeRepository } from '../repositories/narrative-insight.repository';
import { SocialMediaPost } from '../../types/social-media.types';
import { NarrativeInsight } from '../../types/narrative-insight.interface';

/**
 * Service that manages ingestion connections and data flow
 * Provides a unified interface for accessing all data connectors
 */
@Injectable()
export class IngestionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IngestionService.name);
  private connectors: Map<string, DataConnector> = new Map();
  private contentRepository: Repository<any>;
  private sourceRepository: Repository<any>;

  constructor(
    @Optional() private readonly redditConnector: RedditConnector,
    @Optional() private readonly facebookConnector: FacebookConnector,
    @Optional() private readonly rssFeedConnector: RSSConnector,
    @Optional() private readonly webScraperConnector: WebScraperConnector,
    @Optional() private readonly youtubeConnector: YouTubeConnector,
    private readonly databaseService: DatabaseService,
    private readonly narrativeRepository: NarrativeRepository
  ) {}

  async onModuleInit() {
    // Initialize repositories
    this.initializeRepositories();

    // Register available connectors
    await this.registerAvailableConnectors();
  }

  /**
   * Initialize database repositories for content and sources
   */
  private initializeRepositories() {
    try {
      // Register models if they don't exist
      try {
        this.databaseService.registerModel('Content', {});
        this.databaseService.registerModel('Source', {});
      } catch (error) {
        this.logger.warn(
          'Models already registered or error registering models',
          error
        );
      }

      // Get repositories
      this.contentRepository =
        this.databaseService.getRepository<any>('Content');
      this.sourceRepository = this.databaseService.getRepository<any>('Source');

      this.logger.log('Repositories initialized successfully');
    } catch (error: any) {
      this.logger.error(
        `Failed to initialize repositories: ${error.message}`,
        error.stack
      );
    }
  }

  /**
   * Register all available connectors from injected instances
   */
  private async registerAvailableConnectors() {
    const connectors = [
      this.redditConnector,
      this.facebookConnector,
      this.rssFeedConnector,
      this.webScraperConnector,
      this.youtubeConnector,
    ].filter((connector) => connector !== undefined);

    for (const connector of connectors) {
      await this.registerConnector(connector);
    }
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

  /**
   * Save content to the content repository
   * This should only be used for internal content that doesn't need anonymization
   */
  async saveContent(content: any): Promise<any> {
    return this.contentRepository.create(content);
  }

  /**
   * Save source to the source repository
   */
  async saveSource(source: any): Promise<any> {
    return this.sourceRepository.create(source);
  }

  /**
   * Find content by ID
   */
  async findContentById(id: string): Promise<any> {
    return this.contentRepository.findById(id);
  }

  /**
   * Find source by ID
   */
  async findSourceById(id: string): Promise<any> {
    return this.sourceRepository.findById(id);
  }

  /**
   * Search and transform data from all registered connectors
   * Uses the transform-on-ingest pattern to ensure data privacy
   */
  async searchAndTransformAll(
    query: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      platforms?: string[];
    }
  ): Promise<NarrativeInsight[]> {
    const targetConnectors = options?.platforms
      ? Array.from(this.connectors.values()).filter((connector) =>
          options.platforms.includes(connector.platform)
        )
      : Array.from(this.connectors.values());

    const searchPromises = targetConnectors.map((connector) =>
      connector.searchAndTransform(query, options).catch((error) => {
        this.logger.error(
          `Error searching ${connector.platform}: ${error.message}`,
          error.stack
        );
        return [] as NarrativeInsight[];
      })
    );

    const results = await Promise.all(searchPromises);
    return results.flat();
  }
}
