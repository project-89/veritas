import { Field, ObjectType, Float } from '@nestjs/graphql';
import { ContentNode } from '@veritas/shared';
import { ContentClassification } from '../services/content-classification.service';

@ObjectType('ContentNode')
export class ContentNodeType implements ContentNode {
  @Field()
  id: string;

  @Field()
  text: string;

  @Field()
  timestamp: Date;

  @Field()
  platform: 'twitter' | 'facebook' | 'reddit' | 'other';

  @Field(() => Float, { nullable: true })
  toxicity?: number;

  @Field(() => String, { nullable: true })
  sentiment?: 'positive' | 'negative' | 'neutral';

  @Field(() => [String], { nullable: true })
  categories?: string[];

  @Field(() => [String], { nullable: true })
  topics?: string[];

  @Field(() => String, { nullable: true })
  sourceId?: string;

  @Field(() => Object, { nullable: true })
  metadata?: Record<string, any>;

  @Field(() => Object, { nullable: true })
  classification?: ContentClassification;
}
