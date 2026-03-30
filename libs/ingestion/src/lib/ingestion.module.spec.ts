import { Test } from '@nestjs/testing';
import { IngestionModule } from './ingestion.module';
import { NarrativeRepository } from './repositories/narrative-insight.repository';
import { TwitterConnector } from './services/twitter.connector';
import { FacebookConnector } from './services/facebook.connector';
import { RedditConnector } from './services/reddit.connector';
import { TransformOnIngestService } from './services/transform/transform-on-ingest.service';
import { ConfigService } from '@nestjs/config';
import { ContentClassificationService } from '@veritas/content-classification';

describe('IngestionModule', () => {
  describe('forRoot', () => {
    it('should create a module with default options', async () => {
      const module = await Test.createTestingModule({
        imports: [IngestionModule.forRoot()],
      }).compile();

      expect(module).toBeDefined();
    });

    it('should create a module with memory repository', async () => {
      const module = await Test.createTestingModule({
        imports: [
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
        get: jest.fn().mockImplementation((key) => {
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

      expect(module.get(TwitterConnector)).toBeDefined();
      expect(module.get(FacebookConnector)).toBeDefined();
      expect(module.get(RedditConnector)).toBeDefined();
    });

    it('should enable embeddings when configured', async () => {
      // Set environment variables to check if they're set correctly
      const originalEnv = { ...process.env };

      const module = await Test.createTestingModule({
        imports: [
          IngestionModule.forRoot({
            enableEmbeddings: true,
            embeddingsOptions: {
              endpointUrl: 'https://api.embeddings.test',
              apiKey: 'test-api-key',
              embeddingDim: 512,
            },
          }),
        ],
      }).compile();

      // Verify environment variables were set
      expect(process.env['EMBEDDINGS_ENDPOINT']).toBe(
        'https://api.embeddings.test'
      );
      expect(process.env['EMBEDDINGS_API_KEY']).toBe('test-api-key');
      expect(process.env['EMBEDDING_DIMENSION']).toBe('512');

      // Restore original environment
      process.env = originalEnv;
    });
  });

  describe('register', () => {
    it('should create a non-global module', async () => {
      const module = await Test.createTestingModule({
        imports: [IngestionModule.register()],
      }).compile();

      expect(module).toBeDefined();
    });
  });
});
