import { Field, ObjectType, Float, Int } from '@nestjs/graphql';
// Use local ContentNode rather than importing from a problematic path
// import { ContentNode } from '../../../shared/types/src/lib/types';

// Define a local ContentNode instead of importing it
interface ContentNode {
  id: string;
  title: string;
  content: string;
  sourceId: string;
  createdAt: Date;
  updatedAt: Date;
}

@ObjectType()
export class TimeFrame {
  @Field()
  start!: Date;

  @Field()
  end!: Date;
}

@ObjectType()
export class Pattern {
  @Field()
  id!: string;

  @Field()
  type!: 'organic' | 'coordinated' | 'automated';

  @Field(() => Float)
  confidence!: number;

  @Field(() => [String])
  nodes!: string[];

  @Field(() => [String])
  edges!: string[];

  @Field(() => TimeFrame)
  timeframe!: TimeFrame;
}

@ObjectType()
export class DeviationMetrics {
  @Field(() => Float)
  baselineScore!: number;

  @Field(() => Float)
  deviationMagnitude!: number;

  @Field(() => Float)
  propagationVelocity!: number;

  @Field(() => Float)
  crossReferenceScore!: number;

  @Field(() => Float)
  sourceCredibility!: number;

  @Field(() => Float)
  impactScore!: number;

  @Field(() => TimeFrame)
  timeframe!: TimeFrame;
}

@ObjectType()
export class ContentMetadata {
  @Field(() => Int, { nullable: true })
  reach?: number;

  @Field(() => [String], { nullable: true })
  links?: string[];

  @Field(() => [String], { nullable: true })
  media?: string[];

  @Field(() => Boolean, { nullable: true })
  verified?: boolean;
}

@ObjectType()
export class ExtendedContentNode implements ContentNode {
  @Field()
  id!: string;

  @Field()
  text!: string;

  // Required fields from ContentNode
  title = '';
  content = '';
  createdAt: Date = new Date();
  updatedAt: Date = new Date();

  @Field()
  timestamp!: Date;

  @Field()
  platform!: 'twitter' | 'facebook' | 'reddit' | 'other';

  @Field(() => String, { nullable: true })
  sourceId = '';

  @Field(() => Float, { nullable: true })
  toxicity?: number;

  @Field(() => String, { nullable: true })
  sentiment?: 'positive' | 'negative' | 'neutral';

  @Field(() => [String], { nullable: true })
  categories?: string[];

  @Field(() => [String], { nullable: true })
  topics?: string[];

  @Field(() => ContentMetadata, { nullable: true })
  metadata?: ContentMetadata;

  @Field(() => Object, { nullable: true })
  classification?: {
    categories: string[];
    sentiment: 'positive' | 'negative' | 'neutral';
    toxicity: number;
    subjectivity: number;
    language: string;
    topics: string[];
    entities: Array<{
      text: string;
      type: string;
      confidence: number;
    }>;
  };
}
