import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { DatabaseService } from '@veritas/database';
import { DataConnector, ConnectorSearchOptions } from '../interfaces/data-connector.interface';
import { ContentNode, SourceNode } from '../schemas/base.schema';
import { RSSConnector } from './rss.connector';
import { WebScraperConnector } from './web-scraper.connector';
import { Repository } from '@veritas/database';
import { NarrativeRepository } from '../repositories/narrative-insight.repository';
import { SocialMediaPost } from '../../types/social-media.types';
import { NarrativeInsight } from '../../types/narrative-insight.interface';
import {
  REDDIT_CONNECTOR,
  TWITTER_CONNECTOR,
  YOUTUBE_CONNECTOR,
  FACEBOOK_CONNECTOR,
} from '../interfaces/connector-tokens';

/**
 * Service that manages ingestion connections and data flow
 * Provides a unified interface for accessing all data connectors
 */
@Injectable()
export class IngestionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IngestionService.name);
  private connectors: Map<string, DataConnector> = new Map();
  private contentRepository!: Repository<ContentNode>;
  private sourceRepository!: Repository<SourceNode>;

  constructor(
    @Optional() @Inject(REDDIT_CONNECTOR) private readonly redditConnector: DataConnector,
    @Optional() @Inject(TWITTER_CONNECTOR) private readonly twitterConnector: DataConnector,
    @Optional() @Inject(FACEBOOK_CONNECTOR) private readonly facebookConnector: DataConnector,
    @Optional() @Inject(YOUTUBE_CONNECTOR) private readonly youtubeConnector: DataConnector,
    @Optional() private readonly rssFeedConnector: RSSConnector,
    @Optional() private readonly webScraperConnector: WebScraperConnector,
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
        this.databaseService.getRepository<ContentNode>('Content');
      this.sourceRepository = this.databaseService.getRepository<SourceNode>('Source');

      this.logger.log('Repositories initialized successfully');
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Failed to initialize repositories: ${err.message}`,
        err.stack
      );
    }
  }

  /**
   * Register all available connectors from injected instances
   */
  private async registerAvailableConnectors() {
    const connectors = [
      this.redditConnector,
      this.twitterConnector,
      this.facebookConnector,
      this.youtubeConnector,
      this.rssFeedConnector,
      this.webScraperConnector,
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
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Failed to register connector for platform: ${connector.platform}`,
        err.stack
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
  async saveContent(content: ContentNode): Promise<ContentNode> {
    return this.contentRepository.create(content);
  }

  /**
   * Save source to the source repository
   */
  async saveSource(source: SourceNode): Promise<SourceNode> {
    return this.sourceRepository.create(source);
  }

  /**
   * Find content by ID
   */
  async findContentById(id: string): Promise<ContentNode | null> {
    return this.contentRepository.findById(id);
  }

  /**
   * Find source by ID
   */
  async findSourceById(id: string): Promise<SourceNode | null> {
    return this.sourceRepository.findById(id);
  }

  /**
   * Search and transform data from all registered connectors
   * Uses the transform-on-ingest pattern to ensure data privacy
   */
  async searchAndTransformAll(
    query: string,
    options?: ConnectorSearchOptions & {
      platforms?: string[];
    }
  ): Promise<NarrativeInsight[]> {
    const targetConnectors = options?.platforms
      ? Array.from(this.connectors.values()).filter((connector) =>
          options.platforms!.includes(connector.platform)
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

  /**
   * Search all registered connectors and return both raw posts and insights.
   * The raw posts preserve the original text, author info, and URLs needed
   * by the dashboard frontend.
   */
  async searchWithRawDataAll(
    query: string,
    options?: ConnectorSearchOptions & {
      platforms?: string[];
    }
  ): Promise<{ posts: SocialMediaPost[]; insights: NarrativeInsight[] }> {
    const targetConnectors = options?.platforms
      ? Array.from(this.connectors.values()).filter((connector) =>
          options.platforms!.includes(connector.platform)
        )
      : Array.from(this.connectors.values());

    const searchPromises = targetConnectors.map(async (connector) => {
      try {
        // Use searchWithRawData if the connector supports it (BaseSocialMediaConnector),
        // otherwise fall back to searchAndTransform with empty posts
        if ('searchWithRawData' in connector && typeof (connector as Record<string, unknown>).searchWithRawData === 'function') {
          return await (connector as { searchWithRawData: (q: string, o?: ConnectorSearchOptions) => Promise<{ posts: SocialMediaPost[]; insights: NarrativeInsight[] }> }).searchWithRawData(query, options);
        }
        const insights = await connector.searchAndTransform(query, options);
        return { posts: [] as SocialMediaPost[], insights };
      } catch (error) {
        const err = error as Error;
        this.logger.error(
          `Error searching ${connector.platform}: ${err.message}`,
          err.stack
        );
        return { posts: [] as SocialMediaPost[], insights: [] as NarrativeInsight[] };
      }
    });

    const results = await Promise.all(searchPromises);
    return {
      posts: results.flatMap((r) => r.posts),
      insights: results.flatMap((r) => r.insights),
    };
  }
}
