import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
import { DataConnector } from '../interfaces/data-connector.interface';
import { SocialMediaPost } from '../../types/social-media.types';
import { SourceNode } from '../schemas';
import { TransformOnIngestService } from './transform/transform-on-ingest.service';
import { NarrativeInsight } from '../../types/narrative-insight.interface';
import { JinaReaderService } from './utils/jina-reader.service';

interface SearchOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

/**
 * API-free Facebook connector using Jina Reader for public pages.
 *
 * Limitations:
 * - Only works with public Facebook pages/posts
 * - No search within Facebook (monitors configured page URLs)
 * - Limited engagement data (mostly zeroed)
 * - Best effort — Facebook may block scraping of some pages
 *
 * Configure monitored pages via FACEBOOK_PAGE_URLS env var (JSON array of URLs).
 */
@Injectable()
export class FacebookJinaConnector
  implements DataConnector, OnModuleInit, OnModuleDestroy
{
  platform = 'facebook' as const;
  private streamConnections: Map<string, NodeJS.Timeout> = new Map();
  private readonly pollingInterval = 300000; // 5 minutes
  private readonly logger = new Logger(FacebookJinaConnector.name);
  private pageUrls: string[] = [];

  constructor(
    private configService: ConfigService,
    private transformService: TransformOnIngestService,
    private jinaReader: JinaReaderService
  ) {}

  async onModuleInit() {
    await this.validateCredentials();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  async connect(): Promise<void> {
    const pageUrlsConfig = this.configService.get<string>(
      'FACEBOOK_PAGE_URLS'
    );

    if (pageUrlsConfig) {
      try {
        this.pageUrls = JSON.parse(pageUrlsConfig);
      } catch {
        this.logger.warn(
          'Failed to parse FACEBOOK_PAGE_URLS config. Expected JSON array of URLs.'
        );
        this.pageUrls = [];
      }
    }

    if (this.pageUrls.length === 0) {
      this.logger.warn(
        'No Facebook page URLs configured. Set FACEBOOK_PAGE_URLS env var with a JSON array of URLs to monitor.'
      );
    }

    this.logger.log(
      `Facebook Jina connector initialized with ${this.pageUrls.length} page URLs`
    );
  }

  async disconnect(): Promise<void> {
    this.streamConnections.forEach((interval) => {
      clearInterval(interval);
    });
    this.streamConnections.clear();
  }

  async searchAndTransform(
    query: string,
    options?: SearchOptions
  ): Promise<NarrativeInsight[]> {
    try {
      this.logger.log(`Reading Facebook pages (API-free) for: ${query}`);

      const posts = await this.searchContent(query, options);
      const insights = await this.transformService.transformBatch(posts);

      this.logger.log(
        `Transformed ${insights.length} Facebook results into anonymized insights`
      );

      return insights;
    } catch (error) {
      this.logger.error(
        'Error searching and transforming Facebook content:',
        error
      );
      throw error;
    }
  }

  streamAndTransform(keywords: string[]): EventEmitter {
    const emitter = new EventEmitter();
    const streamId = Math.random().toString(36).substring(7);

    const checkPages = async () => {
      try {
        const posts = await this.searchContent(keywords.join(' '), {
          limit: 50,
        });

        if (posts.length > 0) {
          const insights = await this.transformService.transformBatch(posts);

          for (const insight of insights) {
            emitter.emit('data', insight);
          }

          this.logger.debug(
            `Emitted ${insights.length} anonymized insights from Facebook stream`
          );
        }
      } catch (error) {
        emitter.emit('error', error);
        this.logger.error('Error in Facebook stream:', error);
      }
    };

    checkPages();

    const interval = setInterval(checkPages, this.pollingInterval);
    this.streamConnections.set(streamId, interval);

    emitter.on('end', () => {
      clearInterval(interval);
      this.streamConnections.delete(streamId);
      this.logger.log(`Closed Facebook stream: ${streamId}`);
    });

    return emitter;
  }

  async getAuthorDetails(authorId: string): Promise<Partial<SourceNode>> {
    // Limited — try to read the page via Jina Reader
    try {
      const url = `https://www.facebook.com/${authorId}`;
      const result = await this.jinaReader.readUrl(url);

      return {
        id: authorId,
        name: result.title || authorId,
        platform: this.platform,
        url,
        description: result.description || '',
        credibilityScore: 0.3, // Default low score for unverified scraping
        verificationStatus: 'unverified',
      } as Partial<SourceNode>;
    } catch (error) {
      this.logger.error('Error fetching Facebook author details:', error);
      throw error;
    }
  }

  async validateCredentials(): Promise<boolean> {
    try {
      await this.connect();

      // Verify Jina Reader is accessible
      const jinaAvailable = await this.jinaReader.isAvailable();
      if (!jinaAvailable) {
        this.logger.warn(
          'Jina Reader service is not accessible. Facebook Jina connector may not work.'
        );
        return false;
      }

      this.logger.log(
        'Facebook Jina connector validated (no API credentials needed)'
      );
      return true;
    } catch (error) {
      this.logger.error('Facebook Jina connector validation failed:', error);
      return false;
    }
  }

  // --- Private helpers ---

  async searchContent(
    query: string,
    options?: SearchOptions
  ): Promise<SocialMediaPost[]> {
    const allPosts: SocialMediaPost[] = [];
    const limit = options?.limit || 50;

    for (const pageUrl of this.pageUrls) {
      try {
        const result = await this.jinaReader.readUrl(pageUrl);
        const posts = this.extractPostsFromContent(
          result.content,
          pageUrl,
          query
        );
        allPosts.push(...posts);

        if (allPosts.length >= limit) break;
      } catch (error) {
        this.logger.warn(
          `Failed to read Facebook page ${pageUrl}: ${(error as Error).message}`
        );
      }
    }

    return allPosts.slice(0, limit);
  }

  private extractPostsFromContent(
    content: string,
    sourceUrl: string,
    query: string
  ): SocialMediaPost[] {
    const posts: SocialMediaPost[] = [];
    const queryLower = query.toLowerCase();

    // Split content into logical blocks (paragraphs or sections)
    const blocks = content
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter((block) => block.length > 20); // Ignore very short blocks

    for (const block of blocks) {
      // Only include blocks that match the query
      if (queryLower && !block.toLowerCase().includes(queryLower)) {
        continue;
      }

      const id = this.generateBlockId(block, sourceUrl);

      posts.push({
        id,
        text: block.slice(0, 2000),
        platform: this.platform,
        authorId: this.extractPageId(sourceUrl),
        authorName: this.extractPageId(sourceUrl),
        url: sourceUrl,
        timestamp: new Date(), // Can't extract exact timestamps from Jina output
        engagementMetrics: {
          likes: 0,
          shares: 0,
          comments: 0,
          reach: 0,
          viralityScore: 0,
        },
      });
    }

    return posts;
  }

  private extractPageId(url: string): string {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname.replace(/^\//, '').replace(/\/$/, '');
      return path || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  private generateBlockId(content: string, source: string): string {
    // Simple deterministic ID from content + source
    let hash = 0;
    const str = content + source;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `fb-jina-${Math.abs(hash).toString(36)}`;
  }
}
