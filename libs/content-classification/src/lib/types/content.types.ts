import { Field, Float, ID, InputType, ObjectType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

/**
 * Interface defining the expected response structure from external NLP services
 * This matches the structure used in mapServiceResponseToClassification
 */
export interface NlpServiceResponse {
  categories?: string[];
  sentiment?: {
    score?: number;
    label?: string;
    confidence?: number;
  };
  toxicity?: number;
  subjectivity?: number;
  language?: string;
  topics?: string[];
  entities?: Array<{
    text?: string;
    type?: string;
    confidence?: number;
  }>;
}

@ObjectType('EngagementMetrics')
export class EngagementMetricsType {
  @Field(() => Float)
  likes!: number;

  @Field(() => Float)
  shares!: number;

  @Field(() => Float)
  comments!: number;

  @Field(() => Float)
  reach!: number;
}

@InputType('ContentEngagementMetricsInput')
export class EngagementMetricsInputType {
  @Field(() => Float, { nullable: true })
  likes?: number;

  @Field(() => Float, { nullable: true })
  shares?: number;

  @Field(() => Float, { nullable: true })
  comments?: number;

  @Field(() => Float, { nullable: true })
  reach?: number;
}

@ObjectType('ContentClassification')
export class ContentClassificationType {
  @Field(() => [String])
  categories!: string[];

  @Field()
  sentiment!: string;

  @Field(() => Float)
  toxicity!: number;

  @Field(() => Float)
  subjectivity!: number;

  @Field()
  language!: string;

  @Field(() => [String])
  topics!: string[];

  @Field(() => [EntityType])
  entities!: Array<{ text: string; type: string; confidence: number }>;
}

@ObjectType('Entity')
export class EntityType {
  @Field()
  text!: string;

  @Field()
  type!: string;

  @Field(() => Float)
  confidence!: number;
}

@ObjectType('Content')
export class ContentType {
  @Field(() => ID)
  id!: string;

  @Field()
  text!: string;

  @Field(() => Date)
  timestamp!: Date;

  @Field(() => String)
  platform!: string;

  @Field(() => EngagementMetricsType)
  engagementMetrics!: EngagementMetricsType;

  @Field(() => ContentClassificationType)
  classification!: ContentClassificationType;

  @Field(() => GraphQLJSON, { nullable: true })
  metadata?: Record<string, unknown>;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;
}

@InputType('ContentCreateInput')
export class ContentCreateInputType {
  @Field(() => String)
  text!: string;

  @Field(() => Date)
  timestamp!: Date;

  @Field(() => String)
  platform!: string;

  @Field(() => String)
  sourceId!: string;

  @Field(() => GraphQLJSON, { nullable: true })
  metadata?: Record<string, unknown>;
}

@InputType('ContentUpdateInput')
export class ContentUpdateInputType {
  @Field({ nullable: true })
  text?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  metadata?: Record<string, unknown>;

  @Field(() => EngagementMetricsInputType, { nullable: true })
  engagementMetrics?: EngagementMetricsInputType;
}

@InputType('ContentSearchParams')
export class ContentSearchParamsType {
  @Field({ nullable: true })
  query?: string;

  @Field({ nullable: true })
  platform?: string;

  @Field(() => Date, { nullable: true })
  startDate?: Date;

  @Field(() => Date, { nullable: true })
  endDate?: Date;

  @Field({ nullable: true })
  sourceId?: string;

  @Field(() => Float, { nullable: true })
  limit?: number;

  @Field(() => Float, { nullable: true })
  offset?: number;
}

/**
 * Input type for semantic search that extends regular content search
 */
@InputType('SemanticSearchParams')
export class SemanticSearchParamsType extends ContentSearchParamsType {
  @Field({ description: 'Semantic query text for vector similarity search' })
  semanticQuery!: string;

  @Field(() => Float, {
    nullable: true,
    description: 'Minimum similarity score threshold (0-1)',
  })
  minScore?: number;
}

/**
 * Object type for content with similarity score
 */
@ObjectType('SimilarContentResult')
export class SimilarContentResultType {
  @Field(() => ContentType)
  content!: ContentType;

  @Field(() => Float, { description: 'Similarity score between 0-1' })
  score!: number;
}
