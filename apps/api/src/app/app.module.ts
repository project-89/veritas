import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { BullModule } from '@nestjs/bullmq';
import { join } from 'path';
import { DatabaseModule } from '@veritas/database';
import {
  AnalysisModule,
  SIGNAL_CACHE_STORE,
  PropagandaAnalysisService,
  ClaimVerificationService,
  DownstreamEffectsService,
  DeepInvestigationService,
  CrossPlatformIdentityService,
  SourceCredibilityService,
  GraphBotDetectionService,
  PsychologicalProfilerService,
} from '@veritas/analysis';
import { SignalCacheRepository } from '@veritas/ingestion';
import {
  PROPAGANDA_SERVICE,
  CLAIM_VERIFICATION_SERVICE,
  DOWNSTREAM_EFFECTS_SERVICE,
  DEEP_INVESTIGATION_SERVICE,
  CROSS_PLATFORM_SERVICE,
  SOURCE_CREDIBILITY_SERVICE,
  GRAPH_BOT_DETECTION_SERVICE,
  PSYCHOLOGICAL_PROFILER_SERVICE,
} from '@veritas/ingestion';
import { AnalysisProcessor } from '@veritas/ingestion';
import { ContentClassificationModule } from '@veritas/content-classification';
import { IngestionModule } from '@veritas/ingestion';
import { InvestigationController } from './controllers/investigation.controller';
import { MonitorController } from './controllers/monitor.controller';
import { EventsController } from './controllers/events.controller';
import { LoggingService } from './services/logging.service';
import { RefreshService } from './services/refresh.service';
import { SchedulerService } from './services/scheduler.service';
import { LoggingMiddleware } from './middleware/logging.middleware';
import { DatabaseService } from '@veritas/database';

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
        host: process.env['REDIS_HOST'] || 'localhost',
        port: parseInt(process.env['REDIS_PORT'] || '6379', 10),
      },
    }),

    // GraphQL
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
      playground: process.env['NODE_ENV'] !== 'production',
    }),

    // Database Modules
    DatabaseModule.register({
      providerType: 'mongodb',
      providerOptions: {
        uri: process.env['MONGODB_URI'] || 'mongodb://localhost:27017',
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
      useFactory: (configService: ConfigService, dbService: DatabaseService) =>
        dbService,
      inject: [ConfigService, DatabaseService],
    },
    // Bridge ingestion's SignalCacheRepository to analysis's SIGNAL_CACHE_STORE token
    { provide: SIGNAL_CACHE_STORE, useExisting: SignalCacheRepository },
    // Bridge analysis services to ingestion's AnalysisProcessor tokens
    { provide: PROPAGANDA_SERVICE, useExisting: PropagandaAnalysisService },
    { provide: CLAIM_VERIFICATION_SERVICE, useExisting: ClaimVerificationService },
    { provide: DOWNSTREAM_EFFECTS_SERVICE, useExisting: DownstreamEffectsService },
    { provide: DEEP_INVESTIGATION_SERVICE, useExisting: DeepInvestigationService },
    { provide: CROSS_PLATFORM_SERVICE, useExisting: CrossPlatformIdentityService },
    { provide: SOURCE_CREDIBILITY_SERVICE, useExisting: SourceCredibilityService },
    { provide: GRAPH_BOT_DETECTION_SERVICE, useExisting: GraphBotDetectionService },
    { provide: PSYCHOLOGICAL_PROFILER_SERVICE, useExisting: PsychologicalProfilerService },
    // Memgraph is now handled by GraphDatabaseService in AnalysisModule (auto-connects with graceful fallback).
    // Uncomment when Redis is available:
    // { provide: 'REDIS_SERVICE', useFactory: (db: DatabaseService) => db, inject: [DatabaseService] },
  ],
  controllers: [InvestigationController, MonitorController, EventsController],
  exports: ['MONGODB_SERVICE'],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingMiddleware).forRoutes('*');
  }
}
