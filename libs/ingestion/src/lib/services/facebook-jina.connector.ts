import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
import { NarrativeInsight } from '../../types/narrative-insight.interface';
import { SocialMediaPost } from '../../types/social-media.types';
import { DataConnector } from '../interfaces/data-connector.interface';
import { SourceNode } from '../schemas';
import { TransformOnIngestService } from './transform/transform-on-ingest.service';
import { JinaReaderService } from './utils/jina-reader.service';
import { SourceRateLimiter } from './utils/source-rate-limiter';

interface SearchOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

/**
 * PAGE-MONITORING connector for public Facebook pages via Jina Reader — NOT search.
 *
 * IMPORTANT: this connector cannot search Facebook. "search" here means reading
 * the pages configured in FACEBOOK_PAGE_URLS (JSON array of URLs) and filtering
 * their content by the query — results only ever come from those pages.
 *
 * Data-quality caveats:
 * - Timestamps are RETRIEVAL times (when the page was read), NOT publication
 *   times — Jina Reader output does not expose post dates.
 * - Engagement metrics are unavailable and always zero.
 * - Only works with public Facebook pages/posts; Facebook may block scraping
 *   of some pages (best effort).
 */
@Injectable()
export class FacebookJinaConnector implements DataConnector, OnModuleInit, OnModuleDestroy {
  platform = 'facebook' as const;
  private streamConnections: Map<string, NodeJS.Timeout> = new Map();
  private readonly pollingInterval = 300000; // 5 minutes
  private readonly logger = new Logger(FacebookJinaConnector.name);
  private pageUrls: string[] = [];

  constructor(
    private configService: ConfigService,
    private transformService: TransformOnIngestService,
    private jinaReader: JinaReaderService,
  ) {}

  async onModuleInit() {
    await this.validateCredentials();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  async connect(): Promise<void> {
    const pageUrlsConfig = this.configService.get<string>('FACEBOOK_PAGE_URLS');

    if (pageUrlsConfig) {
      try {
        this.pageUrls = JSON.parse(pageUrlsConfig);
      } catch {
        this.logger.warn('Failed to parse FACEBOOK_PAGE_URLS config. Expected JSON array of URLs.');
        this.pageUrls = [];
      }
    }

    if (this.pageUrls.length === 0) {
      this.logger.warn(
        'No Facebook page URLs configured. Set FACEBOOK_PAGE_URLS env var with a JSON array of URLs to monitor.',
      );
    }

    this.logger.log(`Facebook Jina connector initialized with ${this.pageUrls.length} page URLs`);
  }

  async disconnect(): Promise<void> {
    this.streamConnections.forEach((interval) => {
      clearInterval(interval);
    });
    this.streamConnections.clear();
  }

  async searchAndTransform(query: string, options?: SearchOptions): Promise<NarrativeInsight[]> {
    try {
      this.logger.log(`Reading Facebook pages (API-free) for: ${query}`);

      const posts = await this.searchContent(query, options);
      const insights = await this.transformService.transformBatch(posts);

      this.logger.log(`Transformed ${insights.length} Facebook results into anonymized insights`);

      return insights;
    } catch (error) {
      this.logger.error('Error searching and transforming Facebook content:', error);
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

          this.logger.debug(`Emitted ${insights.length} anonymized insights from Facebook stream`);
        }
      } catch (error) {
        emitter.emit('error', error);
        this.logger.error('Error in Facebook stream:', error);
      }
    };

    void checkPages();

    const interval = setInterval(checkPages, this.pollingInterval);
    interval.unref?.();
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
      const result = await SourceRateLimiter.instance.schedule('facebook', () =>
        this.jinaReader.readUrl(url),
      );

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
          'Jina Reader service is not accessible. Facebook Jina connector may not work.',
        );
        return false;
      }

      this.logger.log('Facebook Jina connector validated (no API credentials needed)');
      return true;
    } catch (error) {
      this.logger.error('Facebook Jina connector validation failed:', error);
      return false;
    }
  }

  // --- Private helpers ---

  async searchContent(query: string, options?: SearchOptions): Promise<SocialMediaPost[]> {
    if (this.pageUrls.length === 0) {
      throw new Error('Facebook monitoring not configured: set FACEBOOK_PAGE_URLS');
    }

    const allPosts: SocialMediaPost[] = [];
    const limit = options?.limit || 50;
    const failures: string[] = [];
    let attempted = 0;

    for (const pageUrl of this.pageUrls) {
      attempted++;
      try {
        const result = await SourceRateLimiter.instance.schedule('facebook', () =>
          this.jinaReader.readUrl(pageUrl),
        );
        const posts = this.extractPostsFromContent(result.content, pageUrl, query);
        allPosts.push(...posts);

        if (allPosts.length >= limit) break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(message);
        this.logger.warn(`Failed to read Facebook page ${pageUrl}: ${message}`);
      }
    }

    if (failures.length === attempted && allPosts.length === 0) {
      throw new Error(`Facebook search failed: all ${attempted} pages failed: ${failures[0]}`);
    }

    return allPosts.slice(0, limit);
  }

  private extractPostsFromContent(
    content: string,
    sourceUrl: string,
    query: string,
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
