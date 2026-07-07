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

export class TimeFrame {
  start!: Date;

  end!: Date;
}

export class TimeFrameInput {
  start!: Date;

  end!: Date;
}

export class Pattern {
  id!: string;

  type!: 'organic' | 'coordinated' | 'automated';

  confidence!: number;

  nodes!: string[];

  edges!: string[];

  timeframe!: TimeFrame;
}

export class DeviationMetrics {
  baselineScore!: number;

  deviationMagnitude!: number;

  propagationVelocity!: number;

  crossReferenceScore!: number;

  sourceCredibility!: number;

  impactScore!: number;

  timeframe!: TimeFrame;
}

export class ContentMetadata {
  reach?: number;

  links?: string[];

  media?: string[];

  verified?: boolean;
}

export class ExtendedContentNode implements ContentNode {
  id!: string;

  text!: string;

  // Required fields from ContentNode
  title = '';
  content = '';
  createdAt: Date = new Date();
  updatedAt: Date = new Date();

  timestamp!: Date;

  platform!: 'twitter' | 'facebook' | 'reddit' | 'other';

  sourceId = '';

  toxicity?: number;

  sentiment?: 'positive' | 'negative' | 'neutral';

  categories?: string[];

  topics?: string[];

  metadata?: ContentMetadata;

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
