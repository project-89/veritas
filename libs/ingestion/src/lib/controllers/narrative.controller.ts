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
import { SocialMediaPost } from '../interfaces/social-media-connector.interface';

/**
 * Controller for narrative insights and trends
 * Provides API endpoints to access the repository layer
 */
@Controller('narratives')
export class NarrativeController {
  private readonly logger = new Logger(NarrativeController.name);

  constructor(
    private readonly narrativeRepository: NarrativeRepository,
    private readonly transformService: TransformOnIngestService
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
