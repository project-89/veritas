export interface MyceliumNode {
  id: string;
  narrativeId: string;
  content: string;
  timestamp: Date;
  strength: number; // 0-1, how strong this narrative point is
  position?: {
    x: number;
    y: number;
    z: number;
  };
  connections: string[]; // IDs of connected nodes
  type: 'root' | 'branch' | 'leaf';
  metrics: {
    influence: number; // How much this node influences others
    growth: number; // Growth rate of this narrative point
    color: string; // Visual color for the node
  };
}

export interface MyceliumBranch {
  id: string;
  sourceId: string; // ID of the source node
  targetId: string; // ID of the target node
  strength: number; // 0-1, strength of the connection
  type: 'primary' | 'secondary' | 'tertiary';
  metrics: {
    width: number; // Visual width of the branch
    color: string; // Visual color for the branch
    age: number; // How old/established this connection is
  };
}

export interface NarrativeCluster {
  id: string;
  name: string;
  description: string;
  color: string;
  nodes: string[]; // IDs of nodes in this cluster
  centralNodeId: string; // ID of the central/most important node
  metrics: {
    cohesion: number; // How tightly connected the cluster is
    influence: number; // Overall influence of this cluster
    growth: number; // Growth rate of this cluster
  };
}

export interface MyceliumData {
  nodes: MyceliumNode[];
  branches: MyceliumBranch[];
  clusters: NarrativeCluster[];
  metadata: {
    timestamp: Date;
    totalStrength: number;
    dominantClusterId: string;
    timeframe: {
      start: Date;
      end: Date;
    };
  };
}

export interface MyceliumVisualizationProps {
  data: MyceliumData;
  width?: number;
  height?: number;
  depth?: number; // For 3D visualization
  onNodeClick?: (node: MyceliumNode) => void;
  onClusterClick?: (cluster: NarrativeCluster) => void;
  showLabels?: boolean;
  animate?: boolean;
  perspective?: number; // 0-1, controls 3D perspective intensity
  colorScheme?: string[];
}
