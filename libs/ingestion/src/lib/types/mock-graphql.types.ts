// This file provides type information for the GraphQL types
// It's a simplified version that can be imported by TypeScript

export class SentimentAnalysisType {
  score!: number;
  label!: string;
  confidence!: number;
}

export class EntityType {
  name!: string;
  type!: string;
  relevance!: number;
}

export class EngagementType {
  total!: number;
  breakdown!: Record<string, number>;
}

export class NarrativeInsightType {
  id!: string;
  contentHash!: string;
  sourceHash!: string;
  platform!: string;
  timestamp!: Date;
  themes!: string[];
  entities!: EntityType[];
  sentiment!: SentimentAnalysisType;
  engagement!: EngagementType;
  narrativeScore!: number;
  processedAt!: Date;
  expiresAt!: Date;
}

export class PlatformDistributionType {
  distribution!: Record<string, number>;
}

export class NarrativeTrendType {
  id!: string;
  timeframe!: string;
  primaryTheme!: string;
  relatedThemes!: string[];
  insightCount!: number;
  uniqueSourcesCount!: number;
  sentimentTrend!: number;
  platformDistribution!: Record<string, number>;
  narrativeScore!: number;
  detectedAt!: Date;
}
