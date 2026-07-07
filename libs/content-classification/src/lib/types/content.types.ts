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

export class EngagementMetricsType {
  likes!: number;

  shares!: number;

  comments!: number;

  reach!: number;
}

export class EngagementMetricsInputType {
  likes?: number;

  shares?: number;

  comments?: number;

  reach?: number;
}

export class ContentClassificationType {
  categories!: string[];

  sentiment!: string;

  toxicity!: number;

  subjectivity!: number;

  language!: string;

  topics!: string[];

  entities!: Array<{ text: string; type: string; confidence: number }>;
}

export class EntityType {
  text!: string;

  type!: string;

  confidence!: number;
}

export class ContentType {
  id!: string;

  text!: string;

  timestamp!: Date;

  platform!: string;

  engagementMetrics!: EngagementMetricsType;

  classification!: ContentClassificationType;

  metadata?: Record<string, unknown>;

  createdAt!: Date;

  updatedAt!: Date;
}

export class ContentCreateInputType {
  text!: string;

  timestamp!: Date;

  platform!: string;

  sourceId!: string;

  metadata?: Record<string, unknown>;
}

export class ContentUpdateInputType {
  text?: string;

  metadata?: Record<string, unknown>;

  engagementMetrics?: EngagementMetricsInputType;
}

export class ContentSearchParamsType {
  query?: string;

  platform?: string;

  startDate?: Date;

  endDate?: Date;

  sourceId?: string;

  limit?: number;

  offset?: number;
}

/**
 * Input type for semantic search that extends regular content search
 */
export class SemanticSearchParamsType extends ContentSearchParamsType {
  /** Semantic query text for vector similarity search */
  semanticQuery!: string;

  /** Minimum similarity score threshold (0-1) */
  minScore?: number;
}

/**
 * Object type for content with similarity score
 */
export class SimilarContentResultType {
  content!: ContentType;

  /** Similarity score between 0-1 */
  score!: number;
}
