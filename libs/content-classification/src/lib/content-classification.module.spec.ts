// Mock franc-min to avoid import issues
jest.mock('franc-min', () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue('eng'),
}));

import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  ContentClassificationModule,
  ContentClassificationModuleOptions,
} from './content-classification.module';
import { DATABASE_PROVIDER_TOKEN } from './constants';
import { EmbeddingsService } from './services/embeddings.service';

// Mock the createDatabaseProvider method
jest.mock('./content-classification.module', () => {
  const originalModule = jest.requireActual('./content-classification.module');
  return {
    ...originalModule,
    ContentClassificationModule: {
      ...originalModule.ContentClassificationModule,
      createDatabaseProvider: jest.fn().mockImplementation(() => {
        return {
          connect: jest.fn(),
          disconnect: jest.fn(),
          isConnected: jest.fn().mockReturnValue(true),
          registerModel: jest.fn(),
          getRepository: jest.fn().mockReturnValue({
            find: jest.fn().mockResolvedValue([]),
            findById: jest.fn().mockResolvedValue(null),
            findOne: jest.fn().mockResolvedValue(null),
            count: jest.fn().mockResolvedValue(0),
            create: jest.fn().mockImplementation((data) => data),
            createMany: jest.fn().mockImplementation((data) => data),
            updateById: jest.fn().mockResolvedValue(null),
            updateMany: jest.fn().mockResolvedValue(0),
            deleteById: jest.fn().mockResolvedValue(null),
            deleteMany: jest.fn().mockResolvedValue(0),
            vectorSearch: jest.fn().mockResolvedValue([]),
          }),
        };
      }),
      forRoot: originalModule.ContentClassificationModule.forRoot,
    },
  };
});

// Mock ConfigService
const mockConfigService = {
  get: jest.fn().mockImplementation((key: string) => {
    const config = {
      EMBEDDING_SERVICE_ENDPOINT: 'http://localhost:8080',
      EMBEDDING_SERVICE_API_KEY: 'mock-api-key',
      EMBEDDING_DIMENSION: '1536',
    };
    return config[key];
  }),
};

describe('ContentClassificationModule', () => {
  describe('forRoot', () => {
    it('should create a module with default providers', async () => {
      const module = await Test.createTestingModule({
        imports: [ContentClassificationModule.forRoot()],
        providers: [
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      expect(module).toBeDefined();
      expect(() => module.get('ContentClassificationService')).not.toThrow();
    });

    it('should create a module with database provider', async () => {
      const options: ContentClassificationModuleOptions = {
        providerType: 'mongodb',
        providerOptions: { url: 'mongodb://localhost:27017/test' },
      };

      const module = await Test.createTestingModule({
        imports: [ContentClassificationModule.forRoot(options)],
        providers: [
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      expect(module).toBeDefined();
      expect(() => module.get(DATABASE_PROVIDER_TOKEN)).not.toThrow();
    });

    it('should create a module with embeddings service when enabled', async () => {
      const options: ContentClassificationModuleOptions = {
        providerType: 'mongodb',
        providerOptions: { url: 'mongodb://localhost:27017/test' },
        enableEmbeddings: true,
        embeddingsOptions: {
          endpointUrl: 'http://custom.api/embeddings',
          apiKey: 'custom-api-key',
          embeddingDim: 768,
        },
      };

      const module = await Test.createTestingModule({
        imports: [ContentClassificationModule.forRoot(options)],
        providers: [
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      expect(module).toBeDefined();
      expect(() => module.get(EmbeddingsService)).not.toThrow();

      // Verify environment variables were set
      expect(process.env.EMBEDDING_SERVICE_ENDPOINT).toEqual(
        'http://custom.api/embeddings'
      );
      expect(process.env.EMBEDDING_SERVICE_API_KEY).toEqual('custom-api-key');
      expect(process.env.EMBEDDING_DIMENSION).toEqual('768');
    });

    it('should create a global module when isGlobal is true', async () => {
      const options: ContentClassificationModuleOptions = {
        isGlobal: true,
      };

      const module = await Test.createTestingModule({
        imports: [ContentClassificationModule.forRoot(options)],
        providers: [
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      expect(module).toBeDefined();
    });
  });
});
