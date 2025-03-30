import { Field, ObjectType, Float } from '@nestjs/graphql';

/**
 * GraphQL type for sentiment analysis
 */
@ObjectType()
export class SentimentAnalysisType {
  @Field(() => Float)
  score = 0.0;

  @Field()
  label = 'neutral';

  @Field(() => Float)
  confidence = 0.0;
}

/**
 * GraphQL type for entity
 */
@ObjectType()
export class EntityType {
  @Field()
  name = '';

  @Field()
  type = '';

  @Field(() => Float)
  relevance = 0.0;
}

/**
 * GraphQL type for engagement metrics
 */
@ObjectType()
export class EngagementType {
  @Field(() => Float)
  total = 0;

  @Field(() => Object)
  breakdown: Record<string, number> = {};
}

/**
 * GraphQL type for narrative insight
 * This is the anonymized result from transform-on-ingest
 */
@ObjectType('NarrativeInsight')
export class NarrativeInsightType {
  @Field()
  id = '';

  @Field()
  contentHash = '';

  @Field()
  sourceHash = '';

  @Field()
  platform = '';

  @Field()
  timestamp: Date = new Date();

  @Field(() => [String])
  themes: string[] = [];

  @Field(() => [EntityType])
  entities: EntityType[] = [];

  @Field(() => SentimentAnalysisType)
  sentiment: SentimentAnalysisType = new SentimentAnalysisType();

  @Field(() => EngagementType)
  engagement: EngagementType = new EngagementType();

  @Field(() => Float)
  narrativeScore = 0.0;

  @Field()
  processedAt: Date = new Date();

  @Field()
  expiresAt: Date = new Date();
}

/**
 * GraphQL type for platform distribution
 */
@ObjectType()
export class PlatformDistributionType {
  @Field(() => Object)
  distribution: Record<string, number> = {};
}

/**
 * GraphQL type for narrative trend
 * Represents anonymized aggregated trend data
 */
@ObjectType('NarrativeTrend')
export class NarrativeTrendType {
  @Field()
  id = '';

  @Field()
  timeframe = '';

  @Field()
  primaryTheme = '';

  @Field(() => [String])
  relatedThemes: string[] = [];

  @Field(() => Float)
  insightCount = 0;

  @Field(() => Float)
  uniqueSourcesCount = 0;

  @Field(() => Float)
  sentimentTrend = 0.0;

  @Field(() => Object)
  platformDistribution: Record<string, number> = {};

  @Field(() => Float)
  narrativeScore = 0.0;

  @Field()
  detectedAt: Date = new Date();
}
