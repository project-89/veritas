/**
 * Narrative Detection & Transformation Layer
 *
 * This is NOT a theme frequency counter. It detects actual narratives:
 * 1. Sort posts chronologically
 * 2. Cluster posts by content similarity (shared key phrases)
 * 3. Identify the dominant narrative at each time point
 * 4. Detect when posts diverge from the dominant → create branches
 * 5. Each branch carries its actual posts, authors, and URLs
 *
 * A "narrative" = a cluster of posts making a similar point
 * A "branch" = when new posts introduce a different angle
 */

import type { RawPost, NarrativeInsight } from './api';
import type {
  NarrativeFlowData,
  NarrativeBranch,
  NarrativeConnection,
} from '@veritas-nx/visualization';
import type {
  NetworkGraph,
  NetworkNode,
  NetworkEdge,
} from '@veritas-nx/visualization';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TemporalEvent {
  id: string;
  timestamp: Date;
  content: string;
  impact: number;
}

export interface TemporalStream {
  id: string;
  name: string;
  color: string;
  strength: number[];
  events: TemporalEvent[];
}

export interface TemporalData {
  timePoints: Date[];
  streams: TemporalStream[];
}

/** A detected narrative cluster — a group of posts making a similar point */
export interface NarrativeCluster {
  id: string;
  /** Representative summary of what this cluster is about */
  label: string;
  /** The actual posts in this cluster */
  posts: RawPost[];
  /** Key phrases that define this narrative */
  keyPhrases: string[];
  /** Average sentiment of posts in this cluster */
  avgSentiment: number;
  /** Platforms contributing to this narrative */
  platforms: Record<string, number>;
  /** Authors driving this narrative */
  authors: Array<{ name: string; handle: string; postCount: number }>;
  /** When this narrative first appeared */
  firstSeen: Date;
  /** When this narrative was last active */
  lastSeen: Date;
  /** Total engagement across all posts */
  totalEngagement: number;
  /** Color for visualization */
  color: string;
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const COLORS = [
  '#4299E1', '#48BB78', '#805AD5', '#ECC94B', '#F56565',
  '#2B6CB0', '#38A169', '#6B46C1', '#D69E2E', '#E53E3E',
  '#90CDF4', '#B794F4', '#FC8181', '#68D391', '#FBD38D',
];

// ---------------------------------------------------------------------------
// Text similarity — extract key phrases and compare
// ---------------------------------------------------------------------------

/** Extract meaningful keywords from text (single words, not bigrams) */
function extractKeywords(text: string): string[] {
  const clean = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')   // remove URLs
    .replace(/[^a-z0-9\s@#]/g, ' ')   // keep @mentions and #hashtags
    .replace(/\s+/g, ' ')
    .trim();

  const words = clean.split(' ').filter((w) => w.length > 2);
  const stopwords = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
    'her', 'was', 'one', 'our', 'out', 'has', 'have', 'been', 'will', 'more',
    'when', 'who', 'what', 'how', 'this', 'that', 'with', 'from', 'they',
    'just', 'like', 'about', 'would', 'make', 'than', 'them', 'its', 'into',
    'also', 'could', 'very', 'some', 'other', 'which', 'these', 'then', 'there',
    'their', 'were', 'being', 'does', 'doing', 'did', 'here', 'should',
    'get', 'got', 'going', 'went', 'come', 'came', 'know', 'think',
    'really', 'still', 'much', 'well', 'even', 'back', 'only', 'right',
    'now', 'way', 'may', 'say', 'said', 'see', 'look', 'want', 'give',
    'most', 'let', 'thing', 'things', 'made', 'after', 'year', 'take',
    'because', 'good', 'each', 'those', 'people', 'over', 'such', 'great',
    'its', 'yes', 'own', 'tell', 'day', 'keep', 'same', 'able',
  ]);

  return [...new Set(words.filter((w) => !stopwords.has(w)))];
}

/** Calculate similarity between two posts based on shared keywords (Jaccard) */
function postSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  const union = new Set([...a, ...b]).size;
  return union > 0 ? intersection / union : 0;
}

