import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { DatabaseModule } from '@/database';

// Original platform connectors
import { TwitterConnector as OriginalTwitterConnector } from '../services/twitter.connector';
import { RedditConnector as OriginalRedditConnector } from '../services/reddit.connector';

// Services
import { SocialMediaService } from '../services/social-media.service';
import {
  NarrativeRepository,
  InMemoryNarrativeRepository,
} from '../repositories/narrative-insight.repository';
import { IngestionController } from '../controllers/ingestion.controller';
import { IngestionResolver } from '../resolvers/ingestion.resolver';
import { ContentClassificationService } from '@/modules/content/services/content-classification.service';

// Transform-on-ingest architecture
import { TransformOnIngestModule } from './transform-on-ingest.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    // Import the transform-on-ingest module
    TransformOnIngestModule,
    ClientsModule.registerAsync([
      {
        name: 'KAFKA_SERVICE',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.KAFKA,
          options: {
            client: {
              clientId: 'veritas-ingestion',
              brokers: configService
                .get<string>('KAFKA_BROKERS', 'localhost:9092')
                .split(','),
            },
            consumer: {
              groupId: 'veritas-ingestion-consumer',
            },
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  providers: [
    // Repository
    {
      provide: NarrativeRepository,
      useClass: InMemoryNarrativeRepository,
    },

    // Original Social Media Connectors (soon to be replaced)
    OriginalTwitterConnector,
    OriginalRedditConnector,
    SocialMediaService,

    // GraphQL resolvers
    IngestionResolver,
    ContentClassificationService,

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
  controllers: [IngestionController],
  exports: [SocialMediaService, NarrativeRepository],
})
export class IngestionModule {}
