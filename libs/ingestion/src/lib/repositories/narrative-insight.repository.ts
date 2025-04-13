import { Injectable, Logger } from '@nestjs/common';
import { NarrativeInsight } from '../../types/narrative-insight.interface';
import { NarrativeTrend } from '../../types/narrative-trend.interface';

/**
 * Abstract repository for narrative insights
 * This defines the contract for all narrative insight repository implementations
 */
@Injectable()
export abstract class NarrativeRepository {
  /**
   * Save a narrative insight to the repository
   */
  abstract save(insight: NarrativeInsight): Promise<void>;

  /**
   * Save multiple narrative insights in a batch
   */
  abstract saveMany(insights: NarrativeInsight[]): Promise<void>;

  /**
   * Find a narrative insight by its content hash
   */
  abstract findByContentHash(
    contentHash: string
  ): Promise<NarrativeInsight | null>;

  /**
   * Find narrative insights by timeframe
   */
  abstract findByTimeframe(
    timeframe: string,
    options?: { limit?: number; skip?: number }
  ): Promise<NarrativeInsight[]>;

  /**
   * Get narrative trends by aggregating insights
   */
  abstract getTrendsByTimeframe(timeframe: string): Promise<NarrativeTrend[]>;

  /**
   * Delete insights older than a specified date
   * Returns the number of deleted insights
   */
  abstract deleteOlderThan(cutoffDate: Date): Promise<number>;
}

/**
 * In-memory implementation of the NarrativeRepository
 * This is primarily for development and testing
 * In production, this would be replaced with MongoDB or PostgreSQL implementations
 */
@Injectable()
export class InMemoryNarrativeRepository implements NarrativeRepository {
  private readonly insights: Map<string, NarrativeInsight> = new Map();
  private readonly logger = new Logger(InMemoryNarrativeRepository.name);

  constructor() {
    this.logger.log('Initialized in-memory narrative repository');
  }

  async save(insight: NarrativeInsight): Promise<void> {
    this.insights.set(insight.contentHash, { ...insight });
    this.logger.debug(`Saved insight with hash: ${insight.contentHash}`);
  }

  async saveMany(insights: NarrativeInsight[]): Promise<void> {
    for (const insight of insights) {
      await this.save(insight);
    }
    this.logger.debug(`Saved ${insights.length} insights in batch`);
  }

  async findByContentHash(
    contentHash: string
  ): Promise<NarrativeInsight | null> {
    const insight = this.insights.get(contentHash);
    return insight ? { ...insight } : null;
  }

  async findByTimeframe(
    timeframe: string,
    options?: { limit?: number; skip?: number }
  ): Promise<NarrativeInsight[]> {
    // Extract year and quarter from timeframe (e.g., "2023-Q2")
    const [year, quarter] = timeframe.split('-');

    // Filter insights by timestamp
    const results = Array.from(this.insights.values()).filter((insight) => {
      const insightDate = insight.timestamp;
      const insightYear = insightDate.getFullYear().toString();
      const insightQuarter = `Q${Math.floor(insightDate.getMonth() / 3) + 1}`;

      return insightYear === year && insightQuarter === quarter;
    });

    // Apply pagination
    const skip = options?.skip || 0;
    const limit = options?.limit || results.length;

    return results.slice(skip, skip + limit);
  }

  async getTrendsByTimeframe(timeframe: string): Promise<NarrativeTrend[]> {
    // Get insights for the timeframe
    const insights = await this.findByTimeframe(timeframe);

    // Group insights by themes to identify trends
    const themeCounts: Record<string, number> = {};
    const platformCounts: Record<string, number> = {};
    const sourceHashes = new Set<string>();

    // Aggregate data
    for (const insight of insights) {
      // Count themes
      for (const theme of insight.themes) {
        themeCounts[theme] = (themeCounts[theme] || 0) + 1;
      }

      // Count platforms
      platformCounts[insight.platform] =
        (platformCounts[insight.platform] || 0) + 1;

      // Track unique sources
      sourceHashes.add(insight.sourceHash);
    }

    // Sort themes by frequency
    const sortedThemes = Object.entries(themeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10); // Top 10 themes

    // Create trend objects
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const trends: NarrativeTrend[] = sortedThemes.map(([theme, count]) => {
      // Filter insights related to this theme
      const themeInsights = insights.filter((insight) =>
        insight.themes.includes(theme)
      );

      // Calculate average sentiment
      const avgSentiment =
        themeInsights.reduce(
          (sum, insight) => sum + insight.sentiment.score,
          0
        ) / themeInsights.length;

      // Calculate source diversity
      const themeSourceHashes = new Set(
        themeInsights.map((insight) => insight.sourceHash)
      );

      return {
        id: `trend-${timeframe}-${theme}`,
        timeframe,
        primaryTheme: theme,
        relatedThemes: this.findRelatedThemes(themeInsights),
        insightCount: themeInsights.length,
        uniqueSourcesCount: themeSourceHashes.size,
        sentimentTrend: avgSentiment,
        platformDistribution: this.calculatePlatformDistribution(themeInsights),
        narrativeScore: this.calculateAggregateScore(themeInsights),
        detectedAt: new Date(),
      };
    });

    return trends;
  }

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

  /**
   * Find themes that frequently appear together with the main theme
   */
  private findRelatedThemes(insights: NarrativeInsight[]): string[] {
    const themeCounts: Record<string, number> = {};

    // Count occurrences of each theme
    for (const insight of insights) {
      for (const theme of insight.themes) {
        themeCounts[theme] = (themeCounts[theme] || 0) + 1;
      }
    }

    // Sort by count and get top 5 related themes
    return Object.entries(themeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(1, 6) // Skip the first one (main theme) and get next 5
      .map(([theme]) => theme);
  }

  /**
   * Calculate distribution of insights across platforms
   */
  private calculatePlatformDistribution(
    insights: NarrativeInsight[]
  ): Record<string, number> {
    const distribution: Record<string, number> = {};

    for (const insight of insights) {
      distribution[insight.platform] =
        (distribution[insight.platform] || 0) + 1;
    }

    // Convert to percentages
    const total = insights.length;
    for (const platform in distribution) {
      distribution[platform] = distribution[platform] / total;
    }

    return distribution;
  }

  /**
   * Calculate an aggregate narrative score based on all insights
   */
  private calculateAggregateScore(insights: NarrativeInsight[]): number {
    if (insights.length === 0) return 0;

    // Average of individual narrativeScores
    const avgScore =
      insights.reduce((sum, insight) => sum + insight.narrativeScore, 0) /
      insights.length;

    // Boost based on number of insights (logarithmic scale)
    const volumeBoost = Math.min(Math.log10(insights.length) / 2, 0.5);

    // Adjust final score (max 1.0)
    return Math.min(avgScore + volumeBoost, 1.0);
  }
}
