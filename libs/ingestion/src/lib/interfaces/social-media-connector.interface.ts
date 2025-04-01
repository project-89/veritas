import { EventEmitter } from 'events';
import { SocialMediaPost } from '../../types/social-media.types';
import { SourceNode } from '@veritas/shared/types';

/**
 * Interface for social media connectors
 * Provides methods for searching and streaming content from social media platforms
 */
export interface SocialMediaConnector {
  /**
   * Platform identifier for this connector (twitter, facebook, reddit, etc.)
   */
  platform: string;

  /**
   * Connect to the social media platform API
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the social media platform API
   */
  disconnect(): Promise<void>;

  /**
   * Search for content on the platform
   *
   * @param query - Search query
   * @param options - Search options (platform-specific)
   * @returns Promise resolving to an array of SocialMediaPost objects
   */
  searchContent(
    query: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      [key: string]: any;
    }
  ): Promise<SocialMediaPost[]>;

  /**
   * Stream content from the platform based on keywords
   *
   * @param keywords - Array of keywords to monitor
   * @returns EventEmitter that emits 'data' events with SocialMediaPost objects
   */
  streamContent(keywords: string[]): EventEmitter;

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

export { SocialMediaPost };
