import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';
import { ConfigService } from '@nestjs/config';
import { SocialMediaConnector } from '../interfaces/social-media-connector.interface';
import { DataConnector } from '../interfaces/data-connector.interface';
import { TransformOnIngestService } from './transform/transform-on-ingest.service';
import { SocialMediaPost } from '../../types/social-media.types';
import { NarrativeInsight } from '../../types/narrative-insight.interface';
import { SourceNode } from '../schemas';

// Define an interface for streams that may have close/destroy methods
interface ExtendedEventEmitter extends EventEmitter {
  close?: () => void;
  destroy?: () => void;
}

/**
 * Base class for all social media connectors.
 * Implements common functionality and error handling.
 */
@Injectable()
export abstract class BaseSocialMediaConnector
  implements SocialMediaConnector, DataConnector
{
  protected readonly logger: Logger;
  protected isConnected = false;
  protected streamConnections: Map<string, any> = new Map();

  /**
   * The platform this connector is for. Must be implemented by child classes.
   */
  abstract platform: string;

  constructor(
    protected readonly configService: ConfigService,
    protected readonly transformService: TransformOnIngestService
  ) {
    this.logger = new Logger(this.constructor.name);
  }

  /**
   * Connect to the social media platform API
   */
  async connect(): Promise<void> {
    try {
      this.logger.log(`Connecting to ${this.platform}...`);
      await this.connectToApi();
      this.isConnected = true;
      this.logger.log(`Successfully connected to ${this.platform}`);
    } catch (error: any) {
      this.isConnected = false;
      this.logger.error(
        `Failed to connect to ${this.platform}: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Disconnect from the social media platform API
   */
  async disconnect(): Promise<void> {
    try {
      if (this.isConnected) {
        this.logger.log(`Disconnecting from ${this.platform}...`);

        // Close all stream connections
        for (const [keyword, connection] of this.streamConnections.entries()) {
          if (connection) {
            if (typeof connection.close === 'function') {
              connection.close();
            } else if (typeof connection.destroy === 'function') {
              connection.destroy();
            } else if (connection instanceof EventEmitter) {
              connection.removeAllListeners();
            }
            this.logger.debug(`Closed stream for keyword: ${keyword}`);
          }
        }
        this.streamConnections.clear();

        await this.disconnectFromApi();
        this.isConnected = false;
        this.logger.log(`Successfully disconnected from ${this.platform}`);
      }
    } catch (error: any) {
      this.logger.error(
        `Error disconnecting from ${this.platform}: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Search for content and transform it using the transform-on-ingest pattern
   */
  async searchAndTransform(
    query: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    }
  ): Promise<NarrativeInsight[]> {
    try {
      this.logger.log(`Searching ${this.platform} for: "${query}"`);

      // 1. Get raw posts from the platform
      const posts = await this.searchContent(query, options);

      if (posts.length === 0) {
        this.logger.debug(`No results found for query: "${query}"`);
        return [];
      }

      this.logger.debug(`Found ${posts.length} results for query: "${query}"`);

      // 2. Transform the posts using the transform-on-ingest service
      const insights = await this.transformService.transformBatch(posts);

      this.logger.debug(
        `Transformed ${insights.length} posts into anonymized insights`
      );

      return insights;
    } catch (error: any) {
      this.logger.error(
        `Error searching and transforming ${this.platform} content: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Stream content and transform it using the transform-on-ingest pattern
   */
  streamAndTransform(keywords: string[]): EventEmitter {
    const emitter = new EventEmitter();

    try {
      this.logger.log(
        `Starting ${this.platform} stream for keywords: ${keywords.join(', ')}`
      );

      // 1. Create a stream of raw posts
      const rawStream = this.streamContent(keywords) as ExtendedEventEmitter;

      // 2. Transform each post and emit the anonymized insight
      rawStream.on('data', async (post: SocialMediaPost) => {
        try {
          const insight = await this.transformService.transform(post);
          emitter.emit('data', insight);
        } catch (error: any) {
          this.logger.error(
            `Error transforming streamed post: ${error.message}`,
            error.stack
          );
          // Don't emit transformation errors, just log them
        }
      });

      // Forward errors from the raw stream
      rawStream.on('error', (error: Error) => {
        this.logger.error(
          `Error in ${this.platform} stream: ${error.message}`,
          error
        );
        emitter.emit('error', error);
      });

      // Set up cleanup
      emitter.on('close', () => {
        rawStream.removeAllListeners();
        if (rawStream.listenerCount('data') === 0) {
          if (rawStream.close) {
            rawStream.close();
          } else if (rawStream.destroy) {
            rawStream.destroy();
          }
        }
      });
    } catch (error: any) {
      this.logger.error(
        `Error setting up ${this.platform} stream: ${error.message}`,
        error.stack
      );

      // Emit error asynchronously to match EventEmitter behavior
      process.nextTick(() => {
        emitter.emit('error', error);
      });
    }

    return emitter;
  }

  /**
   * Validate the API credentials
   */
  async validateCredentials(): Promise<boolean> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const isValid = await this.checkCredentialsValidity();

      if (isValid) {
        this.logger.log(`${this.platform} credentials are valid`);
      } else {
        this.logger.warn(`${this.platform} credentials are invalid`);
      }

      return isValid;
    } catch (error: any) {
      this.logger.error(
        `Error validating ${this.platform} credentials: ${error.message}`,
        error.stack
      );
      return false;
    }
  }

  // Abstract methods that must be implemented by subclasses

  /**
   * Connect to the platform API
   */
  protected abstract connectToApi(): Promise<void>;

  /**
   * Disconnect from the platform API
   */
  protected abstract disconnectFromApi(): Promise<void>;

  /**
   * Check if the API credentials are valid
   */
  protected abstract checkCredentialsValidity(): Promise<boolean>;

  /**
   * Search for content on the platform
   */
  abstract searchContent(
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
   */
  abstract streamContent(keywords: string[]): EventEmitter;

  /**
   * Get details about an author from the platform
   */
  abstract getAuthorDetails(authorId: string): Promise<Partial<SourceNode>>;
}
