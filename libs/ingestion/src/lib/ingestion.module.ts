import { BullModule } from '@nestjs/bullmq';
import { DynamicModule, ForwardReference, Module, Provider, Type } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  ContentClassificationModule,
  ContentClassificationService,
  EmbeddingsService,
} from '@veritas/content-classification';
import { DatabaseModule, DatabaseService } from '@veritas/database';
import { AnalysisJobController } from './controllers/analysis-job.controller';
import { IngestionController } from './controllers/ingestion.controller';
import { InvestigationController } from './controllers/investigation.controller';
import { NarrativeController } from './controllers/narrative.controller';
import { ScanController } from './controllers/scan.controller';
import {
  BLUESKY_CONNECTOR,
  FACEBOOK_CONNECTOR,
  FARCASTER_CONNECTOR,
  FOURCHAN_CONNECTOR,
  REDDIT_CONNECTOR,
  TELEGRAM_CONNECTOR,
  TRUTHSOCIAL_CONNECTOR,
  TWITTER_CONNECTOR,
  WIKIPEDIA_CONNECTOR,
  YOUTUBE_CONNECTOR,
} from './interfaces/connector-tokens';
import { ScanProcessor } from './queue/scan.processor';
import { AlertRepository } from './repositories/alert.repository';
import { AnalysisJobRepository } from './repositories/analysis-job.repository';
import { EmbeddingCacheRepository } from './repositories/embedding-cache.repository';
import { GlobalEventRepository } from './repositories/global-event.repository';
import { IdentityRecordRepository } from './repositories/identity-record.repository';
import { InvestigationRepository } from './repositories/investigation.repository';
import { MentalModelRepository } from './repositories/mental-model.repository';
import { MongoNarrativeRepository } from './repositories/mongo-narrative.repository';
import {
  InMemoryNarrativeRepository,
  NarrativeRepository,
} from './repositories/narrative-insight.repository';
import { ProjectDossierRepository } from './repositories/project-dossier.repository';
import { RssCacheRepository } from './repositories/rss-cache.repository';
import { ScanJobRepository } from './repositories/scan-job.repository';
import { SignalCacheRepository } from './repositories/signal-cache.repository';
import { IngestionResolver } from './resolvers/ingestion.resolver';
import { FourChanFreeConnector } from './services/4chan-free.connector';
import { BlueskyFreeConnector } from './services/bluesky-free.connector';
import { FacebookJinaConnector } from './services/facebook-jina.connector';
import { FarcasterFreeConnector } from './services/farcaster-free.connector';
import { IngestionService } from './services/ingestion.service';
import { InvestigationEvidenceService } from './services/investigation-evidence.service';
import { MentalModelService } from './services/mental-model.service';
import { OnChainCorrelationService } from './services/onchain-correlation.service';
import { ProjectDossierService } from './services/project-dossier.service';
import { RedditFreeConnector } from './services/reddit-free.connector';
import { RSSConnector } from './services/rss.connector';
import { TelegramFreeConnector } from './services/telegram-free.connector';
import { TransformOnIngestService } from './services/transform/transform-on-ingest.service';
import { TruthSocialFreeConnector } from './services/truthsocial-free.connector';
import { TwitterFreeConnector } from './services/twitter-free.connector';
import { JinaReaderService } from './services/utils/jina-reader.service';
import { SubprocessUtil } from './services/utils/subprocess.util';
import { WebScraperConnector } from './services/web-scraper.connector';
import { WikipediaEventsConnector } from './services/wikipedia-events.connector';
import { YouTubeFreeConnector } from './services/youtube-free.connector';

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
    truthsocial?: boolean;
    farcaster?: boolean;
    telegram?: boolean;
    wikipedia?: boolean;
    bluesky?: boolean;
    fourchan?: boolean;
  };

  /**
   * Set module as global
   */
  isGlobal?: boolean;
}

