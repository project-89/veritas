import { EventEmitter } from 'events';
import { SourceNode } from '@veritas/shared/types';
import { NarrativeInsight } from './narrative-insight.interface';

/**
 * Interface for data connectors following the transform-on-ingest pattern
 * This is the standard connector interface for all data sources
 */
export interface DataConnector {
  /**
   * Platform identifier for this connector
   */
  platform: string;

  /**
   * Connect to the data source
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the data source
   */
  disconnect(): Promise<void>;

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
      [key: string]: unknown;
    }
  ): Promise<NarrativeInsight[]>;

  /**
   * Stream content and transform it into anonymized narrative insights
   *
   * @param keywords - Array of keywords to monitor
   * @returns EventEmitter that emits 'data' events with NarrativeInsight objects
   */
  streamAndTransform(keywords: string[]): EventEmitter;

  /**
   * Get details about an author/source
   *
   * @param authorId - ID of the author to get details for
   * @returns Promise resolving to a partial SourceNode
   */
  getAuthorDetails(authorId: string): Promise<Partial<SourceNode>>;

  /**
   * Validate the connector's credentials
   *
   * @returns Promise resolving to a boolean indicating if credentials are valid
   */
  validateCredentials(): Promise<boolean>;
}
