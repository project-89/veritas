/**
 * Mock implementation of NarrativeRepository for testing purposes
 * This avoids external dependencies and provides a simplified version for testing
 */
import { NarrativeInsight } from '../../interfaces/narrative-insight.interface';
import { NarrativeTrend } from '../../interfaces/narrative-trend.interface';
import { Logger } from '@nestjs/common';

/**
 * Mock implementation of NarrativeRepository that doesn't rely on external dependencies
 */
export class MockNarrativeRepository {
  private readonly logger = new Logger(MockNarrativeRepository.name);
  private readonly insights: Map<string, NarrativeInsight> = new Map();
  private readonly mockInsight: NarrativeInsight = {
    id: 'test-insight-id',
    contentHash: 'test-content-hash',
    sourceHash: 'test-source-hash',
    platform: 'twitter',
    timestamp: new Date(),
    themes: ['politics', 'technology'],
    entities: [
      { name: 'Entity1', type: 'Organization', relevance: 0.8 },
      { name: 'Entity2', type: 'Person', relevance: 0.6 },
    ],
    sentiment: {
      score: 0.2,
      label: 'neutral',
      confidence: 0.85,
    },
    engagement: {
      total: 500,
      breakdown: {
        likes: 300,
        shares: 150,
        comments: 50,
      },
    },
    narrativeScore: 0.75,
    processedAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
  };

  private readonly mockTrend: NarrativeTrend = {
    id: 'test-trend-id',
    timeframe: '2023-Q2',
    primaryTheme: 'technology',
    relatedThemes: ['ai', 'privacy', 'security'],
    insightCount: 42,
    uniqueSourcesCount: 15,
    sentimentTrend: 0.3,
    platformDistribution: {
      twitter: 0.6,
      facebook: 0.3,
      reddit: 0.1,
    },
    narrativeScore: 0.85,
    detectedAt: new Date(),
  };

  constructor() {
    // Pre-populate with mock data
    this.insights.set(this.mockInsight.contentHash, this.mockInsight);
    this.logger.log('MockNarrativeRepository initialized');
  }

  /**
   * Save a narrative insight to the repository
   */
  async save(insight: NarrativeInsight): Promise<void> {
    this.insights.set(insight.contentHash, { ...insight });
    this.logger.debug(`Saved insight with hash: ${insight.contentHash}`);
  }

  /**
   * Save multiple narrative insights in a batch
   */
  async saveMany(insights: NarrativeInsight[]): Promise<void> {
    for (const insight of insights) {
      await this.save(insight);
    }
    this.logger.debug(`Saved ${insights.length} insights in batch`);
  }

  /**
   * Find a narrative insight by its content hash
   */
  async findByContentHash(
    contentHash: string
  ): Promise<NarrativeInsight | null> {
    const insight = this.insights.get(contentHash);
    return insight ? { ...insight } : null;
  }

  /**
   * Find narrative insights by timeframe
   */
  async findByTimeframe(
    timeframe: string,
    options?: { limit?: number; skip?: number }
  ): Promise<NarrativeInsight[]> {
    const allInsights = Array.from(this.insights.values());

    // Apply pagination
    const skip = options?.skip || 0;
    const limit = options?.limit || allInsights.length;

    return allInsights.slice(skip, skip + limit);
  }

  /**
   * Get narrative trends by aggregating insights
   */
  async getTrendsByTimeframe(timeframe: string): Promise<NarrativeTrend[]> {
    // Return mock trend data
    return [this.mockTrend];
  }

  /**
   * Delete insights older than a specified date
   */
  async deleteOlderThan(cutoffDate: Date): Promise<number> {
    let deletedCount = 0;

    for (const [hash, insight] of this.insights.entries()) {
      if (insight.timestamp < cutoffDate) {
        this.insights.delete(hash);
        deletedCount++;
      }
    }

    this.logger.log(
      `Deleted ${deletedCount} insights older than ${cutoffDate.toISOString()}`
    );
    return deletedCount;
  }
}
