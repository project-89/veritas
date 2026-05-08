import { Optional } from '@nestjs/common';
import { Args, Float, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  ContentSearchParams,
  ContentService,
  ExtendedContentNode,
} from '../services/content.service';

import {
  ContentCreateInputType,
  ContentSearchParamsType,
  ContentType,
  ContentUpdateInputType,
  EngagementMetricsInputType,
  SemanticSearchParamsType,
  SimilarContentResultType,
} from '../types/content.types';

@Resolver(() => ContentType)
export class ContentResolver {
  constructor(@Optional() private readonly contentService: ContentService) {}

  /**
   * Private helper to check if content service is available
   * @private
   */
  private ensureContentService(): void {
    if (!this.contentService) {
      throw new Error(
        'Content service not available - use ContentClassificationModule.forRoot() with databaseProvider',
      );
    }
  }

  @Query(() => ContentType, { nullable: true })
  async content(@Args('id') id: string): Promise<ExtendedContentNode | null> {
    this.ensureContentService();
    return this.contentService.getContentById(id);
  }

  @Query(() => [ContentType])
  async searchContent(
    @Args('params', { type: () => ContentSearchParamsType }) params: ContentSearchParamsType,
  ): Promise<ExtendedContentNode[]> {
    this.ensureContentService();
    return this.contentService.searchContent(params);
  }

  @Query(() => [ContentType])
  async relatedContent(
    @Args('id') id: string,
    @Args('limit', { nullable: true }) limit?: number,
  ): Promise<ExtendedContentNode[]> {
    this.ensureContentService();
    return this.contentService.getRelatedContent(id, limit);
  }

  @Mutation(() => ContentType)
  async createContent(
    @Args('input', { type: () => ContentCreateInputType }) input: ContentCreateInputType,
  ): Promise<ExtendedContentNode> {
    this.ensureContentService();
    return this.contentService.createContent(input);
  }

  @Mutation(() => ContentType)
  async updateContent(
    @Args('id') id: string,
    @Args('input', { type: () => ContentUpdateInputType }) input: ContentUpdateInputType,
  ): Promise<ExtendedContentNode | null> {
    this.ensureContentService();
    return this.contentService.updateContent(id, input);
  }

  @Mutation(() => Boolean)
  async deleteContent(@Args('id') id: string): Promise<boolean> {
    this.ensureContentService();
    return this.contentService.deleteContent(id);
  }

  @Mutation(() => ContentType)
  async updateEngagementMetrics(
    @Args('id') id: string,
    @Args('metrics', { type: () => EngagementMetricsInputType })
    metrics: EngagementMetricsInputType,
  ): Promise<ExtendedContentNode | null> {
    this.ensureContentService();
    return this.contentService.updateContent(id, {
      engagementMetrics: metrics,
    });
  }

  @Query(() => [ContentType])
  async semanticSearch(
    @Args('params', { type: () => SemanticSearchParamsType }) params: SemanticSearchParamsType,
  ): Promise<ExtendedContentNode[]> {
    this.ensureContentService();

    // Convert SemanticSearchParamsType to ContentSearchParams
    const searchParams: ContentSearchParams = {
      query: params.query,
      platform: params.platform,
      startDate: params.startDate,
      endDate: params.endDate,
      sourceId: params.sourceId,
      limit: params.limit,
      offset: params.offset,
      semanticQuery: params.semanticQuery,
      minScore: params.minScore,
    };

    return this.contentService.semanticSearchContent(searchParams, true);
  }

  @Query(() => [SimilarContentResultType])
  async similarContent(
    @Args('id') id: string,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
    @Args('minScore', { type: () => Float, nullable: true }) minScore?: number,
    @Args('useExistingEmbedding', { nullable: true })
    useExistingEmbedding?: boolean,
  ): Promise<Array<{ content: ExtendedContentNode; score: number }>> {
    this.ensureContentService();

    return this.contentService.findSimilarContent(id, {
      limit,
      minScore,
      useExistingEmbedding,
    });
  }

  @Mutation(() => ContentType)
  async generateEmbedding(@Args('id') id: string): Promise<ExtendedContentNode> {
    this.ensureContentService();

    const result = await this.contentService.generateEmbedding(id);
    if (!result) {
      throw new Error(`Content with ID ${id} not found`);
    }

    return result;
  }

  @Mutation(() => Int)
  async generateAllEmbeddings(
    @Args('batchSize', { type: () => Int, nullable: true }) batchSize?: number,
  ): Promise<number> {
    this.ensureContentService();

    return this.contentService.generateAllEmbeddings(batchSize);
  }
}
