import { Body, Controller, Delete, Get, Logger, Param, Post, Query } from '@nestjs/common';
import type { NarrativeInsight } from '../../types/narrative-insight.interface';
import type { NarrativeTrend } from '../../types/narrative-trend.interface';
import type { SocialMediaPost } from '../../types/social-media.types';
import { InvestigationRepository } from '../repositories/investigation.repository';
import { NarrativeRepository } from '../repositories/narrative-insight.repository';
import { IngestionService } from '../services/ingestion.service';
import { TransformOnIngestService } from '../services/transform/transform-on-ingest.service';
import { buildPostDedupKey } from '../utils/post-dedup.util';

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
    private readonly ingestionService: IngestionService,
    private readonly investigationRepository: InvestigationRepository,
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
  async ingestBatch(@Body() posts: SocialMediaPost[]): Promise<{ count: number }> {
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
    @Body() body: { query: string; platforms?: string[]; limit?: number },
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
    investigationId: string | null;
  }> {
    this.logger.log(`Searching narratives with query: "${body.query}"`);

    let rawResult: { posts: SocialMediaPost[]; insights: NarrativeInsight[] };
    try {
      rawResult = await this.ingestionService.searchWithRawDataAll(body.query, {
        platforms: body.platforms,
        limit: body.limit,
      });
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Search failed: ${err.message}`, err.stack);
      throw error;
    }

    // Deduplicate posts using the same fingerprinting strategy as scan jobs.
    // This preserves distinct videos/articles that share similar intros.
    const seenTexts = new Set<string>();
    const dedupedPosts: SocialMediaPost[] = [];
    const dedupedInsights: NarrativeInsight[] = [];
    for (let i = 0; i < rawResult.posts.length; i++) {
      const post = rawResult.posts[i];
      if (!post) {
        continue;
      }
      const textKey = buildPostDedupKey(post);
      if (!seenTexts.has(textKey)) {
        seenTexts.add(textKey);
        dedupedPosts.push(post);
        const insight = rawResult.insights[i];
        if (insight) {
          dedupedInsights.push(insight);
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
        timestamp:
          post.timestamp instanceof Date ? post.timestamp.toISOString() : String(post.timestamp),
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

    // Persist as investigation + snapshot
    let investigationId: string | null = null;
    try {
      const investigation = await this.investigationRepository.findOrCreateByQuery(body.query, {
        platforms: body.platforms,
        limit: body.limit,
      });
      investigationId = investigation._id?.toString() ?? investigation.id ?? null;

      if (investigationId) {
        await this.investigationRepository.addSnapshot(investigationId, {
          posts: serializedPosts,
          narratives: [],
          summary,
        });
      }
    } catch (error) {
      // Non-fatal — log but still return search results
      const err = error as Error;
      this.logger.warn(`Failed to persist investigation: ${err.message}`);
    }

    // Only send posts + summary to frontend — insights are heavy (embeddings, hashes)
    // and the frontend uses server-side analysis (/narratives/analyze) instead
    return { posts: serializedPosts, insights: [], summary, investigationId };
  }

  /**
   * Get narrative insights by timeframe
   */
  @Get('insights/:timeframe')
  async getInsightsByTimeframe(
    @Param('timeframe') timeframe: string,
    @Query('limit') limit?: number,
    @Query('skip') skip?: number,
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
  async getTrendsByTimeframe(@Param('timeframe') timeframe: string): Promise<NarrativeTrend[]> {
    this.logger.log(`Getting trends for timeframe: ${timeframe}`);
    return this.narrativeRepository.getTrendsByTimeframe(timeframe);
  }

  /**
   * Look up a narrative insight by content hash
   */
  @Get('insight/:contentHash')
  async getInsightByHash(
    @Param('contentHash') contentHash: string,
  ): Promise<NarrativeInsight | { error: string }> {
    this.logger.log(`Looking up insight with hash: ${contentHash}`);

    const insight = await this.narrativeRepository.findByContentHash(contentHash);

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
    @Query('olderThan') olderThan: string,
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
