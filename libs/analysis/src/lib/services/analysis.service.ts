import { Injectable, Logger, Optional } from '@nestjs/common';
import { DatabaseService } from '@veritas/database';
import { DeviationMetrics, ExtendedContentNode, Pattern, TimeFrame } from '../analysis.types';
import { AnalysisServiceInterface } from '../interfaces/analysis-service.interface';
import { DeviationService } from './deviation.service';
import { GraphBotDetectionService } from './graph-bot-detection.service';
import { SourceCredibilityService } from './source-credibility.service';

/**
 * Core analysis service for narrative tracking and reality deviation detection.
 * Provides pattern detection, content deviation measurement, and source credibility scoring.
 *
 * Many methods here are thin entry-points. For richer results, prefer the
 * specialized endpoints (e.g. /narratives/deviations, /investigate).
 */
@Injectable()
export class AnalysisService implements AnalysisServiceInterface {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    @Optional() private readonly deviationService?: DeviationService,
    @Optional() private readonly sourceCredibilityService?: SourceCredibilityService,
    @Optional() private readonly graphBotDetectionService?: GraphBotDetectionService,
    @Optional() private readonly databaseService?: DatabaseService,
  ) {}

  async measureRealityDeviation(narrativeId: string): Promise<Omit<DeviationMetrics, 'timeframe'>> {
    this.logger.log(`Measuring reality deviation for narrative: ${narrativeId}`);

    if (this.deviationService) {
      // DeviationService.computeDeviations() requires AnalyzedNarrative[] with embeddings,
      // which we don't have from just a narrativeId. Return sensible defaults and direct
      // callers to the /narratives/deviations endpoint for full deviation analysis.
      this.logger.debug(
        `DeviationService is available but requires narrative data with embeddings. ` +
          `Use the /narratives/deviations endpoint for full deviation metrics.`,
      );
    }

    return {
      baselineScore: 0.5,
      deviationMagnitude: 0.0,
      propagationVelocity: 0.0,
      crossReferenceScore: 0.5,
      sourceCredibility: 0.5,
      impactScore: 0.0,
    };
  }

  async detectPatterns(timeframe: TimeFrame): Promise<Pattern[]> {
    this.logger.log(
      `Detecting patterns from ${timeframe.start.toISOString()} to ${timeframe.end.toISOString()}`,
    );

    if (this.graphBotDetectionService) {
      this.logger.debug(
        'GraphBotDetectionService is available for structural pattern detection, ' +
          'but requires user/post data. Use the /investigate endpoint for full bot detection.',
      );
    }

    return [];
  }

  async detectPatternsForContent(content: ExtendedContentNode): Promise<Pattern[]> {
    this.logger.log(`Detecting patterns for content: ${content.id}`);

    if (this.graphBotDetectionService) {
      this.logger.debug(
        'GraphBotDetectionService available — use /investigate endpoint for coordination pattern detection.',
      );
    }

    return [];
  }

  async calculateContentDeviation(
    content: ExtendedContentNode,
  ): Promise<Omit<DeviationMetrics, 'timeframe'>> {
    this.logger.log(`Calculating deviation for content: ${content.id}`);

    const toxicity = content.toxicity ?? 0;
    const sentimentWeight =
      content.sentiment === 'negative' ? 0.7 : content.sentiment === 'positive' ? 0.3 : 0.5;

    return {
      baselineScore: 0.5,
      deviationMagnitude: toxicity * 0.6 + sentimentWeight * 0.4,
      propagationVelocity: 0.0,
      crossReferenceScore: 0.5,
      sourceCredibility: 0.5,
      impactScore: toxicity * sentimentWeight,
    };
  }

  async getContentById(contentId: string): Promise<ExtendedContentNode | null> {
    this.logger.log(`Fetching content: ${contentId}`);

    if (this.databaseService) {
      try {
        const repo = this.databaseService.getRepository<ExtendedContentNode>('content');
        return (await repo.findById(contentId)) ?? null;
      } catch (err) {
        this.logger.warn(`Failed to fetch content ${contentId} from database: ${err}`);
        return null;
      }
    }

    this.logger.debug('DatabaseService not available — cannot fetch content by ID.');
    return null;
  }

  async findRelatedContent(content: ExtendedContentNode): Promise<ExtendedContentNode[]> {
    this.logger.log(`Finding related content for: ${content.id}`);

    // Related-content discovery is handled by the narrative clustering service
    // (NarrativeAnalysisService) which groups posts by embedding similarity.
    // This endpoint returns an empty array — use narrative clustering instead.
    return [];
  }

  async calculateSourceCredibility(sourceId: string): Promise<number> {
    this.logger.log(`Calculating credibility for source: ${sourceId}`);

    if (this.sourceCredibilityService) {
      this.logger.debug(
        'SourceCredibilityService is available but scoreSource() requires posts. ' +
          'Use the /investigate endpoint for full credibility scoring.',
      );
    }

    return 0.5;
  }
}
