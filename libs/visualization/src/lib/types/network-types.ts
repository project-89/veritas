export interface NetworkNode {
  id: string;
  type: "content" | "source" | "account";
  label: string;
  properties: Record<string, unknown>; // Using unknown instead of any for better type safety
  metrics: {
    size: number;
    color: string;
    weight: number;
  };
}

export interface NetworkEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  properties: Record<string, unknown>; // Using unknown instead of any for better type safety
  metrics: {
    width: number;
    color: string;
    weight: number;
  };
}

export interface NetworkGraph {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  metadata: {
    timestamp: Date;
    nodeCount: number;
    edgeCount: number;
    density: number;
  };
} 