import { Test, TestingModule } from '@nestjs/testing';
import { MongoNarrativeRepository } from './mongo-narrative.repository';
import { InMemoryNarrativeRepository } from './narrative-insight.repository';
import { DatabaseService } from '@veritas/database';
import { NarrativeInsight } from '../../types/narrative-insight.interface';

describe('Narrative Repository Embeddings', () => {
  let mongoRepository: MongoNarrativeRepository;
  let inMemoryRepository: InMemoryNarrativeRepository;
  let databaseService: DatabaseService;

  // Create mock narrative insights with embeddings
  const createMockInsight = (
    id: string,
    themes: string[]
  ): NarrativeInsight => ({
    id,
    contentHash: `content-hash-${id}`,
    sourceHash: `source-hash-${id.substring(0, 1)}`, // Group some by same source
    platform: (['twitter', 'facebook', 'reddit'] as const)[Math.floor(Math.random() * 3)] as string,
    timestamp: new Date(),
    themes,
    entities: themes.map((theme) => ({
      name: theme,
      type: 'topic',
      relevance: 0.7 + Math.random() * 0.3,
    })),
    sentiment: {
      score: Math.random() * 2 - 1,
      label:
        Math.random() > 0.33
          ? Math.random() > 0.5
            ? 'positive'
            : 'negative'
          : 'neutral',
      confidence: 0.7 + Math.random() * 0.3,
    },
    engagement: {
      total: Math.floor(Math.random() * 1000),
      breakdown: {
        likes: 0.4 + Math.random() * 0.2,
        shares: 0.2 + Math.random() * 0.2,
        comments: 0.1 + Math.random() * 0.2,
      },
    },
    narrativeScore: 0.5 + Math.random() * 0.5,
    processedAt: new Date(),
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days in the future
    embedding: new Array(384).fill(0).map(() => Math.random() * 2 - 1),
  });

  // Create a set of mock insights
  const mockInsights = [
    createMockInsight('1', ['climate', 'environment', 'policy']),
    createMockInsight('2', ['climate', 'energy', 'technology']),
    createMockInsight('3', ['technology', 'innovation', 'business']),
    createMockInsight('4', ['politics', 'policy', 'government']),
    createMockInsight('5', ['health', 'science', 'research']),
  ];

  // Create a similar embedding vector to the 'climate' related insights
  const climateRelatedEmbedding = [...(mockInsights[0]!.embedding || [])];
  // Slightly modify it to avoid exact match
  for (let i = 0; i < climateRelatedEmbedding.length; i++) {
    climateRelatedEmbedding[i] = (climateRelatedEmbedding[i] ?? 0) + (Math.random() - 0.5) * 0.1;
  }

  // Create repository mocks
  const mockInsightRepository = {
    find: jest.fn().mockImplementation(() => Promise.resolve(mockInsights)),
    findById: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    updateById: jest.fn(),
    updateMany: jest.fn(),
    deleteById: jest.fn(),
    deleteMany: jest.fn(),
    vectorSearch: jest
      .fn()
      .mockImplementation((field: string, vector: number[], options?: any) => {
        // Simulate vector search by calculating cosine similarity
        const calculateSimilarity = (
          vecA: number[],
          vecB: number[]
        ): number => {
          let dotProduct = 0;
          let normA = 0;
          let normB = 0;

          for (let i = 0; i < vecA.length; i++) {
            dotProduct += (vecA[i] ?? 0) * (vecB[i] ?? 0);
            normA += (vecA[i] ?? 0) * (vecA[i] ?? 0);
            normB += (vecB[i] ?? 0) * (vecB[i] ?? 0);
          }

          if (normA === 0 || normB === 0) return 0;
          return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
        };

        const results = mockInsights
          .map((insight) => ({
            item: insight,
            score: calculateSimilarity(insight.embedding || [], vector),
          }))
          .filter((result) => result.score >= (options?.minScore || 0.7))
          .sort((a, b) => b.score - a.score)
          .slice(0, options?.limit || 10);

        return Promise.resolve(results);
      }),
  };

  // Define type for insightRepository with optional vectorSearch
  type InsightRepositoryType = typeof mockInsightRepository;

  // Mock database service
  const mockDatabaseService = {
    getRepository: jest.fn().mockImplementation((name: string) => {
      if (name === 'narrative-insights') return mockInsightRepository;
      return null;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MongoNarrativeRepository,
        InMemoryNarrativeRepository,
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
      ],
    }).compile();

    mongoRepository = module.get<MongoNarrativeRepository>(
      MongoNarrativeRepository
    );
    inMemoryRepository = module.get<InMemoryNarrativeRepository>(
      InMemoryNarrativeRepository
    );
    databaseService = module.get<DatabaseService>(DatabaseService);

    // Initialize in-memory repository with test data
    for (const insight of mockInsights) {
      await inMemoryRepository.save(insight);
    }
  });

  describe('MongoNarrativeRepository with vector search', () => {
    it('should find similar content using vector search', async () => {
      const result = await mongoRepository.findSimilarContent(
        climateRelatedEmbedding,
        {
          limit: 3,
          minScore: 0.7,
        }
      );

      // Check that results are returned
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(3);

      // Verify each result has required properties
      result.forEach((item) => {
        expect(item).toHaveProperty('insight');
        expect(item).toHaveProperty('score');
        expect(item.score).toBeGreaterThanOrEqual(0.7);
        expect(item.score).toBeLessThanOrEqual(1.0);
      });

      // Verify sorted by score (descending)
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1]!.score).toBeGreaterThanOrEqual(result[i]!.score);
      }

      // Verify repository method was called
      expect(mockInsightRepository.vectorSearch).toHaveBeenCalledWith(
        'embedding',
        climateRelatedEmbedding,
        expect.objectContaining({
          limit: 3,
          minScore: 0.7,
          collection: 'narrative-insights',
        })
      );
    });

    it('should handle empty results', async () => {
      // Mock repository to return empty results
      mockInsightRepository.vectorSearch.mockResolvedValueOnce([]);

      const result = await mongoRepository.findSimilarContent(
        climateRelatedEmbedding,
        {
          minScore: 0.99, // Very high threshold that no results will meet
        }
      );

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should use default values when options not provided', async () => {
      await mongoRepository.findSimilarContent(climateRelatedEmbedding);

      expect(mockInsightRepository.vectorSearch).toHaveBeenCalledWith(
        'embedding',
        climateRelatedEmbedding,
        expect.objectContaining({
          limit: 10, // Default limit
          minScore: 0.7, // Default minScore
          collection: 'narrative-insights',
        })
      );
    });

    it('should fall back to memory search when vectorSearch is unavailable', async () => {
      // Test the fallback by creating a repository without vectorSearch
      const repositoryWithoutVectorSearch: Partial<InsightRepositoryType> = {
        ...mockInsightRepository,
      };

      // Create a type-safe way to modify our mock
      const modifiedRepository = {
        ...repositoryWithoutVectorSearch,
        find: mockInsightRepository.find,
        // Explicitly not including vectorSearch
      };

      // Override getRepository implementation for this test
      mockDatabaseService.getRepository.mockImplementationOnce(
        (name: string) => {
          if (name === 'narrative-insights') return modifiedRepository;
          return null;
        }
      );

      const spy = jest.spyOn(
        mongoRepository as any,
        'calculateCosineSimilarity'
      );

      const result = await mongoRepository.findSimilarContent(
        climateRelatedEmbedding,
        {
          limit: 2,
          minScore: 0.7,
        }
      );

      // Check that in-memory calculation was used
      expect(spy).toHaveBeenCalled();

      // Check we got results
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);

      // Reset for other tests
      mockDatabaseService.getRepository.mockImplementation((name: string) => {
        if (name === 'narrative-insights') return mockInsightRepository;
        return null;
      });
      spy.mockRestore();
    });
  });

  describe('InMemoryNarrativeRepository with embeddings', () => {
    it('should find similar content using in-memory vector similarity', async () => {
      const result = await inMemoryRepository.findSimilarContent(
        climateRelatedEmbedding,
        {
          limit: 3,
          minScore: 0.7,
        }
      );

      // Check that results are returned
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(3);

      // Verify each result has required properties
      result.forEach((item) => {
        expect(item).toHaveProperty('insight');
        expect(item).toHaveProperty('score');
        expect(item.score).toBeGreaterThanOrEqual(0.7);
        expect(item.score).toBeLessThanOrEqual(1.0);
      });

      // Verify sorted by score (descending)
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1]!.score).toBeGreaterThanOrEqual(result[i]!.score);
      }
    });

    it('should handle empty results', async () => {
      // Create a vector that likely won't match anything
      const unrelatedVector = new Array(384)
        .fill(0)
        .map((_, i) => (i % 2 === 0 ? 1 : -1));

      const result = await inMemoryRepository.findSimilarContent(
        unrelatedVector,
        {
          minScore: 0.99, // Very high threshold
        }
      );

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should use default values when options not provided', async () => {
      const result = await inMemoryRepository.findSimilarContent(
        climateRelatedEmbedding
      );

      // Default limit should be applied
      expect(result.length).toBeLessThanOrEqual(10);
    });

    it('should work with insights that have no embeddings', async () => {
      // Create an insight without embedding
      const insightWithoutEmbedding = createMockInsight('6', ['test']);
      delete insightWithoutEmbedding.embedding;

      await inMemoryRepository.save(insightWithoutEmbedding);

      const result = await inMemoryRepository.findSimilarContent(
        climateRelatedEmbedding
      );

      // Should only include insights that have embeddings
      result.forEach((item) => {
        expect(item.insight.embedding).toBeDefined();
      });
    });
  });

  describe('cosine similarity calculation', () => {
    it('should calculate similarity between vectors correctly', () => {
      // Access the private method through the instance
      const calculateSimilarity = (mongoRepository as any)
        .calculateCosineSimilarity;

      // Test with known vectors
      const vecA = [1, 0, 0];
      const vecB = [0, 1, 0];
      const vecC = [1, 1, 0];

      // Identical vectors: similarity = 1
      expect(calculateSimilarity(vecA, vecA)).toBe(1);

      // Orthogonal vectors: similarity = 0
      expect(calculateSimilarity(vecA, vecB)).toBe(0);

      // Vectors at 45° angle: similarity = 0.7071...
      expect(calculateSimilarity(vecA, vecC)).toBeCloseTo(0.7071, 4);

      // Handle zero vectors
      expect(calculateSimilarity(vecA, [0, 0, 0])).toBe(0);
      expect(calculateSimilarity([0, 0, 0], vecB)).toBe(0);
      expect(calculateSimilarity([0, 0, 0], [0, 0, 0])).toBe(0);
    });

    it('should handle large dimensional vectors', () => {
      // Access the private method through the instance
      const calculateSimilarity = (mongoRepository as any)
        .calculateCosineSimilarity;

      // Create large dimensional vectors
      const dim = 384;
      const vecA = new Array(dim).fill(0).map(() => Math.random());
      const vecB = [...vecA]; // Copy of vecA should have similarity 1

      // Identical large vectors
      expect(calculateSimilarity(vecA, vecB)).toBe(1);

      // Modify one element slightly
      vecB[100] = (vecB[100] ?? 0) + 0.01;

      // Close but not identical vectors
      const similarity = calculateSimilarity(vecA, vecB);
      expect(similarity).toBeLessThan(1);
      expect(similarity).toBeGreaterThan(0.99);
    });
  });
});
