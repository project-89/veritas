import { Resolver, Mutation, Args, Query } from '@nestjs/graphql';
import { NarrativeRepository } from '../repositories/narrative-insight.repository';
import { SourceNode } from '@veritas/shared/types';
import { Inject, Logger } from '@nestjs/common';

class SourceType implements SourceNode {
  id!: string;
  name!: string;
  type!: 'social' | 'news' | 'blog' | 'forum' | 'other';
  createdAt!: Date;
  updatedAt!: Date;
}

import {
  ContentIngestionInput,
  SourceIngestionInput,
  VerificationStatus,
} from '../types/ingestion.types';
import { TransformOnIngestService } from '../services/transform/transform-on-ingest.service';
import { SocialMediaPost } from '../../types/social-media.types';
import { NarrativeInsight } from '../../types/narrative-insight.interface';
import {
  NarrativeTrendType,
  NarrativeInsightType,
} from '../types/graphql.types';
import * as crypto from 'crypto';

/**
 * GraphQL resolver for ingestion operations
 * Implements the transform-on-ingest flow for content processing
 */
@Resolver()
export class IngestionResolver {
  private readonly logger = new Logger(IngestionResolver.name);

  constructor(
    private readonly transformService: TransformOnIngestService,
    private readonly narrativeRepository: NarrativeRepository,
    @Inject('MEMGRAPH_SERVICE') private readonly memgraphService: any,
    @Inject('KAFKA_SERVICE') private readonly kafkaClient: any
  ) {}

  private mapVerificationStatus(
    status: VerificationStatus
  ): 'verified' | 'unverified' | 'suspicious' {
    return status.toLowerCase() as 'verified' | 'unverified' | 'suspicious';
  }

  /**
   * Ingest social media content using the transform-on-ingest pattern
   * This adheres to our security architecture by transforming content immediately
   */
  @Mutation(() => NarrativeInsightType)
  async ingestSocialContent(
    @Args('content') content: ContentIngestionInput,
    @Args('source') source: SourceIngestionInput
  ): Promise<NarrativeInsight> {
    // First convert to SocialMediaPost format
    const socialMediaPost: SocialMediaPost = {
      id: crypto.randomUUID(),
      text: content.text,
      timestamp: new Date(),
      platform: content.platform as any,
      authorId: source.name, // Using name as authorId for consistency
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

    // Transform immediately using our transform-on-ingest service
    // This ensures no raw data is stored in the system
    const narrativeInsight = await this.transformService.transform(
      socialMediaPost
    );

    return narrativeInsight;
  }

  /**
   * Retrieve narrative insights by timeframe
   */
  @Query(() => [NarrativeInsightType])
  async getNarrativeInsights(
    @Args('timeframe') timeframe: string,
    @Args('limit', { nullable: true }) limit?: number,
    @Args('skip', { nullable: true }) skip?: number
  ): Promise<NarrativeInsight[]> {
    return this.narrativeRepository.findByTimeframe(timeframe, {
      limit,
      skip,
    });
  }

  /**
   * Retrieve narrative trends by timeframe
   */
  @Query(() => [NarrativeTrendType])
  async getNarrativeTrends(@Args('timeframe') timeframe: string) {
    return this.narrativeRepository.getTrendsByTimeframe(timeframe);
  }

  /**
   * Verify a source's status
   */
  @Mutation(() => SourceType)
  async verifySource(
    @Args('sourceId') sourceId: string,
    @Args('status') status: VerificationStatus
  ): Promise<SourceNode> {
    try {
      // Update graph database
      const query = `
        MATCH (s:Source)
        WHERE s.id = $sourceId
        SET s.verificationStatus = $verificationStatus,
            s.verifiedAt = $timestamp
        RETURN s
      `;

      const result = await this.memgraphService.executeQuery(query, {
        sourceId,
        verificationStatus: this.mapVerificationStatus(status),
        timestamp: new Date().toISOString(),
      });

      // Emit verification event
      await this.kafkaClient.emit('source.verified', {
        sourceId,
        verificationStatus: this.mapVerificationStatus(status),
        timestamp: new Date(),
      });

      return result[0]?.s;
    } catch (error: any) {
      this.logger.error(
        `Error verifying source: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }
}
