import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { Inject } from '@nestjs/common';
// import { AnalysisService } from "../../services/analysis.service";
import {
  DeviationMetrics,
  Pattern,
  TimeFrame,
  ExtendedContentNode,
} from './analysis.types';
import { ContentAnalysisInput } from './dto/content-analysis.input';
import {
  ContentAnalysisResult,
  RelatedContent,
} from './dto/content-analysis.result';

@Resolver()
export class AnalysisResolver {
  constructor(
    @Inject('AnalysisService') private readonly analysisService: any
  ) {}

  @Query(() => [Pattern])
  async detectPatterns(
    @Args('timeframe') timeframe: TimeFrame
  ): Promise<Pattern[]> {
    return this.analysisService.detectPatterns(timeframe);
  }

  @Query(() => DeviationMetrics)
  async getRealityDeviation(
    @Args('narrativeId') narrativeId: string
  ): Promise<DeviationMetrics> {
    const metrics = await this.analysisService.measureRealityDeviation(
      narrativeId
    );
    return { ...metrics, timeframe: { start: new Date(), end: new Date() } };
  }

  @Mutation(() => ContentAnalysisResult)
  async analyzeContent(
    @Args('input') input: ContentAnalysisInput
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

    const relatedContent = (
      await this.analysisService.findRelatedContent(content)
    ).map((node: any) => ({
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

    const sourceCredibility =
      await this.analysisService.calculateSourceCredibility(
        content.sourceId || ''
      );
    const trustScore =
      sourceCredibility * 0.8 + (1 - (content.toxicity || 0)) * 0.2;

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
