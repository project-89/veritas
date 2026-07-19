import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { DatabaseService, Repository } from '@veritas/database';
import { NarrativeInsight } from '../../types/narrative-insight.interface';
import { SocialMediaPost } from '../../types/social-media.types';
import {
  BLUESKY_CONNECTOR,
  FACEBOOK_CONNECTOR,
  FARCASTER_CONNECTOR,
  FOURCHAN_CONNECTOR,
  GDELT_CONNECTOR,
  REDDIT_CONNECTOR,
  TELEGRAM_CONNECTOR,
  TRUTHSOCIAL_CONNECTOR,
  TWITTER_CONNECTOR,
  WIKIPEDIA_CONNECTOR,
  YOUTUBE_CONNECTOR,
} from '../interfaces/connector-tokens';
import { ConnectorSearchOptions, DataConnector } from '../interfaces/data-connector.interface';
import { NarrativeRepository } from '../repositories/narrative-insight.repository';
import { ContentNode, SourceNode } from '../schemas/base.schema';
import { RSSConnector } from './rss.connector';
import { WebScraperConnector } from './web-scraper.connector';

type RawDataConnector = DataConnector & {
  searchWithRawData?: (
    query: string,
    options?: ConnectorSearchOptions,
  ) => Promise<{ posts: SocialMediaPost[]; insights: NarrativeInsight[] }>;
};

/** One connector's runtime status, as determined at registration. */
export interface ConnectorCapability {
  platform: string;
  status: 'live' | 'failed' | 'disabled';
  detail?: string;
}

/**
 * Service that manages ingestion connections and data flow
 * Provides a unified interface for accessing all data connectors
 */
