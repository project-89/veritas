import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FacebookAdsApi, Page } from 'facebook-nodejs-business-sdk';
import { SocialMediaPost } from '../interfaces/social-media-connector.interface';
import { TransformOnIngestConnector } from '../interfaces/transform-on-ingest-connector.interface';
import { SourceNode } from '@veritas/shared/types';
import { EventEmitter } from 'events';
import { TransformOnIngestService } from './transform/transform-on-ingest.service';
import { NarrativeInsight } from '../interfaces/narrative-insight.interface';
import { FacebookPost as SocialMediaFacebookPost } from '../../types/social-media.types';

// Local interface for internal use
interface InternalFacebookPost {
  id: string;
  message?: string;
  created_time: string;
  from?: {
    id: string;
    name: string;
  };
  reactions?: {
    summary: {
      total_count: number;
    };
  };
  shares?: {
    count: number;
  };
  comments?: {
    summary: {
      total_count: number;
    };
  };
  insights?: {
    data: Array<{
      name?: string;
      values: Array<{
        value: number;
      }>;
    }>;
  };
  permalink_url?: string;
  type?: string;
}

interface SearchOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

@Injectable()
export class FacebookConnector
  implements TransformOnIngestConnector, OnModuleInit, OnModuleDestroy
{
  platform = 'facebook' as const;
  private api: FacebookAdsApi | null = null;
  private streamConnections: Map<string, NodeJS.Timeout> = new Map();
  private readonly pollingInterval = 60000; // 1 minute
  private interval: NodeJS.Timeout | null = null;
  private readonly logger = new Logger(FacebookConnector.name);

  constructor(
    private configService: ConfigService,
    private transformService: TransformOnIngestService
  ) {}

  async onModuleInit() {
    await this.validateCredentials();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  async connect(): Promise<void> {
    try {
      const accessToken = this.configService.getOrThrow<string>(
        'FACEBOOK_ACCESS_TOKEN'
      );
      this.api = FacebookAdsApi.init(accessToken);
    } catch (error) {
      this.logger.error('Error connecting to Facebook:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.api = null;
    this.streamConnections.forEach((interval) => {
      clearInterval(interval);
    });
    this.streamConnections.clear();
  }

  /**
   * Original searchContent method for backward compatibility
   * Implements SocialMediaConnector interface
   */
  async searchContent(
    query: string,
    options?: SearchOptions
  ): Promise<SocialMediaPost[]> {
    if (!this.api) {
      throw new Error('Facebook client not initialized');
    }

    try {
      // Fetch posts (kept in memory only)
      const rawPosts = await this.fetchRawPosts(query, options);

      // Transform to SocialMediaPost format (for backward compatibility)
      return this.transformToSocialMediaPosts(rawPosts);
    } catch (error) {
      this.logger.error('Error searching Facebook content:', error);
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
    if (!this.api) {
      throw new Error('Facebook client not initialized');
    }

    try {
      this.logger.log(`Searching Facebook for: ${query}`);

      // Fetch posts (kept in memory only)
      const rawPosts = await this.fetchRawPosts(query, options);

      // Convert to SocialMediaPost format for the transform service
      const socialMediaPosts = this.transformToSocialMediaPosts(rawPosts);

      // Transform immediately - no raw storage
      const insights = await this.transformService.transformBatch(
        socialMediaPosts
      );

      this.logger.log(
        `Transformed ${insights.length} Facebook posts into anonymized insights`
      );

      // Return only anonymized insights
      return insights;
    } catch (error) {
      this.logger.error('Error searching Facebook content:', error);
      throw error;
    }
  }

  /**
   * Fetch raw posts from Facebook (in-memory only, no storage)
   * Private method to keep raw data contained
   */
  private async fetchRawPosts(
    query: string,
    options?: SearchOptions
  ): Promise<InternalFacebookPost[]> {
    if (!this.api) {
      throw new Error('Facebook client not initialized');
    }

    try {
      const pageId = this.configService.getOrThrow('FACEBOOK_PAGE_ID');
      const page = new Page(pageId);

      const params: {
        q: string;
        fields: string[];
        limit: number;
        since?: number;
        until?: number;
      } = {
        q: query,
        fields: [
          'id',
          'message',
          'created_time',
          'from',
          'permalink_url',
          'reactions.summary(total_count)',
          'shares',
          'comments.summary(total_count)',
          'type',
        ],
        limit: options?.limit || 100,
      };

      if (options?.startDate) {
        params.since = Math.floor(options.startDate.getTime() / 1000);
      }

      if (options?.endDate) {
        params.until = Math.floor(options.endDate.getTime() / 1000);
      }

      const response = await page.getPosts(params);
      if (!response || !response.data) {
        return [];
      }

      // Return raw posts for transformation (never stored)
      return response.data as InternalFacebookPost[];
    } catch (error) {
      this.logger.error('Error fetching raw Facebook posts:', error);
      throw error;
    }
  }

  /**
   * Transform raw Facebook posts to SocialMediaPost format
   * For backward compatibility
   */
  private transformToSocialMediaPosts(
    posts: InternalFacebookPost[]
  ): SocialMediaPost[] {
    return posts.map((post) => {
      const likes = post.reactions?.summary?.total_count || 0;
      const shares = post.shares?.count || 0;
      const comments = post.comments?.summary?.total_count || 0;
      const reach =
        post.insights?.data?.find(
          (insight) => insight.name === 'post_impressions'
        )?.values[0]?.value || 0;
      const viralityScore = reach > 0 ? (likes + shares + comments) / reach : 0;

      return {
        id: post.id,
        text: post.message || '',
        platform: this.platform,
        url: post.permalink_url || `https://facebook.com/${post.id}`,
        authorId: post.from?.id || '',
        authorName: post.from?.name || '',
        timestamp: new Date(post.created_time),
        engagementMetrics: {
          likes,
          shares,
          comments,
          reach,
          viralityScore,
        },
      };
    });
  }

  async getAuthorDetails(authorId: string): Promise<Partial<SourceNode>> {
    try {
      if (!this.api) {
        throw new Error('Facebook client not initialized');
      }

      const page = new Page(authorId);
      const pageData = await page.get([
        'id',
        'name',
        'verification_status',
        'fan_count',
      ]);

      if (!pageData || !pageData.id) {
        throw new Error(`Page ${authorId} not found`);
      }

      return {
        id: pageData.id,
        name: pageData.name,
        platform: this.platform,
        credibilityScore: this.calculateCredibilityScore(pageData),
        verificationStatus:
          pageData.verification_status === 'verified'
            ? 'verified'
            : 'unverified',
      } as Partial<SourceNode>;
    } catch (error) {
      this.logger.error('Error fetching Facebook author details:', error);
      throw error;
    }
  }

  /**
   * Original streamContent method for backward compatibility
   * Implements SocialMediaConnector interface
   */
  streamContent(keywords: string[]): EventEmitter {
    const emitter = new EventEmitter();
    const streamId = Math.random().toString(36).substring(7);

    const interval = setInterval(async () => {
      try {
        if (!this.api) {
          throw new Error('Facebook client not initialized');
        }

        // Fetch posts (kept in memory only)
        const rawPosts = await this.fetchRawPosts(keywords.join(' OR '), {
          startDate: new Date(Date.now() - 3600000), // Last hour
          limit: 100,
        });

        // Filter posts that match keywords
        const filteredPosts = rawPosts.filter((post) =>
          this.postMatchesKeywords(post, keywords)
        );

        if (filteredPosts.length > 0) {
          // Transform to SocialMediaPost format (for backward compatibility)
          const posts = this.transformToSocialMediaPosts(filteredPosts);

          // Emit posts
          for (const post of posts) {
            emitter.emit('data', post);
          }

          this.logger.debug(
            `Emitted ${posts.length} posts from Facebook stream`
          );
        }
      } catch (error) {
        emitter.emit('error', error);
        this.logger.error('Error in Facebook stream:', error);
      }
    }, this.pollingInterval);

    this.streamConnections.set(streamId, interval);
    this.interval = interval;

    // Clean up on end event
    emitter.on('end', () => {
      clearInterval(interval);
      this.streamConnections.delete(streamId);
      this.logger.log(`Closed Facebook stream: ${streamId}`);
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
        if (!this.api) {
          throw new Error('Facebook client not initialized');
        }

        // Fetch posts (kept in memory only)
        const rawPosts = await this.fetchRawPosts(keywords.join(' OR '), {
          startDate: new Date(Date.now() - 3600000), // Last hour
          limit: 100,
        });

        // Filter posts that match keywords
        const filteredPosts = rawPosts.filter((post) =>
          this.postMatchesKeywords(post, keywords)
        );

        if (filteredPosts.length > 0) {
          // Convert to SocialMediaPost format for the transform service
          const socialMediaPosts =
            this.transformToSocialMediaPosts(filteredPosts);

          // Transform immediately - no raw storage
          const insights = await this.transformService.transformBatch(
            socialMediaPosts
          );

          // Emit only anonymized insights
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
    }, this.pollingInterval);

    this.streamConnections.set(`transform-${streamId}`, interval);

    // Clean up on end event
    emitter.on('end', () => {
      clearInterval(interval);
      this.streamConnections.delete(`transform-${streamId}`);
      this.logger.log(`Closed transformed Facebook stream: ${streamId}`);
    });

    return emitter;
  }

  async validateCredentials(): Promise<boolean> {
    try {
      await this.connect();
      const pageId = this.configService.getOrThrow('FACEBOOK_PAGE_ID');
      const page = new Page(pageId);

      // Just validate connectivity, don't store any data
      const response = await page.get(['id', 'name']);

      if (!response || !response.id) {
        this.logger.error('Facebook page validation failed: Invalid page ID');
        return false;
      }

      this.logger.log(
        `Facebook credentials validated successfully for page: ${response.name}`
      );
      return true;
    } catch (error) {
      this.logger.error('Facebook credential validation failed:', error);
      return false;
    }
  }

  /**
   * Check if a post matches any of the keywords
   * Used for filtering posts in the stream
   */
  private postMatchesKeywords(
    post: InternalFacebookPost,
    keywords: string[]
  ): boolean {
    if (!post.message) {
      return false;
    }

    const message = post.message.toLowerCase();
    return keywords.some((keyword) => message.includes(keyword.toLowerCase()));
  }

  /**
   * Calculate credibility score for a Facebook page
   */
  private calculateCredibilityScore(pageData: {
    verification_status?: string;
    fan_count?: number;
  }): number {
    const isVerified = pageData.verification_status === 'verified' ? 1 : 0;
    const fanCount = pageData.fan_count || 0;

    // Simple credibility algorithm based on verification and fan count
    let score = isVerified * 0.5;

    if (fanCount > 1000000) score += 0.5;
    else if (fanCount > 100000) score += 0.4;
    else if (fanCount > 10000) score += 0.3;
    else if (fanCount > 1000) score += 0.2;
    else score += 0.1;

    return Math.min(score, 1.0);
  }

  /**
   * Enhanced method that returns strongly typed FacebookPost objects
   */
  async searchFacebookContent(
    query: string,
    options?: SearchOptions
  ): Promise<SocialMediaFacebookPost[]> {
    if (!this.api) {
      throw new Error('Facebook client not initialized');
    }

    try {
      this.logger.log(`Searching Facebook for: ${query}`);

      // Fetch posts (kept in memory only)
      const rawPosts = await this.fetchRawPosts(query, options);

      // Transform to strongly typed FacebookPost format
      return this.transformToTypedFacebookPosts(rawPosts);
    } catch (error) {
      this.logger.error('Error searching Facebook content:', error);
      throw error;
    }
  }

  /**
   * Transform raw Facebook posts to strongly typed FacebookPost format
   */
  private transformToTypedFacebookPosts(
    posts: InternalFacebookPost[]
  ): SocialMediaFacebookPost[] {
    return posts.map((post) => {
      const likes = post.reactions?.summary?.total_count || 0;
      const shares = post.shares?.count || 0;
      const comments = post.comments?.summary?.total_count || 0;
      const reach =
        post.insights?.data?.find(
          (insight) => insight.name === 'post_impressions'
        )?.values[0]?.value || 0;
      const views =
        post.insights?.data?.find(
          (insight) => insight.name === 'post_impressions_unique'
        )?.values[0]?.value || 0;

      return {
        id: post.id,
        text: post.message || '',
        platform: 'facebook',
        authorId: post.from?.id || '',
        authorName: post.from?.name || '',
        authorHandle: '',
        url: post.permalink_url || `https://facebook.com/${post.id}`,
        timestamp: new Date(post.created_time),
        pageId: post.from?.id,
        isPagePost: true,
        engagementMetrics: {
          likes,
          shares,
          comments,
          reach,
          views,
          viralityScore: reach > 0 ? (likes + shares + comments) / reach : 0,
        },
        metadata: {
          postType: post.type || 'status',
          createdTime: post.created_time,
          rawEngagement: {
            reactionCount: likes,
            shareCount: shares,
            commentCount: comments,
          },
        },
      };
    });
  }
}
