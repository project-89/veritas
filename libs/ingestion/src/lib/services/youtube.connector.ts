import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, youtube_v3 } from 'googleapis';
import { SocialMediaPost } from '../interfaces/social-media-connector.interface';
import { TransformOnIngestConnector } from '../interfaces/transform-on-ingest-connector.interface';
import { SourceNode } from '@veritas/shared/types';
import { EventEmitter } from 'events';
import { TransformOnIngestService } from './transform/transform-on-ingest.service';
import { NarrativeInsight } from '../interfaces/narrative-insight.interface';
import { YouTubeComment } from '../../types/social-media.types';

interface SearchOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  maxResults?: number;
}

@Injectable()
export class YouTubeConnector
  implements TransformOnIngestConnector, OnModuleInit, OnModuleDestroy
{
  platform = 'youtube' as const;
  private youtube: youtube_v3.Youtube | null = null;
  private apiKey: string | null = null;
  private streamConnections: Map<string, NodeJS.Timeout> = new Map();
  private readonly pollingInterval = 300000; // 5 minutes
  private readonly logger = new Logger(YouTubeConnector.name);

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
      this.apiKey = this.configService.getOrThrow<string>('YOUTUBE_API_KEY');
      this.youtube = google.youtube({
        version: 'v3',
        auth: this.apiKey,
      });
      this.logger.log('Connected to YouTube API');
    } catch (error) {
      this.logger.error('Error connecting to YouTube API:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.youtube = null;
    this.apiKey = null;
    this.streamConnections.forEach((timeout) => {
      clearTimeout(timeout);
    });
    this.streamConnections.clear();
    this.logger.log('Disconnected from YouTube API');
  }

  /**
   * Search for YouTube comments matching a query
   */
  async searchContent(
    query: string,
    options?: SearchOptions
  ): Promise<SocialMediaPost[]> {
    if (!this.youtube) {
      throw new Error('YouTube client not initialized');
    }

    try {
      // First, search for videos
      const videoIds = await this.searchVideos(query, options);

      // Then fetch comments for these videos
      const comments = await this.fetchCommentsForVideos(videoIds, options);

      // Transform to SocialMediaPost format
      return this.transformToSocialMediaPosts(comments);
    } catch (error) {
      this.logger.error('Error searching YouTube comments:', error);
      throw error;
    }
  }

  /**
   * Search and transform YouTube comments
   */
  async searchAndTransform(
    query: string,
    options?: SearchOptions
  ): Promise<NarrativeInsight[]> {
    if (!this.youtube) {
      throw new Error('YouTube client not initialized');
    }

    try {
      this.logger.log(`Searching YouTube for: ${query}`);

      // First, search for videos
      const videoIds = await this.searchVideos(query, options);

      // Then fetch comments for these videos
      const comments = await this.fetchCommentsForVideos(videoIds, options);

      // Transform to SocialMediaPost format for the transform service
      const socialMediaPosts = this.transformToSocialMediaPosts(comments);

      // Transform immediately - no raw storage
      const insights = await this.transformService.transformBatch(
        socialMediaPosts
      );

      this.logger.log(
        `Transformed ${insights.length} YouTube comments into anonymized insights`
      );

      // Return only anonymized insights
      return insights;
    } catch (error) {
      this.logger.error(
        'Error searching and transforming YouTube comments:',
        error
      );
      throw error;
    }
  }

  /**
   * Stream YouTube comments for videos containing specified keywords
   */
  streamContent(keywords: string[]): EventEmitter {
    const emitter = new EventEmitter();
    const streamId = Math.random().toString(36).substring(7);

    const checkForComments = async () => {
      try {
        if (!this.youtube) {
          throw new Error('YouTube client not initialized');
        }

        // Search for videos matching keywords
        const videoIds = await this.searchVideos(keywords.join(' OR '), {
          // Last day
          startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
          maxResults: 10,
        });

        // Check if we found any videos
        if (videoIds.length === 0) {
          this.logger.debug('No videos found matching keywords');
          return;
        }

        // Fetch comments for these videos
        const comments = await this.fetchCommentsForVideos(videoIds, {
          maxResults: 100,
        });

        // If we have comments, emit them
        if (comments.length > 0) {
          const posts = this.transformToSocialMediaPosts(comments);

          for (const post of posts) {
            emitter.emit('data', post);
          }

          this.logger.debug(
            `Emitted ${posts.length} comments from YouTube stream`
          );
        }
      } catch (error) {
        emitter.emit('error', error);
        this.logger.error('Error in YouTube stream:', error);
      }
    };

    // Initial check
    checkForComments();

    // Set up recurring check
    const interval = setInterval(checkForComments, this.pollingInterval);
    this.streamConnections.set(streamId, interval);

    // Clean up on end event
    emitter.on('end', () => {
      clearInterval(interval);
      this.streamConnections.delete(streamId);
      this.logger.log(`Closed YouTube stream: ${streamId}`);
    });

    return emitter;
  }

  /**
   * Stream and transform YouTube comments
   */
  streamAndTransform(keywords: string[]): EventEmitter {
    const emitter = new EventEmitter();
    const streamId = Math.random().toString(36).substring(7);

    const checkForComments = async () => {
      try {
        if (!this.youtube) {
          throw new Error('YouTube client not initialized');
        }

        // Search for videos matching keywords
        const videoIds = await this.searchVideos(keywords.join(' OR '), {
          // Last day
          startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
          maxResults: 10,
        });

        // Check if we found any videos
        if (videoIds.length === 0) {
          this.logger.debug('No videos found matching keywords');
          return;
        }

        // Fetch comments for these videos
        const comments = await this.fetchCommentsForVideos(videoIds, {
          maxResults: 100,
        });

        // If we have comments, transform and emit them
        if (comments.length > 0) {
          const posts = this.transformToSocialMediaPosts(comments);

          // Transform immediately - no raw storage
          const insights = await this.transformService.transformBatch(posts);

          for (const insight of insights) {
            emitter.emit('data', insight);
          }

          this.logger.debug(
            `Emitted ${insights.length} transformed comments from YouTube stream`
          );
        }
      } catch (error) {
        emitter.emit('error', error);
        this.logger.error('Error in YouTube transform stream:', error);
      }
    };

    // Initial check
    checkForComments();

    // Set up recurring check
    const interval = setInterval(checkForComments, this.pollingInterval);
    this.streamConnections.set(`transform-${streamId}`, interval);

    // Clean up on end event
    emitter.on('end', () => {
      clearInterval(interval);
      this.streamConnections.delete(`transform-${streamId}`);
      this.logger.log(`Closed transformed YouTube stream: ${streamId}`);
    });

    return emitter;
  }

  /**
   * Get details about a YouTube channel
   */
  async getAuthorDetails(authorId: string): Promise<Partial<SourceNode>> {
    if (!this.youtube) {
      throw new Error('YouTube client not initialized');
    }

    try {
      const response = await this.youtube.channels.list({
        part: ['snippet', 'statistics'],
        id: [authorId],
      });

      if (!response.data.items || response.data.items.length === 0) {
        throw new Error(`YouTube channel ${authorId} not found`);
      }

      const channel = response.data.items[0];
      const snippet = channel.snippet;
      const statistics = channel.statistics;

      if (!snippet) {
        throw new Error(`No snippet data for YouTube channel ${authorId}`);
      }

      return {
        id: authorId,
        name: snippet.title || '',
        platform: this.platform,
        url: `https://www.youtube.com/channel/${authorId}`,
        description: snippet.description || '',
        credibilityScore: this.calculateCredibilityScore(statistics),
        verificationStatus: 'unverified',
        metadata: {
          subscriberCount: statistics?.subscriberCount,
          videoCount: statistics?.videoCount,
          viewCount: statistics?.viewCount,
          thumbnailUrl: snippet.thumbnails?.default?.url || undefined,
        },
      } as Partial<SourceNode>;
    } catch (error) {
      this.logger.error('Error fetching YouTube channel details:', error);
      throw error;
    }
  }

  /**
   * Validate YouTube API credentials
   */
  async validateCredentials(): Promise<boolean> {
    try {
      await this.connect();

      // Test API with a simple query
      if (!this.youtube) {
        return false; // Can't validate credentials without a client
      }

      const response = await this.youtube.videos.list({
        part: ['snippet'],
        chart: 'mostPopular',
        maxResults: 1,
      });

      if (!response || !response.data.items) {
        this.logger.error(
          'YouTube API validation failed: No response from API'
        );
        return false;
      }

      this.logger.log('YouTube API credentials validated successfully');
      return true;
    } catch (error) {
      this.logger.error('YouTube API credential validation failed:', error);
      return false;
    }
  }

  /**
   * Search for YouTube videos
   */
  private async searchVideos(
    query: string,
    options?: SearchOptions
  ): Promise<string[]> {
    if (!this.youtube) {
      throw new Error('YouTube client not initialized');
    }

    try {
      // Set up search parameters
      const searchParams: youtube_v3.Params$Resource$Search$List = {
        part: ['snippet'],
        q: query,
        type: ['video'],
        maxResults: options?.maxResults || 10,
        videoCaption: 'any',
        videoType: 'any',
        order: 'relevance',
      };

      if (options?.startDate) {
        searchParams.publishedAfter = options.startDate.toISOString();
      }

      if (options?.endDate) {
        searchParams.publishedBefore = options.endDate.toISOString();
      }

      const response = await this.youtube.search.list(searchParams);

      if (!response.data.items || response.data.items.length === 0) {
        return [];
      }

      // Extract video IDs
      return response.data.items
        .filter((item) => item.id?.videoId)
        .map((item) => {
          // We've already filtered for items with videoId
          if (typeof item.id?.videoId === 'string') {
            return item.id.videoId;
          }
          // This should never happen due to our filter, but TypeScript requires this case
          throw new Error('Invalid video ID encountered');
        });
    } catch (error) {
      this.logger.error('Error searching YouTube videos:', error);
      throw error;
    }
  }

  /**
   * Fetch comments for a list of YouTube videos
   */
  private async fetchCommentsForVideos(
    videoIds: string[],
    options?: SearchOptions
  ): Promise<YouTubeComment[]> {
    if (!this.youtube) {
      throw new Error('YouTube client not initialized');
    }

    const allComments: YouTubeComment[] = [];
    const limit = options?.limit || 100;
    const maxResultsPerVideo = Math.min(
      100,
      Math.max(1, Math.floor(limit / videoIds.length))
    );

    for (const videoId of videoIds) {
      try {
        const comments = await this.fetchCommentsForVideo(
          videoId,
          maxResultsPerVideo
        );
        allComments.push(...comments);

        // Check if we've reached the total limit
        if (allComments.length >= limit) {
          break;
        }
      } catch (error) {
        this.logger.warn(
          `Error fetching comments for video ${videoId}:`,
          error
        );
        // Continue with other videos
      }
    }

    // Respect the total limit
    return allComments.slice(0, limit);
  }

  /**
   * Fetch comments for a specific YouTube video
   */
  private async fetchCommentsForVideo(
    videoId: string,
    maxResults: number
  ): Promise<YouTubeComment[]> {
    if (!this.youtube) {
      throw new Error('YouTube client not initialized');
    }

    try {
      const response = await this.youtube.commentThreads.list({
        part: ['snippet', 'replies'],
        videoId: videoId,
        maxResults: maxResults,
        order: 'relevance',
      });

      if (!response.data.items || response.data.items.length === 0) {
        return [];
      }

      const comments: YouTubeComment[] = [];

      // Process top-level comments
      for (const thread of response.data.items) {
        if (!thread.snippet?.topLevelComment?.snippet) continue;

        const commentSnippet = thread.snippet.topLevelComment.snippet;
        const authorChannelId =
          commentSnippet.authorChannelId?.value || undefined;

        const comment: YouTubeComment = {
          id: thread.id || '',
          platform: 'youtube',
          text: commentSnippet.textDisplay || '',
          timestamp: new Date(commentSnippet.publishedAt || Date.now()),
          authorId: commentSnippet.authorChannelId?.value || '',
          authorName: commentSnippet.authorDisplayName || '',
          url: `https://www.youtube.com/watch?v=${videoId}&lc=${thread.id}`,
          videoId: videoId,
          channelId: authorChannelId,
          isReply: false,
          publishedAt: new Date(commentSnippet.publishedAt || Date.now()),
          updatedAt: commentSnippet.updatedAt
            ? new Date(commentSnippet.updatedAt)
            : undefined,
          likeCount: commentSnippet.likeCount || 0,
          engagementMetrics: {
            likes: commentSnippet.likeCount || 0,
            comments: thread.snippet.totalReplyCount || 0,
            shares: 0,
          },
          metadata: {
            replyCount: thread.snippet.totalReplyCount || 0,
          },
        };

        comments.push(comment);

        // Process replies if available
        if (thread.replies && thread.replies.comments) {
          for (const reply of thread.replies.comments) {
            if (!reply.snippet) continue;

            // Safe extraction of the author channel ID
            const replyChannelId = reply.snippet.authorChannelId?.value;

            const replyComment: YouTubeComment = {
              id: reply.id || '',
              platform: 'youtube',
              text: reply.snippet.textDisplay || '',
              timestamp: new Date(reply.snippet.publishedAt || Date.now()),
              authorId: reply.snippet.authorChannelId?.value || '',
              authorName: reply.snippet.authorDisplayName || '',
              url: `https://www.youtube.com/watch?v=${videoId}&lc=${reply.id}`,
              videoId: videoId,
              // Handle null case explicitly to satisfy type constraint
              channelId: replyChannelId ? replyChannelId : null,
              parentId: thread.id || undefined,
              isReply: true,
              publishedAt: new Date(reply.snippet.publishedAt || Date.now()),
              updatedAt: reply.snippet.updatedAt
                ? new Date(reply.snippet.updatedAt)
                : undefined,
              likeCount: reply.snippet.likeCount || 0,
              engagementMetrics: {
                likes: reply.snippet.likeCount || 0,
                comments: 0,
                shares: 0,
              },
              metadata: {
                replyCount: 0,
              },
            };

            comments.push(replyComment);
          }
        }
      }

      return comments;
    } catch (error) {
      this.logger.error(`Error fetching comments for video ${videoId}:`, error);
      throw error;
    }
  }

  /**
   * Transform YouTube comments to SocialMediaPost format
   */
  private transformToSocialMediaPosts(
    comments: YouTubeComment[]
  ): SocialMediaPost[] {
    return comments.map((comment) => {
      return {
        id: comment.id,
        text: comment.text,
        platform: this.platform,
        url: comment.url,
        authorId: comment.authorId || '',
        authorName: comment.authorName || '',
        timestamp: comment.timestamp,
        engagementMetrics: {
          likes: comment.likeCount || 0,
          shares: 0,
          comments: comment.isReply
            ? 0
            : (comment.metadata?.replyCount as number) || 0,
          reach: 0,
          viralityScore: 0,
        },
      };
    });
  }

  /**
   * Calculate credibility score for a YouTube channel
   */
  private calculateCredibilityScore(
    statistics?: youtube_v3.Schema$ChannelStatistics
  ): number {
    if (!statistics) {
      return 0.1;
    }

    const subscriberCount = Number(statistics.subscriberCount) || 0;
    const videoCount = Number(statistics.videoCount) || 0;
    const viewCount = Number(statistics.viewCount) || 0;

    // Simple credibility algorithm based on channel metrics
    let score = 0.1; // Base score

    // Subscriber count influence
    if (subscriberCount > 1000000) score += 0.3;
    else if (subscriberCount > 100000) score += 0.25;
    else if (subscriberCount > 10000) score += 0.2;
    else if (subscriberCount > 1000) score += 0.15;
    else if (subscriberCount > 100) score += 0.1;

    // Video count influence
    if (videoCount > 500) score += 0.2;
    else if (videoCount > 100) score += 0.15;
    else if (videoCount > 50) score += 0.1;
    else if (videoCount > 10) score += 0.05;

    // View count influence
    if (viewCount > 10000000) score += 0.2;
    else if (viewCount > 1000000) score += 0.15;
    else if (viewCount > 100000) score += 0.1;
    else if (viewCount > 10000) score += 0.05;

    return Math.min(score, 1.0);
  }

  /**
   * Enhanced method that returns strongly typed YouTubeComment objects
   */
  async searchYouTubeComments(
    query: string,
    options?: SearchOptions
  ): Promise<YouTubeComment[]> {
    if (!this.youtube) {
      throw new Error('YouTube client not initialized');
    }

    try {
      // First, search for videos
      const videoIds = await this.searchVideos(query, options);

      // Then fetch comments for these videos
      return this.fetchCommentsForVideos(videoIds, options);
    } catch (error) {
      this.logger.error('Error searching YouTube comments:', error);
      throw error;
    }
  }
}
