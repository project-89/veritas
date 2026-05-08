import { Injectable, Logger } from '@nestjs/common';
import type { RawPost } from './deviation.service';
import type { AnalyzedNarrative } from './narrative-analysis.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EntityDossier {
  name: string;
  type: string; // 'person' | 'organization' | 'topic' | 'hashtag' | 'mention'
  /** Total mentions across all posts */
  totalMentions: number;
  /** Which narratives mention this entity */
  narrativeAppearances: Array<{
    narrativeId: string;
    narrativeSummary: string;
    mentionCount: number;
    avgSentimentTowardEntity: number;
  }>;
  /** Sentiment toward this entity over time */
  sentimentTimeline: Array<{ timestamp: string; score: number }>;
  /** Which platforms discuss this entity most */
  platformBreakdown: Record<string, number>;
  /** Co-occurring entities (who/what is mentioned alongside) */
  coOccurrences: Array<{ entity: string; type: string; frequency: number }>;
  /** Key authors discussing this entity */
  topAuthors: Array<{ handle: string; platform: string; mentionCount: number }>;
}

/** Mirrors the NarrativeInsight shape from the frontend API layer */
export interface InsightInput {
  id: string;
  platform: string;
  timestamp: string;
  entities: Array<{ name: string; type: string; relevance: number }>;
  sentiment: { score: number; label: string; confidence: number };
}

export interface EntityNetworkNode {
  id: string;
  type: 'content' | 'source' | 'account';
  label: string;
  properties: Record<string, unknown>;
  metrics: { size: number; color: string; weight: number };
}

export interface EntityNetworkEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  properties: Record<string, unknown>;
  metrics: { width: number; color: string; weight: number };
}

export interface CoOccurrenceNetwork {
  nodes: EntityNetworkNode[];
  edges: EntityNetworkEdge[];
}

export interface EntityAnalysisResponse {
  dossiers: EntityDossier[];
  coOccurrenceNetwork: CoOccurrenceNetwork;
}

// ---------------------------------------------------------------------------
// Color palette for entity types
// ---------------------------------------------------------------------------

const ENTITY_COLORS: Record<string, string> = {
  person: '#60A5FA',
  organization: '#F97316',
  topic: '#A78BFA',
  hashtag: '#34D399',
  mention: '#FBBF24',
};

