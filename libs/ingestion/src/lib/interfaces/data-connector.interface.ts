import { EventEmitter } from 'events';

import { NarrativeInsight } from '../../types/narrative-insight.interface';
import { SourceNode } from '../schemas';

/**
 * Interface for data connectors that provide content to the ingestion system
 * All connectors must implement this interface
 */
export interface DataConnector {
  /**
   * Platform or data source identifier for this connector
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
   * Implements the transform-on-ingest pattern for privacy compliance
   *
   * @param query - Search query
   * @param options - Search options
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
   * Implements the transform-on-ingest pattern for privacy compliance
   *
   * @param keywords - Array of keywords to monitor
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
