export interface EnhancedTunnelNode {
  id: string;
  narrativeId: string;
  content: string;
  timestamp: Date;
  position: {
    x: number;
    y: number;
    z: number;
  };
  metrics: {
    strength: number;
    relevance: number;
    consensus: number;
  };
  connections: string[];
  branchFactor: number;
  isConsensus: boolean;
}

export interface EnhancedTunnelBranch {
  id: string;
  sourceId: string;
  targetId: string;
  narrativeId: string;
  strength: number;
  metrics: {
    consensus: number;
    traffic: number;
  };
}

export interface EnhancedTunnelNarrative {
  id: string;
  name: string;
  description: string;
  color: string;
  metrics: {
    strength: number;
    coherence: number;
  };
}

export interface EnhancedTunnelData {
  nodes: EnhancedTunnelNode[];
  branches: EnhancedTunnelBranch[];
  narratives: EnhancedTunnelNarrative[];
  timeframe: {
    start: Date;
    end: Date;
  };
  metadata: {
    title: string;
    description: string;
    timestamp: Date;
  };
}

export interface EnhancedTunnelVisualizationProps {
  data?: EnhancedTunnelData;
  width?: number;
  height?: number;
  depth?: number;
  perspective?: number;
  onNodeClick?: (node: EnhancedTunnelNode) => void;
  onBranchClick?: (branch: EnhancedTunnelBranch) => void;
  showLabels?: boolean;
  interactive?: boolean;
  highlightConsensus?: boolean;
  colorScheme?: string;
}
