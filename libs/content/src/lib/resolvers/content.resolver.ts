import { Resolver, Query, Mutation, Args } from "@nestjs/graphql";
import {
  ContentService,
  ContentCreateInput,
  ContentUpdateInput,
  ContentSearchParams,
} from "../services/content.service";
import { ContentNode } from "@/schemas/base.schema";
import {
  ContentType,
  ContentCreateInputType,
  ContentUpdateInputType,
  ContentSearchParamsType,
} from "../types/content.types";

@Resolver(() => ContentType)
export class ContentResolver {
  constructor(private readonly contentService: ContentService) {}

  @Query(() => ContentType, { nullable: true })
  async content(@Args("id") id: string): Promise<ContentNode | null> {
    return this.contentService.getContentById(id);
  }

  @Query(() => [ContentType])
  async searchContent(
    @Args("params") params: ContentSearchParamsType
  ): Promise<ContentNode[]> {
    return this.contentService.searchContent(params);
  }

  @Query(() => [ContentType])
  async relatedContent(
    @Args("id") id: string,
    @Args("limit", { nullable: true }) limit?: number
  ): Promise<ContentNode[]> {
    return this.contentService.getRelatedContent(id, limit);
  }

  @Mutation(() => ContentType)
  async createContent(
    @Args("input") input: ContentCreateInputType
  ): Promise<ContentNode> {
    return this.contentService.createContent(input);
  }

  @Mutation(() => ContentType)
  async updateContent(
    @Args("id") id: string,
    @Args("input") input: ContentUpdateInputType
  ): Promise<ContentNode> {
    return this.contentService.updateContent(id, input);
  }

  @Mutation(() => Boolean)
  async deleteContent(@Args("id") id: string): Promise<boolean> {
    return this.contentService.deleteContent(id);
  }

  @Mutation(() => ContentType)
  async updateEngagementMetrics(
    @Args("id") id: string,
    @Args("metrics") metrics: ContentUpdateInputType["engagementMetrics"]
  ): Promise<ContentNode> {
    return this.contentService.updateEngagementMetrics(id, metrics);
  }
}
