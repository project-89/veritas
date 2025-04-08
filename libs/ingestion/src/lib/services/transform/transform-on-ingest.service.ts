import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  ContentClassificationService,
  ContentClassification,
} from '@veritas/content-classification';
import { NarrativeInsight } from '../../../types/narrative-insight.interface';
import { SocialMediaPost } from '../../../types/social-media.types';
import { NarrativeRepository } from '../../repositories/narrative-insight.repository';

/**
 * Service responsible for transforming raw social media data into anonymized insights
 * Implements the transform-on-ingest architecture to ensure no raw identifiable data is stored
 */
@Injectable()
export class TransformOnIngestService {
  private readonly logger = new Logger(TransformOnIngestService.name);
  private readonly hashSalt: string;
  private readonly retentionPeriodDays: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly narrativeRepository: NarrativeRepository,
    private readonly contentClassificationService: ContentClassificationService
  ) {
    // Get hash salt from config or generate a secure random one
    this.hashSalt =
      this.configService.get<string>('HASH_SALT') ||
      crypto.randomBytes(32).toString('hex');

    // Get retention period from config (default 90 days)
    this.retentionPeriodDays =
      this.configService.get<number>('RETENTION_PERIOD_DAYS') || 90;

    this.logger.log('TransformOnIngestService initialized');

    // Schedule daily cleanup of expired data
    setInterval(() => this.cleanupExpiredData(), 24 * 60 * 60 * 1000);
  }

  /**
   * Transform a social media post into an anonymized narrative insight
   * This is the core method implementing the transform-on-ingest pattern
   */
  public async transform(post: SocialMediaPost): Promise<NarrativeInsight> {
    try {
      // Step 1: Classify the content
      const classification = await this.contentClassificationService.classify(
        post.text
      );

      // Step 2: Transform with classification
      const insight = await this.transformWithClassification(
        post,
        classification
      );

      // Step 3: Store the insight
      await this.storeInsight(insight);

      return insight;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error transforming post: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Transform and store a batch of social media posts
   * Returns the transformed insights
   */
  public async transformBatch(
    posts: SocialMediaPost[]
  ): Promise<NarrativeInsight[]> {
    try {
      // Step 1: Extract all texts for batch classification
      const texts = posts.map((post) => post.text);

      // Step 2: Perform batch classification
      const classifications =
        await this.contentClassificationService.batchClassify(texts);

      // Step 3: Transform each post with its classification
      const insights = await Promise.all(
        posts.map((post, index) =>
          this.transformWithClassification(post, classifications[index])
        )
      );

      // Step 4: Store all insights in a batch operation
      await this.narrativeRepository.saveMany(insights);
      this.logger.debug(
        `Stored ${insights.length} insights from batch transformation`
      );

      return insights;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Error in batch transformation: ${err.message}`,
        err.stack
      );
      throw error;
    }
  }

  /**
   * Transform a post with pre-computed classification
   * Used by transformBatch for better performance
   */
  private async transformWithClassification(
    post: SocialMediaPost,
    classification: ContentClassification
  ): Promise<NarrativeInsight> {
    // Step 1: Create content hash (deterministic but non-reversible)
    const contentHash = this.hashContent(post.text, post.timestamp);

    // Step 2: Create source hash (deterministic but non-reversible)
    const sourceHash = this.hashSource(post.authorId, post.platform);

    // Step 3: Calculate narrative score
    const narrativeScore = this.calculateNarrativeScore(post, classification);

    // Step 4: Create expiration date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.retentionPeriodDays);

    // Create the anonymized narrative insight
    return {
      id: `insight-${contentHash.substring(0, 8)}`,
      contentHash,
      sourceHash,
      platform: post.platform,
      timestamp: post.timestamp,
      themes: classification.topics,
      entities: this.mapClassificationEntities(classification.entities),
      sentiment: {
        score: classification.sentiment.score,
        label: classification.sentiment.label,
        confidence: classification.sentiment.confidence,
      },
      engagement: {
        total: this.calculateTotalEngagement(post.engagementMetrics),
        breakdown: this.normalizeEngagementMetrics(post.engagementMetrics),
      },
      narrativeScore,
      processedAt: new Date(),
      expiresAt,
    };
  }

  /**
   * Store a narrative insight in the repository
   * This is done asynchronously to not block the transformation process
   */
  private async storeInsight(insight: NarrativeInsight): Promise<void> {
    try {
      // Check if this content already exists to prevent duplicates
      const existing = await this.narrativeRepository.findByContentHash(
        insight.contentHash
      );

      if (!existing) {
        await this.narrativeRepository.save(insight);
        this.logger.debug(`Stored new insight: ${insight.contentHash}`);
      } else {
        this.logger.debug(`Skipped duplicate insight: ${insight.contentHash}`);
      }
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error storing insight: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Create a one-way hash of content with salt
   */
  private hashContent(text: string, timestamp: Date): string {
    const content = `${text}|${timestamp.toISOString()}`;
    return crypto
      .createHash('sha256')
      .update(content + this.hashSalt)
      .digest('hex');
  }

  /**
   * Create a one-way hash of source with salt
   */
  private hashSource(authorId: string, platform: string): string {
    const source = `${authorId}|${platform}`;
    return crypto
      .createHash('sha256')
      .update(source + this.hashSalt)
      .digest('hex');
  }

  /**
   * Map entities from ContentClassification format to NarrativeInsight format
   */
  private mapClassificationEntities(
    entities: ContentClassification['entities']
  ): Array<{ name: string; type: string; relevance: number }> {
    return entities.map(
      (entity: { text: string; type: string; confidence: number }) => ({
        name: entity.text,
        type: entity.type,
        relevance: entity.confidence,
      })
    );
  }

  /**
   * Calculate a narrative score based on content and classification
   */
  private calculateNarrativeScore(
    post: SocialMediaPost,
    classification: ContentClassification
  ): number {
    // Factor 1: Engagement score (normalized, max 0.4)
    const engagementScore = Math.min(
      this.calculateEngagementScore(post.engagementMetrics) * 0.4,
      0.4
    );

    // Factor 2: Entity relevance score (max 0.2)
    const entityScore = Math.min(
      this.calculateEntityScore(classification.entities) * 0.2,
      0.2
    );

    // Factor 3: Topic relevance (max 0.2)
    const topicScore = Math.min(
      classification.topics.length > 0 ? 0.2 : 0.1,
      0.2
    );

    // Factor 4: Sentiment intensity (max 0.2)
    const sentimentIntensity = Math.abs(classification.sentiment.score);
    const sentimentScore = Math.min(sentimentIntensity * 0.2, 0.2);

    // Return total score (0-1 range)
    return engagementScore + entityScore + topicScore + sentimentScore;
  }

  /**
   * Calculate the total engagement from engagement metrics
   */
  private calculateTotalEngagement(
    metrics: SocialMediaPost['engagementMetrics']
  ): number {
    if (!metrics) return 0;
    return (
      (metrics.likes || 0) + (metrics.shares || 0) + (metrics.comments || 0)
    );
  }

  /**
   * Calculate an engagement score from engagement metrics
   */
  private calculateEngagementScore(
    metrics: SocialMediaPost['engagementMetrics']
  ): number {
    if (!metrics) return 0;

    const total = this.calculateTotalEngagement(metrics);
    const reach = metrics.reach || 1; // Avoid division by zero

    // Engagement rate calculation (higher is better)
    return Math.min(total / reach, 1);
  }

  /**
   * Calculate an entity score based on entity relevance
   */
  private calculateEntityScore(
    entities: ContentClassification['entities']
  ): number {
    if (!entities || entities.length === 0) return 0;

    // Average confidence of all entities
    return (
      entities.reduce((sum, entity) => sum + entity.confidence, 0) /
      entities.length
    );
  }

  /**
   * Normalize engagement metrics to create a percentage breakdown
   */
  private normalizeEngagementMetrics(
    metrics: SocialMediaPost['engagementMetrics']
  ): Record<string, number> {
    if (!metrics) {
      return {
        likes: 0,
        shares: 0,
        comments: 0,
      };
    }

    const total = this.calculateTotalEngagement(metrics);

    if (total === 0) {
      return {
        likes: 0,
        shares: 0,
        comments: 0,
      };
    }

    return {
      likes: (metrics.likes || 0) / total,
      shares: (metrics.shares || 0) / total,
      comments: (metrics.comments || 0) / total,
    };
  }

  /**
   * Clean up expired data based on retention policy
   */
  private async cleanupExpiredData(): Promise<void> {
    try {
      const now = new Date();
      const deletedCount = await this.narrativeRepository.deleteOlderThan(now);

      if (deletedCount > 0) {
        this.logger.log(`Cleaned up ${deletedCount} expired insights`);
      }
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Error cleaning up expired data: ${err.message}`,
        err.stack
      );
    }
  }
}
