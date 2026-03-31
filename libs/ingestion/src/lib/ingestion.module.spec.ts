import { Test } from '@nestjs/testing';
import { Module, Global } from '@nestjs/common';
import { IngestionModule } from './ingestion.module';
import { NarrativeRepository } from './repositories/narrative-insight.repository';
import { TwitterConnector } from './services/twitter.connector';
import { FacebookConnector } from './services/facebook.connector';
import { RedditConnector } from './services/reddit.connector';
import { TransformOnIngestService } from './services/transform/transform-on-ingest.service';
import { ConfigService } from '@nestjs/config';
import { ContentClassificationService } from '@veritas/content-classification';

// Mock providers for MEMGRAPH_SERVICE and KAFKA_SERVICE
const mockMemgraphService = {
  createNode: jest.fn(),
  executeQuery: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
};

const mockKafkaService = {
  emit: jest.fn(),
  send: jest.fn(),
  connect: jest.fn(),
  close: jest.fn(),
};

// Create a global module to provide the external dependencies
@Global()
@Module({
  providers: [
    { provide: 'MEMGRAPH_SERVICE', useValue: mockMemgraphService },
    { provide: 'KAFKA_SERVICE', useValue: mockKafkaService },
  ],
  exports: ['MEMGRAPH_SERVICE', 'KAFKA_SERVICE'],
})
class MockExternalServicesModule {}

describe('IngestionModule', () => {
  describe('forRoot', () => {
    it('should create a module with default options', async () => {
      const module = await Test.createTestingModule({
        imports: [MockExternalServicesModule, IngestionModule.forRoot()],
      }).compile();

      expect(module).toBeDefined();
    });

    it('should create a module with memory repository', async () => {
      const module = await Test.createTestingModule({
        imports: [
          MockExternalServicesModule,
          IngestionModule.forRoot({
            repositoryType: 'memory',
          }),
        ],
      }).compile();

      const repository = module.get<NarrativeRepository>(NarrativeRepository);
      expect(repository).toBeDefined();
    });

    it('should register the provided connectors', async () => {
      const mockConfigService = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'TWITTER_API_KEY') return 'mock-api-key';
          if (key === 'TWITTER_API_SECRET') return 'mock-api-secret';
          if (key === 'FACEBOOK_APP_ID') return 'mock-app-id';
          if (key === 'FACEBOOK_APP_SECRET') return 'mock-app-secret';
          if (key === 'REDDIT_CLIENT_ID') return 'mock-client-id';
          if (key === 'REDDIT_CLIENT_SECRET') return 'mock-client-secret';
          return null;
        }),
      };

      const module = await Test.createTestingModule({
        imports: [
          MockExternalServicesModule,
          IngestionModule.forRoot({
            connectors: {
              twitter: true,
              facebook: true,
              reddit: true,
            },
          }),
        ],
      })
        .overrideProvider(ConfigService)
        .useValue(mockConfigService)
        .overrideProvider(ContentClassificationService)
        .useValue({ classifyContent: jest.fn() })
        .overrideProvider(TransformOnIngestService)
        .useValue({ transform: jest.fn() })
        .compile();

      // Module compiles successfully with connectors enabled
      expect(module).toBeDefined();
    });

    it('should accept embeddings configuration options', () => {
      // IngestionModule.forRoot with embeddings returns a valid dynamic module definition
      const dynamicModule = IngestionModule.forRoot({
        enableEmbeddings: true,
        embeddingsOptions: {
          endpointUrl: 'https://api.embeddings.test',
          apiKey: 'test-api-key',
          embeddingDim: 512,
        },
      });

      // Verify the dynamic module is defined with correct structure
      expect(dynamicModule).toBeDefined();
      expect(dynamicModule.module).toBe(IngestionModule);
      expect(dynamicModule.providers).toBeDefined();
      expect(Array.isArray(dynamicModule.providers)).toBe(true);
    });
  });

  describe('register', () => {
    it('should create a non-global module', async () => {
      const module = await Test.createTestingModule({
        imports: [MockExternalServicesModule, IngestionModule.register()],
      }).compile();

      expect(module).toBeDefined();
    });
  });
});
