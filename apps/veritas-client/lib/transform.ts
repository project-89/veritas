// Data transformation layer.
// Converts API response types (NarrativeInsight) into the shapes expected by
// the visualization library components.

import type { NarrativeInsight } from './api';
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
// Temporal data types (stream-graph style)
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
  strength: number[]; // strength at each time point (0-1)
  events: TemporalEvent[];
}

export interface TemporalData {
  timePoints: Date[];
  streams: TemporalStream[];
}

// ---------------------------------------------------------------------------
// Color palette - sourced from the visualization lib color-utils
// ---------------------------------------------------------------------------

const BRANCH_COLORS = [
  '#4299E1', // Blue
  '#48BB78', // Green
  '#805AD5', // Purple
  '#ECC94B', // Yellow
  '#F56565', // Red
  '#2B6CB0', // Dark Blue
  '#38A169', // Dark Green
  '#6B46C1', // Dark Purple
  '#D69E2E', // Dark Yellow
  '#E53E3E', // Dark Red
  '#90CDF4', // Light Blue
  '#B794F4', // Light Purple
  '#FC8181', // Light Red
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Choose bucket size: hours if the data spans < 3 days, otherwise days. */
function computeBuckets(insights: NarrativeInsight[]): {
  buckets: Map<string, NarrativeInsight[]>;
  timePoints: Date[];
  bucketMs: number;
} {
  const timestamps = insights
    .map((i) => new Date(i.timestamp).getTime())
    .filter((t) => Number.isFinite(t));

  if (timestamps.length === 0) {
    return { buckets: new Map(), timePoints: [], bucketMs: 24 * 60 * 60 * 1000 };
  }

  const min = Math.min(...timestamps);
  const max = Math.max(...timestamps);
  const spanMs = max - min;

  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
  const useHours = spanMs < THREE_DAYS_MS;
  const bucketMs = useHours ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

  const buckets = new Map<string, NarrativeInsight[]>();

  for (const insight of insights) {
    const ts = new Date(insight.timestamp).getTime();
    const bucketStart = Math.floor(ts / bucketMs) * bucketMs;
    const key = String(bucketStart);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(insight);
  }

  // Sorted time points
  const timePoints = Array.from(buckets.keys())
    .map(Number)
    .sort((a, b) => a - b)
    .map((t) => new Date(t));

  return { buckets, timePoints, bucketMs };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
}

function uniqueThemes(insights: NarrativeInsight[]): string[] {
  const counts = new Map<string, number>();
  for (const i of insights) {
    for (const t of i.themes) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([theme]) => theme);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ---------------------------------------------------------------------------
// transformToNarrativeFlow
// ---------------------------------------------------------------------------

/** Check whether a Date is valid (not NaN). */
function isValidDate(d: Date): boolean {
  return d instanceof Date && !isNaN(d.getTime());
}

/** Ensure a number is finite; return fallback otherwise. */
function safeFinite(v: number, fallback = 0): number {
  return Number.isFinite(v) ? v : fallback;
}

export function transformToNarrativeFlow(
  insights: NarrativeInsight[],
): NarrativeFlowData {
  // Filter out insights with invalid timestamps up front
  const validInsights = (insights ?? []).filter((i) => {
    const d = new Date(i.timestamp);
    return isValidDate(d);
  });

  if (validInsights.length === 0) {
    const now = new Date();
    return emptyFlowData(now, now);
  }

  const { buckets, timePoints } = computeBuckets(validInsights);
  const themes = uniqueThemes(validInsights);
  const bucketKeys = timePoints.map((d) => String(d.getTime()));

  // ---- Consensus band ----
  const consensusSentiments: number[] = [];
  const consensusStability: number[] = [];

  for (const key of bucketKeys) {
    const items = buckets.get(key) ?? [];
    const sentiments = items.map((i) => i.sentiment.score);
    consensusSentiments.push(safeFinite(mean(sentiments)));
    consensusStability.push(safeFinite(1 - clamp(variance(sentiments), 0, 1)));
  }

  const consensus = {
    id: 'consensus',
    name: 'Overall Consensus',
    description: 'Aggregate sentiment across all narratives',
    color: '#4299E1',
    timePoints: [...timePoints],
    strengthValues: consensusSentiments.map((s) =>
      clamp((s + 1) / 2, 0, 1),
    ),
    metrics: {
      stability: safeFinite(mean(consensusStability)),
      confidence: safeFinite(clamp(validInsights.length / 100, 0, 1)),
      diversity:
        themes.length > 0
          ? safeFinite(clamp(themes.length / 20, 0, 1))
          : 0,
    },
  };

  // ---- Branches (one per theme) ----
  const branches: NarrativeBranch[] = themes.map((theme, idx) => {
    const color = BRANCH_COLORS[idx % BRANCH_COLORS.length];
    const strengthValues: number[] = [];
    const divergenceValues: number[] = [];
    const events: NarrativeBranch['events'] = [];
    const sourceMap = new Map<string, number>();

    for (let bi = 0; bi < bucketKeys.length; bi++) {
      const key = bucketKeys[bi];
      const items = buckets.get(key) ?? [];
      const themeItems = items.filter((i) => i.themes.includes(theme));
      const total = items.length || 1;

      // Branch strength = fraction of insights containing this theme
      const strength = safeFinite(themeItems.length / total);
      strengthValues.push(clamp(strength, 0, 1));

      // Divergence = |theme avg sentiment - consensus sentiment|
      const themeSentiment = safeFinite(mean(themeItems.map((i) => i.sentiment.score)));
      const div = safeFinite(Math.abs(themeSentiment - (consensusSentiments[bi] ?? 0)));
      divergenceValues.push(clamp(div, 0, 1));

      // Collect events (high narrative-score insights with valid timestamps)
      for (const item of themeItems) {
        if (item.narrativeScore > 0.7) {
          const eventTs = new Date(item.timestamp);
          if (isValidDate(eventTs) && Number.isFinite(item.narrativeScore)) {
            events.push({
              id: item.id,
              timestamp: eventTs,
              description: item.themes.join(', ') || `Insight ${item.id}`,
              impact: safeFinite(item.narrativeScore, 0.5),
            });
          }
        }
        // Track source platforms
        sourceMap.set(
          item.platform,
          (sourceMap.get(item.platform) ?? 0) + 1,
        );
      }
    }

    const themeInsights = validInsights.filter((i) => i.themes.includes(theme));
    const themeTimes = themeInsights
      .map((i) => new Date(i.timestamp).getTime())
      .filter((t) => Number.isFinite(t));
    const emergence = themeTimes.length > 0 ? new Date(Math.min(...themeTimes)) : timePoints[0];
    const termination = themeTimes.length > 0 ? new Date(Math.max(...themeTimes)) : timePoints[timePoints.length - 1];
    const longevityDays = safeFinite(
      (termination.getTime() - emergence.getTime()) / (1000 * 60 * 60 * 24),
    );

    const sources = Array.from(sourceMap.entries()).map(([name, count]) => ({
      id: name,
      name,
      weight: count / (themeInsights.length || 1),
    }));

    return {
      id: `branch-${idx}`,
      name: theme,
      description: `Narrative branch for "${theme}"`,
      color,
      parentId: null,
      emergencePoint: emergence,
      terminationPoint: termination,
      timePoints: [...timePoints],
      strengthValues,
      divergenceValues,
      metrics: {
        peakStrength: safeFinite(Math.max(...strengthValues, 0)),
        longevity: longevityDays,
        volatility: safeFinite(Math.sqrt(variance(strengthValues))),
        influence: safeFinite(mean(strengthValues)),
      },
      sources,
      events,
    };
  });

  // ---- Connections: themes sharing entities within the same bucket ----
  const connections: NarrativeConnection[] = [];
  let connId = 0;

  for (let bi = 0; bi < bucketKeys.length; bi++) {
    const key = bucketKeys[bi];
    const items = buckets.get(key) ?? [];

    // Build theme -> entities map for this bucket
    const themeEntities = new Map<string, Set<string>>();
    for (const item of items) {
      for (const theme of item.themes) {
        if (!themeEntities.has(theme)) themeEntities.set(theme, new Set());
        for (const entity of item.entities) {
          themeEntities.get(theme)!.add(entity.name);
        }
      }
    }

    // Find pairs that share entities
    const themeList = Array.from(themeEntities.keys());
    for (let a = 0; a < themeList.length; a++) {
      for (let b = a + 1; b < themeList.length; b++) {
        const entA = themeEntities.get(themeList[a])!;
        const entB = themeEntities.get(themeList[b])!;
        const shared = [...entA].filter((e) => entB.has(e));
        if (shared.length > 0) {
          const branchA = branches.find((br) => br.name === themeList[a]);
          const branchB = branches.find((br) => br.name === themeList[b]);
          if (branchA && branchB) {
            connections.push({
              id: `conn-${connId++}`,
              sourceId: branchA.id,
              targetId: branchB.id,
              timestamp: timePoints[bi],
              strength: clamp(shared.length / 5, 0, 1),
              type: 'influence',
              description: `Shared entities: ${shared.slice(0, 3).join(', ')}`,
            });
          }
        }
      }
    }
  }

  // Only keep branches with at least 2 time points (D3 area generators need >= 2)
  const validBranches = branches.filter((b) => b.timePoints.length >= 2);

  return {
    timeframe: {
      start: timePoints[0],
      end: timePoints[timePoints.length - 1],
    },
    consensus,
    branches: validBranches,
    connections,
    metadata: {
      title: 'Narrative Flow Analysis',
      description: `Analysis of ${validInsights.length} insights across ${themes.length} themes`,
      topics: themes.slice(0, 10),
      sources: new Set(validInsights.map((i) => i.platform)).size,
      timestamp: new Date(),
    },
  };
}

function emptyFlowData(start: Date, end: Date): NarrativeFlowData {
  return {
    timeframe: { start, end },
    consensus: {
      id: 'consensus',
      name: 'Overall Consensus',
      description: 'No data available',
      color: '#4299E1',
      timePoints: [],
      strengthValues: [],
      metrics: { stability: 0, confidence: 0, diversity: 0 },
    },
    branches: [],
    connections: [],
    metadata: {
      title: 'Narrative Flow Analysis',
      description: 'No insights available',
      topics: [],
      sources: 0,
      timestamp: new Date(),
    },
  };
}

// ---------------------------------------------------------------------------
// transformToNetworkGraph
// ---------------------------------------------------------------------------

export function transformToNetworkGraph(
  insights: NarrativeInsight[],
): NetworkGraph {
  if (!insights || insights.length === 0) {
    return {
      nodes: [],
      edges: [],
      metadata: { timestamp: new Date(), nodeCount: 0, edgeCount: 0, density: 0 },
    };
  }
  // Count frequencies and accumulate sentiment for themes and entities
  const themeFreq = new Map<string, number>();
  const themeSentiment = new Map<string, number[]>();
  const entityFreq = new Map<string, number>();
  const entitySentiment = new Map<string, number[]>();
  // Co-occurrence tracking: pairs that appear in the same insight
  const edgeCounts = new Map<string, number>();

  for (const insight of insights) {
    const allItems = [
      ...insight.themes.map((t) => ({ id: `theme:${t}`, kind: 'theme' as const, label: t })),
      ...insight.entities.map((e) => ({ id: `entity:${e.name}`, kind: 'entity' as const, label: e.name })),
    ];

    for (const item of allItems) {
      if (item.kind === 'theme') {
        themeFreq.set(item.label, (themeFreq.get(item.label) ?? 0) + 1);
        if (!themeSentiment.has(item.label)) themeSentiment.set(item.label, []);
        themeSentiment.get(item.label)!.push(insight.sentiment.score);
      } else {
        entityFreq.set(item.label, (entityFreq.get(item.label) ?? 0) + 1);
        if (!entitySentiment.has(item.label)) entitySentiment.set(item.label, []);
        entitySentiment.get(item.label)!.push(insight.sentiment.score);
      }

      // Build co-occurrence edges (pairs within same insight)
      for (const other of allItems) {
        if (item.id >= other.id) continue; // avoid duplicates
        const edgeKey = `${item.id}||${other.id}`;
        edgeCounts.set(edgeKey, (edgeCounts.get(edgeKey) ?? 0) + 1);
      }
    }
  }

  // Determine max frequency for normalization
  const allFreqs = [
    ...Array.from(themeFreq.values()),
    ...Array.from(entityFreq.values()),
  ];
  const maxFreq = Math.max(...allFreqs, 1);

  // Build nodes
  const nodes: NetworkNode[] = [];

  for (const [label, freq] of themeFreq) {
    const avgSent = mean(themeSentiment.get(label) ?? []);
    nodes.push({
      id: `theme:${label}`,
      type: 'content',
      label,
      properties: { kind: 'theme' },
      metrics: {
        size: clamp(freq / maxFreq, 0.1, 1),
        color: sentimentToColor(avgSent),
        weight: freq,
      },
    });
  }

  for (const [label, freq] of entityFreq) {
    const avgSent = mean(entitySentiment.get(label) ?? []);
    nodes.push({
      id: `entity:${label}`,
      type: 'source',
      label,
      properties: { kind: 'entity' },
      metrics: {
        size: clamp(freq / maxFreq, 0.1, 1),
        color: sentimentToColor(avgSent),
        weight: freq,
      },
    });
  }

  // Build edges
  const maxEdge = Math.max(...Array.from(edgeCounts.values()), 1);
  const edges: NetworkEdge[] = [];
  let edgeId = 0;

  for (const [key, count] of edgeCounts) {
    const [sourceId, targetId] = key.split('||');
    edges.push({
      id: `edge-${edgeId++}`,
      source: sourceId,
      target: targetId,
      type: 'co-occurrence',
      properties: { count },
      metrics: {
        width: clamp(count / maxEdge, 0.1, 1),
        color: '#805AD5',
        weight: count,
      },
    });
  }

  return {
    nodes,
    edges,
    metadata: {
      timestamp: new Date(),
      nodeCount: nodes.length,
      edgeCount: edges.length,
      density:
        nodes.length > 1
          ? (2 * edges.length) / (nodes.length * (nodes.length - 1))
          : 0,
    },
  };
}

/** Map sentiment (-1...1) to a color from red (negative) through yellow to green (positive). */
function sentimentToColor(sentiment: number): string {
  if (sentiment > 0.3) return '#48BB78'; // Green
  if (sentiment > 0) return '#ECC94B'; // Yellow
  if (sentiment > -0.3) return '#ED8936'; // Orange
  return '#F56565'; // Red
}

// ---------------------------------------------------------------------------
// transformToTemporalData
// ---------------------------------------------------------------------------

export function transformToTemporalData(
  insights: NarrativeInsight[],
  topN = 8,
): TemporalData {
  if (!insights || insights.length === 0) {
    return { timePoints: [], streams: [] };
  }

  // Filter out insights with invalid timestamps
  const validInsights = insights.filter((i) => {
    const d = new Date(i.timestamp);
    return d instanceof Date && !isNaN(d.getTime());
  });
  if (validInsights.length === 0) {
    return { timePoints: [], streams: [] };
  }
  // Use validInsights from here
  insights = validInsights;

  const { buckets, timePoints } = computeBuckets(insights);
  const bucketKeys = timePoints.map((d) => String(d.getTime()));

  // Pick top N themes by overall frequency
  const themes = uniqueThemes(insights).slice(0, topN);

  // Find the maximum count in any bucket for normalization
  let maxCount = 1;
  for (const key of bucketKeys) {
    const items = buckets.get(key) ?? [];
    for (const theme of themes) {
      const count = items.filter((i) => i.themes.includes(theme)).length;
      if (count > maxCount) maxCount = count;
    }
  }

  const streams: TemporalStream[] = themes.map((theme, idx) => {
    const values: number[] = bucketKeys.map((key) => {
      const items = buckets.get(key) ?? [];
      const count = items.filter((i) => i.themes.includes(theme)).length;
      return count / maxCount; // normalized 0-1
    });

    // Collect events: high-score insights with this theme
    const events: TemporalEvent[] = [];
    for (const key of bucketKeys) {
      const items = buckets.get(key) ?? [];
      for (const item of items) {
        if (item.themes.includes(theme) && item.narrativeScore > 0.6) {
          events.push({
            id: item.id,
            timestamp: new Date(item.timestamp),
            content: item.themes.join(', '),
            impact: item.narrativeScore,
          });
        }
      }
    }

    return {
      id: `stream-${idx}`,
      name: theme,
      color: BRANCH_COLORS[idx % BRANCH_COLORS.length],
      strength: values,
      events: events.slice(0, 5),
    };
  });

  return { timePoints, streams };
}
