import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  Optional,
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
import { RssCacheRepository } from '../repositories/rss-cache.repository';
import type { RssCacheItem } from '../schemas/rss-cache.schema';

interface RSSItem {
  title?: unknown;
  link?: unknown;
  pubDate?: unknown;
  creator?: unknown;
  content?: unknown;
  contentSnippet?: unknown;
  guid?: unknown;
  categories?: unknown;
  isoDate?: unknown;
  sourceName?: string;
  sourceUrl?: string;
  [key: string]: unknown;
}

interface FeedFailureState {
  consecutiveFailures: number;
  lastErrorSignature: string;
  suppressedUntil: number;
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
  private static readonly DEFAULT_CACHE_MAX_AGE_MS = 30 * 60 * 1000;
  private static readonly FEED_FETCH_TIMEOUT_MS = 15000;
  private static readonly FEED_FAILURE_BASE_COOLDOWN_MS = 5 * 60 * 1000;
  private static readonly FEED_FAILURE_MAX_COOLDOWN_MS = 6 * 60 * 60 * 1000;

  private parser: Parser;
  private streamConnections: Map<string, NodeJS.Timeout> = new Map();
  private readonly pollingInterval = 300000; // 5 minutes
  private interval: NodeJS.Timeout | null = null;
  private readonly logger = new Logger(RSSConnector.name);
  private feedUrls: Map<string, string> = new Map();
  private readonly feedFailureState: Map<string, FeedFailureState> = new Map();

