import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { Inject } from '@nestjs/common';
import {
  ANALYSIS_SERVICE,
  AnalysisServiceInterface,
} from './interfaces/analysis-service.interface';
import { DeviationMetrics, Pattern, TimeFrame, TimeFrameInput, ExtendedContentNode } from './analysis.types';
import { ContentAnalysisInput } from './dto/content-analysis.input';
import { ContentAnalysisResult, RelatedContent } from './dto/content-analysis.result';

@Resolver()
export class AnalysisResolver {
  constructor(
    @Inject(ANALYSIS_SERVICE)
    private readonly analysisService: AnalysisServiceInterface,
  ) {}

  @Query(() => [Pattern])
  async detectPatterns(@Args('timeframe', { type: () => TimeFrameInput }) timeframe: TimeFrameInput): Promise<Pattern[]> {
    return this.analysisService.detectPatterns(timeframe);
  }

  @Query(() => DeviationMetrics)
  async getRealityDeviation(
    @Args('narrativeId') narrativeId: string,
  ): Promise<DeviationMetrics> {
    const metrics = await this.analysisService.measureRealityDeviation(narrativeId);
    return { ...metrics, timeframe: { start: new Date(), end: new Date() } };
  }

  @Mutation(() => ContentAnalysisResult)
  async analyzeContent(
    @Args('input', { type: () => ContentAnalysisInput }) input: ContentAnalysisInput,
  ): Promise<ContentAnalysisResult> {
    const content = await this.analysisService.getContentById(input.contentId);
    if (!content) {
      throw new Error('Content not found');
    }

    const [patterns, metrics] = await Promise.all([
      this.analysisService.detectPatternsForContent(content),
      this.analysisService.calculateContentDeviation(content),
    ]);

    const deviationMetrics = {
      ...metrics,
      timeframe: { start: new Date(), end: new Date() },
    };

    const relatedNodes = await this.analysisService.findRelatedContent(content);
    const relatedContent: RelatedContent[] = relatedNodes.map((node) => ({
      id: node.id,
      text: node.text,
      timestamp: node.timestamp,
      platform: node.platform,
      sourceId: node.sourceId,
      toxicity: node.toxicity,
      sentiment: node.sentiment,
      categories: node.categories,
      topics: node.topics,
      metadata: node.metadata,
    }));

    const sourceCredibility = await this.analysisService.calculateSourceCredibility(
      content.sourceId || '',
    );
    const trustScore = sourceCredibility * 0.8 + (1 - (content.toxicity ?? 0)) * 0.2;

    return {
      contentId: content.id,
      patterns,
      deviationMetrics,
      relatedContent,
      sourceCredibility,
      trustScore,
      analysisTimestamp: new Date(),
    };
  }
}
