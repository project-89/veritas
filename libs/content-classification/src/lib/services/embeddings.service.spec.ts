import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmbeddingsService } from './embeddings.service';
import { DATABASE_PROVIDER_TOKEN } from '../constants';

// We'll use global fetch instead of axios
global.fetch = jest.fn();

describe('EmbeddingsService', () => {
  let service: EmbeddingsService;
  let configService: ConfigService;

  // Mock repository with vectorSearch method
  const mockRepository = {
    vectorSearch: jest.fn(),
  };

  const mockDatabaseService = {
    getRepository: jest.fn().mockReturnValue(mockRepository),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config = {
        EMBEDDING_SERVICE_ENDPOINT: 'https://api.embeddings.test',
        EMBEDDING_SERVICE_API_KEY: 'test-api-key',
        EMBEDDING_DIMENSION: 384,
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Reset the fetch mock
    global.fetch = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingsService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: DATABASE_PROVIDER_TOKEN,
          useValue: mockDatabaseService,
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
    it('should generate an embedding vector with correct dimensions', async () => {
      // Mock successful API response
      const mockEmbedding = Array(384)
        .fill(0)
        .map((_, i) => i / 384);

      // Mock fetch response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ embedding: mockEmbedding }] }),
      });

      const result = await service.generateEmbedding('test text');

      expect(result).toEqual(mockEmbedding);
      expect(result.length).toBe(384);
      expect(global.fetch).toHaveBeenCalledWith('https://api.embeddings.test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-api-key',
        },
        body: JSON.stringify({ text: 'test text', model: 'text-embedding' }),
      });
    });

    it('should return the same embedding for the same text (caching)', async () => {
      // Mock successful API response
      const mockEmbedding = Array(384)
        .fill(0)
        .map((_, i) => i / 384);

      // Mock fetch response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ embedding: mockEmbedding }] }),
      });

      // First call should use the API
      const result1 = await service.generateEmbedding('cached text');

      // Second call should use cache
      const result2 = await service.generateEmbedding('cached text');

      expect(result1).toEqual(result2);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should handle API errors and fall back to local processing', async () => {
      // Mock API failure
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('API Error'));

      const result = await service.generateEmbedding('test text');

      // Local processing should return a vector of the correct dimension
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(384);
    });
  });

  describe('batchGenerateEmbeddings', () => {
    it('should generate embeddings for multiple texts', async () => {
      const texts = ['text 1', 'text 2', 'text 3'];

      // Mock the batchGenerateWithExternalService method
      const mockEmbeddings = [
        Array(384).fill(0.1),
        Array(384).fill(0.2),
        Array(384).fill(0.3),
      ];

      // We need to mock the implementation of batchGenerateEmbeddings
      // instead of trying to mock generateEmbedding
      jest
        .spyOn(service as any, 'batchGenerateWithExternalService')
        .mockResolvedValueOnce(mockEmbeddings);

      const results = await service.batchGenerateEmbeddings(texts);

      expect(results.length).toBe(3);
      expect(results).toEqual(mockEmbeddings);
      expect(
        (service as any).batchGenerateWithExternalService
      ).toHaveBeenCalledWith(texts);
    });

    it('should return an empty array for empty input', async () => {
      const results = await service.batchGenerateEmbeddings([]);
      expect(results).toEqual([]);
    });
  });

  describe('calculateSimilarity', () => {
    it('should calculate cosine similarity correctly', () => {
      const vector1 = [1, 0, 0];
      const vector2 = [0, 1, 0];

      // Cosine similarity should be 0 for orthogonal vectors
      const similarity = service.calculateSimilarity(vector1, vector2);
      expect(similarity).toBe(0);
    });

    it('should handle identical vectors', () => {
      const vector = [0.5, 0.5, 0.5];

      // Cosine similarity should be 1 for identical vectors
      // Use toBeCloseTo instead of toBe to handle floating point precision
      const similarity = service.calculateSimilarity(vector, vector);
      expect(similarity).toBeCloseTo(1, 10);
    });

    it('should throw error for vectors with different dimensions', () => {
      const vector1 = [1, 0, 0];
      const vector2 = [0, 1];

      expect(() => {
        service.calculateSimilarity(vector1, vector2);
      }).toThrow('Vectors must have the same dimensions');
    });
  });

  describe('searchSimilarContent', () => {
    it('should search similar content using repository vectorSearch if available', async () => {
      const embedding = [0.1, 0.2, 0.3];

      mockRepository.vectorSearch.mockResolvedValueOnce([
        { item: { id: '1', text: 'Similar content' }, score: 0.95 },
      ]);

      const results = await service.searchSimilarContent(embedding, {
        limit: 5,
        minScore: 0.8,
      });

      expect(results).toHaveLength(1);
      expect(results[0].score).toBe(0.95);
      expect(mockDatabaseService.getRepository).toHaveBeenCalledWith('Content');
      expect(mockRepository.vectorSearch).toHaveBeenCalledWith(
        'embedding',
        embedding,
        { limit: 5, minScore: 0.8 }
      );
    });
  });
});
