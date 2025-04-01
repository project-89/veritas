import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';
import { DatabaseModule } from '@/database';
import { AnalysisModule } from '@/modules/analysis/analysis.module';
import { ContentClassificationModule } from '@veritas/content-classification';
import { SourcesModule } from '@/modules/sources/sources.module';
import { MonitoringModule } from '@/modules/monitoring/monitoring.module';
import { IngestionModule } from '@/modules/ingestion/ingestion.module';
import { VisualizationModule } from '@/modules/visualization/visualization.module';
import { LoggingService } from './services/logging.service';
import { LoggingMiddleware } from './middleware/logging.middleware';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // GraphQL
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
      playground: process.env.NODE_ENV !== 'production',
      definitions: {
        path: join(process.cwd(), 'src/graphql.ts'),
        outputAs: 'class',
      },
    }),

    // Core Modules
    DatabaseModule,

    // Feature Modules
    IngestionModule,
    AnalysisModule,
    ContentClassificationModule,
    SourcesModule,
    MonitoringModule,
    VisualizationModule,
  ],
  providers: [LoggingService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingMiddleware).forRoutes('*');
  }
}
