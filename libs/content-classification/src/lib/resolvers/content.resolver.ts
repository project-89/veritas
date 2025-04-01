import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { Optional } from '@nestjs/common';
import {
  ContentService,
  ExtendedContentNode,
  ContentSearchParams,
} from '../services/content.service';
import {
  ContentCreateInput,
  ContentUpdateInput,
} from '../services/content-validation.service';
import {
  ContentType,
  ContentCreateInputType,
  ContentUpdateInputType,
  ContentSearchParamsType,
} from '../types/content.types';

@Resolver(() => ContentType)
export class ContentResolver {
  constructor(@Optional() private readonly contentService: ContentService) {}

  @Query(() => ContentType, { nullable: true })
  async content(@Args('id') id: string): Promise<ExtendedContentNode | null> {
    if (!this.contentService) {
      throw new Error(
        'Content service not available - use ContentClassificationModule.forRoot() with databaseProvider'
      );
    }
    return this.contentService.getContentById(id);
  }

  @Query(() => [ContentType])
  async searchContent(
    @Args('params') params: ContentSearchParamsType
  ): Promise<ExtendedContentNode[]> {
    if (!this.contentService) {
      throw new Error(
        'Content service not available - use ContentClassificationModule.forRoot() with databaseProvider'
      );
    }
    return this.contentService.searchContent(params);
  }

  @Query(() => [ContentType])
  async relatedContent(
    @Args('id') id: string,
    @Args('limit', { nullable: true }) limit?: number
  ): Promise<ExtendedContentNode[]> {
    if (!this.contentService) {
      throw new Error(
        'Content service not available - use ContentClassificationModule.forRoot() with databaseProvider'
      );
    }
    return this.contentService.getRelatedContent(id, limit);
  }

  @Mutation(() => ContentType)
  async createContent(
    @Args('input') input: ContentCreateInputType
  ): Promise<ExtendedContentNode> {
    if (!this.contentService) {
      throw new Error(
        'Content service not available - use ContentClassificationModule.forRoot() with databaseProvider'
      );
    }
    return this.contentService.createContent(input);
  }

  @Mutation(() => ContentType)
  async updateContent(
    @Args('id') id: string,
    @Args('input') input: ContentUpdateInputType
  ): Promise<ExtendedContentNode> {
    if (!this.contentService) {
      throw new Error(
        'Content service not available - use ContentClassificationModule.forRoot() with databaseProvider'
      );
    }
    return this.contentService.updateContent(id, input);
  }

  @Mutation(() => Boolean)
  async deleteContent(@Args('id') id: string): Promise<boolean> {
    if (!this.contentService) {
      throw new Error(
        'Content service not available - use ContentClassificationModule.forRoot() with databaseProvider'
      );
    }
    return this.contentService.deleteContent(id);
  }

  @Mutation(() => ContentType)
  async updateEngagementMetrics(
    @Args('id') id: string,
    @Args('metrics') metrics: ContentUpdateInputType['engagementMetrics']
  ): Promise<ExtendedContentNode> {
    if (!this.contentService) {
      throw new Error(
        'Content service not available - use ContentClassificationModule.forRoot() with databaseProvider'
      );
    }
    return this.contentService.updateContent(id, {
      engagementMetrics: metrics,
    });
  }
}
