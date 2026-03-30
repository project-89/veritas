import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';
import { DatabaseModule } from '@veritas/database';
import { AnalysisModule } from '@veritas/analysis';
import { ContentClassificationModule } from '@veritas/content-classification';
import { IngestionModule } from '@veritas/ingestion';
import { LoggingService } from './services/logging.service';
import { LoggingMiddleware } from './middleware/logging.middleware';
import { DatabaseService } from '@veritas/database';

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

    // Database Modules
    DatabaseModule.register({
      providerType: 'mongodb',
      providerOptions: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
        databaseName: 'veritas',
      },
      isGlobal: true,
    }),

    DatabaseModule.register({
      providerType: 'memgraph',
      providerOptions: {
        uri: process.env.MEMGRAPH_URI || 'bolt://localhost:7687',
        databaseName: 'veritas',
        username: process.env.MEMGRAPH_USERNAME,
        password: process.env.MEMGRAPH_PASSWORD,
      },
    }),

    DatabaseModule.register({
      providerType: 'redis',
      providerOptions: {
        uri: process.env.REDIS_URI || 'redis://localhost:6379',
        databaseName: '0',
      },
    }),

    // Feature Modules
    IngestionModule.forRoot(),
    AnalysisModule,
    ContentClassificationModule,
  ],
  providers: [
    LoggingService,
    {
      provide: 'MONGODB_SERVICE',
      useFactory: (configService: ConfigService, dbService: DatabaseService) =>
        dbService,
      inject: [ConfigService, DatabaseService],
    },
    {
      provide: 'MEMGRAPH_SERVICE',
      useFactory: (configService: ConfigService, dbService: DatabaseService) =>
        dbService,
      inject: [ConfigService, DatabaseService],
    },
    {
      provide: 'REDIS_SERVICE',
      useFactory: (configService: ConfigService, dbService: DatabaseService) =>
        dbService,
      inject: [ConfigService, DatabaseService],
    },
  ],
  exports: ['MONGODB_SERVICE', 'MEMGRAPH_SERVICE', 'REDIS_SERVICE'],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingMiddleware).forRoutes('*');
  }
}
