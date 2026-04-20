import { join } from 'node:path';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { BullModule } from '@nestjs/bullmq';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
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
  IngestionModule,
  PROPAGANDA_SERVICE,
  SignalCacheRepository,
  SOURCE_CREDIBILITY_SERVICE,
} from '@veritas/ingestion';
import { EventsController } from './controllers/events.controller';
import { InvestigationController } from './controllers/investigation.controller';
import { MonitorController } from './controllers/monitor.controller';
import { PluginsController } from './controllers/plugins.controller';
import { GENERATED_PLUGIN_APP_PROVIDERS, GENERATED_PLUGIN_CONTROLLERS } from './generated-plugin-backend';
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

    // BullMQ — Redis-backed job queue (used by scan workers)
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    }),

    // GraphQL
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
      playground: process.env.NODE_ENV !== 'production',
    }),

    // Database Modules
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
    AnalysisModule,
    ContentClassificationModule.forRoot(),
  ],
  providers: [
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
  controllers: [InvestigationController, MonitorController, EventsController, PluginsController, ...GENERATED_PLUGIN_CONTROLLERS],
  exports: ['MONGODB_SERVICE'],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingMiddleware).forRoutes('*');
  }
}
