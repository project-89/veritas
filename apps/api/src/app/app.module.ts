import { BullModule } from '@nestjs/bullmq';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import {
  AnalysisModule,
  ClaimVerificationService,
  CrossPlatformIdentityService,
  DeepInvestigationService,
  DownstreamEffectsService,
  GLOBAL_EVENT_REPOSITORY,
  GraphBotDetectionService,
  PropagandaAnalysisService,
  SIGNAL_CACHE_STORE,
  SourceCredibilityService,
} from '@veritas/analysis';
import { ContentClassificationModule } from '@veritas/content-classification';
import { DatabaseModule, DatabaseService } from '@veritas/database';
import {
  AnalysisProcessor,
  CLAIM_VERIFICATION_SERVICE,
  CROSS_PLATFORM_SERVICE,
  DEEP_INVESTIGATION_SERVICE,
  DOWNSTREAM_EFFECTS_SERVICE,
  GlobalEventRepository,
  GRAPH_BOT_DETECTION_SERVICE,
  getAllFeeds,
  IngestionModule,
  PROPAGANDA_SERVICE,
  SignalCacheRepository,
  SOURCE_CREDIBILITY_SERVICE,
} from '@veritas/ingestion';
import { CapabilitiesController } from './controllers/capabilities.controller';
import { MaritimeController } from './controllers/maritime.controller';
import { WebSearchController } from './controllers/web-search.controller';
import { EventsController } from './controllers/events.controller';
import { HealthController } from './controllers/health.controller';
import { InvestigationController } from './controllers/investigation.controller';
import { MonitorController } from './controllers/monitor.controller';
import { PluginsController } from './controllers/plugins.controller';
import {
  GENERATED_PLUGIN_APP_PROVIDERS,
  GENERATED_PLUGIN_CONTROLLERS,
} from './generated-plugin-backend';
import { ApiKeyGuard } from './guards/api-key.guard';
import { LoggingMiddleware } from './middleware/logging.middleware';
import { LoggingService } from './services/logging.service';
import { RefreshService } from './services/refresh.service';
import { SchedulerService } from './services/scheduler.service';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Rate limiting — generous global ceiling per client IP; expensive
    // endpoints declare stricter @Throttle overrides locally
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 300,
      },
    ]),

    // BullMQ — Redis-backed job queue (used by scan workers)
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST') || 'localhost',
          port: parseInt(config.get<string>('REDIS_PORT') || '6379', 10),
        },
      }),
    }),

    // Database Modules
    // NOTE: DatabaseModule only exposes a synchronous register() (no async/
    // factory variant), so its options are evaluated at decorator time —
    // before Nest DI exists. Direct process.env access is intentional here;
    // dotenv is loaded in main.ts before AppModule is imported.
    DatabaseModule.register({
      providerType: 'mongodb',
      providerOptions: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
        databaseName: 'veritas',
      },
      isGlobal: true,
    }),

    // Memgraph is handled by GraphDatabaseService (in AnalysisModule) with
    // graceful degradation — no DatabaseModule.register needed.

    // Redis is optional — uncomment when available
    // DatabaseModule.register({
    //   providerType: 'redis',
    //   providerOptions: {
    //     uri: process.env['REDIS_URI'] || 'redis://localhost:6379',
    //     databaseName: '0',
    //   },
    // }),

    // Feature Modules
    IngestionModule.forRoot({
      repositoryType: 'mongodb',
    }),
    // Pass the RSS feed catalog into AnalysisModule's own scope so the
    // aggregation service actually receives it (a plain AppModule provider is
    // invisible to the child module and silently defaults to []).
    AnalysisModule.forRoot({ rssFeeds: getAllFeeds() }),
    ContentClassificationModule.forRoot(),
  ],
  providers: [
    // API-key auth on every route when VERITAS_API_KEY is set (validate-env
    // refuses to start production without it)
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    LoggingService,
    RefreshService,
    SchedulerService,
    // Analysis queue processor — lives here so it can inject services from both AnalysisModule and IngestionModule
    AnalysisProcessor,
    {
      provide: 'MONGODB_SERVICE',
      useFactory: (_configService: ConfigService, dbService: DatabaseService) => dbService,
      inject: [ConfigService, DatabaseService],
    },
    // Bridge ingestion repositories to analysis tokens
    { provide: SIGNAL_CACHE_STORE, useExisting: SignalCacheRepository },
    { provide: GLOBAL_EVENT_REPOSITORY, useExisting: GlobalEventRepository },
    // Bridge analysis services to ingestion's AnalysisProcessor tokens
    { provide: PROPAGANDA_SERVICE, useExisting: PropagandaAnalysisService },
    { provide: CLAIM_VERIFICATION_SERVICE, useExisting: ClaimVerificationService },
    { provide: DOWNSTREAM_EFFECTS_SERVICE, useExisting: DownstreamEffectsService },
    { provide: DEEP_INVESTIGATION_SERVICE, useExisting: DeepInvestigationService },
    { provide: CROSS_PLATFORM_SERVICE, useExisting: CrossPlatformIdentityService },
    { provide: SOURCE_CREDIBILITY_SERVICE, useExisting: SourceCredibilityService },
    { provide: GRAPH_BOT_DETECTION_SERVICE, useExisting: GraphBotDetectionService },
    ...GENERATED_PLUGIN_APP_PROVIDERS,
    // Memgraph is now handled by GraphDatabaseService in AnalysisModule (auto-connects with graceful fallback).
    // Uncomment when Redis is available:
    // { provide: 'REDIS_SERVICE', useFactory: (db: DatabaseService) => db, inject: [DatabaseService] },
  ],
  controllers: [
    HealthController,
    InvestigationController,
    MonitorController,
    EventsController,
    CapabilitiesController,
    WebSearchController,
    MaritimeController,
    PluginsController,
    ...GENERATED_PLUGIN_CONTROLLERS,
  ],
  exports: ['MONGODB_SERVICE'],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingMiddleware).forRoutes('*');
  }
}
