import { Test, TestingModule } from '@nestjs/testing';
import { InMemoryNarrativeRepository } from '../../src/lib/repositories/narrative-insight.repository';
import { NarrativeInsight } from '../../src/types/narrative-insight.interface';

describe('InMemoryNarrativeRepository', () => {
  let repository: InMemoryNarrativeRepository;

  // Test data
  const mockEmbedding1 = [0.1, 0.2, 0.3, 0.4, 0.5];
  const mockEmbedding2 = [0.2, 0.3, 0.4, 0.5, 0.6];
  const mockEmbedding3 = [0.8, 0.7, 0.6, 0.5, 0.4]; // More different from 1 & 2

  const mockInsight1: NarrativeInsight = {
    id: 'test-insight-1',
    contentHash: 'hash-123',
    sourceHash: 'source-456',
    platform: 'twitter',
    timestamp: new Date('2023-01-15'),
    themes: ['politics', 'economy'],
    entities: [
      { name: 'Economy', type: 'topic', relevance: 0.8 },
      { name: 'Politics', type: 'topic', relevance: 0.7 },
    ],
    sentiment: { score: 0.2, label: 'positive', confidence: 0.8 },
    engagement: {
      total: 150,
      breakdown: { likes: 100, shares: 30, comments: 20 },
    },
    narrativeScore: 0.75,
    processedAt: new Date('2023-01-15T10:30:00'),
    expiresAt: new Date('2023-04-15'),
    embedding: mockEmbedding1,
  };

  const mockInsight2: NarrativeInsight = {
    ...mockInsight1,
    id: 'test-insight-2',
    contentHash: 'hash-456',
    themes: ['economy', 'inflation'],
    embedding: mockEmbedding2,
  };

  const mockInsight3: NarrativeInsight = {
    ...mockInsight1,
    id: 'test-insight-3',
    contentHash: 'hash-789',
    themes: ['elections', 'politics'],
    embedding: mockEmbedding3,
  };

  const mockInsightNoEmbedding: NarrativeInsight = {
    ...mockInsight1,
    id: 'test-insight-no-embedding',
    contentHash: 'hash-no-embedding',
    embedding: undefined,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InMemoryNarrativeRepository],
    }).compile();

    repository = module.get<InMemoryNarrativeRepository>(InMemoryNarrativeRepository);

    // Reset the repository and add test data
    await repository.saveMany([mockInsight1, mockInsight2, mockInsight3, mockInsightNoEmbedding]);
  });

  describe('basic CRUD operations', () => {
    it('should save and retrieve an insight', async () => {
      const result = await repository.findByContentHash(mockInsight1.contentHash);
      expect(result).toEqual(mockInsight1);
    });

    it('should find insights by timeframe', async () => {
      // All insights have same timestamp in our test data
      const result = await repository.findByTimeframe('2023-Q1');
      expect(result).toHaveLength(4);
    });

    it('should delete insights older than a cutoff date', async () => {
      const cutoffDate = new Date('2023-02-01');
      const deletedCount = await repository.deleteOlderThan(cutoffDate);
      expect(deletedCount).toBe(4); // All insights are from January 2023

      const remainingInsights = await repository.findByTimeframe('2023-Q1');
      expect(remainingInsights).toHaveLength(0);
    });
  });

  describe('vector similarity search', () => {
    it('should find similar content based on embedding similarity', async () => {
      // Search for content similar to mockEmbedding1
      const result = await repository.findSimilarContent(mockEmbedding1);

      // Should return all insights with embeddings, sorted by similarity
      expect(result).toHaveLength(3);

      // First result should be mockInsight1 (exact match)
      expect(result[0]!.insight.id).toBe(mockInsight1.id);
      expect(result[0]!.score).toBe(1); // Perfect match with itself

      // Second should be mockInsight2 (more similar than mockInsight3)
      expect(result[1]!.insight.id).toBe(mockInsight2.id);

      // Third should be mockInsight3
      expect(result[2]!.insight.id).toBe(mockInsight3.id);

      // Scores should be descending
      expect(result[0]!.score).toBeGreaterThan(result[1]!.score);
      expect(result[1]!.score).toBeGreaterThan(result[2]!.score);
    });

    it('should apply minScore filter', async () => {
      // Set a high threshold that only the exact match will pass
      const result = await repository.findSimilarContent(mockEmbedding1, {
        minScore: 0.999,
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.insight.id).toBe(mockInsight1.id);
    });

    it('should apply limit filter', async () => {
      const result = await repository.findSimilarContent(mockEmbedding1, {
        limit: 2,
      });

      expect(result).toHaveLength(2);
      expect(result[0]!.insight.id).toBe(mockInsight1.id);
      expect(result[1]!.insight.id).toBe(mockInsight2.id);
    });

    it('should ignore insights without embeddings', async () => {
      // Create a query vector
      const queryVector = [0.1, 0.2, 0.3, 0.4, 0.5];

      // Find similar content
      const result = await repository.findSimilarContent(queryVector);

      // Should not include the insight without embedding
      expect(result.some((item) => item.insight.id === mockInsightNoEmbedding.id)).toBe(false);
    });

    it('should handle empty repository', async () => {
      // Create a new empty repository
      const emptyRepo = new InMemoryNarrativeRepository();

      const result = await emptyRepo.findSimilarContent([0.1, 0.2, 0.3, 0.4, 0.5]);

      expect(result).toEqual([]);
    });

    it('should throw error for vectors with different dimensions', async () => {
      // Create a query vector with wrong dimensions
      const wrongDimensionVector = [0.1, 0.2, 0.3];

      // The repository should throw an error
      await expect(repository.findSimilarContent(wrongDimensionVector)).rejects.toThrow();
    });
  });

  describe('narrative trends', () => {
    it('should generate trends by timeframe', async () => {
      const trends = await repository.getTrendsByTimeframe('2023-Q1');

      expect(trends).toHaveLength(4); // 4 unique themes: politics, economy, inflation, elections

      // Check trends structure
      trends.forEach((trend) => {
        expect(trend).toHaveProperty('id');
        expect(trend).toHaveProperty('timeframe', '2023-Q1');
        expect(trend).toHaveProperty('primaryTheme');
        expect(trend).toHaveProperty('relatedThemes');
        expect(trend).toHaveProperty('insightCount');
        expect(trend).toHaveProperty('uniqueSourcesCount');
        expect(trend).toHaveProperty('sentimentTrend');
        expect(trend).toHaveProperty('platformDistribution');
        expect(trend).toHaveProperty('narrativeScore');
        expect(trend).toHaveProperty('detectedAt');
      });
    });
  });
});
