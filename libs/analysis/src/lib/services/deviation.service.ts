import { Injectable, Logger } from '@nestjs/common';
import type { AnalyzedNarrative } from './narrative-analysis.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NarrativeDeviation {
  narrativeId: string;
  summary: string;
  /** 0-1, cosine distance from consensus centroid */
  deviationMagnitude: number;
  /** Posts per hour from velocity metrics */
  propagationVelocity: number;
  /** 0-1, fraction of known platforms carrying this narrative */
  crossReferenceScore: number;
  /** 0-1, average influence score of authors (approx by post count weight) */
  sourceCredibility: number;
  /** 0-1, weighted composite of all metrics */
  impactScore: number;
  /** Cluster size */
  postCount: number;
  /** Whether this is the consensus narrative */
  isConsensus: boolean;
}

/** Matches RealityTunnelVisualization.tsx interface */
export interface RealityTunnelNode {
  id: string;
  content: string;
  timestamp: Date;
  deviationScore: number;
  strength: number;
  tunnelId: string;
  parentId?: string;
}

export interface RealityTunnel {
  id: string;
  name: string;
  color: string;
  nodes: RealityTunnelNode[];
  isConsensus: boolean;
}

/** Matches enhanced-tunnel-types.ts interfaces */
export interface EnhancedTunnelNode {
  id: string;
  narrativeId: string;
  content: string;
  timestamp: Date;
  position: { x: number; y: number; z: number };
  metrics: { strength: number; relevance: number; consensus: number };
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
  metrics: { consensus: number; traffic: number };
}

export interface EnhancedTunnelNarrative {
  id: string;
  name: string;
  description: string;
  color: string;
  metrics: { strength: number; coherence: number };
}

export interface EnhancedTunnelData {
  nodes: EnhancedTunnelNode[];
  branches: EnhancedTunnelBranch[];
  narratives: EnhancedTunnelNarrative[];
  timeframe: { start: Date; end: Date };
  metadata: { title: string; description: string; timestamp: Date };
}

/** A raw post shape matching what the controller receives */
export interface RawPost {
  id: string;
  text: string;
  platform: string;
  authorName: string;
  authorHandle: string;
  timestamp: string;
  engagement?: { likes: number; shares: number; comments: number };
}

/** Combined response from the deviations endpoint */
export interface DeviationResponse {
  deviations: NarrativeDeviation[];
  realityTunnel: RealityTunnel[];
  enhancedTunnel: EnhancedTunnelData;
}

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------

const TUNNEL_COLORS = [
  '#2B6CB0', // consensus blue
  '#48BB78', '#F56565', '#805AD5', '#ECC94B',
  '#38A169', '#E53E3E', '#6B46C1', '#D69E2E',
  '#90CDF4', '#FC8181', '#B794F4', '#68D391',
];