@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: NestJS modules use the static forRoot pattern by design.
export class IngestionModule {
  /**
   * Register the ingestion module with configuration options
   * @param options Module configuration options
   */
  static forRoot(options?: IngestionModuleOptions): DynamicModule {
    const imports: Array<Type<object> | DynamicModule | Promise<DynamicModule> | ForwardReference> =
      [
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
        }),
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
        }),
      );
    }

    // Add BullMQ queues
    imports.push(
      BullModule.registerQueue({ name: 'scan' }),
      BullModule.registerQueue({ name: 'analysis' }),
    );

    // Configure providers
    const providers: Provider[] = [
      IngestionService,
      TransformOnIngestService,
      IngestionResolver,
      InvestigationRepository,
      ScanJobRepository,
      ScanProcessor,
      AlertRepository,
      SignalCacheRepository,
      AnalysisJobRepository,
      IdentityRecordRepository,
      GlobalEventRepository,
      ProjectDossierRepository,
      MentalModelRepository,
      InvestigationEvidenceService,
      ProjectDossierService,
      OnChainCorrelationService,
      MentalModelService,
      EmbeddingCacheRepository,
      RssCacheRepository,
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

    // Configure connectors - default to 'free' (API-free) if not specified.
    // WebScraper stays disabled by default because it is only useful when
    // explicitly pointed at real target URLs from evidence intake.
    const connectorConfig = options?.connectors || {
      twitter: true,
      facebook: true,
      reddit: true,
      rss: true,
      webScraper: false,
      youtube: true,
    };

    // All connectors are API-free — no paid API keys needed
    // Only register via injection token — do NOT also push the bare class,
    // otherwise NestJS creates two instances and duplicates all searches.
    if (connectorConfig.reddit) {
      providers.push({ provide: REDDIT_CONNECTOR, useClass: RedditFreeConnector });
    }

    if (connectorConfig.twitter) {
      providers.push({ provide: TWITTER_CONNECTOR, useClass: TwitterFreeConnector });
    }

    if (connectorConfig.facebook) {
      providers.push({ provide: FACEBOOK_CONNECTOR, useClass: FacebookJinaConnector });
    }

    if (connectorConfig.youtube) {
      providers.push({ provide: YOUTUBE_CONNECTOR, useClass: YouTubeFreeConnector });
    }

    if (connectorConfig.truthsocial) {
      providers.push({ provide: TRUTHSOCIAL_CONNECTOR, useClass: TruthSocialFreeConnector });
    }

    if (connectorConfig.farcaster !== false) {
      providers.push({ provide: FARCASTER_CONNECTOR, useClass: FarcasterFreeConnector });
    }

    if (connectorConfig.telegram !== false) {
      providers.push({ provide: TELEGRAM_CONNECTOR, useClass: TelegramFreeConnector });
    }

    if ((connectorConfig as Record<string, unknown>)['wikipedia'] !== false) {
      providers.push({ provide: WIKIPEDIA_CONNECTOR, useClass: WikipediaEventsConnector });
    }

    if ((connectorConfig as Record<string, unknown>)['bluesky'] !== false) {
      providers.push({ provide: BLUESKY_CONNECTOR, useClass: BlueskyFreeConnector });
    }

    if ((connectorConfig as Record<string, unknown>)['fourchan'] !== false) {
      providers.push({ provide: FOURCHAN_CONNECTOR, useClass: FourChanFreeConnector });
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
      InvestigationRepository,
      ScanJobRepository,
      AlertRepository,
      SignalCacheRepository,
      AnalysisJobRepository,
      IdentityRecordRepository,
      GlobalEventRepository,
      EmbeddingCacheRepository,
      RssCacheRepository,
      BullModule,
      // Only export EmbeddingsService if it's enabled
      ...(options?.enableEmbeddings ? [EmbeddingsService] : []),
    ];

    return {
      module: IngestionModule,
      imports,
      controllers: [
        IngestionController,
        NarrativeController,
        InvestigationController,
        ScanController,
        AnalysisJobController,
      ],
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
    return IngestionModule.forRoot({
      repositoryType: 'memory',
      enableEmbeddings: false,
      isGlobal: false,
    });
  }
}
