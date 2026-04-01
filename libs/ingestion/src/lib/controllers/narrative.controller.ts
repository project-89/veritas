import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Delete,
  Logger,
} from '@nestjs/common';
import { NarrativeRepository } from '../repositories/narrative-insight.repository';
import { NarrativeInsight } from '../../types/narrative-insight.interface';
import { NarrativeTrend } from '../../types/narrative-trend.interface';
import { TransformOnIngestService } from '../services/transform/transform-on-ingest.service';
import { IngestionService } from '../services/ingestion.service';
import { SocialMediaPost } from '../../types/social-media.types';

/**
 * Controller for narrative insights and trends
 * Provides API endpoints to access the repository layer
 */
@Controller('narratives')
export class NarrativeController {
  private readonly logger = new Logger(NarrativeController.name);

  constructor(
    private readonly narrativeRepository: NarrativeRepository,
    private readonly transformService: TransformOnIngestService,
    private readonly ingestionService: IngestionService
  ) {}

  /**
   * Ingest a social media post and transform it into a narrative insight
   */
  @Post('ingest')
  async ingestPost(@Body() post: SocialMediaPost): Promise<NarrativeInsight> {
    this.logger.log(`Ingesting post from platform: ${post.platform}`);
    return this.transformService.transform(post);
  }

  /**
   * Ingest multiple social media posts in a batch
   */
  @Post('ingest-batch')
  async ingestBatch(
    @Body() posts: SocialMediaPost[]
  ): Promise<{ count: number }> {
    this.logger.log(`Ingesting batch of ${posts.length} posts`);
    const insights = await this.transformService.transformBatch(posts);
    return { count: insights.length };
  }

  /**
   * Search across all registered connectors and return raw posts,
   * classified narrative insights, and a summary.
   */
  @Post('search')
  async searchNarratives(
    @Body() body: { query: string; platforms?: string[]; limit?: number }
  ): Promise<{
    posts: Array<{
      id: string;
      text: string;
      platform: string;
      authorName: string;
      authorHandle: string;
      url: string;
      timestamp: string;
      engagement: {
        likes: number;
        shares: number;
        comments: number;
        reach: number;
        viralityScore: number;
      };
    }>;
    insights: NarrativeInsight[];
    summary: {
      total: number;
      positive: number;
      negative: number;
      neutral: number;
      byPlatform: Record<string, number>;
    };
  }> {
    this.logger.log(`Searching narratives with query: "${body.query}"`);

    const rawResult = await this.ingestionService.searchWithRawDataAll(
      body.query,
      {
        platforms: body.platforms,
        limit: body.limit,
      }
    );

    // Deduplicate posts — use normalized text as primary key since tweet IDs
    // can vary across search queries
    const seenTexts = new Set<string>();
    const dedupedPosts: SocialMediaPost[] = [];
    const dedupedInsights: NarrativeInsight[] = [];
    for (let i = 0; i < rawResult.posts.length; i++) {
      const post = rawResult.posts[i];
      // Normalize text for comparison: lowercase, strip whitespace, first 100 chars
      const textKey = post.text.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 100);
      if (!seenTexts.has(textKey)) {
        seenTexts.add(textKey);
        dedupedPosts.push(post);
        if (rawResult.insights[i]) {
          dedupedInsights.push(rawResult.insights[i]);
        }
      }
    }
    const posts = dedupedPosts;
    const insights = dedupedInsights;
    this.logger.log(`Deduplicated: ${rawResult.posts.length} → ${posts.length} posts`);

    // Map SocialMediaPost[] to a simplified serializable format for the frontend
    // Pair each post with its corresponding insight (by index) to embed sentiment
    const serializedPosts = posts.map((post: SocialMediaPost, idx: number) => {
      const insight = insights[idx];
      return {
        id: post.id,
        text: post.text,
        platform: post.platform,
        authorName: post.authorName ?? 'Unknown',
        authorHandle: post.authorHandle ?? 'unknown',
        url: post.url ?? '',
        timestamp: post.timestamp instanceof Date ? post.timestamp.toISOString() : String(post.timestamp),
        sentiment: insight?.sentiment ?? { score: 0, label: 'neutral', confidence: 0 },
        themes: insight?.themes ?? [],
        engagement: {
          likes: post.engagementMetrics.likes,
          shares: post.engagementMetrics.shares,
          comments: post.engagementMetrics.comments,
          reach: post.engagementMetrics.reach,
          viralityScore: post.engagementMetrics.viralityScore,
        },
      };
    });

    const summary = {
      total: insights.length,
      positive: insights.filter((i) => i.sentiment.label === 'positive').length,
      negative: insights.filter((i) => i.sentiment.label === 'negative').length,
      neutral: insights.filter((i) => i.sentiment.label === 'neutral').length,
      byPlatform: insights.reduce<Record<string, number>>((acc, i) => {
        acc[i.platform] = (acc[i.platform] || 0) + 1;
        return acc;
      }, {}),
    };

    return { posts: serializedPosts, insights, summary };
  }

  /**
   * Get narrative insights by timeframe
   */
  @Get('insights/:timeframe')
  async getInsightsByTimeframe(
    @Param('timeframe') timeframe: string,
    @Query('limit') limit?: number,
    @Query('skip') skip?: number
  ): Promise<NarrativeInsight[]> {
    this.logger.log(`Getting insights for timeframe: ${timeframe}`);

    return this.narrativeRepository.findByTimeframe(timeframe, {
      limit: limit ? Number(limit) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }

  /**
   * Get narrative trends by timeframe
   */
  @Get('trends/:timeframe')
  async getTrendsByTimeframe(
    @Param('timeframe') timeframe: string
  ): Promise<NarrativeTrend[]> {
    this.logger.log(`Getting trends for timeframe: ${timeframe}`);
    return this.narrativeRepository.getTrendsByTimeframe(timeframe);
  }

  /**
   * Look up a narrative insight by content hash
   */
  @Get('insight/:contentHash')
  async getInsightByHash(
    @Param('contentHash') contentHash: string
  ): Promise<NarrativeInsight | { error: string }> {
    this.logger.log(`Looking up insight with hash: ${contentHash}`);

    const insight = await this.narrativeRepository.findByContentHash(
      contentHash
    );

    if (!insight) {
      return { error: 'Insight not found' };
    }

    return insight;
  }

  /**
   * Delete insights older than the specified date
   * Used primarily for compliance purposes
   */
  @Delete('cleanup')
  async deleteOldInsights(
    @Query('olderThan') olderThan: string
  ): Promise<{ deletedCount: number }> {
    const date = olderThan ? new Date(olderThan) : new Date();

    if (isNaN(date.getTime())) {
      this.logger.error(`Invalid date provided: ${olderThan}`);
      return { deletedCount: 0 };
    }

    this.logger.log(`Cleaning up insights older than: ${date.toISOString()}`);
    const deletedCount = await this.narrativeRepository.deleteOlderThan(date);

    return { deletedCount };
  }
}