// ---------------------------------------------------------------------------
// Narrative clustering — group posts making similar points
// ---------------------------------------------------------------------------

// Jaccard similarity: 0.1 = sharing 10% of vocabulary = loosely related
const SIMILARITY_THRESHOLD = 0.1;

export function detectNarratives(
  posts: RawPost[],
  insights: NarrativeInsight[],
): NarrativeCluster[] {
  if (!posts || posts.length === 0) return [];

  // Sort chronologically
  const sorted = [...posts].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  // Extract keywords for each post
  const postPhrases = sorted.map((p) => extractKeywords(p.text));

  // Build sentiment lookup from insights (match by index since they're parallel)
  const sentimentByIndex = insights.map((ins) => ins?.sentiment?.score ?? 0);

  // Cluster posts using single-linkage clustering
  const clusters: Array<{
    postIndices: number[];
    phrases: Set<string>;
  }> = [];

  for (let i = 0; i < sorted.length; i++) {
    const phrases = postPhrases[i];
    if (phrases.length === 0) {
      // Post with no meaningful content — skip or put in "misc"
      continue;
    }

    // Find the best matching existing cluster
    let bestCluster = -1;
    let bestSim = 0;

    for (let c = 0; c < clusters.length; c++) {
      const clusterPhraseArr = [...clusters[c].phrases];
      const sim = postSimilarity(phrases, clusterPhraseArr);
      if (sim > bestSim) {
        bestSim = sim;
        bestCluster = c;
      }
    }

    if (bestSim >= SIMILARITY_THRESHOLD && bestCluster >= 0) {
      // Add to existing cluster
      clusters[bestCluster].postIndices.push(i);
      for (const p of phrases) clusters[bestCluster].phrases.add(p);
    } else {
      // Start a new cluster
      clusters.push({
        postIndices: [i],
        phrases: new Set(phrases),
      });
    }
  }

  // Convert clusters to NarrativeCluster objects
  // Sort by size (largest first = dominant narrative)
  clusters.sort((a, b) => b.postIndices.length - a.postIndices.length);

  return clusters
    .filter((c) => c.postIndices.length >= 1) // Keep even single-post narratives
    .slice(0, 12) // Cap at 12 narratives for readability
    .map((cluster, idx) => {
      const clusterPosts = cluster.postIndices.map((i) => sorted[i]);
      const timestamps = clusterPosts.map((p) => new Date(p.timestamp).getTime()).filter(Number.isFinite);

      // Find the most representative phrases (appear in most posts)
      const phraseCount = new Map<string, number>();
      for (const i of cluster.postIndices) {
        for (const p of postPhrases[i]) {
          phraseCount.set(p, (phraseCount.get(p) ?? 0) + 1);
        }
      }
      const topPhrases = [...phraseCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([phrase]) => phrase);

      // Generate a readable label: use the most engaged post's text as summary
      const bestPost = [...clusterPosts].sort(
        (a, b) =>
          (b.engagement?.likes ?? 0) + (b.engagement?.comments ?? 0) -
          (a.engagement?.likes ?? 0) - (a.engagement?.comments ?? 0),
      )[0];
      const label = bestPost
        ? bestPost.text.replace(/https?:\/\/\S+/g, '').trim().slice(0, 80) + (bestPost.text.length > 80 ? '...' : '')
        : topPhrases.slice(0, 3).join(', ') || `Narrative ${idx + 1}`;

      // Platform breakdown
      const platforms: Record<string, number> = {};
      for (const p of clusterPosts) {
        platforms[p.platform] = (platforms[p.platform] ?? 0) + 1;
      }

      // Author breakdown
      const authorMap = new Map<string, { name: string; handle: string; count: number }>();
      for (const p of clusterPosts) {
        const key = p.authorHandle || p.authorName || 'unknown';
        const existing = authorMap.get(key);
        if (existing) {
          existing.count++;
        } else {
          authorMap.set(key, { name: p.authorName, handle: p.authorHandle, count: 1 });
        }
      }
      const authors = [...authorMap.values()]
        .sort((a, b) => b.count - a.count)
        .map((a) => ({ name: a.name, handle: a.handle, postCount: a.count }));

      // Average sentiment
      const sentiments = cluster.postIndices
        .map((i) => sentimentByIndex[i] ?? 0)
        .filter(Number.isFinite);
      const avgSentiment = sentiments.length > 0
        ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length
        : 0;

      // Total engagement
      const totalEngagement = clusterPosts.reduce(
        (sum, p) => sum + (p.engagement?.likes ?? 0) + (p.engagement?.comments ?? 0) + (p.engagement?.shares ?? 0),
        0,
      );

      return {
        id: `narrative-${idx}`,
        label,
        posts: clusterPosts,
        keyPhrases: topPhrases,
        avgSentiment,
        platforms,
        authors,
        firstSeen: new Date(Math.min(...timestamps)),
        lastSeen: new Date(Math.max(...timestamps)),
        totalEngagement,
        color: COLORS[idx % COLORS.length],
      };
    });
}

