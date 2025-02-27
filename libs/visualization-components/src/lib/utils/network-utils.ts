import { NetworkNode, NetworkEdge } from '../types/network-types';
import { NODE_COLORS, EDGE_COLORS, EdgeType, adjustColorOpacity } from './color-utils';

/**
 * Calculates the size of a node based on its type and properties
 * @param node The node to calculate size for
 * @returns A number representing the node size
 */
export function calculateNodeSize(node: Partial<NetworkNode> & { type: string }): number {
  let baseSize = 1;

  switch (node.type) {
    case "content": {
      // Size based on engagement metrics
      const engagement =
        ((node.properties?.likes as number) || 0) + 
        ((node.properties?.shares as number) || 0) + 
        ((node.properties?.comments as number) || 0);
      baseSize = Math.log10(engagement + 1) + 1;
      break;
    }
    case "source": {
      // Size based on credibility and activity
      baseSize = ((node.properties?.credibilityScore as number) || 0.5) * 2;
      break;
    }
    case "account": {
      // Size based on influence metrics
      const influence = (node.properties?.followers as number) || 
                        (node.properties?.connections as number) || 0;
      baseSize = Math.log10(influence + 1) + 1;
      break;
    }
  }

  // Ensure size is within reasonable bounds
  return Math.max(0.5, Math.min(baseSize, 3));
}

/**
 * Calculates the color of a node based on its type and weight
 * @param node The node to calculate color for
 * @param weight The weight of the node (0-1)
 * @returns A color string
 */
export function calculateNodeColor(node: Partial<NetworkNode> & { type: string }, weight: number): string {
  switch (node.type) {
    case "content": {
      if (weight > 0.7) return NODE_COLORS.content.highImpact;
      if (weight < 0.3) return NODE_COLORS.content.lowImpact;
      return NODE_COLORS.content.default;
    }
    case "source": {
      if ((node.properties?.verificationStatus as string) === "verified")
        return NODE_COLORS.source.verified;
      if ((node.properties?.verificationStatus as string) === "disputed")
        return NODE_COLORS.source.disputed;
      return NODE_COLORS.source.unverified;
    }
    case "account": {
      if (weight > 0.7) return NODE_COLORS.account.influential;
      if (weight < 0.3) return NODE_COLORS.account.suspicious;
      return NODE_COLORS.account.normal;
    }
    default:
      return "#000000";
  }
}

/**
 * Calculates the weight of a node based on its type and properties
 * @param node The node to calculate weight for
 * @returns A number between 0 and 1 representing the node's weight
 */
export function calculateNodeWeight(node: Partial<NetworkNode> & { type: string }): number {
  let weight = 0.5; // Default weight

  switch (node.type) {
    case "content": {
      // Weight based on engagement and credibility
      const engagement =
        ((node.properties?.likes as number) || 0) + 
        ((node.properties?.shares as number) || 0) + 
        ((node.properties?.comments as number) || 0);
      const engagementScore = Math.min(engagement / 1000, 1);
      const credibility = (node.properties?.sourceCredibility as number) || 0.5;
      weight = engagementScore * 0.6 + credibility * 0.4;
      break;
    }
    case "source": {
      // Weight based on verification status and historical accuracy
      weight =
        ((node.properties?.credibilityScore as number) || 0.5) * 0.7 +
        ((node.properties?.historicalAccuracy as number) || 0.5) * 0.3;
      break;
    }
    case "account": {
      // Weight based on activity patterns and verification
      const activityScore = (node.properties?.activityScore as number) || 0.5;
      const verificationBonus = (node.properties?.isVerified as boolean) ? 0.2 : 0;
      weight = Math.min(activityScore + verificationBonus, 1);
      break;
    }
  }

  return weight;
}

/**
 * Calculates the width of an edge based on its properties
 * @param edge The edge to calculate width for
 * @returns A number representing the edge width
 */
export function calculateEdgeWidth(edge: Partial<NetworkEdge>): number {
  // Base width on relationship strength
  const strength = (edge.properties?.strength as number) || 1;
  const frequency = (edge.properties?.frequency as number) || 1;

  // Calculate width based on relationship metrics
  const width = Math.log10(strength * frequency + 1) + 1;

  // Ensure width is within reasonable bounds
  return Math.max(0.5, Math.min(width, 3));
}

/**
 * Calculates the color of an edge based on its type and weight
 * @param edge The edge to calculate color for
 * @param weight The weight of the edge (0-1)
 * @returns A color string
 */
export function calculateEdgeColor(edge: { type: string }, weight: number): string {
  // Get base color from edge type
  const baseColor = EDGE_COLORS[edge.type as EdgeType] || "#999999";

  // If it's a weak relationship, make it more transparent
  if (weight < 0.3) {
    return adjustColorOpacity(baseColor, 0.5);
  }

  return baseColor;
}

/**
 * Calculates the weight of an edge based on its properties
 * @param edge The edge to calculate weight for
 * @returns A number between 0 and 1 representing the edge's weight
 */
export function calculateEdgeWeight(edge: Partial<NetworkEdge>): number {
  // Calculate base weight from relationship properties
  const strength = (edge.properties?.strength as number) || 1;
  const frequency = (edge.properties?.frequency as number) || 1;
  const duration = (edge.properties?.duration as number) || 1;

  // Normalize components
  const strengthScore = Math.min(strength / 10, 1);
  const frequencyScore = Math.min(frequency / 100, 1);
  const durationScore = Math.min(duration / (30 * 24 * 60 * 60), 1); // Normalize to 30 days

  // Weighted combination
  return strengthScore * 0.4 + frequencyScore * 0.4 + durationScore * 0.2;
}

/**
 * Calculates the density of a network
 * @param nodeCount Number of nodes in the network
 * @param edgeCount Number of edges in the network
 * @returns A number between 0 and 1 representing the network density
 */
export function calculateNetworkDensity(nodeCount: number, edgeCount: number): number {
  if (nodeCount <= 1) return 0;
  const maxEdges = (nodeCount * (nodeCount - 1)) / 2;
  return edgeCount / maxEdges;
} 