function entityColor(type: string): string {
  return ENTITY_COLORS[type] ?? '#94A3B8';
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class EntityAnalysisService {
  private readonly logger = new Logger(EntityAnalysisService.name);

  /**
   * Build dossiers for all entities found across narratives.
   * Aggregates entity mentions from insight.entities across all posts.
   */
  buildEntityDossiers(
    posts: RawPost[],
    insights: InsightInput[],
    narratives: AnalyzedNarrative[],
  ): EntityDossier[] {
    const hasUsableEntities = insights.some((insight) => (insight.entities?.length ?? 0) > 0);

    // If no usable entities are provided, extract entities from raw post text
    if (!hasUsableEntities && posts.length > 0) {
      insights = this.extractInsightsFromPosts(posts);
    }
    if (insights.length === 0) return [];

    // Normalise entity name for dedup (lower-case, trimmed)
    const norm = (n: string) => n.trim().toLowerCase();

    // Map: normalised name -> canonical name, type
    const canonMap = new Map<string, { name: string; type: string }>();
    // Map: normalised name -> per-insight data
    const mentionsByEntity = new Map<
      string,
      Array<{
        insightIdx: number;
        relevance: number;
      }>
    >();

    for (let idx = 0; idx < insights.length; idx++) {
      const insight = insights[idx];
      if (!insight) continue;
      if (!insight.entities || insight.entities.length === 0) continue;

      for (const ent of insight.entities) {
        const key = norm(ent.name);
        if (!key) continue;

        if (!canonMap.has(key)) {
          canonMap.set(key, { name: ent.name, type: ent.type });
        }
        if (!mentionsByEntity.has(key)) {
          mentionsByEntity.set(key, []);
        }
        mentionsByEntity.get(key)?.push({ insightIdx: idx, relevance: ent.relevance });
      }
    }

    // Build a post-index -> insight mapping.
    // Assumption: insights[i] corresponds to posts[i] (same order, same length).
    // If lengths don't match, we map by index up to the minimum.
    const insightByPostIdx = new Map<number, InsightInput>();
    for (let i = 0; i < insights.length; i++) {
      const insight = insights[i];
      if (insight) {
        insightByPostIdx.set(i, insight);
      }
    }

    // Build narrative -> set of post indices
    const narrativePostSets = new Map<
      string,
      { narrative: AnalyzedNarrative; postIdxSet: Set<number> }
    >();
    for (const n of narratives) {
      narrativePostSets.set(n.id, {
        narrative: n,
        postIdxSet: new Set(n.postIndices),
      });
    }

    // For each entity, compute the dossier fields
    const dossiers: EntityDossier[] = [];

    for (const [key, mentions] of mentionsByEntity.entries()) {
      const canon = canonMap.get(key);
      if (!canon) continue;
      const totalMentions = mentions.length;

      // -----------------------------------------------------------------------
      // Narrative appearances
      // -----------------------------------------------------------------------
      const narrativeMentions = new Map<string, { count: number; sentimentSum: number }>();

      for (const m of mentions) {
        // Determine which narrative(s) this insight/post belongs to
        for (const [nId, { postIdxSet }] of narrativePostSets.entries()) {
          if (postIdxSet.has(m.insightIdx)) {
            const existing = narrativeMentions.get(nId) ?? { count: 0, sentimentSum: 0 };
            existing.count++;
            existing.sentimentSum += insights[m.insightIdx]?.sentiment?.score ?? 0;
            narrativeMentions.set(nId, existing);
          }
        }
      }

      const narrativeAppearances = Array.from(narrativeMentions.entries())
        .map(([nId, data]) => {
          const narrative = narrativePostSets.get(nId)?.narrative;
          return {
            narrativeId: nId,
            narrativeSummary: narrative?.summary ?? '',
            mentionCount: data.count,
            avgSentimentTowardEntity: data.count > 0 ? data.sentimentSum / data.count : 0,
          };
        })
        .sort((a, b) => b.mentionCount - a.mentionCount);

      // -----------------------------------------------------------------------
      // Sentiment timeline
      // -----------------------------------------------------------------------
      const timelineBuckets = new Map<string, { sum: number; count: number }>();
      for (const m of mentions) {
        const insight = insights[m.insightIdx];
        if (!insight) continue;
        // Bucket by date (YYYY-MM-DD)
        const dateKey = insight.timestamp.slice(0, 10);
        const existing = timelineBuckets.get(dateKey) ?? { sum: 0, count: 0 };
        existing.sum += insight.sentiment?.score ?? 0;
        existing.count++;
        timelineBuckets.set(dateKey, existing);
      }
      const sentimentTimeline = Array.from(timelineBuckets.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([ts, data]) => ({
          timestamp: ts,
          score: data.count > 0 ? data.sum / data.count : 0,
        }));

      // -----------------------------------------------------------------------
      // Platform breakdown
      // -----------------------------------------------------------------------
      const platformBreakdown: Record<string, number> = {};
      for (const m of mentions) {
        const platform = insights[m.insightIdx]?.platform ?? 'unknown';
        platformBreakdown[platform] = (platformBreakdown[platform] ?? 0) + 1;
      }

      // -----------------------------------------------------------------------
      // Top authors
      // -----------------------------------------------------------------------
      const authorMap = new Map<string, { handle: string; platform: string; count: number }>();
      for (const m of mentions) {
        const post = posts[m.insightIdx];
        if (!post) continue;
        const authorKey = `${post.authorHandle}|${post.platform}`;
        const existing = authorMap.get(authorKey) ?? {
          handle: post.authorHandle || post.authorName,
          platform: post.platform,
          count: 0,
        };
        existing.count++;
        authorMap.set(authorKey, existing);
      }
      const topAuthors = Array.from(authorMap.values())
        .map((a) => ({ handle: a.handle, platform: a.platform, mentionCount: a.count }))
        .sort((a, b) => b.mentionCount - a.mentionCount)
        .slice(0, 20);

      // -----------------------------------------------------------------------
      // Co-occurrences: other entities that appear in the same insights
      // -----------------------------------------------------------------------
      const coOccMap = new Map<string, { type: string; count: number }>();
      for (const m of mentions) {
        const insight = insights[m.insightIdx];
        if (!insight) continue;
        for (const ent of insight.entities) {
          const coKey = norm(ent.name);
          if (coKey === key || !coKey) continue;
          const existing = coOccMap.get(coKey) ?? { type: ent.type, count: 0 };
          existing.count++;
          coOccMap.set(coKey, existing);
        }
      }
      const coOccurrences = Array.from(coOccMap.entries())
        .map(([coKey, data]) => ({
          entity: canonMap.get(coKey)?.name ?? coKey,
          type: data.type,
          frequency: data.count,
        }))
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 30);

      dossiers.push({
        name: canon.name,
        type: canon.type,
        totalMentions,
        narrativeAppearances,
        sentimentTimeline,
        platformBreakdown,
        coOccurrences,
        topAuthors,
      });
    }

    // Sort by total mentions descending
    dossiers.sort((a, b) => b.totalMentions - a.totalMentions);

    this.logger.log(`Built ${dossiers.length} entity dossiers from ${insights.length} insights`);
    return dossiers;
  }

  /**
   * Build a co-occurrence network: entities that appear together in the same posts.
   * Returns data suitable for the NetworkGraph visualization.
   */
  buildCoOccurrenceNetwork(insights: InsightInput[]): CoOccurrenceNetwork {
    if (insights.length === 0) return { nodes: [], edges: [] };

    const norm = (n: string) => n.trim().toLowerCase();

    // Collect entity metadata and per-insight entity sets
    const entityMeta = new Map<string, { name: string; type: string; count: number }>();
    const insightEntitySets: string[][] = [];

    for (const insight of insights) {
      if (!insight.entities || insight.entities.length === 0) {
        insightEntitySets.push([]);
        continue;
      }
      const keys: string[] = [];
      for (const ent of insight.entities) {
        const key = norm(ent.name);
        if (!key) continue;
        keys.push(key);
        if (!entityMeta.has(key)) {
          entityMeta.set(key, { name: ent.name, type: ent.type, count: 0 });
        }
        const meta = entityMeta.get(key);
        if (meta) {
          meta.count++;
        }
      }
      insightEntitySets.push(keys);
    }

    // Build edge counts
    const edgeCounts = new Map<string, number>();
    for (const entities of insightEntitySets) {
      for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
          const a = entities[i];
          const b = entities[j];
          if (!a || !b) continue;
          const edgeKey = a < b ? `${a}|||${b}` : `${b}|||${a}`;
          edgeCounts.set(edgeKey, (edgeCounts.get(edgeKey) ?? 0) + 1);
        }
      }
    }

    // Only include entities that have at least one co-occurrence
    const connectedEntities = new Set<string>();
    for (const [edgeKey] of edgeCounts) {
      const [a, b] = edgeKey.split('|||');
      if (a) connectedEntities.add(a);
      if (b) connectedEntities.add(b);
    }

    // Find max count for normalization
    const maxCount = Math.max(1, ...Array.from(entityMeta.values()).map((e) => e.count));
    const maxEdge = Math.max(1, ...Array.from(edgeCounts.values()));

    // Build nodes
    const nodes: EntityNetworkNode[] = [];
    for (const [key, meta] of entityMeta) {
      if (!connectedEntities.has(key)) continue;
      nodes.push({
        id: key,
        type: 'content',
        label: meta.name,
        properties: { entityType: meta.type, mentionCount: meta.count },
        metrics: {
          size: Math.max(0.2, meta.count / maxCount),
          color: entityColor(meta.type),
          weight: meta.count / maxCount,
        },
      });
    }

    // Build edges
    const edges: EntityNetworkEdge[] = [];
    for (const [edgeKey, count] of edgeCounts) {
      const [a, b] = edgeKey.split('|||');
      if (!a || !b) continue;
      edges.push({
        id: `edge-${a}-${b}`,
        source: a,
        target: b,
        type: 'co-occurrence',
        properties: { frequency: count },
        metrics: {
          width: Math.max(0.5, (count / maxEdge) * 5),
          color: '#64748B',
          weight: count / maxEdge,
        },
      });
    }

    // Sort edges by weight descending, take top 200 to avoid overwhelming visualizations
    edges.sort((a, b) => b.metrics.weight - a.metrics.weight);
    const trimmedEdges = edges.slice(0, 200);

    this.logger.log(
      `Built co-occurrence network: ${nodes.length} nodes, ${trimmedEdges.length} edges`,
    );

    return { nodes, edges: trimmedEdges };
  }

  // -------------------------------------------------------------------------
  // Fallback entity extraction from raw posts
  // -------------------------------------------------------------------------

  /**
   * Extract synthetic InsightInput objects from raw posts when the transform-on-ingest
   * pipeline wasn't used (e.g., scan queue architecture stores raw posts only).
   * Uses simple pattern matching: @handles, #hashtags, $tickers, capitalized phrases.
   */
  private extractInsightsFromPosts(posts: RawPost[]): InsightInput[] {
    return posts.map((post) => {
      const entities: Array<{ name: string; type: string; relevance: number }> = [];
      const seen = new Set<string>();

      // @handles → person entities
      const handles = post.text.match(/@[\w]+/g) ?? [];
      for (const h of handles) {
        const name = h.slice(1); // remove @
        if (name.length < 2 || seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        entities.push({ name, type: 'person', relevance: 0.8 });
      }

      // #hashtags → topic entities
      const hashtags = post.text.match(/#[\w]+/g) ?? [];
      for (const h of hashtags) {
        const name = h.slice(1);
        if (name.length < 2 || seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        entities.push({ name, type: 'topic', relevance: 0.6 });
      }

      // $TICKER → organization/asset entities
      const tickers = post.text.match(/\$[A-Z]{2,6}/g) ?? [];
      for (const t of tickers) {
        const name = t.slice(1);
        if (seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        entities.push({ name, type: 'organization', relevance: 0.7 });
      }

      // Capitalized multi-word phrases (2-3 words) → potential entity names
      const capitalizedPhrases = post.text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}\b/g) ?? [];
      for (const phrase of capitalizedPhrases) {
        if (phrase.length < 4 || seen.has(phrase.toLowerCase())) continue;
        // Skip common sentence starters
        if (
          ['The', 'This', 'That', 'What', 'When', 'Where', 'How', 'Why'].some((w) =>
            phrase.startsWith(w + ' '),
          )
        )
          continue;
        seen.add(phrase.toLowerCase());
        entities.push({ name: phrase, type: 'entity', relevance: 0.5 });
      }

      return {
        id: post.id ?? `post-${Math.random().toString(36).slice(2)}`,
        platform: post.platform,
        timestamp: post.timestamp,
        entities,
        sentiment: { score: 0, label: 'neutral' as const, confidence: 0 },
      };
    });
  }
}
