import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NarrativeInsight } from '../../types/narrative-insight.interface';
import { NarrativeTrend } from '../../types/narrative-trend.interface';
import { NarrativeRepository } from './narrative-insight.repository';

/**
 * MongoDB implementation of the NarrativeRepository
 * This is for production use, leveraging MongoDB's indexing and aggregation capabilities
 */
@Injectable()
export class MongoNarrativeRepository implements NarrativeRepository {
  private readonly logger = new Logger(MongoNarrativeRepository.name);

  constructor(
    @InjectModel('NarrativeInsight')
    private readonly insightModel: Model<NarrativeInsight>,
    @InjectModel('NarrativeTrend')
    private readonly trendModel: Model<NarrativeTrend>
  ) {
    this.logger.log('Initialized MongoDB narrative repository');
  }

  async save(insight: NarrativeInsight): Promise<void> {
    await this.insightModel.findOneAndUpdate(
      { contentHash: insight.contentHash },
      insight,
      { upsert: true, new: true }
    );
    this.logger.debug(`Saved insight with hash: ${insight.contentHash}`);
  }

  async saveMany(insights: NarrativeInsight[]): Promise<void> {
    if (!insights.length) return;

    const operations = insights.map((insight) => ({
      updateOne: {
        filter: { contentHash: insight.contentHash },
        update: insight,
        upsert: true,
      },
    }));

    await this.insightModel.bulkWrite(operations);
    this.logger.debug(`Saved ${insights.length} insights in batch`);
  }

  async findByContentHash(
    contentHash: string
  ): Promise<NarrativeInsight | null> {
    return this.insightModel.findOne({ contentHash }).lean();
  }

  async findByTimeframe(
    timeframe: string,
    options?: { limit?: number; skip?: number }
  ): Promise<NarrativeInsight[]> {
    // Extract year and quarter from timeframe (e.g., "2023-Q2")
    const [year, quarter] = timeframe.split('-');
    const quarterNum = parseInt(quarter.substring(1));

    // Calculate start and end dates for the quarter
    const startMonth = (quarterNum - 1) * 3;
    const endMonth = startMonth + 3;

    const startDate = new Date(parseInt(year), startMonth, 1);
    const endDate = new Date(parseInt(year), endMonth, 0);

    // Build query
    const query = this.insightModel.find({
      timestamp: {
        $gte: startDate,
        $lt: endDate,
      },
    });

    // Apply pagination
    if (options?.skip) {
      query.skip(options.skip);
    }

    if (options?.limit) {
      query.limit(options.limit);
    }

    return query.lean();
  }

  async getTrendsByTimeframe(timeframe: string): Promise<NarrativeTrend[]> {
    // First check if we have pre-computed trends
    const existingTrends = await this.trendModel.find({ timeframe }).lean();

    if (existingTrends.length > 0) {
      return existingTrends;
    }

    // If not, compute trends from insights
    const insights = await this.findByTimeframe(timeframe);

    if (insights.length === 0) {
      return [];
    }

    // Group insights by themes
    const themeGroups = new Map<string, NarrativeInsight[]>();

    for (const insight of insights) {
      for (const theme of insight.themes) {
        if (!themeGroups.has(theme)) {
          themeGroups.set(theme, []);
        }
        themeGroups.get(theme)!.push(insight);
      }
    }

    // Create trends sorted by frequency
    const trends: NarrativeTrend[] = Array.from(themeGroups.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 10) // Top 10 themes
      .map(([theme, themeInsights]) => {
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

        // Calculate platform distribution
        const platformCounts: Record<string, number> = {};
        for (const insight of themeInsights) {
          platformCounts[insight.platform] =
            (platformCounts[insight.platform] || 0) + 1;
        }

        const totalCount = themeInsights.length;
        const platformDistribution: Record<string, number> = {};
        for (const platform in platformCounts) {
          platformDistribution[platform] =
            platformCounts[platform] / totalCount;
        }

        // Find related themes
        const relatedThemes = this.findRelatedThemes(themeInsights, theme);

        // Calculate narrative score
        const narrativeScore = this.calculateAggregateScore(themeInsights);

        const trend: NarrativeTrend = {
          id: `trend-${timeframe}-${theme}`,
          timeframe,
          primaryTheme: theme,
          relatedThemes,
          insightCount: themeInsights.length,
          uniqueSourcesCount: themeSourceHashes.size,
          sentimentTrend: avgSentiment,
          platformDistribution,
          narrativeScore,
          detectedAt: new Date(),
        };

        // Optionally persist the trend for future queries
        this.trendModel.create(trend).catch((err: Error) => {
          this.logger.error(`Failed to save trend: ${err.message}`);
        });

        return trend;
      });

    return trends;
  }

  async deleteOlderThan(cutoffDate: Date): Promise<number> {
    const result = await this.insightModel.deleteMany({
      timestamp: { $lt: cutoffDate },
    });

    const deletedCount = result.deletedCount || 0;

    this.logger.log(
      `Deleted ${deletedCount} insights older than ${cutoffDate.toISOString()}`
    );

    return deletedCount;
  }

  /**
   * Find themes that frequently appear together with the main theme
   */
  private findRelatedThemes(
    insights: NarrativeInsight[],
    mainTheme: string
  ): string[] {
    const themeCounts: Record<string, number> = {};

    // Count occurrences of each theme
    for (const insight of insights) {
      for (const theme of insight.themes) {
        if (theme !== mainTheme) {
          themeCounts[theme] = (themeCounts[theme] || 0) + 1;
        }
      }
    }

    // Sort by count and get top 5 related themes
    return Object.entries(themeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([theme]) => theme);
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
