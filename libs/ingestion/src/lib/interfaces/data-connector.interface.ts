import { EventEmitter } from 'events';

import { NarrativeInsight } from '../../types/narrative-insight.interface';
import { SourceNode } from '../schemas';

/**
 * Options for connector search operations
 */
export interface ConnectorSearchOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  [key: string]: unknown;
}

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
  searchAndTransform(query: string, options?: ConnectorSearchOptions): Promise<NarrativeInsight[]>;

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

  /**
   * Optional. Report required credentials/config that are absent from the
   * environment. When this returns a non-empty list, the connector is
   * auto-disabled at registration (excluded from every scan) rather than
   * being attempted and failing per-request (e.g. repeated 403s). Connectors
   * that work keyless should not implement this, or return an empty array.
   *
   * @returns Names of the missing environment variables, e.g. ['REDDIT_CLIENT_ID']
   */
  getMissingCredentials?(): string[];
}
