import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { NarrativeInsight } from '../../interfaces/narrative-insight.interface';
import { SocialMediaPost } from '../../interfaces/social-media-connector.interface';
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
    private readonly narrativeRepository: NarrativeRepository
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
   * The original raw data is never stored, only the transformed result
   */
  public transform(post: SocialMediaPost): NarrativeInsight {
    try {
      // Step 1: Create content hash (deterministic but non-reversible)
      const contentHash = this.hashContent(post.text, post.timestamp);

      // Step 2: Create source hash (deterministic but non-reversible)
      const sourceHash = this.hashSource(post.authorId, post.platform);

      // Step 3: Extract themes using NLP (simplified for example)
      const themes = this.extractThemes(post.text);

      // Step 4: Extract entities (simplified for example)
      const entities = this.extractEntities(post.text);

      // Step 5: Analyze sentiment (simplified for example)
      const sentiment = this.analyzeSentiment(post.text);

      // Step 6: Calculate narrative score (simplified for example)
      const narrativeScore = this.calculateNarrativeScore(post);

      // Step 7: Create expiration date
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + this.retentionPeriodDays);

      // Create the anonymized narrative insight
      const insight: NarrativeInsight = {
        id: `insight-${contentHash.substring(0, 8)}`,
        contentHash,
        sourceHash,
        platform: post.platform,
        timestamp: post.timestamp,
        themes,
        entities,
        sentiment,
        engagement: {
          total: this.calculateTotalEngagement(post.engagementMetrics),
          breakdown: this.normalizeEngagementMetrics(post.engagementMetrics),
        },
        narrativeScore,
        processedAt: new Date(),
        expiresAt,
      };

      // Store the insight (non-blocking)
      this.storeInsight(insight).catch((err: Error) =>
        this.logger.error(`Failed to store insight: ${err.message}`, err.stack)
      );

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
    const insights = posts.map((post) => this.transform(post));

    try {
      // Store all insights in a batch operation
      await this.narrativeRepository.saveMany(insights);
      this.logger.debug(
        `Stored ${insights.length} insights from batch transformation`
      );
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Error storing batch insights: ${err.message}`,
        err.stack
      );
    }

    return insights;
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
   * Extract themes from text using NLP techniques
   */
  private extractThemes(text: string): string[] {
    // Simplified implementation for example
    const themes = new Set<string>();
    const words = text.toLowerCase().split(/\s+/);

    // Common theme words (simplified for example)
    const themeKeywords = {
      politics: ['policy', 'government', 'election', 'vote', 'political'],
      technology: ['tech', 'digital', 'software', 'app', 'innovation'],
      environment: ['climate', 'sustainable', 'green', 'eco', 'environmental'],
      // Add more themes as needed
    };

    // Check for theme keywords in the text
    Object.entries(themeKeywords).forEach(([theme, keywords]) => {
      if (keywords.some((keyword) => words.includes(keyword))) {
        themes.add(theme);
      }
    });

    return Array.from(themes);
  }

  /**
   * Extract entities from text
   */
  private extractEntities(
    text: string
  ): Array<{ name: string; type: string; relevance: number }> {
    // Simplified implementation for example
    const entities: Array<{ name: string; type: string; relevance: number }> =
      [];

    // Extract simple entity mentions (highly simplified)
    const matches = text.match(/@([a-zA-Z0-9_]+)|#([a-zA-Z0-9_]+)/g) || [];

    matches.forEach((match) => {
      if (match.startsWith('@')) {
        entities.push({
          name: match.substring(1),
          type: 'person',
          relevance: 0.8,
        });
      } else if (match.startsWith('#')) {
        entities.push({
          name: match.substring(1),
          type: 'topic',
          relevance: 0.7,
        });
      }
    });

    return entities;
  }

  /**
   * Analyze sentiment of text
   */
  private analyzeSentiment(text: string): {
    score: number;
    label: 'negative' | 'neutral' | 'positive';
    confidence: number;
  } {
    // Simplified implementation for example
    const positiveWords = [
      'good',
      'great',
      'excellent',
      'like',
      'love',
      'happy',
    ];
    const negativeWords = [
      'bad',
      'awful',
      'terrible',
      'dislike',
      'hate',
      'sad',
    ];

    const words = text.toLowerCase().split(/\s+/);
    let score = 0;

    // Count positive and negative words
    const positiveCount = words.filter((word) =>
      positiveWords.includes(word)
    ).length;
    const negativeCount = words.filter((word) =>
      negativeWords.includes(word)
    ).length;

    // Calculate score between -1 and 1
    if (positiveCount + negativeCount > 0) {
      score = (positiveCount - negativeCount) / (positiveCount + negativeCount);
    }

    // Determine label
    let label: 'negative' | 'neutral' | 'positive' = 'neutral';
    if (score > 0.2) {
      label = 'positive';
    } else if (score < -0.2) {
      label = 'negative';
    }

    return {
      score,
      label,
      confidence: Math.min(0.9, Math.abs(score) + 0.5), // Simplified confidence calculation
    };
  }

  /**
   * Calculate a narrative score for the post
   */
  private calculateNarrativeScore(post: SocialMediaPost): number {
    // Simplified implementation for example
    const engagementFactor =
      this.calculateTotalEngagement(post.engagementMetrics) / 1000;
    const timeFactor = Math.max(
      0,
      1 - (Date.now() - post.timestamp.getTime()) / (30 * 24 * 60 * 60 * 1000)
    );

    // Score between 0 and 1
    return Math.min(
      0.95,
      Math.max(0.1, engagementFactor * 0.7 + timeFactor * 0.3)
    );
  }

  /**
   * Calculate total engagement from metrics
   */
  private calculateTotalEngagement(
    metrics: SocialMediaPost['engagementMetrics']
  ): number {
    // Sum of all engagement metrics with weights
    return (
      metrics.likes * 1 +
      metrics.shares * 2 +
      metrics.comments * 1.5 +
      metrics.reach * 0.1
    );
  }

  /**
   * Normalize engagement metrics for storage
   */
  private normalizeEngagementMetrics(
    metrics: SocialMediaPost['engagementMetrics']
  ): Record<string, number> {
    const total = this.calculateTotalEngagement(metrics);

    // Return normalized breakdown
    return {
      likes: metrics.likes / total,
      shares: metrics.shares / total,
      comments: metrics.comments / total,
      reach: metrics.reach / total,
      viralityScore: metrics.viralityScore,
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
