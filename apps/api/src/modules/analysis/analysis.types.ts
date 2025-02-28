import { ContentNode } from '../../schemas/base.schema';

export interface ExtendedContentNode extends ContentNode {
  relationships?: {
    type: string;
    target: string;
    properties?: Record<string, unknown>;
  }[];
  metrics?: {
    influence?: number;
    centrality?: number;
    engagement?: number;
    reach?: number;
    [key: string]: unknown;
  };
  analysis?: {
    sentiment?: number;
    topics?: string[];
    entities?: {
      name: string;
      type: string;
      confidence: number;
    }[];
    patterns?: {
      type: string;
      confidence: number;
      description?: string;
    }[];
    [key: string]: unknown;
  };
  classification?: {
    sentiment?: 'positive' | 'negative' | 'neutral';
    topics?: string[];
    language?: string;
    entities?: {
      name: string;
      type: string;
      confidence: number;
      text?: string;
    }[];
  };
}

export interface AnalysisResult {
  id: string;
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface PatternDetectionResult {
  patternType: string;
  type: string;
  confidence: number;
  nodes: string[];
  description?: string;
  evidence?: Record<string, unknown>;
}

export interface NetworkAnalysisResult {
  centrality: Record<string, number>;
  communities: Record<string, string[]>;
  density: number;
  diameter: number;
  metrics: Record<string, unknown>;
}
