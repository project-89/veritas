import { Module, DynamicModule, Provider } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IngestionController } from './controllers/ingestion.controller';
import { DatabaseModule, DatabaseService } from '@veritas/database';
import { IngestionResolver } from './resolvers/ingestion.resolver';
import { TransformOnIngestService } from './services/transform/transform-on-ingest.service';
import { RedditConnector } from './services/reddit.connector';
import { FacebookConnector } from './services/facebook.connector';
import { RSSConnector } from './services/rss.connector';
import { WebScraperConnector } from './services/web-scraper.connector';
import { YouTubeConnector } from './services/youtube.connector';
import { IngestionService } from './services/ingestion.service';
import {
  ContentClassificationModule,
  ContentClassificationService,
} from '@veritas/content-classification';
import {
  NarrativeRepository,
  InMemoryNarrativeRepository,
} from './repositories/narrative-insight.repository';
import { MongoNarrativeRepository } from './repositories/mongo-narrative.repository';

/**
 * Configuration options for the Ingestion Module
 */
export interface IngestionModuleOptions {
  /**
   * Database provider instance to use
   */
  databaseProvider?: any;

  /**
   * Content classification provider to use
   */
  contentClassificationProvider?: any;

  /**
   * Repository type to use for narrative insights
   * - 'memory' (default): In-memory repository for development
   * - 'mongodb': MongoDB repository for production
   */
  repositoryType?: 'memory' | 'mongodb';

  /**
   * Enable or disable specific connectors
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
    const imports = [
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
            uri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
            databaseName: 'veritas',
          },
        })
      );
    }

    // Add content classification module if not provided
    if (!options?.contentClassificationProvider) {
      imports.push(ContentClassificationModule.forRoot());
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

    // Configure connectors - default to true if not specified
    const connectorConfig = options?.connectors || {
      twitter: true,
      facebook: true,
      reddit: true,
      rss: true,
      webScraper: true,
      youtube: true,
    };

    if (connectorConfig.twitter) providers.push(RedditConnector);
    if (connectorConfig.facebook) providers.push(FacebookConnector);
    if (connectorConfig.reddit) providers.push(RedditConnector);
    if (connectorConfig.rss) providers.push(RSSConnector);
    if (connectorConfig.webScraper) providers.push(WebScraperConnector);
    if (connectorConfig.youtube) providers.push(YouTubeConnector);

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

    return {
      module: IngestionModule,
      imports,
      controllers: [IngestionController],
      providers,
      exports: [
        IngestionService,
        NarrativeRepository,
        TransformOnIngestService,
      ],
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
      isGlobal: false,
    });
  }
}
