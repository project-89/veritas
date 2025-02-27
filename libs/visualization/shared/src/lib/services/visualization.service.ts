import { Injectable } from "@nestjs/common";
import { MemgraphService } from "@/database";
import { TimeFrame } from "@/modules/analysis/dto";

type EdgeType =
  | "PUBLISHED"
  | "SHARED"
  | "REFERENCED"
  | "INTERACTED"
  | "DISPUTED";

// Color schemes for different node types
const NODE_COLORS = {
  content: {
    default: "#4299E1", // Blue
    highImpact: "#2B6CB0", // Dark Blue
    lowImpact: "#90CDF4", // Light Blue
  },
  source: {
    verified: "#48BB78", // Green
    unverified: "#ECC94B", // Yellow
    disputed: "#F56565", // Red
  },
  account: {
    influential: "#805AD5", // Purple
    normal: "#B794F4", // Light Purple
    suspicious: "#FC8181", // Light Red
  },
};

const EDGE_COLORS: Record<EdgeType, string> = {
  PUBLISHED: "#2B6CB0", // Blue
  SHARED: "#48BB78", // Green
  REFERENCED: "#805AD5", // Purple
  INTERACTED: "#ECC94B", // Yellow
  DISPUTED: "#F56565", // Red
};

export interface NetworkNode {
  id: string;
  type: "content" | "source" | "account";
  label: string;
  properties: Record<string, any>;
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
  properties: Record<string, any>;
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

export interface TimelineEvent {
  id: string;
  timestamp: Date;
  type: string;
  content: string;
  source: string;
  impact: number;
  relatedEvents: string[];
}

@Injectable()
export class VisualizationService {
  constructor(private readonly memgraphService: MemgraphService) {}

  async getNetworkGraph(timeframe: TimeFrame): Promise<NetworkGraph> {
    const query = `
      MATCH (n)
      WHERE n.timestamp >= $startTime AND n.timestamp <= $endTime
      WITH collect(n) as nodes
      MATCH (source)-[r]->(target)
      WHERE source IN nodes AND target IN nodes
      RETURN nodes, collect({source: source, target: target, relationship: r}) as edges
    `;

    const result = await this.memgraphService.executeQuery(query, {
      startTime: timeframe.start.toISOString(),
      endTime: timeframe.end.toISOString(),
    });

    const nodes = this.transformNodes(result[0]?.nodes || []);
    const edges = this.transformEdges(result[0]?.edges || []);

    return {
      nodes,
      edges,
      metadata: {
        timestamp: new Date(),
        nodeCount: nodes.length,
        edgeCount: edges.length,
        density: this.calculateNetworkDensity(nodes.length, edges.length),
      },
    };
  }

  async getTimeline(timeframe: TimeFrame): Promise<TimelineEvent[]> {
    const query = `
      MATCH (n)
      WHERE n.timestamp >= $startTime AND n.timestamp <= $endTime
      WITH n
      ORDER BY n.timestamp
      MATCH (n)-[r]-(related)
      RETURN n, collect(related) as relatedNodes
    `;

    const result = await this.memgraphService.executeQuery(query, {
      startTime: timeframe.start.toISOString(),
      endTime: timeframe.end.toISOString(),
    });

    return result.map((row) =>
      this.transformToTimelineEvent(row.n, row.relatedNodes)
    );
  }

  private transformNodes(nodes: any[]): NetworkNode[] {
    return nodes.map((node) => ({
      id: node.id,
      type: this.determineNodeType(node),
      label: node.name || node.title || node.id,
      properties: this.extractNodeProperties(node),
      metrics: this.calculateNodeMetrics(node),
    }));
  }

  private transformEdges(edges: any[]): NetworkEdge[] {
    return edges.map((edge) => ({
      id: `${edge.source.id}-${edge.target.id}`,
      source: edge.source.id,
      target: edge.target.id,
      type: edge.relationship.type,
      properties: this.extractEdgeProperties(edge.relationship),
      metrics: this.calculateEdgeMetrics(edge.relationship),
    }));
  }

  private determineNodeType(node: any): "content" | "source" | "account" {
    if (node.hasOwnProperty("text")) return "content";
    if (node.hasOwnProperty("credibilityScore")) return "source";
    return "account";
  }

  private extractNodeProperties(node: any): Record<string, any> {
    const { id, timestamp, ...properties } = node;
    return properties;
  }

  private extractEdgeProperties(edge: any): Record<string, any> {
    const { type, ...properties } = edge;
    return properties;
  }

  private calculateNodeMetrics(node: any): NetworkNode["metrics"] {
    const size = this.calculateNodeSize(node);
    const weight = this.calculateNodeWeight(node);
    const color = this.calculateNodeColor(node, weight);

    return { size, color, weight };
  }

  private calculateEdgeMetrics(edge: any): NetworkEdge["metrics"] {
    const width = this.calculateEdgeWidth(edge);
    const weight = this.calculateEdgeWeight(edge);
    const color = this.calculateEdgeColor(edge, weight);

    return { width, color, weight };
  }

