import { Field, ObjectType, Float } from "@nestjs/graphql";
import { Pattern, DeviationMetrics } from "../analysis.types";
import { ContentNode } from "@/schemas/base.schema";

@ObjectType()
export class RelatedContent implements ContentNode {
  @Field()
  id: string;

  @Field()
  text: string;

  @Field()
  timestamp: Date;

  @Field()
  platform: "twitter" | "facebook" | "reddit" | "other";

  @Field(() => Float, { nullable: true })
  toxicity?: number;

  @Field(() => String, { nullable: true })
  sentiment?: "positive" | "negative" | "neutral";

  @Field(() => [String], { nullable: true })
  categories?: string[];

  @Field(() => [String], { nullable: true })
  topics?: string[];

  @Field(() => String, { nullable: true })
  sourceId?: string;

  @Field(() => Object, { nullable: true })
  metadata?: Record<string, any>;
}

@ObjectType()
export class ContentAnalysisResult {
  @Field()
  contentId: string;

  @Field(() => [Pattern])
  patterns: Pattern[];

  @Field(() => DeviationMetrics)
  deviationMetrics: DeviationMetrics;

  @Field(() => [RelatedContent])
  relatedContent: RelatedContent[];

  @Field(() => Float)
  sourceCredibility: number;

  @Field(() => Float)
  trustScore: number;

  @Field()
  analysisTimestamp: Date;
}
