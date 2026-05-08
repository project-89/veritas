import { Field, Float, ObjectType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

/**
 * GraphQL type for sentiment analysis
 */
@ObjectType()
export class SentimentAnalysisType {
  @Field(() => Float)
  score = 0.0;

  @Field(() => String)
  label = 'neutral';

  @Field(() => Float)
  confidence = 0.0;
}

/**
 * GraphQL type for entity
 */
@ObjectType()
export class EntityType {
  @Field(() => String)
  name = '';

  @Field(() => String)
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

  @Field(() => GraphQLJSON, { nullable: true })
  breakdown: Record<string, number> = {};
}

/**
 * GraphQL type for narrative insight
 * This is the anonymized result from transform-on-ingest
 */
@ObjectType('NarrativeInsight')
export class NarrativeInsightType {
  @Field(() => String)
  id = '';

  @Field(() => String)
  contentHash = '';

  @Field(() => String)
  sourceHash = '';

  @Field(() => String)
  platform = '';

  @Field(() => Date)
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

  @Field(() => Date)
  processedAt: Date = new Date();

  @Field(() => Date)
  expiresAt: Date = new Date();
}

/**
 * GraphQL type for platform distribution
 */
@ObjectType()
export class PlatformDistributionType {
  @Field(() => GraphQLJSON, { nullable: true })
  distribution: Record<string, number> = {};
}

/**
 * GraphQL type for narrative trend
 * Represents anonymized aggregated trend data
 */
@ObjectType('NarrativeTrend')
export class NarrativeTrendType {
  @Field(() => String)
  id = '';

  @Field(() => String)
  timeframe = '';

  @Field(() => String)
  primaryTheme = '';

  @Field(() => [String])
  relatedThemes: string[] = [];

  @Field(() => Float)
  insightCount = 0;

  @Field(() => Float)
  uniqueSourcesCount = 0;

  @Field(() => Float)
  sentimentTrend = 0.0;

  @Field(() => GraphQLJSON, { nullable: true })
  platformDistribution: Record<string, number> = {};

  @Field(() => Float)
  narrativeScore = 0.0;

  @Field(() => Date)
  detectedAt: Date = new Date();
}