@Injectable()
export class IngestionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IngestionService.name);
  private connectors: Map<string, DataConnector> = new Map();
  private connectorCapability: ConnectorCapability[] = [];
  private contentRepository!: Repository<ContentNode>;
  private sourceRepository!: Repository<SourceNode>;

  constructor(
    @Optional() @Inject(REDDIT_CONNECTOR) private readonly redditConnector: DataConnector,
    @Optional() @Inject(TWITTER_CONNECTOR) private readonly twitterConnector: DataConnector,
    @Optional() @Inject(FACEBOOK_CONNECTOR) private readonly facebookConnector: DataConnector,
    @Optional() @Inject(YOUTUBE_CONNECTOR) private readonly youtubeConnector: DataConnector,
    @Optional()
    @Inject(TRUTHSOCIAL_CONNECTOR)
    private readonly truthSocialConnector: DataConnector,
    @Optional() @Inject(FARCASTER_CONNECTOR) private readonly farcasterConnector: DataConnector,
    @Optional() @Inject(TELEGRAM_CONNECTOR) private readonly telegramConnector: DataConnector,
    @Optional()
    @Inject(WIKIPEDIA_CONNECTOR)
    private readonly wikipediaConnector: DataConnector,
    @Optional() @Inject(BLUESKY_CONNECTOR) private readonly blueskyConnector: DataConnector,
    @Optional() @Inject(FOURCHAN_CONNECTOR) private readonly fourchanConnector: DataConnector,
    @Optional() @Inject(GDELT_CONNECTOR) private readonly gdeltConnector: DataConnector,
    @Optional() private readonly rssFeedConnector: RSSConnector,
    @Optional() private readonly webScraperConnector: WebScraperConnector,
    private readonly databaseService: DatabaseService,
    private readonly narrativeRepository: NarrativeRepository,
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
        this.logger.warn('Models already registered or error registering models', error);
      }

      // Get repositories
      this.contentRepository = this.databaseService.getRepository<ContentNode>('Content');
      this.sourceRepository = this.databaseService.getRepository<SourceNode>('Source');

      this.logger.log('Repositories initialized successfully');
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Failed to initialize repositories: ${err.message}`, err.stack);
    }
  }

  /**
   * Register all available connectors from injected instances
   */
  private async registerAvailableConnectors() {
    const connectors: DataConnector[] = [
      this.redditConnector,
      this.twitterConnector,
      this.facebookConnector,
      this.youtubeConnector,
      this.truthSocialConnector,
      this.farcasterConnector,
      this.telegramConnector,
      this.wikipediaConnector,
      this.blueskyConnector,
      this.fourchanConnector,
      this.gdeltConnector,
      this.rssFeedConnector,
      this.webScraperConnector,
    ].filter((connector) => connector !== undefined);

    const results: Array<{
      platform: string;
      status: 'live' | 'failed' | 'disabled';
      detail?: string;
    }> = [];
    for (const connector of connectors) {
      // Credential gate: if a connector declares required env vars that are
      // absent, disable it up front instead of registering it and letting
      // every scan fail per-request (e.g. Reddit 403s without OAuth keys).
      const missing = connector.getMissingCredentials?.() ?? [];
      if (missing.length > 0) {
        results.push({
          platform: connector.platform,
          status: 'disabled',
          detail: `missing ${missing.join(', ')}`,
        });
        continue;
      }

      const error = await this.registerConnector(connector);
      results.push(
        error
          ? { platform: connector.platform, status: 'failed', detail: error }
          : { platform: connector.platform, status: 'live' },
      );
    }

    // Startup capability table — one authoritative log of what this
    // deployment can actually reach, so degraded sources are visible up
    // front instead of surfacing as mystery-empty scan results. Kept on the
    // instance so /capabilities can serve it — the UI builds its platform
    // picker from THIS, never from a hardcoded list that can drift.
    this.connectorCapability = results;
    const live = results.filter((r) => r.status === 'live').map((r) => r.platform);
    const disabled = results.filter((r) => r.status === 'disabled');
    const failed = results.filter((r) => r.status === 'failed');
    this.logger.log(
      `Connector capability: ${live.length}/${results.length} live [${live.join(', ') || 'none'}]`,
    );
    for (const d of disabled) {
      this.logger.warn(`Connector DISABLED: ${d.platform} — ${d.detail}`);
    }
    for (const f of failed) {
      this.logger.warn(`Connector UNAVAILABLE: ${f.platform} — ${f.detail}`);
    }
  }

  async onModuleDestroy() {
    // Disconnect all connectors
    for (const connector of this.connectors.values()) {
      await connector.disconnect();
    }
  }

  /** Runtime connector statuses — the single source of truth for what this
   *  deployment can search. UIs must build from this, not hardcoded lists. */
  getConnectorCapability(): ConnectorCapability[] {
    return [...this.connectorCapability];
  }

  /**
   * Register a data connector with the service.
   * Returns undefined on success, or the failure reason.
   */
  private async registerConnector(connector: DataConnector): Promise<string | undefined> {
    try {
      await connector.connect();
      this.connectors.set(connector.platform, connector);

      this.logger.log(`Registered connector for platform: ${connector.platform}`);
      return undefined;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Failed to register connector for platform: ${connector.platform}`,
        err.stack,
      );
      return err.message;
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
    },
  ): Promise<NarrativeInsight[]> {
    const selectedPlatforms = options?.platforms;
    const targetConnectors = selectedPlatforms
      ? Array.from(this.connectors.values()).filter((connector) =>
          selectedPlatforms.includes(connector.platform),
        )
      : Array.from(this.connectors.values());

    const searchPromises = targetConnectors.map((connector) =>
      connector.searchAndTransform(query, options).catch((error) => {
        this.logger.error(`Error searching ${connector.platform}: ${error.message}`, error.stack);
        return [] as NarrativeInsight[];
      }),
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
    },
  ): Promise<{ posts: SocialMediaPost[]; insights: NarrativeInsight[] }> {
    const selectedPlatforms = options?.platforms;
    const targetConnectors = selectedPlatforms
      ? Array.from(this.connectors.values()).filter((connector) =>
          selectedPlatforms.includes(connector.platform),
        )
      : Array.from(this.connectors.values());

    // Process connectors sequentially so we don't overwhelm Gemini with
    // concurrent sentiment batches from multiple connectors at once.
    // Each connector fetches posts + classifies them (including Gemini calls)
    // before the next one starts.
    const allPosts: SocialMediaPost[] = [];
    const allInsights: NarrativeInsight[] = [];

    for (const connector of targetConnectors) {
      try {
        this.logger.log(`[search] Starting ${connector.platform}...`);
        const start = Date.now();

        let result: { posts: SocialMediaPost[]; insights: NarrativeInsight[] };
        const rawDataConnector = connector as RawDataConnector;
        if (typeof rawDataConnector.searchWithRawData === 'function') {
          result = await rawDataConnector.searchWithRawData(query, options);
        } else {
          const insights = await connector.searchAndTransform(query, options);
          result = { posts: [], insights };
        }

        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        this.logger.log(
          `[search] ${connector.platform} done: ${result.posts.length} posts, ${result.insights.length} insights (${elapsed}s)`,
        );

        allPosts.push(...result.posts);
        allInsights.push(...result.insights);
      } catch (error) {
        const err = error as Error;
        this.logger.error(`[search] ${connector.platform} failed: ${err.message}`, err.stack);
        // Continue with other connectors
      }
    }

    this.logger.log(
      `[search] All connectors done: ${allPosts.length} posts, ${allInsights.length} insights total`,
    );
    return { posts: allPosts, insights: allInsights };
  }
}
