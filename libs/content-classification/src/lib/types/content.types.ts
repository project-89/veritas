import { ObjectType, InputType, Field, ID, Float } from '@nestjs/graphql';
import { ContentClassification } from '../services/content-classification.service';

@ObjectType('EngagementMetrics')
export class EngagementMetricsType {
  @Field(() => Float)
  likes: number;

  @Field(() => Float)
  shares: number;

  @Field(() => Float)
  comments: number;

  @Field(() => Float)
  reach: number;
}

@InputType('EngagementMetricsInput')
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
  categories: string[];

  @Field()
  sentiment: string;

  @Field(() => Float)
  toxicity: number;

  @Field(() => Float)
  subjectivity: number;

  @Field()
  language: string;

  @Field(() => [String])
  topics: string[];

  @Field(() => [EntityType])
  entities: Array<{ text: string; type: string; confidence: number }>;
}

@ObjectType('Entity')
export class EntityType {
  @Field()
  text: string;

  @Field()
  type: string;

  @Field(() => Float)
  confidence: number;
}

@ObjectType('Content')
export class ContentType {
  @Field(() => ID)
  id: string;

  @Field()
  text: string;

  @Field()
  timestamp: Date;

  @Field()
  platform: string;

  @Field(() => EngagementMetricsType)
  engagementMetrics: EngagementMetricsType;

  @Field(() => ContentClassificationType)
  classification: ContentClassificationType;

  @Field(() => Object, { nullable: true })
  metadata?: Record<string, any>;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}

@InputType('ContentCreateInput')
export class ContentCreateInputType {
  @Field()
  text: string;

  @Field()
  timestamp: Date;

  @Field()
  platform: string;

  @Field()
  sourceId: string;

  @Field(() => Object, { nullable: true })
  metadata?: Record<string, any>;
}

@InputType('ContentUpdateInput')
export class ContentUpdateInputType {
  @Field({ nullable: true })
  text?: string;

  @Field(() => Object, { nullable: true })
  metadata?: Record<string, any>;

  @Field(() => EngagementMetricsInputType, { nullable: true })
  engagementMetrics?: EngagementMetricsInputType;
}

@InputType('ContentSearchParams')
export class ContentSearchParamsType {
  @Field({ nullable: true })
  query?: string;

  @Field({ nullable: true })
  platform?: string;

  @Field({ nullable: true })
  startDate?: Date;

  @Field({ nullable: true })
  endDate?: Date;

  @Field({ nullable: true })
  sourceId?: string;

  @Field(() => Float, { nullable: true })
  limit?: number;

  @Field(() => Float, { nullable: true })
  offset?: number;
}
