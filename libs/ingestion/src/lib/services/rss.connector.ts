import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
import axios from 'axios';
import Parser from 'rss-parser';
import {
  SocialMediaConnector,
  SocialMediaPost,
} from '../interfaces/social-media-connector.interface';
import { TransformOnIngestConnector } from '../interfaces/transform-on-ingest-connector.interface';
import { getFeedsForQuery, getAllFeeds } from '../config/rss-feed-catalog';
import { SourceNode } from '@veritas/shared/types';
import { TransformOnIngestService } from './transform/transform-on-ingest.service';
import { NarrativeInsight } from '../../types/narrative-insight.interface';

interface RSSItem {
  title?: string;
  link?: string;
  pubDate?: string;
  creator?: string;
  content?: string;
  contentSnippet?: string;
  guid?: string;
  categories?: string[];
  isoDate?: string;
  sourceName?: string;
  sourceUrl?: string;
  [key: string]: unknown;
}

interface SearchOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

/**
 * RSS/Atom feed connector
 * Handles fetching and processing RSS and Atom feeds
 */
@Injectable()
export class RSSConnector
  implements TransformOnIngestConnector, OnModuleInit, OnModuleDestroy
{
  platform = 'rss' as const;
  private parser: Parser;
  private streamConnections: Map<string, NodeJS.Timeout> = new Map();
  private readonly pollingInterval = 300000; // 5 minutes
  private interval: NodeJS.Timeout | null = null;
  private readonly logger = new Logger(RSSConnector.name);
  private feedUrls: Map<string, string> = new Map();

  constructor(
    private configService: ConfigService,
    private transformService: TransformOnIngestService
  ) {
    this.parser = new Parser({
      customFields: {
        item: ['media:content', 'media:group', 'dc:creator', 'content:encoded'],
      },
    });
  }

  async onModuleInit() {
    await this.loadFeedUrls();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  /**
   * Load feed URLs from env config or curated catalog.
   */
  private async loadFeedUrls() {
    // 1. Try env-configured feeds first
    const feedsConfig = this.configService.get<string>('RSS_FEEDS');
    if (feedsConfig) {
      try {
        const feeds = JSON.parse(feedsConfig);
        for (const [name, url] of Object.entries(feeds)) {
          this.feedUrls.set(name, url as string);
        }
        this.logger.log(`Loaded ${this.feedUrls.size} RSS feeds from config`);
        return;
      } catch (error) {
        this.logger.error('Error parsing RSS_FEEDS config:', error);
      }
    }

    // 2. Fall back to curated catalog (177 feeds across 15 categories)
    const catalogFeeds = getAllFeeds();
    for (const feed of catalogFeeds) {
      this.feedUrls.set(feed.name, feed.url);
    }
    this.logger.log(`Loaded ${this.feedUrls.size} RSS feeds from curated catalog`);
  }

  /**
   * Load only feeds relevant to a specific query (for targeted scans).
   */
  loadFeedsForQuery(query: string): void {
    const relevant = getFeedsForQuery(query);
    this.feedUrls.clear();
    for (const feed of relevant) {
      this.feedUrls.set(feed.name, feed.url);
    }
    this.logger.log(`Loaded ${this.feedUrls.size} RSS feeds relevant to "${query}"`);
  }

  async connect(): Promise<void> {
    // No persistent connection needed for RSS
    this.logger.log('RSS connector initialized');
  }

  async disconnect(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.streamConnections.forEach((interval) => {
      clearInterval(interval);
    });
    this.streamConnections.clear();
  }

  /**
   * Search content from RSS feeds
   * Implements SocialMediaConnector interface
   */
  async searchContent(
    query: string,
    options?: SearchOptions
  ): Promise<SocialMediaPost[]> {
    try {
      // Use query-relevant feeds (smart matching) instead of all 177
      const relevantFeeds = getFeedsForQuery(query);
      const feedsToUse = new Map<string, string>();
      for (const feed of relevantFeeds) {
        feedsToUse.set(feed.name, feed.url);
      }
      // Also include any manually configured feeds
      for (const [name, url] of this.feedUrls.entries()) {
        feedsToUse.set(name, url);
      }

      this.logger.log(`Fetching from ${feedsToUse.size} RSS feeds relevant to "${query}"`);

      // Fetch in parallel batches of 10 (don't overwhelm network)
      const allItems: RSSItem[] = [];
      const entries = Array.from(feedsToUse.entries());
      const BATCH_SIZE = 10;

      for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        const batch = entries.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async ([feedName, feedUrl]) => {
            const items = await this.fetchFeedItems(feedUrl, options);
            items.forEach((item) => {
              item.sourceName = feedName;
              item.sourceUrl = feedUrl;
            });
            return items;
          }),
        );

        for (const result of results) {
          if (result.status === 'fulfilled') {
            allItems.push(...result.value);
          }
        }
      }

      // Filter items by query if provided
      const filteredItems = query
        ? allItems.filter((item) => this.itemMatchesQuery(item, query))
        : allItems;

      // Transform to SocialMediaPost format
      return this.transformToSocialMediaPosts(filteredItems);
    } catch (error) {
      this.logger.error('Error searching RSS content:', error);
      throw error;
    }
  }

  /**
   * Enhanced searchAndTransform method that returns anonymized insights
   * Implements TransformOnIngestConnector interface
   */
  async searchAndTransform(
    query: string,
    options?: SearchOptions
  ): Promise<NarrativeInsight[]> {
    try {
      this.logger.log(`Searching RSS feeds for: ${query}`);

      // Get social media posts
      const posts = await this.searchContent(query, options);

      // Transform immediately - no raw storage
      const insights = await this.transformService.transformBatch(posts);

      this.logger.log(
        `Transformed ${insights.length} RSS items into anonymized insights`
      );

      // Return only anonymized insights
      return insights;
    } catch (error) {
      this.logger.error('Error searching RSS content:', error);
      throw error;
    }
  }

  /**
   * Add a feed URL to the connector
   */
  async addFeed(name: string, url: string): Promise<boolean> {
    try {
      // Validate the feed URL
      await this.parser.parseURL(url);

      // Add to feedUrls
      this.feedUrls.set(name, url);
      this.logger.log(`Added RSS feed: ${name} - ${url}`);
      return true;
    } catch (error) {
      this.logger.error(`Error adding RSS feed ${name} - ${url}:`, error);
      return false;
    }
  }

  /**
   * Remove a feed URL from the connector
   */
  removeFeed(name: string): boolean {
    const result = this.feedUrls.delete(name);
    if (result) {
      this.logger.log(`Removed RSS feed: ${name}`);
    }
    return result;
  }

  /**
   * Fetch items from a feed URL
   */
  private async fetchFeedItems(
    feedUrl: string,
    options?: SearchOptions
  ): Promise<RSSItem[]> {
    try {
      const feed = await this.parser.parseURL(feedUrl);
      let items = feed.items || [];

      // Apply date filters if provided
      if (options?.startDate || options?.endDate) {
        items = items.filter((item) => {
          const itemDate = new Date(item.isoDate || item.pubDate || Date.now());

          if (options.startDate && itemDate < options.startDate) {
            return false;
          }

          if (options.endDate && itemDate > options.endDate) {
            return false;
          }

          return true;
        });
      }

      // Apply limit if provided
      if (options?.limit && items.length > options.limit) {
        items = items.slice(0, options.limit);
      }

      return items;
    } catch (error) {
      this.logger.error(`Error fetching feed ${feedUrl}:`, error);
      return [];
    }
  }

  /**
   * Check if an item matches the search query
   */
  private itemMatchesQuery(item: RSSItem, query: string): boolean {
    const searchTerms = query.toLowerCase().split(' ');
    const itemText = `
      ${item.title || ''} 
      ${item.contentSnippet || ''} 
      ${item.content || ''} 
      ${item.categories?.join(' ') || ''}
    `.toLowerCase();

    return searchTerms.some((term) => itemText.includes(term));
  }

  /**
   * Transform RSS items to SocialMediaPost format
   */
  private transformToSocialMediaPosts(items: RSSItem[]): SocialMediaPost[] {
    return items.map((item) => {
      const pubDate = new Date(item.isoDate || item.pubDate || Date.now());

      return {
        id: item.guid || item.link || `rss-${Date.now()}-${Math.random()}`,
        text: item.contentSnippet || item.title || '',
        platform: this.platform,
        timestamp: pubDate,
        authorId: item.creator || item.sourceName || 'unknown',
        authorName: item.creator || item.sourceName || 'unknown',
        url: item.link || item.sourceUrl || '',
        engagementMetrics: {
          likes: 0,
          shares: 0,
          comments: 0,
          reach: 0,
          viralityScore: 0,
        },
      };
    });
  }

  async getAuthorDetails(authorId: string): Promise<Partial<SourceNode>> {
    // For RSS feeds, author details are minimal
    return {
      id: authorId,
      name: authorId,
      platform: this.platform,
      credibilityScore: 0.5, // Default score
      verificationStatus: 'unverified',
    } as Partial<SourceNode>;
  }

  /**
   * Stream content from RSS feeds
   * Implements SocialMediaConnector interface
   */
  streamContent(keywords: string[]): EventEmitter {
    const emitter = new EventEmitter();
    const streamId = Math.random().toString(36).substring(7);

    const interval = setInterval(async () => {
      try {
        // Fetch recent items from all feeds
        const allItems: RSSItem[] = [];
        for (const [feedName, feedUrl] of this.feedUrls.entries()) {
          const items = await this.fetchFeedItems(feedUrl, {
            startDate: new Date(Date.now() - 3600000 * 24), // Last 24 hours
          });

          // Add source name to each item
          items.forEach((item) => {
            item.sourceName = feedName;
            item.sourceUrl = feedUrl;
          });

          allItems.push(...items);
        }

        // Filter items by keywords
        const filteredItems = this.filterItemsByKeywords(allItems, keywords);

        if (filteredItems.length > 0) {
          // Transform to SocialMediaPost format
          const posts = this.transformToSocialMediaPosts(filteredItems);

          // Emit posts
          for (const post of posts) {
            emitter.emit('data', post);
          }

          this.logger.debug(`Emitted ${posts.length} posts from RSS stream`);
        }
      } catch (error) {
        emitter.emit('error', error);
        this.logger.error('Error in RSS stream:', error);
      }
    }, this.pollingInterval);

    this.streamConnections.set(streamId, interval);
    this.interval = interval;

    // Clean up on end event
    emitter.on('end', () => {
      clearInterval(interval);
      this.streamConnections.delete(streamId);
      this.logger.log(`Closed RSS stream: ${streamId}`);
    });

    return emitter;
  }

  /**
   * Enhanced streamAndTransform method that streams anonymized insights
   * Implements TransformOnIngestConnector interface
   */
  streamAndTransform(keywords: string[]): EventEmitter {
    const emitter = new EventEmitter();
    const streamId = Math.random().toString(36).substring(7);

    const interval = setInterval(async () => {
      try {
        // Fetch recent items from all feeds
        const allItems: RSSItem[] = [];
        for (const [feedName, feedUrl] of this.feedUrls.entries()) {
          const items = await this.fetchFeedItems(feedUrl, {
            startDate: new Date(Date.now() - 3600000 * 24), // Last 24 hours
          });

          // Add source name to each item
          items.forEach((item) => {
            item.sourceName = feedName;
            item.sourceUrl = feedUrl;
          });

          allItems.push(...items);
        }

        // Filter items by keywords
        const filteredItems = this.filterItemsByKeywords(allItems, keywords);

        if (filteredItems.length > 0) {
          // Transform to SocialMediaPost format
          const posts = this.transformToSocialMediaPosts(filteredItems);

          // Transform immediately - no raw storage
          const insights = await this.transformService.transformBatch(posts);

          // Emit insights
          for (const insight of insights) {
            emitter.emit('data', insight);
          }

          this.logger.debug(
            `Emitted ${insights.length} anonymized insights from RSS stream`
          );
        }
      } catch (error) {
        emitter.emit('error', error);
        this.logger.error('Error in RSS stream:', error);
      }
    }, this.pollingInterval);

    this.streamConnections.set(`transform-${streamId}`, interval);

    // Clean up on end event
    emitter.on('end', () => {
      clearInterval(interval);
      this.streamConnections.delete(`transform-${streamId}`);
      this.logger.log(`Closed transformed RSS stream: ${streamId}`);
    });

    return emitter;
  }

  /**
   * Filter items by keywords
   */
  private filterItemsByKeywords(
    items: RSSItem[],
    keywords: string[]
  ): RSSItem[] {
    if (!keywords.length) {
      return items;
    }

    return items.filter((item) => {
      const itemText = `
        ${item.title || ''} 
        ${item.contentSnippet || ''} 
        ${item.content || ''} 
        ${item.categories?.join(' ') || ''}
      `.toLowerCase();

      return keywords.some((keyword) =>
        itemText.includes(keyword.toLowerCase())
      );
    });
  }

  async validateCredentials(): Promise<boolean> {
    try {
      // RSS always available — curated catalog has 177 feeds
      if (this.feedUrls.size === 0) {
        // Load from catalog if not yet loaded
        const catalogFeeds = getAllFeeds();
        for (const feed of catalogFeeds) {
          this.feedUrls.set(feed.name, feed.url);
        }
      }

      // Try to fetch the first feed
      const firstEntry = [...this.feedUrls.entries()][0];
      if (!firstEntry) return false;
      const [feedName, feedUrl] = firstEntry;
      await this.parser.parseURL(feedUrl);

      this.logger.log(`RSS feed validation successful for ${feedName}`);
      return true;
    } catch (error) {
      this.logger.error('Error validating RSS feeds:', error);
      return false;
    }
  }
}
