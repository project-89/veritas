import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService, Repository } from '@veritas/database';
import { NarrativeInsight } from '../../types/narrative-insight.interface';
import { NarrativeTrend } from '../../types/narrative-trend.interface';
import { NarrativeRepository } from './narrative-insight.repository';
import {
  NarrativeInsightModel,
  NarrativeInsightSchema,
} from '../schemas/narrative-insight.schema';
import {
  NarrativeTrendModel,
  NarrativeTrendSchema,
} from '../schemas/narrative-trend.schema';

/**
 * MongoDB implementation of the NarrativeRepository
 * Uses our DatabaseService to access MongoDB collections
 */
@Injectable()
export class MongoNarrativeRepository implements NarrativeRepository {
  private readonly logger = new Logger(MongoNarrativeRepository.name);
  private insightRepository: Repository<NarrativeInsight>;
  private trendRepository: Repository<NarrativeTrend>;

  constructor(private readonly databaseService: DatabaseService) {
    this.logger.log('Initializing MongoDB narrative repository');
    this.initializeRepositories();
  }

  /**
   * Initialize database repositories
   */
  private initializeRepositories() {
    try {
      // Register models with the proper Mongoose schemas
      try {
        // Use the Mongoose schema models exported from our schema files
        this.databaseService.registerModel(
          'NarrativeInsight',
          NarrativeInsightModel
        );
        this.databaseService.registerModel(
          'NarrativeTrend',
          NarrativeTrendModel
        );

        this.logger.debug(
          'Successfully registered Narrative models with database service'
        );
      } catch (error) {
        this.logger.warn(
          'Models already registered or error registering models',
          error
        );
      }

      // Get repositories
      this.insightRepository =
        this.databaseService.getRepository<NarrativeInsight>(
          'NarrativeInsight'
        );
      this.trendRepository =
        this.databaseService.getRepository<NarrativeTrend>('NarrativeTrend');

      this.logger.debug('Successfully acquired Narrative repositories');
    } catch (error: any) {
      this.logger.error(
        `Failed to initialize repositories: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Save a narrative insight to the repository
   */
  async save(insight: NarrativeInsight): Promise<void> {
    try {
      await this.insightRepository.create(insight);
      this.logger.debug(`Saved narrative insight: ${insight.id}`);
    } catch (error: any) {
      this.logger.error(
        `Error saving narrative insight: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Save multiple narrative insights in a batch
   */
  async saveMany(insights: NarrativeInsight[]): Promise<void> {
    try {
      await this.insightRepository.createMany(insights);
      this.logger.debug(`Saved ${insights.length} narrative insights`);
    } catch (error: any) {
      this.logger.error(
        `Error saving narrative insights batch: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Find a narrative insight by its content hash
   */
  async findByContentHash(
    contentHash: string
  ): Promise<NarrativeInsight | null> {
    try {
      return await this.insightRepository.findOne({ contentHash });
    } catch (error: any) {
      this.logger.error(
        `Error finding insight by content hash: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Find narrative insights by timeframe
   */
  async findByTimeframe(
    timeframe: string,
    options?: { limit?: number; skip?: number }
  ): Promise<NarrativeInsight[]> {
    try {
      // Extract start and end dates from timeframe (e.g., "2023-Q1")
      const { startDate, endDate } = this.parseTimeframe(timeframe);

      return await this.insightRepository.find(
        {
          timestamp: {
            $gte: startDate,
            $lte: endDate,
          },
        },
        {
          limit: options?.limit,
          skip: options?.skip,
          sort: { timestamp: -1 },
        }
      );
    } catch (error: any) {
      this.logger.error(
        `Error finding insights by timeframe: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Get narrative trends by aggregating insights
   */
  async getTrendsByTimeframe(timeframe: string): Promise<NarrativeTrend[]> {
    try {
      // First check if we already have trends for this timeframe
      const existingTrends = await this.trendRepository.find({ timeframe });

      if (existingTrends.length > 0) {
        this.logger.debug(
          `Found ${existingTrends.length} existing trends for timeframe ${timeframe}`
        );
        return existingTrends;
      }

      // If no existing trends, calculate them
      const { startDate, endDate } = this.parseTimeframe(timeframe);

      // Find insights for this timeframe
      const insights = await this.insightRepository.find({
        timestamp: {
          $gte: startDate,
          $lte: endDate,
        },
      });

      if (insights.length === 0) {
        return [];
      }

      // Process insights to generate trends
      const trends = this.generateTrends(insights, timeframe);

      // Save trends for future queries
      await this.trendRepository.createMany(trends);

      return trends;
    } catch (error: any) {
      this.logger.error(
        `Error getting trends by timeframe: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Delete insights older than a specified date
   * Returns the number of deleted insights
   */
  async deleteOlderThan(cutoffDate: Date): Promise<number> {
    try {
      const result = await this.insightRepository.deleteMany({
        expiresAt: { $lt: cutoffDate },
      });

      return result;
    } catch (error: any) {
      this.logger.error(
        `Error deleting old insights: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Parse a timeframe string into start and end dates
   * Handles formats like "2023-Q1", "2023-04", etc.
   */
  private parseTimeframe(timeframe: string): {
    startDate: Date;
    endDate: Date;
  } {
    try {
      let startDate = new Date();
      let endDate = new Date();

      // Handle quarterly format (YYYY-QN)
      if (/^\d{4}-Q[1-4]$/.test(timeframe)) {
        const year = parseInt(timeframe.substring(0, 4), 10);
        const quarter = parseInt(timeframe.substring(6, 7), 10);
        const startMonth = (quarter - 1) * 3;

        startDate = new Date(year, startMonth, 1);
        endDate = new Date(year, startMonth + 3, 0);
      }
      // Handle monthly format (YYYY-MM)
      else if (/^\d{4}-\d{2}$/.test(timeframe)) {
        const year = parseInt(timeframe.substring(0, 4), 10);
        const month = parseInt(timeframe.substring(5, 7), 10) - 1;

        startDate = new Date(year, month, 1);
        endDate = new Date(year, month + 1, 0);
      }
      // Handle yearly format (YYYY)
      else if (/^\d{4}$/.test(timeframe)) {
        const year = parseInt(timeframe, 10);

        startDate = new Date(year, 0, 1);
        endDate = new Date(year, 11, 31);
      }
      // Default to current month
      else {
        const now = new Date();
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      }

      return { startDate, endDate };
    } catch (error: any) {
      this.logger.error(
        `Error parsing timeframe: ${error.message}`,
        error.stack
      );

      // Default to current day as fallback
      const now = new Date();
      return {
        startDate: new Date(now.setHours(0, 0, 0, 0)),
        endDate: new Date(now.setHours(23, 59, 59, 999)),
      };
    }
  }

  /**
   * Generate trend data from a collection of insights
   */
  private generateTrends(
    insights: NarrativeInsight[],
    timeframe: string
  ): NarrativeTrend[] {
    // Group insights by primary theme
    const themeGroups = this.groupByTheme(insights);
    const trends: NarrativeTrend[] = [];

    // For each theme, generate a trend
    for (const [theme, themeInsights] of themeGroups.entries()) {
      if (themeInsights.length < 2) continue; // Skip themes with minimal data

      // Find related themes
      const relatedThemes = this.findRelatedThemes(theme, themeInsights);

      // Count unique sources
      const uniqueSources = new Set(
        themeInsights.map((insight) => insight.sourceHash)
      );

      // Calculate average sentiment
      const sentimentTrend = this.calculateAverageSentiment(themeInsights);

      // Calculate platform distribution
      const platformDistribution =
        this.calculatePlatformDistribution(themeInsights);

      // Calculate narrative score based on engagement, source diversity, etc.
      const narrativeScore = this.calculateNarrativeScore(
        themeInsights,
        uniqueSources.size
      );

      // Create the trend object
      const trend: NarrativeTrend = {
        id: `trend-${timeframe}-${theme.replace(/\s+/g, '-').toLowerCase()}`,
        timeframe,
        primaryTheme: theme,
        relatedThemes,
        insightCount: themeInsights.length,
        uniqueSourcesCount: uniqueSources.size,
        sentimentTrend,
        platformDistribution,
        narrativeScore,
        detectedAt: new Date(),
      };

      trends.push(trend);
    }

    // Sort trends by narrative score (highest first)
    return trends.sort((a, b) => b.narrativeScore - a.narrativeScore);
  }

  /**
   * Group insights by their primary theme
   */
  private groupByTheme(
    insights: NarrativeInsight[]
  ): Map<string, NarrativeInsight[]> {
    const themeGroups = new Map<string, NarrativeInsight[]>();

    for (const insight of insights) {
      // Skip insights with no themes
      if (!insight.themes || insight.themes.length === 0) continue;

      // Use the first theme as the primary theme
      const primaryTheme = insight.themes[0];

      if (!themeGroups.has(primaryTheme)) {
        themeGroups.set(primaryTheme, []);
      }

      themeGroups.get(primaryTheme)!.push(insight);
    }

    return themeGroups;
  }

  /**
   * Find themes that frequently appear together with the primary theme
   */
  private findRelatedThemes(
    primaryTheme: string,
    insights: NarrativeInsight[]
  ): string[] {
    const themeCounts = new Map<string, number>();

    // Count occurrences of each theme (except the primary)
    for (const insight of insights) {
      for (const theme of insight.themes) {
        if (theme !== primaryTheme) {
          const count = themeCounts.get(theme) || 0;
          themeCounts.set(theme, count + 1);
        }
      }
    }

    // Sort themes by frequency
    const sortedThemes = Array.from(themeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([theme]) => theme);

    // Return top 5 related themes
    return sortedThemes.slice(0, 5);
  }

  /**
   * Calculate the average sentiment across insights
   */
  private calculateAverageSentiment(insights: NarrativeInsight[]): number {
    const sum = insights.reduce(
      (total, insight) => total + insight.sentiment.score,
      0
    );

    return sum / insights.length;
  }

  /**
   * Calculate the distribution of insights across platforms
   */
  private calculatePlatformDistribution(
    insights: NarrativeInsight[]
  ): Record<string, number> {
    const platformCounts: Record<string, number> = {};

    for (const insight of insights) {
      const platform = insight.platform;
      platformCounts[platform] = (platformCounts[platform] || 0) + 1;
    }

    // Convert to percentages
    const total = insights.length;
    Object.keys(platformCounts).forEach((platform) => {
      platformCounts[platform] = platformCounts[platform] / total;
    });

    return platformCounts;
  }

  /**
   * Calculate a narrative score based on various factors
   */
  private calculateNarrativeScore(
    insights: NarrativeInsight[],
    uniqueSourcesCount: number
  ): number {
    // Factors that contribute to narrative score:
    // 1. Number of insights (volume)
    const volumeScore = Math.min(insights.length / 20, 1); // Normalize to 0-1

    // 2. Source diversity
    const diversityScore = Math.min(uniqueSourcesCount / 10, 1); // Normalize to 0-1

    // 3. Average engagement
    const totalEngagement = insights.reduce(
      (sum, insight) => sum + insight.engagement.total,
      0
    );
    const avgEngagement = totalEngagement / insights.length;
    const engagementScore = Math.min(avgEngagement / 1000, 1); // Normalize to 0-1

    // 4. Sentiment intensity (absolute value of sentiment)
    const sentimentIntensity =
      insights.reduce(
        (sum, insight) => sum + Math.abs(insight.sentiment.score),
        0
      ) / insights.length;
    const sentimentScore = sentimentIntensity;

    // 5. Platform diversity
    const platforms = new Set(insights.map((insight) => insight.platform));
    const platformDiversityScore = Math.min(platforms.size / 3, 1); // Normalize to 0-1

    // Calculate weighted score
    return (
      volumeScore * 0.2 +
      diversityScore * 0.2 +
      engagementScore * 0.3 +
      sentimentScore * 0.2 +
      platformDiversityScore * 0.1
    );
  }
}
