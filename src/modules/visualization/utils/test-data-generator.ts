import {
  NetworkGraph,
  NetworkNode,
  NetworkEdge,
} from "../services/visualization.service";
import { v4 as uuidv4 } from "uuid";

// Constants for test data generation
const PLATFORMS = ["twitter", "facebook", "reddit", "other"] as const;
const TOPICS = [
  "politics",
  "technology",
  "health",
  "science",
  "entertainment",
  "sports",
] as const;
const SOURCE_TYPES = [
  "news_outlet",
  "journalist",
  "expert",
  "organization",
] as const;

interface TestDataOptions {
  nodeCount?: number;
  edgeDensity?: number; // 0-1, percentage of possible edges to create
  timeframe?: {
    start: Date;
    end: Date;
  };
}

export function generateTestData(options: TestDataOptions = {}): NetworkGraph {
  const {
    nodeCount = 100,
    edgeDensity = 0.1,
    timeframe = {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      end: new Date(),
    },
  } = options;

  // Generate nodes
  const nodes: NetworkNode[] = [];
  const contentNodes = generateContentNodes(Math.floor(nodeCount * 0.6));
  const sourceNodes = generateSourceNodes(Math.floor(nodeCount * 0.3));
  const accountNodes = generateAccountNodes(Math.floor(nodeCount * 0.1));
  nodes.push(...contentNodes, ...sourceNodes, ...accountNodes);

  // Generate edges
  const edges = generateEdges(nodes, edgeDensity, timeframe);

  return {
    nodes,
    edges,
    metadata: {
      timestamp: new Date(),
      nodeCount: nodes.length,
      edgeCount: edges.length,
      density: calculateNetworkDensity(nodes.length, edges.length),
    },
  };
}

function generateContentNodes(count: number): NetworkNode[] {
  return Array.from({ length: count }, () => {
    const impact = Math.random();
    return {
      id: uuidv4(),
      type: "content",
      label: `Content ${Math.floor(Math.random() * 1000)}`,
      properties: {
        platform: PLATFORMS[Math.floor(Math.random() * PLATFORMS.length)],
        topic: TOPICS[Math.floor(Math.random() * TOPICS.length)],
        sentiment: Math.random() > 0.5 ? "positive" : "negative",
        timestamp: new Date(
          Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000
        ),
      },
      metrics: {
        size: 10 + impact * 20, // Size based on impact
        color: getContentColor(impact),
        weight: impact,
      },
    };
  });
}

function generateSourceNodes(count: number): NetworkNode[] {
  return Array.from({ length: count }, () => {
    const credibility = Math.random();
    const sourceType =
      SOURCE_TYPES[Math.floor(Math.random() * SOURCE_TYPES.length)];
    return {
      id: uuidv4(),
      type: "source",
      label: `${sourceType.replace("_", " ")} ${Math.floor(Math.random() * 100)}`,
      properties: {
        type: sourceType,
        verificationStatus: getVerificationStatus(credibility),
        platform: PLATFORMS[Math.floor(Math.random() * PLATFORMS.length)],
      },
      metrics: {
        size: 15 + credibility * 25, // Larger than content nodes
        color: getSourceColor(credibility),
        weight: credibility,
      },
    };
  });
}

function generateAccountNodes(count: number): NetworkNode[] {
  return Array.from({ length: count }, () => {
    const influence = Math.random();
    return {
      id: uuidv4(),
      type: "account",
      label: `Account ${Math.floor(Math.random() * 500)}`,
      properties: {
        platform: PLATFORMS[Math.floor(Math.random() * PLATFORMS.length)],
        activityLevel: Math.random(),
        automationProbability: Math.random(),
      },
      metrics: {
        size: 12 + influence * 23,
        color: getAccountColor(influence),
        weight: influence,
      },
    };
  });
}

