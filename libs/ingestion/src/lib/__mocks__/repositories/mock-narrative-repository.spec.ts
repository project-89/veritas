/**
 * Tests for the mock implementation of NarrativeRepository
 */
import { MockNarrativeRepository } from './mock-narrative-repository';
import { NarrativeInsight } from '../../interfaces/narrative-insight.interface';

describe('MockNarrativeRepository', () => {
  let repository: MockNarrativeRepository;

  beforeEach(() => {
    repository = new MockNarrativeRepository();
  });

  describe('save', () => {
    it('should save a narrative insight', async () => {
      const insight: NarrativeInsight = {
        id: 'new-insight',
        contentHash: 'new-content-hash',
        sourceHash: 'new-source-hash',
        platform: 'facebook',
        timestamp: new Date(),
        themes: ['news', 'politics'],
        entities: [],
        sentiment: {
          score: 0.5,
          label: 'positive',
          confidence: 0.9,
        },
        engagement: {
          total: 200,
          breakdown: {
            likes: 100,
            shares: 80,
            comments: 20,
          },
        },
        narrativeScore: 0.65,
        processedAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      };

      await repository.save(insight);

      const found = await repository.findByContentHash(insight.contentHash);

      if (!found) {
        throw new Error('Expected to find saved insight');
      }

      if (found.id !== insight.id) {
        throw new Error(`Expected id ${insight.id}, got ${found.id}`);
      }

      if (found.platform !== insight.platform) {
        throw new Error(
          `Expected platform ${insight.platform}, got ${found.platform}`
        );
      }
    });
  });

  describe('saveMany', () => {
    it('should save multiple insights in batch', async () => {
      const insights: NarrativeInsight[] = [
        {
          id: 'batch-1',
          contentHash: 'batch-content-1',
          sourceHash: 'batch-source-1',
          platform: 'facebook',
          timestamp: new Date(),
          themes: ['news'],
          entities: [],
          sentiment: { score: 0.5, label: 'positive', confidence: 0.9 },
          engagement: {
            total: 200,
            breakdown: { likes: 100, shares: 80, comments: 20 },
          },
          narrativeScore: 0.65,
          processedAt: new Date(),
          expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        },
        {
          id: 'batch-2',
          contentHash: 'batch-content-2',
          sourceHash: 'batch-source-2',
          platform: 'twitter',
          timestamp: new Date(),
          themes: ['tech'],
          entities: [],
          sentiment: { score: -0.2, label: 'negative', confidence: 0.8 },
          engagement: {
            total: 300,
            breakdown: { likes: 150, shares: 100, comments: 50 },
          },
          narrativeScore: 0.75,
          processedAt: new Date(),
          expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        },
      ];

      await repository.saveMany(insights);

      // Verify first insight
      const found1 = await repository.findByContentHash(
        insights[0].contentHash
      );
      if (!found1) {
        throw new Error('Expected to find first insight');
      }
      if (found1.id !== insights[0].id) {
        throw new Error(`Expected id ${insights[0].id}, got ${found1.id}`);
      }

      // Verify second insight
      const found2 = await repository.findByContentHash(
        insights[1].contentHash
      );
      if (!found2) {
        throw new Error('Expected to find second insight');
      }
      if (found2.id !== insights[1].id) {
        throw new Error(`Expected id ${insights[1].id}, got ${found2.id}`);
      }
    });
  });

  describe('findByContentHash', () => {
    it('should find insight by content hash', async () => {
      // The repository is pre-populated with a mock insight
      const mockHash = 'test-content-hash';
      const found = await repository.findByContentHash(mockHash);

      if (!found) {
        throw new Error('Expected to find mock insight');
      }

      if (found.contentHash !== mockHash) {
        throw new Error(
          `Expected contentHash ${mockHash}, got ${found.contentHash}`
        );
      }
    });

    it('should return null for non-existent hash', async () => {
      const found = await repository.findByContentHash('non-existent-hash');

      if (found !== null) {
        throw new Error('Expected null for non-existent hash');
      }
    });
  });

  describe('findByTimeframe', () => {
    it('should find insights by timeframe', async () => {
      const insights = await repository.findByTimeframe('2023-Q2');

      if (insights.length === 0) {
        throw new Error('Expected to find insights');
      }
    });

    it('should apply pagination options', async () => {
      // Add a few more insights
      for (let i = 0; i < 5; i++) {
        await repository.save({
          id: `paginated-${i}`,
          contentHash: `paginated-content-${i}`,
          sourceHash: `paginated-source-${i}`,
          platform: 'twitter',
          timestamp: new Date(),
          themes: ['test'],
          entities: [],
          sentiment: { score: 0, label: 'neutral', confidence: 0.5 },
          engagement: {
            total: 100,
            breakdown: { likes: 50, shares: 30, comments: 20 },
          },
          narrativeScore: 0.5,
          processedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });
      }

      // Test with limit
      const limitedInsights = await repository.findByTimeframe('2023-Q2', {
        limit: 3,
      });
      if (limitedInsights.length !== 3) {
        throw new Error(
          `Expected 3 insights with limit, got ${limitedInsights.length}`
        );
      }

      // Test with skip
      const skippedInsights = await repository.findByTimeframe('2023-Q2', {
        skip: 2,
      });
      // Should be at least 4 insights (1 initial + 5 added - 2 skipped)
      if (skippedInsights.length < 4) {
        throw new Error(
          `Expected at least 4 insights with skip, got ${skippedInsights.length}`
        );
      }
    });
  });

  describe('getTrendsByTimeframe', () => {
    it('should return narrative trends for a timeframe', async () => {
      const trends = await repository.getTrendsByTimeframe('2023-Q2');

      if (trends.length === 0) {
        throw new Error('Expected to find trends');
      }

      const trend = trends[0];
      if (trend.timeframe !== '2023-Q2') {
        throw new Error(`Expected timeframe 2023-Q2, got ${trend.timeframe}`);
      }

      if (trend.primaryTheme !== 'technology') {
        throw new Error(
          `Expected primaryTheme technology, got ${trend.primaryTheme}`
        );
      }
    });
  });

  describe('deleteOlderThan', () => {
    it('should delete insights older than cutoff date', async () => {
      // Add an old insight
      const oldDate = new Date();
      oldDate.setFullYear(oldDate.getFullYear() - 1); // One year ago

      await repository.save({
        id: 'old-insight',
        contentHash: 'old-content-hash',
        sourceHash: 'old-source-hash',
        platform: 'twitter',
        timestamp: oldDate,
        themes: ['old'],
        entities: [],
        sentiment: { score: 0, label: 'neutral', confidence: 0.5 },
        engagement: {
          total: 100,
          breakdown: { likes: 50, shares: 30, comments: 20 },
        },
        narrativeScore: 0.5,
        processedAt: oldDate,
        expiresAt: new Date(oldDate.getTime() + 30 * 24 * 60 * 60 * 1000),
      });

      // Verify it was added
      const beforeDelete = await repository.findByContentHash(
        'old-content-hash'
      );
      if (!beforeDelete) {
        throw new Error('Expected to find old insight before deletion');
      }

      // Delete older than 6 months ago
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - 6);

      const deletedCount = await repository.deleteOlderThan(cutoffDate);

      if (deletedCount < 1) {
        throw new Error(`Expected at least 1 deletion, got ${deletedCount}`);
      }

      // Verify it was deleted
      const afterDelete = await repository.findByContentHash(
        'old-content-hash'
      );
      if (afterDelete !== null) {
        throw new Error('Expected old insight to be deleted');
      }
    });
  });
});
