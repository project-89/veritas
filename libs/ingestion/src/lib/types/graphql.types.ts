import { Field, ObjectType, Float } from '@nestjs/graphql';

/**
 * GraphQL type for sentiment analysis
 */
@ObjectType()
export class SentimentAnalysisType {
  @Field(() => Float)
  score: number;

  @Field()
  label: string;

  @Field(() => Float)
  confidence: number;
}

/**
 * GraphQL type for entity
 */
@ObjectType()
export class EntityType {
  @Field()
  name: string;

  @Field()
  type: string;

  @Field(() => Float)
  relevance: number;
}

/**
 * GraphQL type for engagement metrics
 */
@ObjectType()
export class EngagementType {
  @Field(() => Float)
  total: number;

  @Field(() => Object)
  breakdown: Record<string, number>;
}

/**
 * GraphQL type for narrative insight
 * This is the anonymized result from transform-on-ingest
 */
@ObjectType('NarrativeInsight')
export class NarrativeInsightType {
  @Field()
  id: string;

  @Field()
  contentHash: string;

  @Field()
  sourceHash: string;

  @Field()
  platform: string;

  @Field()
  timestamp: Date;

  @Field(() => [String])
  themes: string[];

  @Field(() => [EntityType])
  entities: EntityType[];

  @Field(() => SentimentAnalysisType)
  sentiment: SentimentAnalysisType;

  @Field(() => EngagementType)
  engagement: EngagementType;

  @Field(() => Float)
  narrativeScore: number;

  @Field()
  processedAt: Date;

  @Field()
  expiresAt: Date;
}

/**
 * GraphQL type for platform distribution
 */
@ObjectType()
export class PlatformDistributionType {
  @Field(() => Object)
  distribution: Record<string, number>;
}

/**
 * GraphQL type for narrative trend
 * Represents anonymized aggregated trend data
 */
@ObjectType('NarrativeTrend')
export class NarrativeTrendType {
  @Field()
  id: string;

  @Field()
  timeframe: string;

  @Field()
  primaryTheme: string;

  @Field(() => [String])
  relatedThemes: string[];

  @Field(() => Float)
  insightCount: number;

  @Field(() => Float)
  uniqueSourcesCount: number;

  @Field(() => Float)
  sentimentTrend: number;

  @Field(() => Object)
  platformDistribution: Record<string, number>;

  @Field(() => Float)
  narrativeScore: number;

  @Field()
  detectedAt: Date;
}
