import { EventEmitter } from 'events';
import { SocialMediaConnector } from './social-media-connector.interface';
import { NarrativeInsight } from './narrative-insight.interface';

/**
 * Enhanced connector interface for transform-on-ingest architecture
 * Extends the original SocialMediaConnector for backward compatibility
 * while adding new methods that return anonymized insights
 */
export interface TransformOnIngestConnector extends SocialMediaConnector {
  /**
   * Enhanced search method that returns anonymized narrative insights
   * instead of raw social media posts
   *
   * This is the preferred method for the transform-on-ingest architecture
   * as it ensures no raw identifiable data is stored
   *
   * @param query - Search query
   * @param options - Search options (platform-specific)
   * @returns Promise resolving to an array of anonymized NarrativeInsight objects
   */
  searchAndTransform(
    query: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      [key: string]: unknown;
    }
  ): Promise<NarrativeInsight[]>;

  /**
   * Enhanced stream method that emits anonymized narrative insights
   * instead of raw social media posts
   *
   * This is the preferred method for the transform-on-ingest architecture
   * as it ensures no raw identifiable data is stored during streaming
   *
   * @param keywords - Array of keywords to monitor
   * @returns EventEmitter that emits 'data' events with NarrativeInsight objects
   */
  streamAndTransform(keywords: string[]): EventEmitter;
}