  constructor(
    private configService: ConfigService,
    private transformService: TransformOnIngestService,
    @Optional() private rssCacheRepo?: RssCacheRepository,
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

    // 2. Fall back to curated catalog
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
      const feedXml = await this.fetchFeedXml(url);
      await this.parser.parseString(feedXml);

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
   * Fetch items from a feed URL (with RSS cache layer)
   */
  private async fetchFeedItems(
    feedUrl: string,
    options?: SearchOptions
  ): Promise<RSSItem[]> {
    try {
      // --- Check RSS cache first ---
      if (this.rssCacheRepo) {
        try {
          const cached = await this.rssCacheRepo.getCachedFeed(feedUrl);
          if (cached) {
            this.logger.debug(`RSS cache hit for ${feedUrl} (${cached.length} items)`);
            let items: RSSItem[] = cached.map((c) => ({
              title: c.title,
              link: c.link,
              pubDate: c.pubDate,
              isoDate: c.pubDate,
              content: c.content,
              contentSnippet: c.contentSnippet,
            }));
            // Apply date filters
            items = this.applyDateFilters(items, options);
            if (options?.limit && items.length > options.limit) {
              items = items.slice(0, options.limit);
            }
            return items;
          }
        } catch {
          // Cache miss — fetch fresh
        }
      }

      if (this.isFeedTemporarilySuppressed(feedUrl)) {
        return [];
      }

      const feedXml = await this.fetchFeedXml(feedUrl);
      const feed = await this.parser.parseString(feedXml);
      let items = (feed.items || []) as RSSItem[];

      this.clearFeedFailureState(feedUrl);

      // --- Store in RSS cache (before filtering) ---
      if (this.rssCacheRepo && items.length > 0) {
        const cacheItems: RssCacheItem[] = items.map((item) => ({
          title: this.coerceToText(item.title),
          link: this.coerceToText(item.link),
          pubDate: this.coerceToText(item.isoDate) || this.coerceToText(item.pubDate),
          content: this.coerceToText(item.content),
          contentSnippet: this.coerceToText(item.contentSnippet),
        }));
        this.rssCacheRepo
          .setCachedFeed(feedUrl, feedUrl, cacheItems, RSSConnector.DEFAULT_CACHE_MAX_AGE_MS)
          .catch(() => {});
      }

      // Apply date filters if provided
      items = this.applyDateFilters(items, options);

      // Apply limit if provided
      if (options?.limit && items.length > options.limit) {
        items = items.slice(0, options.limit);
      }

      return items;
    } catch (error) {
      this.recordFeedFailure(feedUrl, error);
      return [];
    }
  }

  private async fetchFeedXml(feedUrl: string): Promise<string> {
    const response = await axios.get<string>(feedUrl, {
      responseType: 'text',
      timeout: RSSConnector.FEED_FETCH_TIMEOUT_MS,
      headers: {
        'User-Agent':
          this.configService.get<string>('RSS_USER_AGENT') ??
          'Mozilla/5.0 (compatible; VeritasRSS/1.0; +https://oneirocom.com)',
        Accept:
          'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });

    return this.sanitizeFeedXml(feedUrl, response.data);
  }

  private sanitizeFeedXml(feedUrl: string, rawXml: unknown): string {
    const xml = this.coerceToText(rawXml);
    if (!xml) {
      throw new Error(`Empty RSS response from ${feedUrl}`);
    }

    const withoutBom = xml.replace(/^\uFEFF/, '');
    const firstTagIndex = withoutBom.indexOf('<');
    const trimmedToFirstTag =
      firstTagIndex > 0 ? withoutBom.slice(firstTagIndex) : withoutBom;

    return trimmedToFirstTag
      .replace(/&(?!#\d+;|#x[a-fA-F0-9]+;|[a-zA-Z][\w.-]*;)/g, '&amp;')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .trim();
  }

  /**
   * Apply date filters to RSS items.
   */
  private applyDateFilters(items: RSSItem[], options?: SearchOptions): RSSItem[] {
    if (!options?.startDate && !options?.endDate) return items;

    return items.filter((item) => {
      const itemDate = new Date(
        this.coerceToText(item.isoDate) ||
          this.coerceToText(item.pubDate) ||
          Date.now()
      );
      if (options.startDate && itemDate < options.startDate) return false;
      if (options.endDate && itemDate > options.endDate) return false;
      return true;
    });
  }

  /**
   * Check if an item matches the search query
   */
  private itemMatchesQuery(item: RSSItem, query: string): boolean {
    const searchTerms = query
      .toLowerCase()
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean);
    const itemText = [
      this.coerceToSearchText(item.title),
      this.coerceToSearchText(item.contentSnippet),
      this.coerceToSearchText(item.content),
      this.coerceToSearchText(item.categories),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return searchTerms.some((term) => itemText.includes(term));
  }

  /**
   * Transform RSS items to SocialMediaPost format
   */
  private transformToSocialMediaPosts(items: RSSItem[]): SocialMediaPost[] {
    return items.map((item) => {
      const pubDate = new Date(
        this.coerceToText(item.isoDate) ||
          this.coerceToText(item.pubDate) ||
          Date.now()
      );
      const guid = this.coerceToText(item.guid);
      const link = this.coerceToText(item.link);
      const contentSnippet = this.coerceToText(item.contentSnippet);
      const title = this.coerceToText(item.title);
      const creator = this.coerceToText(item.creator);

      return {
        id: guid || link || `rss-${Date.now()}-${Math.random()}`,
        text: contentSnippet || title || '',
        platform: this.platform,
        timestamp: pubDate,
        authorId: creator || item.sourceName || 'unknown',
        authorName: creator || item.sourceName || 'unknown',
        url: link || item.sourceUrl || '',
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

  private coerceToText(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value
        .map((entry) => this.coerceToText(entry))
        .filter(Boolean)
        .join(' ');
    }
    if (typeof value === 'object') {
      const candidateKeys = [
        'name',
        'term',
        'label',
        'value',
        'text',
        'content',
        'title',
      ] as const;

      for (const key of candidateKeys) {
        const candidate = (value as Record<string, unknown>)[key];
        const text = this.coerceToText(candidate);
        if (text) return text;
      }

      try {
        return JSON.stringify(value);
      } catch {
        return '';
      }
    }

    return '';
  }

  private coerceToSearchText(value: unknown): string {
    return this.coerceToText(value).replace(/\s+/g, ' ').trim();
  }

  private isFeedTemporarilySuppressed(feedUrl: string): boolean {
    const state = this.feedFailureState.get(feedUrl);
    if (!state) {
      return false;
    }

    if (state.suppressedUntil <= Date.now()) {
      this.feedFailureState.delete(feedUrl);
      return false;
    }

    return true;
  }

  private clearFeedFailureState(feedUrl: string): void {
    this.feedFailureState.delete(feedUrl);
  }

  private recordFeedFailure(feedUrl: string, error: unknown): void {
    const summary = this.summarizeFeedError(error);
    const previous = this.feedFailureState.get(feedUrl);
    const consecutiveFailures =
      previous?.lastErrorSignature === summary ? previous.consecutiveFailures + 1 : 1;
    const cooldownMs = Math.min(
      RSSConnector.FEED_FAILURE_BASE_COOLDOWN_MS *
        2 ** Math.max(0, consecutiveFailures - 1),
      RSSConnector.FEED_FAILURE_MAX_COOLDOWN_MS
    );

    this.feedFailureState.set(feedUrl, {
      consecutiveFailures,
      lastErrorSignature: summary,
      suppressedUntil: Date.now() + cooldownMs,
    });

    const shouldLog =
      !previous ||
      previous.lastErrorSignature !== summary ||
      previous.consecutiveFailures < 2;

    if (shouldLog) {
      this.logger.warn(
        `RSS feed unavailable (${summary}). Suppressing ${feedUrl} for ${Math.round(cooldownMs / 60000)}m`
      );
    }
  }

  private summarizeFeedError(error: unknown): string {
    if (axios.isAxiosError(error)) {
      if (error.response?.status) {
        return `HTTP ${error.response.status}`;
      }

      if (error.code) {
        return error.code;
      }
    }

    if (error instanceof Error) {
      return error.message.split('\n')[0] || error.name;
    }

    return 'Unknown RSS fetch error';
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
      const itemText = [
        this.coerceToSearchText(item.title),
        this.coerceToSearchText(item.contentSnippet),
        this.coerceToSearchText(item.content),
        this.coerceToSearchText(item.categories),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return keywords.some((keyword) =>
        itemText.includes(keyword.toLowerCase())
      );
    });
  }

  async validateCredentials(): Promise<boolean> {
    try {
      // RSS always available when the curated catalog has at least one usable feed
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
      const feedXml = await this.fetchFeedXml(feedUrl);
      await this.parser.parseString(feedXml);

      this.logger.log(`RSS feed validation successful for ${feedName}`);
      return true;
    } catch (error) {
      this.logger.error('Error validating RSS feeds:', error);
      return false;
    }
  }
}