function generateEdges(
  nodes: NetworkNode[],
  density: number,
  timeframe: { start: Date; end: Date }
): NetworkEdge[] {
  const edges: NetworkEdge[] = [];
  const maxEdges = Math.floor(
    ((nodes.length * (nodes.length - 1)) / 2) * density
  );

  const sourceNodes = nodes.filter((n) => n.type === "source");
  const contentNodes = nodes.filter((n) => n.type === "content");
  const accountNodes = nodes.filter((n) => n.type === "account");

  // Generate PUBLISHED edges (source -> content)
  sourceNodes.forEach((source) => {
    const numPublished = Math.floor(Math.random() * 5) + 1;
    for (let i = 0; i < numPublished && contentNodes.length > 0; i++) {
      const target =
        contentNodes[Math.floor(Math.random() * contentNodes.length)];
      edges.push(createEdge(source, target, "PUBLISHED"));
    }
  });

  // Generate SHARED edges (account -> content)
  accountNodes.forEach((account) => {
    const numShared = Math.floor(Math.random() * 8) + 1;
    for (let i = 0; i < numShared && contentNodes.length > 0; i++) {
      const target =
        contentNodes[Math.floor(Math.random() * contentNodes.length)];
      edges.push(createEdge(account, target, "SHARED"));
    }
  });

  // Generate INTERACTED edges (account -> account)
  accountNodes.forEach((account) => {
    const numInteractions = Math.floor(Math.random() * 3);
    for (let i = 0; i < numInteractions && accountNodes.length > 1; i++) {
      const target = accountNodes.find((a) => a.id !== account.id);
      if (target) {
        edges.push(createEdge(account, target, "INTERACTED"));
      }
    }
  });

  // Generate REFERENCED edges (content -> content)
  contentNodes.forEach((content) => {
    if (Math.random() < 0.3 && contentNodes.length > 1) {
      const target = contentNodes.find((c) => c.id !== content.id);
      if (target) {
        edges.push(createEdge(content, target, "REFERENCED"));
      }
    }
  });

  return edges.slice(0, maxEdges);
}

function createEdge(
  source: NetworkNode,
  target: NetworkNode,
  type: string
): NetworkEdge {
  const weight = Math.random();
  return {
    id: uuidv4(),
    source: source.id,
    target: target.id,
    type,
    properties: {
      timestamp: new Date(
        Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000
      ),
      weight,
    },
    metrics: {
      width: 1 + weight * 4,
      color: getEdgeColor(type, weight),
      weight,
    },
  };
}

// Utility functions for colors and calculations
function getContentColor(impact: number): string {
  if (impact > 0.7) return "#2B6CB0"; // High impact - Dark Blue
  if (impact > 0.4) return "#4299E1"; // Medium impact - Blue
  return "#90CDF4"; // Low impact - Light Blue
}

function getSourceColor(credibility: number): string {
  if (credibility > 0.7) return "#48BB78"; // High credibility - Green
  if (credibility > 0.4) return "#ECC94B"; // Medium credibility - Yellow
  return "#F56565"; // Low credibility - Red
}

function getAccountColor(influence: number): string {
  if (influence > 0.7) return "#805AD5"; // High influence - Purple
  if (influence > 0.4) return "#B794F4"; // Medium influence - Light Purple
  return "#FC8181"; // Low influence - Light Red
}

function getEdgeColor(type: string, weight: number): string {
  switch (type) {
    case "PUBLISHED":
      return `rgba(43, 108, 176, ${0.4 + weight * 0.6})`; // Blue
    case "SHARED":
      return `rgba(128, 90, 213, ${0.4 + weight * 0.6})`; // Purple
    case "INTERACTED":
      return `rgba(72, 187, 120, ${0.4 + weight * 0.6})`; // Green
    case "REFERENCED":
      return `rgba(236, 201, 75, ${0.4 + weight * 0.6})`; // Yellow
    default:
      return `rgba(160, 174, 192, ${0.4 + weight * 0.6})`; // Gray
  }
}

function getVerificationStatus(credibility: number): string {
  if (credibility > 0.7) return "verified";
  if (credibility > 0.3) return "unverified";
  return "disputed";
}

function calculateNetworkDensity(nodeCount: number, edgeCount: number): number {
  const maxPossibleEdges = (nodeCount * (nodeCount - 1)) / 2;
  return maxPossibleEdges > 0 ? edgeCount / maxPossibleEdges : 0;
}
