export interface NarrativePoint {
  timestamp: Date;
  strength: number; // 0-1, representing narrative strength at this point in time
}

export interface ConsensusBand {
  id: string;
  name: string;
  description: string;
  color: string;
  timePoints: Date[]; // Array of time points for the x-axis
  strengthValues: number[]; // Corresponding strength values at each time point
  metrics: {
    stability: number; // 0-1, how stable the consensus is over time
    confidence: number; // 0-1, confidence in the consensus measurement
    diversity: number; // 0-1, diversity of sources supporting this consensus
  };
}

export interface NarrativeBranch {
  id: string;
  name: string;
  description: string;
  color: string;
  parentId: string | null; // null if branching from consensus, otherwise ID of parent branch
  emergencePoint: Date; // When this branch emerged
  terminationPoint?: Date; // When this branch ended (if applicable)
  timePoints: Date[]; // Array of time points for the x-axis
  strengthValues: number[]; // Corresponding strength values at each time point
  divergenceValues: number[]; // How far from consensus at each time point (0-1)
  metrics: {
    peakStrength: number; // Maximum strength achieved
    longevity: number; // Duration in days
    volatility: number; // How much the strength fluctuates
    influence: number; // How much this branch influenced other narratives
  };
  sources: Array<{
    id: string;
    name: string;
    weight: number; // Contribution to this narrative
  }>;
  events: Array<{
    id: string;
    timestamp: Date;
    description: string;
    impact: number; // How much this event affected the narrative
  }>;
}

export interface NarrativeConnection {
  id: string;
  sourceId: string; // ID of source branch
  targetId: string; // ID of target branch
  timestamp: Date; // When the connection formed
  strength: number; // 0-1, strength of connection
  type: 'merge' | 'split' | 'influence' | 'conflict';
  description: string;
}

export interface NarrativeFlowData {
  timeframe: {
    start: Date;
    end: Date;
  };
  consensus: ConsensusBand;
  branches: NarrativeBranch[];
  connections: NarrativeConnection[];
  metadata: {
    title: string;
    description: string;
    topics: string[];
    sources: number; // Total number of sources analyzed
    timestamp: Date; // When this analysis was generated
  };
}

export interface NarrativeFlowVisualizationProps {
  data: NarrativeFlowData;
  width?: number;
  height?: number;
  onBranchClick?: (branch: NarrativeBranch) => void;
  onConnectionClick?: (connection: NarrativeConnection) => void;
  showLabels?: boolean;
  showEvents?: boolean;
  animate?: boolean;
  timeWindow?: {
    start: Date;
    end: Date;
  }; // To view a specific time window
  highlightBranchIds?: string[]; // IDs of branches to highlight
  colorScheme?: string[];
  interactive?: boolean;
}
