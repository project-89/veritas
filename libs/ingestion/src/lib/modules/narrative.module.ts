import { Module, DynamicModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
// import { RedisModule } from '@veritas/shared';
import { NarrativeController } from '../controllers/narrative.controller';
import {
  NarrativeRepository,
  InMemoryNarrativeRepository,
} from '../repositories/narrative-insight.repository';
import { MongoNarrativeRepository } from '../repositories/mongo-narrative.repository';
import { TransformOnIngestService } from '../services/transform/transform-on-ingest.service';
import { AnonymizedSocialMediaService } from '../services/anonymized-social-media.service';
import { TwitterConnector } from '../services/twitter.connector';
import { FacebookConnector } from '../services/facebook.connector';
import { RedditConnector } from '../services/reddit.connector';
import { IngestionResolver } from '../resolvers/ingestion.resolver';
// import { ContentClassificationService } from '@/modules/content/services/content-classification.service';
import { MongoDBModule } from './mongodb.module';

/**
 * Configuration options for the Narrative Module
 */
export interface NarrativeModuleOptions {
  /**
   * The repository implementation to use
   * - 'memory' (default): Uses the in-memory implementation for development/testing
   * - 'mongodb': Uses the MongoDB implementation for production
   */
  repositoryType?: 'memory' | 'mongodb';
}

/**
 * Mock ContentClassificationService for dependency resolution
 * In a real app, this would be imported from the content module
 */
class ContentClassificationService {
  async classifyContent(text: string) {
    return {
      categories: [],
      sentiment: 'neutral',
      toxicity: 0,
      topics: [],
    };
  }
}

/**
 * Module for narrative processing and management
 * Provides controllers, services, and repositories for processing social media data
 * into narrative insights and trends
 */
@Module({})
export class NarrativeModule {
  /**
   * Configure the narrative module with specific options
   * @param options Configuration options for the narrative module
   * @returns A DynamicModule configured with the specified options
   */
  static forRoot(options: NarrativeModuleOptions = {}): DynamicModule {
    const { repositoryType = 'memory' } = options;

    // Determine which modules to import based on the repository type
    const imports = [
      ConfigModule,
      // RedisModule,
      ClientsModule.register([
        {
          name: 'KAFKA_SERVICE',
          transport: Transport.KAFKA,
          options: {
            client: {
              clientId: 'narrative',
              brokers: ['localhost:9092'],
            },
            consumer: {
              groupId: 'narrative-consumer',
            },
          },
        },
      ]),
    ];

    // If using MongoDB, include the MongoDB module
    if (repositoryType === 'mongodb') {
      imports.push(MongoDBModule as any);
    }

    // Configure the repository provider based on the repository type
    const repositoryProvider = {
      provide: NarrativeRepository,
      useClass:
        repositoryType === 'mongodb'
          ? MongoNarrativeRepository
          : InMemoryNarrativeRepository,
    };

    return {
      module: NarrativeModule,
      imports,
      controllers: [NarrativeController],
      providers: [
        // Repository
        repositoryProvider,

        // Core services
        TransformOnIngestService,
        AnonymizedSocialMediaService,

        // Connectors
        TwitterConnector,
        FacebookConnector,
        RedditConnector,

        // Classification
        ContentClassificationService,

        // GraphQL resolvers
        IngestionResolver,

        // External services
        {
          provide: 'MEMGRAPH_SERVICE',
          useValue: {
            createNode: jest.fn(),
            createRelationship: jest.fn(),
            executeQuery: jest.fn(),
          },
        },
      ],
      exports: [
        NarrativeRepository,
        TransformOnIngestService,
        AnonymizedSocialMediaService,
      ],
    };
  }

  /**
   * Default configuration for the narrative module
   * Uses the in-memory repository for simplicity
   */
  static register(): DynamicModule {
    return this.forRoot({ repositoryType: 'memory' });
  }
}
