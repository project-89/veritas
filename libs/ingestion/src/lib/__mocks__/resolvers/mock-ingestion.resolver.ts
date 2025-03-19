/**
 * Mock implementation of the ingestion resolver for testing purposes
 * This avoids dependencies on external modules
 */

import { TransformOnIngestService } from '../../services/transform/transform-on-ingest.service';
import { NarrativeRepository } from '../../repositories/narrative-insight.repository';
import { VerificationStatus } from '../types/mock-ingestion.types';
import { Logger } from '@nestjs/common';

// Mock for ContentClassificationService
class ContentClassificationService {
  async classifyContent(text: string) {
    return {
      toxicity: 0.1,
      sentiment: {
        score: 0.2,
        magnitude: 0.5,
      },
      categories: ['news'],
      topics: ['technology'],
    };
  }
}

// Mock for ContentNode and SourceNode
interface ContentNode {
  id: string;
  text: string;
  timestamp: Date;
  platform: string;
  toxicity?: number;
  sentiment?: { score: number; magnitude: number };
  categories?: string[];
  topics?: string[];
  engagementMetrics?: any;
  metadata?: Record<string, any>;
}

interface SourceNode {
  id: string;
  name: string;
  platform: string;
  verificationStatus?: string;
  credibilityScore?: number;
  metadata?: Record<string, unknown>;
}

// Mock for NarrativeInsight
interface NarrativeInsight {
  id: string;
  contentHash: string;
  sourceHash: string;
  platform: string;
  timestamp: Date;
  themes: string[];
  entities: any[];
  sentiment: any;
  engagement: any;
  narrativeScore: number;
  processedAt: Date;
  expiresAt: Date;
}

// Type definitions for inputs
interface ContentIngestionInput {
  text: string;
  platform: string;
  engagementMetrics?: any;
  metadata?: Record<string, any>;
}

interface SourceIngestionInput {
  name: string;
  platform: string;
  credibilityScore: number;
  verificationStatus: VerificationStatus;
  metadata?: Record<string, any>;
}

/**
 * Mock implementation of IngestionResolver for testing
 */
export class IngestionResolver {
  private readonly logger = new Logger(IngestionResolver.name);
  private readonly memgraphService: any;
  private readonly kafkaClient: any;

  constructor(
    private readonly classificationService: ContentClassificationService,
    private readonly transformService: TransformOnIngestService,
    private readonly narrativeRepository: NarrativeRepository
  ) {
    // Mock memgraph and kafka services
    this.memgraphService = {
      executeQuery: jest.fn().mockResolvedValue([
        {
          s: {
            id: 'test-source-id',
            name: 'Test Source',
            platform: 'twitter',
            verificationStatus: 'verified',
          },
        },
      ]),
      createNode: jest.fn().mockResolvedValue({
        id: 'test-id',
        platform: 'twitter',
      }),
      createRelationship: jest.fn().mockResolvedValue({}),
    };

    this.kafkaClient = {
      emit: jest.fn().mockResolvedValue(undefined),
    };
  }

  private mapVerificationStatus(
    status: VerificationStatus
  ): 'verified' | 'unverified' | 'suspicious' {
    return status.toLowerCase() as 'verified' | 'unverified' | 'suspicious';
  }

  /**
   * Ingest social media content using the transform-on-ingest pattern
   */
  async ingestSocialContent(
    content: ContentIngestionInput,
    source: SourceIngestionInput
  ): Promise<NarrativeInsight> {
    // First convert to SocialMediaPost format
    const socialMediaPost = {
      id: 'mocked-id',
      text: content.text,
      timestamp: new Date(),
      platform: content.platform,
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
    const narrativeInsight = this.transformService.transform(socialMediaPost);

    return narrativeInsight;
  }

  /**
   * Retrieve narrative insights by timeframe
   */
  async getNarrativeInsights(
    timeframe: string,
    limit?: number,
    skip?: number
  ): Promise<NarrativeInsight[]> {
    return this.narrativeRepository.findByTimeframe(timeframe, {
      limit,
      skip,
    });
  }

  /**
   * Retrieve narrative trends by timeframe
   */
  async getNarrativeTrends(timeframe: string) {
    return this.narrativeRepository.getTrendsByTimeframe(timeframe);
  }

  /**
   * Verify a source's status
   */
  async verifySource(
    sourceId: string,
    status: VerificationStatus
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
