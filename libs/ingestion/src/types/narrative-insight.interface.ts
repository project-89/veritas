/**
 * Represents a sentiment analysis result
 */
export interface SentimentAnalysis {
  /**
   * Sentiment score from -1 (negative) to 1 (positive)
   */
  score: number;

  /**
   * Sentiment label (negative, neutral, positive)
   */
  label: 'negative' | 'neutral' | 'positive';

  /**
   * Confidence score (0-1) of the sentiment analysis
   */
  confidence: number;
}

/**
 * Represents a transformed and anonymized narrative insight
 * derived from social media content but with no personally identifiable information
 */
export interface NarrativeInsight {
  /**
   * Unique identifier for the insight
   */
  id: string;

  /**
   * One-way hash of the original content
   * Used to prevent duplicates and for data deletion compliance
   */
  contentHash: string;

  /**
   * One-way hash of the source (author/account)
   * Anonymized to prevent identity linking
   */
  sourceHash: string;

  /**
   * Platform where the content originated
   */
  platform: string;

  /**
   * When the content was posted
   */
  timestamp: Date;

  /**
   * An array of extracted themes from the content
   */
  themes: string[];

  /**
   * Key entities mentioned in the content
   */
  entities: {
    /**
     * Entity name (topic, person, organization, etc.)
     */
    name: string;

    /**
     * Entity type (topic, person, organization, etc.)
     */
    type: string;

    /**
     * Importance of entity in the context (0-1)
     */
    relevance: number;
  }[];

  /**
   * Sentiment analysis results
   */
  sentiment: SentimentAnalysis;

  /**
   * Anonymized engagement metrics
   */
  engagement: {
    /**
     * Total engagement count
     */
    total: number;

    /**
     * Engagement type breakdown
     */
    breakdown: Record<string, number>;
  };

  /**
   * Narrative score (0-1) indicating the contribution to overall narratives
   */
  narrativeScore: number;

  /**
   * When this insight was created in the system
   */
  processedAt: Date;

  /**
   * When this insight should be automatically deleted
   */
  expiresAt: Date;
}
