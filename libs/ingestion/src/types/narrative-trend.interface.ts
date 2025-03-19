/**
 * Represents an aggregated narrative trend identified from multiple insights
 * These trends are the key outputs of the narrative detection process
 */
export interface NarrativeTrend {
  /**
   * Unique identifier for the trend
   */
  id: string;

  /**
   * Time period this trend represents (e.g., "2023-Q2")
   */
  timeframe: string;

  /**
   * The main theme of this narrative trend
   */
  primaryTheme: string;

  /**
   * Related themes that frequently appear with the primary theme
   */
  relatedThemes: string[];

  /**
   * Number of insights that contribute to this trend
   */
  insightCount: number;

  /**
   * Number of unique sources contributing to this trend
   * Higher numbers indicate broader adoption of the narrative
   */
  uniqueSourcesCount: number;

  /**
   * Average sentiment score for this trend
   * Ranges from -1 (negative) to 1 (positive)
   */
  sentimentTrend: number;

  /**
   * Distribution of insights across platforms
   * Key is platform name, value is percentage (0-1)
   */
  platformDistribution: Record<string, number>;

  /**
   * Overall score (0-1) indicating the significance of this narrative
   * Considers volume, engagement, source diversity, and sentiment
   */
  narrativeScore: number;

  /**
   * When this trend was detected
   */
  detectedAt: Date;
}
