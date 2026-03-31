import { Module, DynamicModule, Provider, Type, ForwardReference } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IngestionController } from './controllers/ingestion.controller';
import { NarrativeController } from './controllers/narrative.controller';
import { DatabaseModule, DatabaseService } from '@veritas/database';
import { IngestionResolver } from './resolvers/ingestion.resolver';
import { TransformOnIngestService } from './services/transform/transform-on-ingest.service';
import { RedditFreeConnector } from './services/reddit-free.connector';
import { FacebookJinaConnector } from './services/facebook-jina.connector';
import { TwitterFreeConnector } from './services/twitter-free.connector';
import { RSSConnector } from './services/rss.connector';
import { WebScraperConnector } from './services/web-scraper.connector';
import { YouTubeFreeConnector } from './services/youtube-free.connector';
import { IngestionService } from './services/ingestion.service';
import { SubprocessUtil } from './services/utils/subprocess.util';
import { JinaReaderService } from './services/utils/jina-reader.service';
import {
  ContentClassificationModule,
  ContentClassificationService,
  EmbeddingsService,
} from '@veritas/content-classification';
import {
  NarrativeRepository,
  InMemoryNarrativeRepository,
} from './repositories/narrative-insight.repository';
import { MongoNarrativeRepository } from './repositories/mongo-narrative.repository';
import {
  REDDIT_CONNECTOR,
  TWITTER_CONNECTOR,
  YOUTUBE_CONNECTOR,
  FACEBOOK_CONNECTOR,
} from './interfaces/connector-tokens';

/**
 * Configuration options for the Ingestion Module
 */
export interface IngestionModuleOptions {
  /**
   * Database provider instance to use
   */
  databaseProvider?: unknown;

  /**
   * Content classification provider to use
   */
  contentClassificationProvider?: unknown;

  /**
   * Repository type to use for narrative insights
   * - 'memory' (default): In-memory repository for development
   * - 'mongodb': MongoDB repository for production
   */
  repositoryType?: 'memory' | 'mongodb';

  /**
   * Enable embeddings for enhanced content analysis
   * @default false
   */
  enableEmbeddings?: boolean;

  /**
   * Embeddings configuration options
   */
  embeddingsOptions?: {
    /**
     * Endpoint for embeddings service
     */
    endpointUrl?: string;

    /**
     * API key for embeddings service
     */
    apiKey?: string;

    /**
     * Dimension of embeddings
     * @default 384
     */
    embeddingDim?: number;
  };

  /**
   * Enable or disable specific connectors.
   * All connectors are API-free (no paid API keys needed).
   * - true: Enable connector (default)
   * - false: Disable connector
   */
  connectors?: {
    twitter?: boolean;
    facebook?: boolean;
    reddit?: boolean;
    rss?: boolean;
    webScraper?: boolean;
    youtube?: boolean;
  };

  /**
   * Set module as global
   */
  isGlobal?: boolean;
}

@Module({})
export class IngestionModule {
  /**
   * Register the ingestion module with configuration options
   * @param options Module configuration options
   */
  static forRoot(options?: IngestionModuleOptions): DynamicModule {
    const imports: Array<Type<any> | DynamicModule | Promise<DynamicModule> | ForwardReference> = [
      ConfigModule.forRoot({
        isGlobal: true,
      }),
    ];

    // Add database module if not provided
    if (!options?.databaseProvider) {
      imports.push(
        DatabaseModule.register({
          providerType: 'mongodb',
          providerOptions: {
            uri: process.env['MONGODB_URI'] || 'mongodb://localhost:27017',
            databaseName: 'veritas',
          },
        })
      );
    }

    // Add content classification module if not provided
    if (!options?.contentClassificationProvider) {
      imports.push(
        ContentClassificationModule.forRoot({
          // Pass through embedding options if embeddings are enabled
          enableEmbeddings: options?.enableEmbeddings || false,
          embeddingsOptions: options?.enableEmbeddings
            ? {
                endpointUrl: options.embeddingsOptions?.endpointUrl,
                apiKey: options.embeddingsOptions?.apiKey,
                embeddingDim: options.embeddingsOptions?.embeddingDim,
              }
            : undefined,
        })
      );
    }

    // Configure providers
    const providers: Provider[] = [
      IngestionService,
      TransformOnIngestService,
      IngestionResolver,
    ];

    // Configure repository
    if (options?.repositoryType === 'mongodb') {
      providers.push({
        provide: NarrativeRepository,
        useClass: MongoNarrativeRepository,
      });
    } else {
      providers.push({
        provide: NarrativeRepository,
        useClass: InMemoryNarrativeRepository,
      });
    }

    // Shared utilities needed by free connectors
    providers.push(SubprocessUtil, JinaReaderService);

    // Configure connectors - default to 'free' (API-free) if not specified
    const connectorConfig = options?.connectors || {
      twitter: true,
      facebook: true,
      reddit: true,
      rss: true,
      webScraper: true,
      youtube: true,
    };

    // All connectors are API-free — no paid API keys needed
    if (connectorConfig.reddit) {
      providers.push({ provide: REDDIT_CONNECTOR, useClass: RedditFreeConnector });
      providers.push(RedditFreeConnector);
    }

    if (connectorConfig.twitter) {
      providers.push({ provide: TWITTER_CONNECTOR, useClass: TwitterFreeConnector });
      providers.push(TwitterFreeConnector);
    }

    if (connectorConfig.facebook) {
      providers.push({ provide: FACEBOOK_CONNECTOR, useClass: FacebookJinaConnector });
      providers.push(FacebookJinaConnector);
    }

    if (connectorConfig.youtube) {
      providers.push({ provide: YOUTUBE_CONNECTOR, useClass: YouTubeFreeConnector });
      providers.push(YouTubeFreeConnector);
    }

    // RSS and WebScraper are already API-free
    if (connectorConfig.rss) providers.push(RSSConnector);
    if (connectorConfig.webScraper) providers.push(WebScraperConnector);

    // Database provider
    if (options?.databaseProvider) {
      providers.push({
        provide: DatabaseService,
        useValue: options.databaseProvider,
      });
    }

    // Content classification provider
    if (options?.contentClassificationProvider) {
      providers.push({
        provide: ContentClassificationService,
        useValue: options.contentClassificationProvider,
      });
    }

    const exports = [
      IngestionService,
      NarrativeRepository,
      TransformOnIngestService,
      // Only export EmbeddingsService if it's enabled
      ...(options?.enableEmbeddings ? [EmbeddingsService] : []),
    ];

    return {
      module: IngestionModule,
      imports,
      controllers: [IngestionController, NarrativeController],
      providers,
      exports,
      global: options?.isGlobal || false,
    };
  }

  /**
   * Register the ingestion module with default configuration
   * For quick setup in development
   */
  static register(): DynamicModule {
    return this.forRoot({
      repositoryType: 'memory',
      enableEmbeddings: false,
      isGlobal: false,
    });
  }
}
