import { Field, Float, ObjectType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';
import { DeviationMetrics, Pattern } from '../analysis.types';

// Define a local interface instead of importing from @veritas/shared
interface ContentNode {
  id: string;
  text: string;
  timestamp: Date;
  platform: 'twitter' | 'facebook' | 'reddit' | 'other';
  toxicity?: number;
  sentiment?: 'positive' | 'negative' | 'neutral';
  categories?: string[];
  topics?: string[];
  sourceId?: string;
  metadata?: Record<string, unknown>;
}

@ObjectType()
export class RelatedContent implements ContentNode {
  @Field()
  id!: string;

  @Field()
  text!: string;

  @Field(() => Date)
  timestamp: Date = new Date();

  @Field(() => String)
  platform: 'twitter' | 'facebook' | 'reddit' | 'other' = 'other';

  @Field(() => Float, { nullable: true })
  toxicity?: number;

  @Field(() => String, { nullable: true })
  sentiment?: 'positive' | 'negative' | 'neutral';

  @Field(() => [String], { nullable: true })
  categories?: string[];

  @Field(() => [String], { nullable: true })
  topics?: string[];

  @Field(() => String, { nullable: true })
  sourceId?: string = '';

  @Field(() => GraphQLJSON, { nullable: true })
  metadata?: Record<string, unknown>;
}

@ObjectType()
export class ContentAnalysisResult {
  @Field()
  contentId!: string;

  @Field(() => [Pattern])
  patterns: Pattern[] = [];

  @Field(() => DeviationMetrics)
  deviationMetrics!: DeviationMetrics;

  @Field(() => [RelatedContent])
  relatedContent: RelatedContent[] = [];

  @Field(() => Float)
  sourceCredibility = 0.0;

  @Field(() => Float)
  trustScore = 0.0;

  @Field(() => Date)
  analysisTimestamp: Date = new Date();
}
