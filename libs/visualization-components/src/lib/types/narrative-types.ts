export interface Node {
  id: string;
  group?: number;
  label?: string;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  [key: string]: unknown; // Using unknown instead of any for better type safety
}

export interface Link {
  source: string | Node;
  target: string | Node;
  value?: number;
  [key: string]: unknown; // Using unknown instead of any for better type safety
}

export interface GraphData {
  nodes: Node[];
  links: Link[];
}

export interface NarrativeNode extends Node {
  timestamp?: string | Date;
  content?: string;
  type?: string;
}

export interface NarrativeLink extends Link {
  type?: string;
  label?: string;
}

export interface NarrativeData extends GraphData {
  nodes: NarrativeNode[];
  links: NarrativeLink[];
} 