const KNOWN_PLATFORMS = ['twitter', 'reddit', 'youtube', 'facebook', 'tiktok'];

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class DeviationService {
  private readonly logger = new Logger(DeviationService.name);

  /**
   * Given analyzed narratives (with centroid embeddings), compute deviation metrics.
   *
   * Consensus = weighted average of all centroids (weighted by cluster size).
   * Deviation = cosine distance from consensus centroid for each narrative.
   */
  computeDeviations(narratives: AnalyzedNarrative[]): NarrativeDeviation[] {
    if (narratives.length === 0) return [];

    const consensusCentroid = this.computeConsensusCentroid(narratives);
    const totalPosts = narratives.reduce((s, n) => s + n.postIndices.length, 0);

    return narratives.map((narrative, idx) => {
      const deviationMagnitude =
        1 - this.cosineSimilarity(narrative.centroidEmbedding, consensusCentroid);

      const propagationVelocity = Math.min(narrative.velocity.postsPerHour / 10, 1);

      const platformCount = Object.keys(narrative.platforms).length;
      const crossReferenceScore = Math.min(platformCount / KNOWN_PLATFORMS.length, 1);

      // Source credibility: approximate by diversity of authors and post distribution
      const authorCount = narrative.authors.length;
      const maxPostsByOneAuthor = narrative.authors[0]?.postCount ?? 0;
      const concentration =
        narrative.postIndices.length > 0
          ? maxPostsByOneAuthor / narrative.postIndices.length
          : 1;
      // Higher credibility when many diverse authors, lower when one dominates
      const sourceCredibility = Math.min(
        (1 - concentration) * 0.5 + Math.min(authorCount / 20, 1) * 0.5,
        1,
      );

      // Impact = weighted composite
      const impactScore =
        deviationMagnitude * 0.3 +
        propagationVelocity * 0.25 +
        crossReferenceScore * 0.2 +
        (1 - sourceCredibility) * 0.15 +
        (narrative.postIndices.length / Math.max(totalPosts, 1)) * 0.1;

      const isConsensus = idx === 0; // narratives sorted largest-first

      return {
        narrativeId: narrative.id,
        summary: narrative.summary,
        deviationMagnitude: clamp(deviationMagnitude, 0, 1),
        propagationVelocity: clamp(propagationVelocity, 0, 1),
        crossReferenceScore: clamp(crossReferenceScore, 0, 1),
        sourceCredibility: clamp(sourceCredibility, 0, 1),
        impactScore: clamp(impactScore, 0, 1),
        postCount: narrative.postIndices.length,
        isConsensus,
      };
    });
  }

  /**
   * Transform narratives into RealityTunnel visualization data.
   * The largest narrative becomes the consensus tunnel.
   * Other narratives become divergent tunnels with deviation scores.
   */
  toRealityTunnelData(
    narratives: AnalyzedNarrative[],
    posts: RawPost[],
  ): RealityTunnel[] {
    if (narratives.length === 0) return [];

    const deviations = this.computeDeviations(narratives);
    const tunnels: RealityTunnel[] = [];

    for (let i = 0; i < narratives.length; i++) {
      const narrative = narratives[i]!;
      const deviation = deviations[i]!;

      const nodes: RealityTunnelNode[] = narrative.postIndices.map(
        (postIdx, nodeIdx) => {
          const post = posts[postIdx];
          const engagement = post
            ? (post.engagement?.likes ?? 0) +
              (post.engagement?.comments ?? 0) +
              (post.engagement?.shares ?? 0)
            : 0;
          const maxEngagement = 1000; // normalization cap

          return {
            id: `${narrative.id}-node-${nodeIdx}`,
            content: post?.text?.slice(0, 120) ?? `Post ${postIdx}`,
            timestamp: new Date(post?.timestamp ?? narrative.firstSeen),
            deviationScore: deviation.deviationMagnitude,
            strength: clamp(engagement / maxEngagement, 0.05, 1),
            tunnelId: narrative.id,
            // First node of non-consensus tunnels references the closest consensus node
            parentId:
              !deviation.isConsensus && nodeIdx === 0 && tunnels[0]?.nodes[0]
                ? tunnels[0].nodes[0].id
                : undefined,
          };
        },
      );

      tunnels.push({
        id: narrative.id,
        name: narrative.summary || `Narrative ${i + 1}`,
        color: TUNNEL_COLORS[i % TUNNEL_COLORS.length]!,
        nodes,
        isConsensus: deviation.isConsensus,
      });
    }

    return tunnels;
  }

  /**
   * Transform into EnhancedTunnelData (3D version).
   */
  toEnhancedTunnelData(
    narratives: AnalyzedNarrative[],
    posts: RawPost[],
  ): EnhancedTunnelData {
    if (narratives.length === 0) {
      return emptyEnhancedData();
    }

    const deviations = this.computeDeviations(narratives);
    const allTimestamps = posts
      .map((p) => new Date(p.timestamp).getTime())
      .filter(Number.isFinite);
    const minTime = Math.min(...allTimestamps);
    const maxTime = Math.max(...allTimestamps);
    const timeRange = maxTime - minTime || 1;

    const enhancedNarratives: EnhancedTunnelNarrative[] = narratives.map(
      (n, i) => ({
        id: n.id,
        name: n.summary || `Narrative ${i + 1}`,
        description: `${n.postIndices.length} posts, ${Object.keys(n.platforms).length} platforms`,
        color: TUNNEL_COLORS[i % TUNNEL_COLORS.length]!,
        metrics: {
          strength: clamp(n.postIndices.length / Math.max(narratives[0]!.postIndices.length, 1), 0, 1),
          coherence: 1 - deviations[i]!.deviationMagnitude,
        },
      }),
    );

    const nodes: EnhancedTunnelNode[] = [];
    const branches: EnhancedTunnelBranch[] = [];

    for (let i = 0; i < narratives.length; i++) {
      const narrative = narratives[i]!;
      const deviation = deviations[i]!;
      const isConsensus = deviation.isConsensus;

      // Y offset: consensus at 0, others fan out
      const yOffset = isConsensus ? 0 : (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * 80;

      let prevNodeId: string | null = null;

      // Sort post indices by timestamp
      const sortedIndices = [...narrative.postIndices].sort((a, b) => {
        const ta = new Date(posts[a]?.timestamp ?? 0).getTime();
        const tb = new Date(posts[b]?.timestamp ?? 0).getTime();
        return ta - tb;
      });

      for (let j = 0; j < sortedIndices.length; j++) {
        const postIdx = sortedIndices[j]!;
        const post = posts[postIdx];
        if (!post) continue;

        const timestamp = new Date(post.timestamp);
        const tNorm = (timestamp.getTime() - minTime) / timeRange;
        const engagement =
          (post.engagement?.likes ?? 0) +
          (post.engagement?.comments ?? 0) +
          (post.engagement?.shares ?? 0);

        const nodeId = `${narrative.id}-enode-${j}`;

        nodes.push({
          id: nodeId,
          narrativeId: narrative.id,
          content: post.text?.slice(0, 100) ?? `Post ${postIdx}`,
          timestamp,
          position: {
            x: tNorm * 1000,
            y: yOffset + deviation.deviationMagnitude * (isConsensus ? 0 : 50),
            z: 0,
          },
          metrics: {
            strength: clamp(engagement / 1000, 0.1, 1),
            relevance: clamp(1 - deviation.deviationMagnitude, 0, 1),
            consensus: isConsensus ? 0.8 + Math.random() * 0.2 : clamp(1 - deviation.deviationMagnitude, 0, 1),
          },
          connections: [],
          branchFactor: j === 0 && !isConsensus ? 0.7 : 0.3,
          isConsensus,
        });

        // Connect to previous node in same narrative
        if (prevNodeId) {
          branches.push({
            id: `branch-${narrative.id}-${j}`,
            sourceId: prevNodeId,
            targetId: nodeId,
            narrativeId: narrative.id,
            strength: clamp(0.5 + engagement / 2000, 0.3, 1),
            metrics: {
              consensus: isConsensus ? 0.8 : clamp(1 - deviation.deviationMagnitude, 0.1, 0.7),
              traffic: clamp(engagement / 1000, 0.1, 1),
            },
          });

          // Update connections on previous node
          const prevNode = nodes.find((n) => n.id === prevNodeId);
          if (prevNode) prevNode.connections.push(nodeId);
        }

        // Connect first node of non-consensus to nearest consensus node
        if (j === 0 && !isConsensus) {
          const consensusNodes = nodes.filter((n) => n.isConsensus);
          if (consensusNodes.length > 0) {
            // Find closest by time
            let closestNode = consensusNodes[0]!;
            let closestDist = Math.abs(
              closestNode.timestamp.getTime() - timestamp.getTime(),
            );
            for (const cn of consensusNodes) {
              const dist = Math.abs(cn.timestamp.getTime() - timestamp.getTime());
              if (dist < closestDist) {
                closestDist = dist;
                closestNode = cn;
              }
            }

            branches.push({
              id: `diverge-${narrative.id}`,
              sourceId: closestNode.id,
              targetId: nodeId,
              narrativeId: narrative.id,
              strength: 0.5,
              metrics: {
                consensus: 0.3,
                traffic: 0.3,
              },
            });
            closestNode.connections.push(nodeId);
          }
        }

        prevNodeId = nodeId;
      }
    }

    return {
      nodes,
      branches,
      narratives: enhancedNarratives,
      timeframe: {
        start: new Date(minTime),
        end: new Date(maxTime),
      },
      metadata: {
        title: 'Reality Deviation Analysis',
        description: `${narratives.length} narratives, ${posts.length} posts`,
        timestamp: new Date(),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Compute consensus centroid as weighted average of all narrative centroids.
   * Weight = cluster size (number of posts).
   */
  computeConsensusCentroid(narratives: AnalyzedNarrative[]): number[] {
    if (narratives.length === 0) return [];

    const dim = narratives[0]!.centroidEmbedding.length;
    if (dim === 0) return [];

    const totalPosts = narratives.reduce((s, n) => s + n.postIndices.length, 0);
    if (totalPosts === 0) return new Array(dim).fill(0);

    const centroid = new Array(dim).fill(0) as number[];

    for (const narrative of narratives) {
      const weight = narrative.postIndices.length / totalPosts;
      for (let i = 0; i < dim; i++) {
        centroid[i]! += (narrative.centroidEmbedding[i] ?? 0) * weight;
      }
    }

    // Normalize
    const mag = Math.sqrt(centroid.reduce((s, v) => s + v * v, 0));
    if (mag > 0) {
      for (let i = 0; i < dim; i++) {
        centroid[i]! /= mag;
      }
    }

    return centroid;
  }

  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length === 0 || b.length === 0) return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      const ai = a[i] ?? 0;
      const bi = b[i] ?? 0;
      dot += ai * bi;
      normA += ai * ai;
      normB += bi * bi;
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function emptyEnhancedData(): EnhancedTunnelData {
  const now = new Date();
  return {
    nodes: [],
    branches: [],
    narratives: [],
    timeframe: { start: now, end: now },
    metadata: {
      title: 'No Data',
      description: 'No narratives to analyze',
      timestamp: now,
    },
  };
}
