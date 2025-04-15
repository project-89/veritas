import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmbeddingsService, EmbeddingVector } from './embeddings.service';
import { DATABASE_PROVIDER_TOKEN } from '../constants';

describe('EmbeddingsService', () => {
  let service: EmbeddingsService;
  let configService: ConfigService;

  // Mock ConfigService implementation
  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'EMBEDDING_SERVICE_ENDPOINT') return null;
      if (key === 'EMBEDDING_SERVICE_API_KEY') return null;
      if (key === 'EMBEDDING_DIMENSION') return 384;
      return null;
    }),
  };

  // Mock database provider
  const mockDatabaseProvider = {
    getRepository: jest.fn().mockReturnValue({
      find: jest.fn().mockResolvedValue([]),
      vectorSearch: jest.fn().mockResolvedValue([]),
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingsService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: DATABASE_PROVIDER_TOKEN,
          useValue: mockDatabaseProvider,
        },
      ],
    }).compile();

    service = module.get<EmbeddingsService>(EmbeddingsService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateEmbedding', () => {
    it('should generate an embedding vector with the correct dimensions', async () => {
      const text = 'Test text for embedding generation';
      const embedding = await service.generateEmbedding(text);

      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBe(384); // Default dimension
      expect(typeof embedding[0]).toBe('number');
    });

    it('should return the same embedding for the same text (from cache)', async () => {
      const text = 'This is a test for caching';

      const firstEmbedding = await service.generateEmbedding(text);
      const secondEmbedding = await service.generateEmbedding(text);

      expect(firstEmbedding).toEqual(secondEmbedding);
    });
  });

  describe('batchGenerateEmbeddings', () => {
    it('should generate embeddings for multiple texts', async () => {
      const texts = ['First test text', 'Second test text', 'Third test text'];
      const embeddings = await service.batchGenerateEmbeddings(texts);

      expect(Array.isArray(embeddings)).toBe(true);
      expect(embeddings.length).toBe(texts.length);

      embeddings.forEach((embedding) => {
        expect(Array.isArray(embedding)).toBe(true);
        expect(embedding.length).toBe(384);
      });
    });

    it('should return an empty array for empty input', async () => {
      const embeddings = await service.batchGenerateEmbeddings([]);
      expect(embeddings).toEqual([]);
    });
  });

  describe('calculateSimilarity', () => {
    it('should calculate cosine similarity between two vectors', () => {
      const vecA: EmbeddingVector = [1, 2, 3];
      const vecB: EmbeddingVector = [4, 5, 6];

      const similarity = service.calculateSimilarity(vecA, vecB);

      // Calculated cosine similarity: (1*4 + 2*5 + 3*6) / (sqrt(1^2 + 2^2 + 3^2) * sqrt(4^2 + 5^2 + 6^2))
      // = (4 + 10 + 18) / (sqrt(14) * sqrt(77))
      // ≈ 32 / 32.83 ≈ 0.975
      expect(similarity).toBeCloseTo(0.975, 3);
    });

    it('should return 0 for orthogonal vectors', () => {
      const vecA: EmbeddingVector = [1, 0, 0];
      const vecB: EmbeddingVector = [0, 1, 0];

      const similarity = service.calculateSimilarity(vecA, vecB);
      expect(similarity).toBe(0);
    });

    it('should return 1 for identical vectors', () => {
      const vecA: EmbeddingVector = [1, 2, 3];
      const vecB: EmbeddingVector = [1, 2, 3];

      const similarity = service.calculateSimilarity(vecA, vecB);
      expect(similarity).toBe(1);
    });

    it('should throw an error for vectors with different dimensions', () => {
      const vecA: EmbeddingVector = [1, 2, 3];
      const vecB: EmbeddingVector = [1, 2];

      expect(() => service.calculateSimilarity(vecA, vecB)).toThrow(
        'Vectors must have the same dimensions'
      );
    });
  });

  describe('searchSimilarContent', () => {
    it('should use repository vectorSearch if available', async () => {
      // Setup mock repository with vector search capability
      const mockRepository = {
        vectorSearch: jest.fn().mockResolvedValue([
          { item: { id: '1', text: 'Test content' }, score: 0.9 },
          { item: { id: '2', text: 'Another test' }, score: 0.8 },
        ]),
      };

      mockDatabaseProvider.getRepository.mockReturnValue(mockRepository);

      const results = await service.searchSimilarContent('test query');

      expect(results.length).toBe(2);
      expect(mockRepository.vectorSearch).toHaveBeenCalled();
      expect(results[0].score).toBe(0.9);
      expect(results[1].score).toBe(0.8);
    });

    // Additional test cases for fallback behavior could be added here
  });
});