// ---------------------------------------------------------------------------
// Safe helpers
// ---------------------------------------------------------------------------

function isValidDate(d: Date): boolean {
  return d instanceof Date && !isNaN(d.getTime());
}

function safeFinite(v: number, fallback = 0): number {
  return Number.isFinite(v) ? v : fallback;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ---------------------------------------------------------------------------
// Time bucketing
// ---------------------------------------------------------------------------

function computeTimeBuckets(posts: RawPost[]): { timePoints: Date[]; bucketMs: number } {
  const timestamps = posts
    .map((p) => new Date(p.timestamp).getTime())
    .filter(Number.isFinite);

  if (timestamps.length === 0) return { timePoints: [], bucketMs: 86400000 };

  const min = Math.min(...timestamps);
  const max = Math.max(...timestamps);
  const span = max - min;

  const THREE_DAYS = 3 * 86400000;
  const bucketMs = span < THREE_DAYS ? 3600000 : 86400000; // hourly or daily

  const timePoints: Date[] = [];
  for (let t = min; t <= max + bucketMs; t += bucketMs) {
    timePoints.push(new Date(t));
  }
  return { timePoints, bucketMs };
}

// ---------------------------------------------------------------------------
// transformToNarrativeFlow
// ---------------------------------------------------------------------------

export function transformToNarrativeFlow(
  posts: RawPost[],
  insights: NarrativeInsight[],
): NarrativeFlowData {
  const narratives = detectNarratives(posts, insights);

  if (narratives.length === 0 || !posts || posts.length === 0) {
    const now = new Date();
    return emptyFlowData(now, now);
  }

  const { timePoints, bucketMs } = computeTimeBuckets(posts);
  if (timePoints.length < 2) return emptyFlowData(new Date(), new Date());

  // The dominant narrative (largest cluster) forms the consensus band
  const dominant = narratives[0];
  const branches: NarrativeBranch[] = [];

  // Build consensus band from the dominant narrative
  const consensusStrength: number[] = timePoints.map((tp) => {
    const bucketStart = tp.getTime();
    const bucketEnd = bucketStart + bucketMs;
    const postsInBucket = dominant.posts.filter((p) => {
      const t = new Date(p.timestamp).getTime();
      return t >= bucketStart && t < bucketEnd;
    });
    const allInBucket = posts.filter((p) => {
      const t = new Date(p.timestamp).getTime();
      return t >= bucketStart && t < bucketEnd;
    });
    return allInBucket.length > 0 ? postsInBucket.length / allInBucket.length : 0;
  });

  const consensus = {
    id: 'consensus',
    name: dominant.label,
    description: `Dominant narrative (${dominant.posts.length} posts): ${dominant.keyPhrases.join(', ')}`,
    color: dominant.color,
    timePoints: [...timePoints],
    strengthValues: consensusStrength.map((s) => clamp(s, 0, 1)),
    metrics: {
      stability: safeFinite(1 - variance(consensusStrength)),
      confidence: clamp(dominant.posts.length / posts.length, 0, 1),
      diversity: clamp(Object.keys(dominant.platforms).length / 5, 0, 1),
    },
  };

  // Each non-dominant narrative becomes a branch
  for (let i = 0; i < narratives.length; i++) {
    const narrative = narratives[i];

    const strengthValues: number[] = timePoints.map((tp) => {
      const bucketStart = tp.getTime();
      const bucketEnd = bucketStart + bucketMs;
      const postsInBucket = narrative.posts.filter((p) => {
        const t = new Date(p.timestamp).getTime();
        return t >= bucketStart && t < bucketEnd;
      });
      const allInBucket = posts.filter((p) => {
        const t = new Date(p.timestamp).getTime();
        return t >= bucketStart && t < bucketEnd;
      });
      return allInBucket.length > 0 ? postsInBucket.length / allInBucket.length : 0;
    });

    // Divergence = how different this narrative's sentiment is from the dominant
    const divergenceValues: number[] = timePoints.map((tp) => {
      const bucketStart = tp.getTime();
      const bucketEnd = bucketStart + bucketMs;
      const narPosts = narrative.posts.filter((p) => {
        const t = new Date(p.timestamp).getTime();
        return t >= bucketStart && t < bucketEnd;
      });
      if (narPosts.length === 0) return 0;
      // Use position offset based on narrative index for visual separation
      return (i + 1) * 0.15 * (narrative.avgSentiment >= 0 ? 1 : -1);
    });

    // Key events = posts with highest engagement in this narrative
    const sortedByEngagement = [...narrative.posts].sort(
      (a, b) =>
        (b.engagement?.likes ?? 0) + (b.engagement?.comments ?? 0) -
        (a.engagement?.likes ?? 0) - (a.engagement?.comments ?? 0),
    );
    const events = sortedByEngagement.slice(0, 5).map((p) => ({
      id: p.id,
      timestamp: new Date(p.timestamp),
      description: p.text.slice(0, 100) + (p.text.length > 100 ? '...' : ''),
      impact: clamp(
        ((p.engagement?.likes ?? 0) + (p.engagement?.comments ?? 0)) /
          Math.max(narrative.totalEngagement, 1),
        0.1,
        1,
      ),
    })).filter((e) => isValidDate(e.timestamp));

    const sources = narrative.authors.slice(0, 10).map((a) => ({
      id: a.handle || a.name,
      name: a.handle ? `@${a.handle}` : a.name,
      weight: a.postCount / narrative.posts.length,
    }));

    branches.push({
      id: narrative.id,
      name: narrative.label,
      description: `${narrative.posts.length} posts | ${Object.keys(narrative.platforms).join(', ')} | sentiment: ${narrative.avgSentiment.toFixed(2)}`,
      color: narrative.color,
      parentId: i === 0 ? null : 'consensus',
      emergencePoint: narrative.firstSeen,
      terminationPoint: narrative.lastSeen,
      timePoints: [...timePoints],
      strengthValues,
      divergenceValues,
      metrics: {
        peakStrength: safeFinite(Math.max(...strengthValues, 0)),
        longevity: safeFinite(
          (narrative.lastSeen.getTime() - narrative.firstSeen.getTime()) / 86400000,
        ),
        volatility: safeFinite(Math.sqrt(variance(strengthValues))),
        influence: safeFinite(narrative.totalEngagement / Math.max(posts.reduce((s, p) => s + (p.engagement?.likes ?? 0) + (p.engagement?.comments ?? 0), 0), 1)),
      },
      sources,
      events,
    });
  }

  // Connections: narratives that share authors (cross-pollination)
  const connections: NarrativeConnection[] = [];
  for (let i = 0; i < narratives.length; i++) {
    for (let j = i + 1; j < narratives.length; j++) {
      const authorsI = new Set(narratives[i].authors.map((a) => a.handle || a.name));
      const authorsJ = new Set(narratives[j].authors.map((a) => a.handle || a.name));
      const shared = [...authorsI].filter((a) => authorsJ.has(a));
      if (shared.length > 0) {
        // Find the midpoint timestamp
        const midTime = new Date(
          (narratives[i].firstSeen.getTime() + narratives[j].firstSeen.getTime()) / 2,
        );
        if (isValidDate(midTime)) {
          connections.push({
            id: `conn-${i}-${j}`,
            sourceId: narratives[i].id,
            targetId: narratives[j].id,
            timestamp: midTime,
            strength: shared.length / Math.max(authorsI.size, authorsJ.size),
            type: 'influence',
            description: `Shared authors: ${shared.slice(0, 3).join(', ')}`,
          });
        }
      }
    }
  }

  return {
    timeframe: { start: timePoints[0], end: timePoints[timePoints.length - 1] },
    consensus,
    branches: branches.filter((b) => b.timePoints.length >= 2),
    connections,
    metadata: {
      title: 'Narrative Flow Analysis',
      description: `${narratives.length} narratives detected across ${posts.length} posts`,
      topics: narratives.map((n) => n.label),
      sources: new Set(posts.map((p) => p.platform)).size,
      timestamp: new Date(),
    },
  };
}

// ---------------------------------------------------------------------------
// transformToNetworkGraph — shows relationships between sources & narratives
// ---------------------------------------------------------------------------

export function transformToNetworkGraph(
  posts: RawPost[],
  insights: NarrativeInsight[],
): NetworkGraph {
  const narratives = detectNarratives(posts, insights);

  if (narratives.length === 0) {
    return { nodes: [], edges: [], metadata: { timestamp: new Date(), nodeCount: 0, edgeCount: 0, density: 0 } };
  }

  const nodes: NetworkNode[] = [];
  const edges: NetworkEdge[] = [];
  const nodeIds = new Set<string>();

  // Create nodes for each narrative
  for (const narrative of narratives) {
    const nodeId = narrative.id;
    nodes.push({
      id: nodeId,
      type: 'content',
      label: narrative.label,
      properties: {
        postCount: narrative.posts.length,
        platforms: Object.keys(narrative.platforms).join(', '),
        sentiment: narrative.avgSentiment,
      },
      metrics: {
        size: Math.max(0.2, narrative.posts.length / posts.length),
        color: narrative.color,
        weight: narrative.posts.length / posts.length,
      },
    });
    nodeIds.add(nodeId);
  }

  // Create nodes for top authors and connect them to narratives
  for (const narrative of narratives) {
    for (const author of narrative.authors.slice(0, 5)) {
      const authorId = `author-${author.handle || author.name}`;
      if (!nodeIds.has(authorId)) {
        nodes.push({
          id: authorId,
          type: 'source',
          label: author.handle ? `@${author.handle}` : author.name,
          properties: { postCount: author.postCount },
          metrics: {
            size: Math.max(0.1, author.postCount / 10),
            color: '#94a3b8',
            weight: author.postCount / posts.length,
          },
        });
        nodeIds.add(authorId);
      }

      edges.push({
        id: `edge-${authorId}-${narrative.id}`,
        source: authorId,
        target: narrative.id,
        type: 'PUBLISHED',
        properties: { count: author.postCount },
        metrics: {
          width: Math.max(1, author.postCount),
          color: narrative.color,
          weight: author.postCount / narrative.posts.length,
        },
      });
    }
  }

  // Create nodes for platforms
  const platformCounts = new Map<string, number>();
  for (const p of posts) {
    platformCounts.set(p.platform, (platformCounts.get(p.platform) ?? 0) + 1);
  }
  for (const [platform, count] of platformCounts) {
    const platformId = `platform-${platform}`;
    if (!nodeIds.has(platformId)) {
      nodes.push({
        id: platformId,
        type: 'account',
        label: platform.charAt(0).toUpperCase() + platform.slice(1),
        properties: { postCount: count },
        metrics: {
          size: Math.max(0.3, count / posts.length),
          color: platform === 'reddit' ? '#FF4500' : platform === 'twitter' ? '#1DA1F2' : platform === 'youtube' ? '#FF0000' : '#888',
          weight: count / posts.length,
        },
      });
      nodeIds.add(platformId);
    }

    // Connect platforms to narratives they contribute to
    for (const narrative of narratives) {
      const narPlatCount = narrative.platforms[platform];
      if (narPlatCount > 0) {
        edges.push({
          id: `edge-${platformId}-${narrative.id}`,
          source: platformId,
          target: narrative.id,
          type: 'SHARED',
          properties: { count: narPlatCount },
          metrics: {
            width: Math.max(1, narPlatCount / 5),
            color: narrative.color,
            weight: narPlatCount / narrative.posts.length,
          },
        });
      }
    }
  }

  return {
    nodes,
    edges,
    metadata: {
      timestamp: new Date(),
      nodeCount: nodes.length,
      edgeCount: edges.length,
      density: edges.length / Math.max(nodes.length * (nodes.length - 1) / 2, 1),
    },
  };
}

// ---------------------------------------------------------------------------
// transformToTemporalData — shows narrative strength over time
// ---------------------------------------------------------------------------

export function transformToTemporalData(
  posts: RawPost[],
  insights: NarrativeInsight[],
): TemporalData {
  const narratives = detectNarratives(posts, insights);
  if (narratives.length === 0 || !posts || posts.length === 0) {
    return { timePoints: [], streams: [] };
  }

  const { timePoints, bucketMs } = computeTimeBuckets(posts);
  if (timePoints.length < 2) return { timePoints: [], streams: [] };

  const streams: TemporalStream[] = narratives.map((narrative) => {
    const strength: number[] = timePoints.map((tp) => {
      const bucketStart = tp.getTime();
      const bucketEnd = bucketStart + bucketMs;
      const count = narrative.posts.filter((p) => {
        const t = new Date(p.timestamp).getTime();
        return t >= bucketStart && t < bucketEnd;
      }).length;
      const total = posts.filter((p) => {
        const t = new Date(p.timestamp).getTime();
        return t >= bucketStart && t < bucketEnd;
      }).length;
      return total > 0 ? count / total : 0;
    });

    const events: TemporalEvent[] = narrative.posts
      .sort((a, b) => (b.engagement?.likes ?? 0) - (a.engagement?.likes ?? 0))
      .slice(0, 3)
      .map((p) => ({
        id: p.id,
        timestamp: new Date(p.timestamp),
        content: p.text.slice(0, 80),
        impact: clamp((p.engagement?.likes ?? 0) / Math.max(narrative.totalEngagement, 1), 0.1, 1),
      }))
      .filter((e) => isValidDate(e.timestamp));

    return {
      id: narrative.id,
      name: narrative.label,
      color: narrative.color,
      strength,
      events,
    };
  });

  return { timePoints, streams };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function variance(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
}

function emptyFlowData(start: Date, end: Date): NarrativeFlowData {
  return {
    timeframe: { start, end },
    consensus: {
      id: 'consensus',
      name: 'No Data',
      description: 'No data available',
      color: '#888',
      timePoints: [start, end],
      strengthValues: [0.5, 0.5],
      metrics: { stability: 0, confidence: 0, diversity: 0 },
    },
    branches: [],
    connections: [],
    metadata: {
      title: 'No Data',
      description: 'No insights available',
      topics: [],
      sources: 0,
      timestamp: new Date(),
    },
  };
}
