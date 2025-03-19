/**
 * Simplified version of the base schema for use in the transform-on-ingest architecture
 * Provides just the necessary types without dependencies
 */

/**
 * Represents a source entity in the system
 * This could be an author, publication, or platform
 */
export interface SourceNode {
  /**
   * Unique identifier for the source
   */
  id: string;

  /**
   * Human-readable name of the source
   */
  name: string;

  /**
   * Platform the source is from (e.g., 'facebook', 'twitter')
   */
  platform: string;

  /**
   * URL associated with the source (if applicable)
   */
  url?: string;

  /**
   * Description of the source (if available)
   */
  description?: string;

  /**
   * Verification status ('verified', 'unverified')
   */
  verificationStatus?: string;

  /**
   * Score representing the source's credibility (0-1)
   */
  credibilityScore?: number;

  /**
   * Additional metadata about the source
   */
  metadata?: Record<string, unknown>;
}

/**
 * Represents engagement metrics for content
 */
export interface EngagementMetrics {
  /**
   * Number of likes/reactions
   */
  likes: number;

  /**
   * Number of shares/retweets
   */
  shares: number;

  /**
   * Number of comments/replies
   */
  comments: number;

  /**
   * Total reach/views
   */
  reach: number;

  /**
   * Virality score (0-1)
   */
  viralityScore: number;
}

/**
 * Represents a content node in the system
 * This is a piece of content from a source
 */
export interface ContentNode {
  /**
   * Unique identifier for the content
   */
  id: string;

  /**
   * The actual text content
   */
  text: string;

  /**
   * When the content was posted
   */
  timestamp: Date;

  /**
   * Platform the content is from (e.g., 'facebook', 'twitter')
   */
  platform: string;

  /**
   * Toxicity score (0-1)
   */
  toxicity?: number;

  /**
   * Sentiment analysis results
   */
  sentiment?: {
    /**
     * Sentiment score (-1 to 1)
     */
    score: number;

    /**
     * Sentiment magnitude (0 to 1)
     */
    magnitude: number;
  };

  /**
   * Content categories
   */
  categories?: string[];

  /**
   * Content topics
   */
  topics?: string[];

  /**
   * Engagement metrics for the content
   */
  engagementMetrics?: EngagementMetrics;

  /**
   * Additional metadata about the content
   */
  metadata?: Record<string, unknown>;
}
