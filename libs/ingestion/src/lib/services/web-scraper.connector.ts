import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
import axios from 'axios';
import * as cheerio from 'cheerio';
import {
  SocialMediaConnector,
  SocialMediaPost,
} from '../interfaces/social-media-connector.interface';
import { TransformOnIngestConnector } from '../interfaces/transform-on-ingest-connector.interface';
import { SourceNode } from '@veritas/shared/types';
import { TransformOnIngestService } from './transform/transform-on-ingest.service';
import { NarrativeInsight } from '../../types/narrative-insight.interface';

interface ScrapedArticle {
  id: string;
  title: string;
  content: string;
  url: string;
  author?: string;
  publishDate?: Date;
  source: string;
  sourceUrl: string;
  [key: string]: any;
}

interface ScrapeConfig {
  name: string;
  url: string;
  articleSelector: string;
  titleSelector: string;
  contentSelector: string;
  authorSelector?: string;
  dateSelector?: string;
  urlSelector?: string;
  baseUrl?: string;
}

interface SearchOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

/**
 * Web Scraper Connector for news sites
 * Handles fetching and scraping content from configured news websites
 */
@Injectable()
export class WebScraperConnector
  implements TransformOnIngestConnector, OnModuleInit, OnModuleDestroy
{
  platform = 'web' as const;
  private streamConnections: Map<string, NodeJS.Timeout> = new Map();
  private readonly pollingInterval = 3600000; // 1 hour
  private interval: NodeJS.Timeout | null = null;
  private readonly logger = new Logger(WebScraperConnector.name);
  private scrapeConfigs: Map<string, ScrapeConfig> = new Map();
  private lastScrapedUrls: Set<string> = new Set();

  constructor(
    private configService: ConfigService,
    private transformService: TransformOnIngestService
  ) {}

  async onModuleInit() {
    await this.loadScrapeConfigs();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  /**
   * Load scraping configurations from the environment or database
   */
  private async loadScrapeConfigs() {
    const configsString = this.configService.get<string>(
      'NEWS_SCRAPER_CONFIGS'
    );
    if (configsString) {
      try {
        const configs = JSON.parse(configsString);
        for (const config of configs) {
          this.scrapeConfigs.set(config.name, config);
        }
        this.logger.log(
          `Loaded ${this.scrapeConfigs.size} scraping configurations`
        );
      } catch (error) {
        this.logger.error('Error parsing NEWS_SCRAPER_CONFIGS:', error);
      }
    }

    // Add some default configs if none were loaded
    if (this.scrapeConfigs.size === 0) {
      const defaultConfigs: ScrapeConfig[] = [
        {
          name: 'Example News Site',
          url: 'https://example.com/news',
          articleSelector: 'article',
          titleSelector: 'h1, h2',
          contentSelector: '.article-content, .content',
          authorSelector: '.author',
          dateSelector: '.date, time',
          urlSelector: 'a',
          baseUrl: 'https://example.com',
        },
      ];

      for (const config of defaultConfigs) {
        this.scrapeConfigs.set(config.name, config);
      }
      this.logger.log(
        `Added ${defaultConfigs.length} default scraping configurations`
      );
    }
  }

  async connect(): Promise<void> {
    // No persistent connection needed for web scraping
    this.logger.log('Web scraper connector initialized');
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
   * Add a new scraping configuration
   */
  addScrapeConfig(config: ScrapeConfig): boolean {
    try {
      this.scrapeConfigs.set(config.name, config);
      this.logger.log(`Added scraping config: ${config.name} - ${config.url}`);
      return true;
    } catch (error) {
      this.logger.error(`Error adding scraping config ${config.name}:`, error);
      return false;
    }
  }

  /**
   * Remove a scraping configuration
   */
  removeScrapeConfig(name: string): boolean {
    const result = this.scrapeConfigs.delete(name);
    if (result) {
      this.logger.log(`Removed scraping config: ${name}`);
    }
    return result;
  }

  /**
   * Search content from news sites
   * Implements SocialMediaConnector interface
   */
  async searchContent(
    query: string,
    options?: SearchOptions
  ): Promise<SocialMediaPost[]> {
    try {
      const articles: ScrapedArticle[] = [];

      // Scrape from all configured sources
      for (const [name, config] of this.scrapeConfigs.entries()) {
        this.logger.log(`Scraping articles from ${name}...`);
        const scrapedArticles = await this.scrapeArticles(config);
        articles.push(...scrapedArticles);
      }

      // Filter articles by query
      const filteredArticles = query
        ? articles.filter((article) => this.articleMatchesQuery(article, query))
        : articles;

      // Apply date filters if provided
      const dateFilteredArticles = this.filterArticlesByDate(
        filteredArticles,
        options?.startDate,
        options?.endDate
      );

      // Apply limit if provided
      const limitedArticles =
        options?.limit && dateFilteredArticles.length > options.limit
          ? dateFilteredArticles.slice(0, options.limit)
          : dateFilteredArticles;

      // Transform to SocialMediaPost format
      return this.transformToSocialMediaPosts(limitedArticles);
    } catch (error) {
      this.logger.error('Error searching news content:', error);
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
      this.logger.log(`Searching news sites for: ${query}`);

      // Get social media posts from scraping
      const posts = await this.searchContent(query, options);

      // Transform immediately - no raw storage
      const insights = await this.transformService.transformBatch(posts);

      this.logger.log(
        `Transformed ${insights.length} news articles into anonymized insights`
      );

      // Return only anonymized insights
      return insights;
    } catch (error) {
      this.logger.error('Error searching news content:', error);
      throw error;
    }
  }

  /**
   * Scrape articles from a website based on configuration
   */
  private async scrapeArticles(
    config: ScrapeConfig
  ): Promise<ScrapedArticle[]> {
    try {
      // Fetch the HTML content
      const response = await axios.get(config.url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
      });

      const html = response.data;
      const $ = cheerio.load(html);
      const articles: ScrapedArticle[] = [];

      // Find all articles on the page
      $(config.articleSelector).each((i, el) => {
        // Extract the title
        const titleEl = $(el).find(config.titleSelector).first();
        const title = titleEl.text().trim();

        // Extract the content
        const contentEl = $(el).find(config.contentSelector);
        const content = contentEl.text().trim();

        // Extract the URL
        let url = '';
        if (config.urlSelector) {
          const urlEl = $(el).find(config.urlSelector).first();
          url = urlEl.attr('href') || '';

          // Handle relative URLs
          if (url && url.startsWith('/') && config.baseUrl) {
            url = `${config.baseUrl}${url}`;
          }
        }

        // Extract the author if available
        let author = '';
        if (config.authorSelector) {
          const authorEl = $(el).find(config.authorSelector).first();
          author = authorEl.text().trim();
        }

        // Extract the publish date if available
        let publishDate: Date | undefined;
        if (config.dateSelector) {
          const dateEl = $(el).find(config.dateSelector).first();
          const dateText = dateEl.text().trim();
          if (dateText) {
            publishDate = new Date(dateText);

            // If the date is invalid, try to parse it as relative date
            if (isNaN(publishDate.getTime())) {
              publishDate = this.parseRelativeDate(dateText);
            }
          }
        }

        // Skip if no title or content
        if (!title || !content) {
          return;
        }

        // Generate a unique ID
        const id = `${config.name}-${Buffer.from(url || title)
          .toString('base64')
          .substring(0, 12)}`;

        // Skip if already scraped
        if (this.lastScrapedUrls.has(url)) {
          return;
        }

        // Add to scraped articles
        articles.push({
          id,
          title,
          content,
          url,
          author,
          publishDate,
          source: config.name,
          sourceUrl: config.url,
        });

        // Remember this URL for deduplication
        if (url) {
          this.lastScrapedUrls.add(url);
        }
      });

      // Limit the memory usage of the URL cache
      if (this.lastScrapedUrls.size > 1000) {
        const urls = Array.from(this.lastScrapedUrls);
        this.lastScrapedUrls = new Set(urls.slice(urls.length - 1000));
      }

      this.logger.log(
        `Scraped ${articles.length} articles from ${config.name}`
      );
      return articles;
    } catch (error) {
      this.logger.error(`Error scraping articles from ${config.name}:`, error);
      return [];
    }
  }

  /**
   * Parse relative date strings like "2 hours ago", "yesterday", etc.
   */
  private parseRelativeDate(dateText: string): Date {
    const now = new Date();
    const lowerText = dateText.toLowerCase();

    if (lowerText.includes('hour') || lowerText.includes('hr')) {
      const hours = parseInt(lowerText.match(/\d+/)?.[0] || '1');
      const date = new Date(now);
      date.setHours(date.getHours() - hours);
      return date;
    } else if (lowerText.includes('minute') || lowerText.includes('min')) {
      const minutes = parseInt(lowerText.match(/\d+/)?.[0] || '1');
      const date = new Date(now);
      date.setMinutes(date.getMinutes() - minutes);
      return date;
    } else if (lowerText.includes('day')) {
      const days = parseInt(lowerText.match(/\d+/)?.[0] || '1');
      const date = new Date(now);
      date.setDate(date.getDate() - days);
      return date;
    } else if (lowerText.includes('yesterday')) {
      const date = new Date(now);
      date.setDate(date.getDate() - 1);
      return date;
    } else if (lowerText.includes('week')) {
      const weeks = parseInt(lowerText.match(/\d+/)?.[0] || '1');
      const date = new Date(now);
      date.setDate(date.getDate() - weeks * 7);
      return date;
    } else if (lowerText.includes('month')) {
      const months = parseInt(lowerText.match(/\d+/)?.[0] || '1');
      const date = new Date(now);
      date.setMonth(date.getMonth() - months);
      return date;
    } else if (lowerText.includes('year')) {
      const years = parseInt(lowerText.match(/\d+/)?.[0] || '1');
      const date = new Date(now);
      date.setFullYear(date.getFullYear() - years);
      return date;
    }

    return now; // Default to current time if parsing fails
  }

  /**
   * Check if an article matches the search query
   */
  private articleMatchesQuery(article: ScrapedArticle, query: string): boolean {
    const searchTerms = query.toLowerCase().split(' ');
    const articleText = `
      ${article.title || ''} 
      ${article.content || ''} 
      ${article.author || ''}
    `.toLowerCase();

    return searchTerms.some((term) => articleText.includes(term));
  }

  /**
   * Filter articles by date range
   */
  private filterArticlesByDate(
    articles: ScrapedArticle[],
    startDate?: Date,
    endDate?: Date
  ): ScrapedArticle[] {
    if (!startDate && !endDate) {
      return articles;
    }

    return articles.filter((article) => {
      // Use publish date or current date if not available
      const articleDate = article.publishDate || new Date();

      if (startDate && articleDate < startDate) {
        return false;
      }

      if (endDate && articleDate > endDate) {
        return false;
      }

      return true;
    });
  }

  /**
   * Transform scraped articles to SocialMediaPost format
   */
  private transformToSocialMediaPosts(
    articles: ScrapedArticle[]
  ): SocialMediaPost[] {
    return articles.map((article) => ({
      id: article.id,
      text: `${article.title}\n\n${article.content}`.substring(0, 2000), // Limit text length
      platform: this.platform,
      timestamp: article.publishDate || new Date(),
      authorId: article.author || article.source,
      authorName: article.author || article.source,
      url: article.url,
      engagementMetrics: {
        likes: 0,
        shares: 0,
        comments: 0,
        reach: 0,
        viralityScore: 0,
      },
    }));
  }

  async getAuthorDetails(authorId: string): Promise<Partial<SourceNode>> {
    // For web articles, author details are minimal
    return {
      id: authorId,
      name: authorId,
      platform: this.platform,
      credibilityScore: 0.5, // Default score
      verificationStatus: 'unverified',
    } as Partial<SourceNode>;
  }

  /**
   * Stream content from news sites
   * Implements SocialMediaConnector interface
   */
  streamContent(keywords: string[]): EventEmitter {
    const emitter = new EventEmitter();
    const streamId = Math.random().toString(36).substring(7);

    const interval = setInterval(async () => {
      try {
        const articles: ScrapedArticle[] = [];

        // Scrape from all configured sources
        for (const [name, config] of this.scrapeConfigs.entries()) {
          const scrapedArticles = await this.scrapeArticles(config);
          articles.push(...scrapedArticles);
        }

        // Filter articles by keywords
        const filteredArticles = this.filterArticlesByKeywords(
          articles,
          keywords
        );

        if (filteredArticles.length > 0) {
          // Transform to SocialMediaPost format
          const posts = this.transformToSocialMediaPosts(filteredArticles);

          // Emit posts
          for (const post of posts) {
            emitter.emit('data', post);
          }

          this.logger.debug(
            `Emitted ${posts.length} posts from web scraper stream`
          );
        }
      } catch (error) {
        emitter.emit('error', error);
        this.logger.error('Error in web scraper stream:', error);
      }
    }, this.pollingInterval);

    this.streamConnections.set(streamId, interval);
    this.interval = interval;

    // Clean up on end event
    emitter.on('end', () => {
      clearInterval(interval);
      this.streamConnections.delete(streamId);
      this.logger.log(`Closed web scraper stream: ${streamId}`);
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
        const articles: ScrapedArticle[] = [];

        // Scrape from all configured sources
        for (const [name, config] of this.scrapeConfigs.entries()) {
          const scrapedArticles = await this.scrapeArticles(config);
          articles.push(...scrapedArticles);
        }

        // Filter articles by keywords
        const filteredArticles = this.filterArticlesByKeywords(
          articles,
          keywords
        );

        if (filteredArticles.length > 0) {
          // Transform to SocialMediaPost format
          const posts = this.transformToSocialMediaPosts(filteredArticles);

          // Transform immediately - no raw storage
          const insights = await this.transformService.transformBatch(posts);

          // Emit insights
          for (const insight of insights) {
            emitter.emit('data', insight);
          }

          this.logger.debug(
            `Emitted ${insights.length} anonymized insights from web scraper stream`
          );
        }
      } catch (error) {
        emitter.emit('error', error);
        this.logger.error('Error in web scraper stream:', error);
      }
    }, this.pollingInterval);

    this.streamConnections.set(`transform-${streamId}`, interval);

    // Clean up on end event
    emitter.on('end', () => {
      clearInterval(interval);
      this.streamConnections.delete(`transform-${streamId}`);
      this.logger.log(`Closed transformed web scraper stream: ${streamId}`);
    });

    return emitter;
  }

  /**
   * Filter articles by keywords
   */
  private filterArticlesByKeywords(
    articles: ScrapedArticle[],
    keywords: string[]
  ): ScrapedArticle[] {
    if (!keywords.length) {
      return articles;
    }

    return articles.filter((article) => {
      const articleText = `
        ${article.title || ''} 
        ${article.content || ''} 
        ${article.author || ''}
      `.toLowerCase();

      return keywords.some((keyword) =>
        articleText.includes(keyword.toLowerCase())
      );
    });
  }

  async validateCredentials(): Promise<boolean> {
    try {
      // For web scraping, we validate by checking if we have configurations
      if (this.scrapeConfigs.size === 0) {
        this.logger.warn('No web scraping configurations defined');
        return false;
      }

      // Scraping doesn't require credentials, so we just check if we can access a website
      const axios = require('axios');
      await axios.get('https://www.google.com');

      this.logger.log('Web scraper validation successful');
      return true;
    } catch (error) {
      this.logger.error('Error validating web scraper:', error);
      return false;
    }
  }
}
