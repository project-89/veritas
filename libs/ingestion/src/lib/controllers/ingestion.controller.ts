import {
  Controller,
  Post,
  Put,
  Body,
  Param,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { NarrativeRepository } from '../repositories/narrative-insight.repository';
import { TransformOnIngestService } from '../services/transform/transform-on-ingest.service';
import { ContentNode, SourceNode } from '@veritas/shared/types';
import { SocialMediaPost } from '../../types/social-media.types';
import { SocialMediaContentNode } from '../../types/social-media.types';
import * as crypto from 'crypto';

/** Interface for the graph database service */
interface GraphDatabaseService {
  executeQuery(query: string, params: Record<string, unknown>): Promise<Record<string, unknown>[]>;
}

/** Interface for the event streaming client */
interface EventStreamingClient {
  emit(event: string, data: Record<string, unknown>): Promise<void>;
}

@ApiTags('ingestion')
@Controller('ingestion')
export class IngestionController {
  private readonly logger = new Logger(IngestionController.name);

  constructor(
    private readonly narrativeRepository: NarrativeRepository,
    private readonly transformService: TransformOnIngestService,
    @Optional() @Inject('MEMGRAPH_SERVICE') private readonly memgraphService: GraphDatabaseService,
    @Optional() @Inject('KAFKA_SERVICE') private readonly kafkaClient: EventStreamingClient
  ) {}

  @Post('content')
  @ApiOperation({
    summary: 'Ingest new content using transform-on-ingest pattern',
  })
  async ingestContent(
    @Body('content') content: SocialMediaContentNode,
    @Body('source') source: SourceNode
  ) {
    // Convert to SocialMediaPost format
    const post: SocialMediaPost = {
      id: content.id || crypto.randomUUID(),
      text: content.text,
      timestamp: content.timestamp || new Date(),
      platform: content.platform,
      authorId: source.id,
      authorName: source.name,
      engagementMetrics: content.engagementMetrics
        ? {
            likes: content.engagementMetrics.likes || 0,
            shares: content.engagementMetrics.shares || 0,
            comments: content.engagementMetrics.comments || 0,
            reach: content.engagementMetrics.reach || 0,
            viralityScore: content.engagementMetrics.viralityScore || 0,
          }
        : {
            likes: 0,
            shares: 0,
            comments: 0,
            reach: 0,
            viralityScore: 0,
          },
    };

    // Transform and store
    const insight = this.transformService.transform(post);
    return { insight };
  }

  @Put('source/:id/verify')
  @ApiOperation({ summary: 'Update source verification status' })
  async verifySource(
    @Param('id') sourceId: string,
    @Body('status') status: 'verified' | 'unverified' | 'suspicious'
  ) {
    try {
      // Update graph database
      const query = `
        MATCH (s:Source)
        WHERE s.id = $sourceId
        SET s.verificationStatus = $status,
            s.verifiedAt = $timestamp
        RETURN s
      `;

      const result = await this.memgraphService.executeQuery(query, {
        sourceId,
        status,
        timestamp: new Date().toISOString(),
      });

      // Emit verification event
      await this.kafkaClient.emit('source.verified', {
        sourceId,
        verificationStatus: status,
        timestamp: new Date(),
      });

      return result[0]?.['s'];
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Error verifying source: ${err.message}`,
        err.stack
      );
      throw error;
    }
  }
}
