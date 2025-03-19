import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
// import { RedisModule } from '@veritas/shared';
import { NarrativeController } from '../controllers/narrative.controller';
import {
  NarrativeRepository,
  InMemoryNarrativeRepository,
} from '../repositories/narrative-insight.repository';
import { TransformOnIngestService } from '../services/transform/transform-on-ingest.service';
import { AnonymizedSocialMediaService } from '../services/anonymized-social-media.service';
import { TwitterConnector } from '../services/twitter.connector';
import { FacebookConnector } from '../services/facebook.connector';
import { RedditConnector } from '../services/reddit.connector';
import { IngestionResolver } from '../resolvers/ingestion.resolver';
import { ContentClassificationService } from '@/modules/content/services/content-classification.service';

/**
 * Module for narrative processing and management
 * Provides controllers, services, and repositories for processing social media data
 * into narrative insights and trends
 */
@Module({
  imports: [
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
  ],
  controllers: [NarrativeController],
  providers: [
    // Repository
    {
      provide: NarrativeRepository,
      useClass: InMemoryNarrativeRepository,
    },

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
})
export class NarrativeModule {}
