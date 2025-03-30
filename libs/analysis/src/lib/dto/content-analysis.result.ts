import { Field, ObjectType, Float } from '@nestjs/graphql';
import { Pattern, DeviationMetrics } from '../analysis.types';

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
  metadata?: Record<string, any>;
}

@ObjectType()
export class RelatedContent implements ContentNode {
  @Field()
  id!: string;

  @Field()
  text!: string;

  @Field()
  timestamp: Date = new Date();

  @Field()
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

  @Field(() => Object, { nullable: true })
  metadata?: Record<string, any>;
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

  @Field()
  analysisTimestamp: Date = new Date();
}
