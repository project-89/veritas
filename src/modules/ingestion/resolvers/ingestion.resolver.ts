import { Resolver, Mutation, Args } from "@nestjs/graphql";
import { ContentStorageService } from "../content-storage.service";
import { ContentNode, SourceNode } from "@/schemas/base.schema";
import { ContentType } from "@/modules/content/types/content.types";
import { SourceType } from "@/modules/sources/types/source.types";
import {
  ContentIngestionInput,
  SourceIngestionInput,
  VerificationStatus,
} from "../types/ingestion.types";
import { ContentClassificationService } from "@/modules/content/services/content-classification.service";

@Resolver()
export class IngestionResolver {
  constructor(
    private readonly storageService: ContentStorageService,
    private readonly classificationService: ContentClassificationService
  ) {}

  private mapVerificationStatus(
    status: VerificationStatus
  ): "verified" | "unverified" | "suspicious" {
    return status.toLowerCase() as "verified" | "unverified" | "suspicious";
  }

  @Mutation(() => ContentType)
  async ingestContent(
    @Args("content") content: ContentIngestionInput,
    @Args("source") source: SourceIngestionInput
  ): Promise<ContentNode> {
    // Get classification results
    const classification = await this.classificationService.classifyContent(
      content.text
    );

    const contentNode: ContentNode = {
      id: crypto.randomUUID(),
      text: content.text,
      timestamp: new Date(),
      platform: content.platform,
      toxicity: classification.toxicity,
      sentiment: classification.sentiment,
      categories: classification.categories,
      topics: classification.topics,
      engagementMetrics: content.engagementMetrics,
      metadata: content.metadata,
    };

    const sourceNode: SourceNode = {
      id: crypto.randomUUID(),
      name: source.name,
      platform: source.platform,
      credibilityScore: source.credibilityScore,
      verificationStatus: this.mapVerificationStatus(source.verificationStatus),
      metadata: source.metadata,
    };

    const result = await this.storageService.ingestContent(
      contentNode,
      sourceNode
    );
    return result.contentNode;
  }

  @Mutation(() => SourceType)
  async verifySource(
    @Args("sourceId") sourceId: string,
    @Args("status") status: VerificationStatus
  ): Promise<SourceNode> {
    return this.storageService.verifySource(
      sourceId,
      this.mapVerificationStatus(status)
    );
  }
}
