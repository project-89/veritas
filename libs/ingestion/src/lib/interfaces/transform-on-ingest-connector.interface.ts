import { EventEmitter } from 'events';
import { SocialMediaConnector } from './social-media-connector.interface';
import { NarrativeInsight } from '../../types/narrative-insight.interface';

/**
 * Interface for connectors that implement the transform-on-ingest pattern
 * Extends SocialMediaConnector with methods for transforming data during ingestion
 */
export interface TransformOnIngestConnector extends SocialMediaConnector {
  /**
   * Search for content and transform it into anonymized narrative insights
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
      [key: string]: any;
    }
  ): Promise<NarrativeInsight[]>;

  /**
   * Stream content and transform it into anonymized narrative insights
   *
   * @param keywords - Array of keywords to monitor
   * @returns EventEmitter that emits 'data' events with NarrativeInsight objects
   */
  streamAndTransform(keywords: string[]): EventEmitter;
}