  private calculateNodeSize(node: any): number {
    const type = this.determineNodeType(node);
    let baseSize = 1;

    switch (type) {
      case "content":
        // Size based on engagement metrics
        const engagement =
          (node.likes || 0) + (node.shares || 0) + (node.comments || 0);
        baseSize = Math.log10(engagement + 1) + 1;
        break;
      case "source":
        // Size based on credibility and activity
        baseSize = (node.credibilityScore || 0.5) * 2;
        break;
      case "account":
        // Size based on influence metrics
        const influence = node.followers || node.connections || 0;
        baseSize = Math.log10(influence + 1) + 1;
        break;
    }

    // Ensure size is within reasonable bounds
    return Math.max(0.5, Math.min(baseSize, 3));
  }

  private calculateNodeColor(node: any, weight: number): string {
    const type = this.determineNodeType(node);

    switch (type) {
      case "content":
        if (weight > 0.7) return NODE_COLORS.content.highImpact;
        if (weight < 0.3) return NODE_COLORS.content.lowImpact;
        return NODE_COLORS.content.default;

      case "source":
        if (node.verificationStatus === "verified")
          return NODE_COLORS.source.verified;
        if (node.verificationStatus === "disputed")
          return NODE_COLORS.source.disputed;
        return NODE_COLORS.source.unverified;

      case "account":
        if (weight > 0.7) return NODE_COLORS.account.influential;
        if (weight < 0.3) return NODE_COLORS.account.suspicious;
        return NODE_COLORS.account.normal;

      default:
        return "#000000";
    }
  }

  private calculateNodeWeight(node: any): number {
    const type = this.determineNodeType(node);
    let weight = 0.5; // Default weight

    switch (type) {
      case "content":
        // Weight based on engagement and credibility
        const engagement =
          (node.likes || 0) + (node.shares || 0) + (node.comments || 0);
        const engagementScore = Math.min(engagement / 1000, 1);
        const credibility = node.sourceCredibility || 0.5;
        weight = engagementScore * 0.6 + credibility * 0.4;
        break;

      case "source":
        // Weight based on verification status and historical accuracy
        weight =
          (node.credibilityScore || 0.5) * 0.7 +
          (node.historicalAccuracy || 0.5) * 0.3;
        break;

      case "account":
        // Weight based on activity patterns and verification
        const activityScore = node.activityScore || 0.5;
        const verificationBonus = node.isVerified ? 0.2 : 0;
        weight = Math.min(activityScore + verificationBonus, 1);
        break;
    }

    return weight;
  }

  private calculateEdgeWidth(edge: any): number {
    // Base width on relationship strength
    const strength = edge.strength || 1;
    const frequency = edge.frequency || 1;

    // Calculate width based on relationship metrics
    const width = Math.log10(strength * frequency + 1) + 1;

    // Ensure width is within reasonable bounds
    return Math.max(0.5, Math.min(width, 3));
  }

  private calculateEdgeColor(edge: { type: string }, weight: number): string {
    // Get base color from edge type
    const baseColor = EDGE_COLORS[edge.type as EdgeType] || "#999999";

    // If it's a weak relationship, make it more transparent
    if (weight < 0.3) {
      return this.adjustColorOpacity(baseColor, 0.5);
    }

    return baseColor;
  }

  private calculateEdgeWeight(edge: any): number {
    // Calculate base weight from relationship properties
    const strength = edge.strength || 1;
    const frequency = edge.frequency || 1;
    const duration = edge.duration || 1;

    // Normalize components
    const strengthScore = Math.min(strength / 10, 1);
    const frequencyScore = Math.min(frequency / 100, 1);
    const durationScore = Math.min(duration / (30 * 24 * 60 * 60), 1); // Normalize to 30 days

    // Weighted combination
    return strengthScore * 0.4 + frequencyScore * 0.4 + durationScore * 0.2;
  }

  private calculateNetworkDensity(
    nodeCount: number,
    edgeCount: number
  ): number {
    if (nodeCount <= 1) return 0;
    const maxEdges = (nodeCount * (nodeCount - 1)) / 2;
    return edgeCount / maxEdges;
  }

  private transformToTimelineEvent(
    node: any,
    relatedNodes: any[]
  ): TimelineEvent {
    return {
      id: node.id,
      timestamp: new Date(node.timestamp),
      type: this.determineNodeType(node),
      content: node.text || node.name || "",
      source: node.source || "",
      impact: this.calculateImpact(node),
      relatedEvents: relatedNodes.map((related) => related.id),
    };
  }

  private calculateImpact(node: any): number {
    const type = this.determineNodeType(node);
    let impact = 0.5; // Default impact

    switch (type) {
      case "content":
        // Impact based on engagement, reach, and source credibility
        const engagement =
          (node.likes || 0) + (node.shares || 0) + (node.comments || 0);
        const reach = node.reach || engagement * 2;
        const sourceCredibility = node.sourceCredibility || 0.5;

        const engagementScore = Math.min(engagement / 1000, 1);
        const reachScore = Math.min(reach / 10000, 1);

        impact =
          engagementScore * 0.4 + reachScore * 0.3 + sourceCredibility * 0.3;
        break;

      case "source":
        // Impact based on credibility and influence
        impact =
          (node.credibilityScore || 0.5) * 0.6 +
          (node.influenceScore || 0.5) * 0.4;
        break;

      case "account":
        // Impact based on activity and reach
        const activityScore = node.activityScore || 0.5;
        const followersScore = Math.min((node.followers || 0) / 10000, 1);
        impact = activityScore * 0.5 + followersScore * 0.5;
        break;
    }

    return Math.max(0, Math.min(impact, 1));
  }

  private adjustColorOpacity(color: string, opacity: number): string {
    // Convert hex to rgba
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
}
