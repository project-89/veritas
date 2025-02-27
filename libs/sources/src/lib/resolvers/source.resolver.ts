import { Resolver, Query, Mutation, Args, Float } from "@nestjs/graphql";
import {
  SourceService,
  SourceCreateInput,
  SourceUpdateInput,
  SourceSearchParams,
} from "../services/source.service";
import { SourceNode } from "@/schemas/base.schema";
import {
  SourceType,
  SourceCreateInputType,
  SourceUpdateInputType,
  SourceSearchParamsType,
} from "../types/source.types";

@Resolver(() => SourceType)
export class SourceResolver {
  constructor(private readonly sourceService: SourceService) {}

  @Query(() => SourceType, { nullable: true })
  async source(@Args("id") id: string): Promise<SourceNode | null> {
    return this.sourceService.getSourceById(id);
  }

  @Query(() => [SourceType])
  async searchSources(
    @Args("params") params: SourceSearchParamsType
  ): Promise<SourceNode[]> {
    return this.sourceService.searchSources(params);
  }

  @Query(() => [SourceType])
  async sourceContent(
    @Args("id") id: string,
    @Args("limit", { nullable: true }) limit?: number
  ): Promise<any[]> {
    return this.sourceService.getSourceContent(id, limit);
  }

  @Mutation(() => SourceType)
  async createSource(
    @Args("input") input: SourceCreateInputType
  ): Promise<SourceNode> {
    return this.sourceService.createSource(input);
  }

  @Mutation(() => SourceType)
  async updateSource(
    @Args("id") id: string,
    @Args("input") input: SourceUpdateInputType
  ): Promise<SourceNode> {
    return this.sourceService.updateSource(id, input);
  }

  @Mutation(() => Boolean)
  async deleteSource(@Args("id") id: string): Promise<boolean> {
    return this.sourceService.deleteSource(id);
  }

  @Mutation(() => SourceType)
  async updateSourceCredibility(
    @Args("id") id: string,
    @Args("score") score: number
  ): Promise<SourceNode> {
    return this.sourceService.updateCredibilityScore(id, score);
  }

  @Query(() => Float)
  async calculateSourceCredibility(@Args("id") id: string): Promise<number> {
    return this.sourceService.calculateAggregateCredibility(id);
  }
}
