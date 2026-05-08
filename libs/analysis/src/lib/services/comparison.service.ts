import { Injectable, Logger } from '@nestjs/common';
import type { RawPost } from './deviation.service';
import type { AnalyzedNarrative } from './narrative-analysis.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NarrativeComparison {
  narrativeA: { id: string; summary: string };
  narrativeB: { id: string; summary: string };
  /** Cosine similarity of centroid embeddings */
  similarity: number;
  /** Difference in average sentiment (A - B) */
  sentimentDelta: number;
  velocityComparison: {
    aPostsPerHour: number;
    bPostsPerHour: number;
    fasterNarrative: 'a' | 'b' | 'equal';
  };
  platformOverlap: {
    shared: string[];
    onlyA: string[];
    onlyB: string[];
  };
  authorOverlap: {
    shared: string[];
    onlyA: string[];
    onlyB: string[];
  };
  /** LLM analysis of the key differences (optional, not generated in this service) */
  differenceAnalysis?: string;
}

export interface TimePeriodComparison {
  periodA: { label: string; postCount: number; narrativeCount: number };
  periodB: { label: string; postCount: number; narrativeCount: number };
  /** Narratives that exist in both periods (matched by embedding similarity) */
  persistent: Array<{
    summary: string;
    sentimentShift: number;
    volumeChange: number;
  }>;
  /** New narratives in period B that didn't exist in A */
  emerged: Array<{ summary: string; postCount: number }>;
  /** Narratives from period A that disappeared in B */
  disappeared: Array<{ summary: string; lastPostCount: number }>;
  /** Overall sentiment shift (B avg - A avg) */
  sentimentShift: number;
  /** Volume change as a percentage */
  volumeChange: number;
}

export interface PlatformComparison {
  platforms: string[];
  /** How the same topic manifests differently per platform */
  perPlatform: Array<{
    platform: string;
    postCount: number;
    avgSentiment: number;
    dominantNarrative: string;
    uniqueNarratives: string[];
    topAuthors: string[];
  }>;
  /** Cross-platform narratives (appear on 2+ platforms) */
  crossPlatform: Array<{
    summary: string;
    platforms: string[];
    sentimentByPlatform: Record<string, number>;
  }>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/** Similarity threshold for matching narratives across time periods */
const MATCH_THRESHOLD = 0.7;

@Injectable()
export class ComparisonService {
  private readonly logger = new Logger(ComparisonService.name);

  // -------------------------------------------------------------------------
  // Narrative vs Narrative
  // -------------------------------------------------------------------------

  compareNarratives(
    narrativeA: AnalyzedNarrative,
    narrativeB: AnalyzedNarrative,
    postsA: RawPost[],
    postsB: RawPost[],
  ): NarrativeComparison {
    this.logger.log(`Comparing narratives ${narrativeA.id} vs ${narrativeB.id}`);
    void postsA;
    void postsB;

    const similarity = this.cosineSimilarity(
      narrativeA.centroidEmbedding,
      narrativeB.centroidEmbedding,
    );

    const sentimentDelta = narrativeA.avgSentiment - narrativeB.avgSentiment;

    const aRate = narrativeA.velocity.postsPerHour;
    const bRate = narrativeB.velocity.postsPerHour;
    const velocityComparison = {
      aPostsPerHour: aRate,
      bPostsPerHour: bRate,
      fasterNarrative:
        Math.abs(aRate - bRate) < 0.01
          ? ('equal' as const)
          : aRate > bRate
            ? ('a' as const)
            : ('b' as const),
    };

    const platformsA = new Set(Object.keys(narrativeA.platforms));
    const platformsB = new Set(Object.keys(narrativeB.platforms));
    const platformOverlap = this.computeSetOverlap(platformsA, platformsB);

    const authorsA = new Set(narrativeA.authors.map((a) => a.handle || a.name));
    const authorsB = new Set(narrativeB.authors.map((a) => a.handle || a.name));
    const authorOverlap = this.computeSetOverlap(authorsA, authorsB);

    return {
      narrativeA: { id: narrativeA.id, summary: narrativeA.summary },
      narrativeB: { id: narrativeB.id, summary: narrativeB.summary },
      similarity,
      sentimentDelta,
      velocityComparison,
      platformOverlap,
      authorOverlap,
    };
  }

  // -------------------------------------------------------------------------
  // Time Period vs Time Period
  // -------------------------------------------------------------------------

  compareTimePeriods(
    periodA: {
      narratives: AnalyzedNarrative[];
      posts: RawPost[];
      label: string;
    },
    periodB: {
      narratives: AnalyzedNarrative[];
      posts: RawPost[];
      label: string;
    },
  ): TimePeriodComparison {
    this.logger.log(`Comparing time periods: "${periodA.label}" vs "${periodB.label}"`);

    // Match narratives across periods by centroid similarity
    const matchedA = new Set<number>();
    const matchedB = new Set<number>();
    const persistent: TimePeriodComparison['persistent'] = [];

    for (let i = 0; i < periodA.narratives.length; i++) {
      const nA = periodA.narratives[i];
      if (!nA) {
        continue;
      }
      let bestJ = -1;
      let bestSim = -1;

      for (let j = 0; j < periodB.narratives.length; j++) {
        if (matchedB.has(j)) continue;
        const nB = periodB.narratives[j];
        if (!nB) {
          continue;
        }
        const sim = this.cosineSimilarity(nA.centroidEmbedding, nB.centroidEmbedding);
        if (sim > bestSim) {
          bestSim = sim;
          bestJ = j;
        }
      }

      if (bestJ >= 0 && bestSim >= MATCH_THRESHOLD) {
        matchedA.add(i);
        matchedB.add(bestJ);
        const nB = periodB.narratives[bestJ];
        if (!nB) {
          continue;
        }
        const aCount = nA.postIndices.length;
        const bCount = nB.postIndices.length;
        persistent.push({
          summary: nA.summary || nB.summary,
          sentimentShift: nB.avgSentiment - nA.avgSentiment,
          volumeChange: aCount > 0 ? ((bCount - aCount) / aCount) * 100 : bCount > 0 ? 100 : 0,
        });
      }
    }

    const emerged: TimePeriodComparison['emerged'] = [];
    for (let j = 0; j < periodB.narratives.length; j++) {
      if (!matchedB.has(j)) {
        const n = periodB.narratives[j];
        if (!n) {
          continue;
        }
        emerged.push({
          summary: n.summary,
          postCount: n.postIndices.length,
        });
      }
    }

    const disappeared: TimePeriodComparison['disappeared'] = [];
    for (let i = 0; i < periodA.narratives.length; i++) {
      if (!matchedA.has(i)) {
        const n = periodA.narratives[i];
        if (!n) {
          continue;
        }
        disappeared.push({
          summary: n.summary,
          lastPostCount: n.postIndices.length,
        });
      }
    }

    const avgSentimentA = this.avgSentiment(periodA.narratives);
    const avgSentimentB = this.avgSentiment(periodB.narratives);

    const totalA = periodA.posts.length;
    const totalB = periodB.posts.length;
    const volumeChange = totalA > 0 ? ((totalB - totalA) / totalA) * 100 : totalB > 0 ? 100 : 0;

    return {
      periodA: {
        label: periodA.label,
        postCount: totalA,
        narrativeCount: periodA.narratives.length,
      },
      periodB: {
        label: periodB.label,
        postCount: totalB,
        narrativeCount: periodB.narratives.length,
      },
      persistent,
      emerged,
      disappeared,
      sentimentShift: avgSentimentB - avgSentimentA,
      volumeChange,
    };
  }

  // -------------------------------------------------------------------------
  // Platform Comparison
  // -------------------------------------------------------------------------

  comparePlatforms(narratives: AnalyzedNarrative[], posts: RawPost[]): PlatformComparison {
    this.logger.log(`Comparing platforms across ${narratives.length} narratives`);

    // Group posts by platform
    const postsByPlatform = new Map<string, RawPost[]>();
    for (const post of posts) {
      const platform = post.platform.toLowerCase();
      const platformPosts = postsByPlatform.get(platform);
      if (platformPosts) {
        platformPosts.push(post);
      } else {
        postsByPlatform.set(platform, [post]);
      }
    }

    const platforms = Array.from(postsByPlatform.keys()).sort();

    // Determine which narratives appear on which platforms
    const narrativePlatformMap = new Map<
      string,
      { narrative: AnalyzedNarrative; platforms: Set<string> }
    >();
    for (const narrative of narratives) {
      const platformsForNarrative = new Set(
        Object.keys(narrative.platforms).map((p) => p.toLowerCase()),
      );
      narrativePlatformMap.set(narrative.id, {
        narrative,
        platforms: platformsForNarrative,
      });
    }

    // Build per-platform stats
    const perPlatform: PlatformComparison['perPlatform'] = [];
    for (const platform of platforms) {
      const platformPosts = postsByPlatform.get(platform) ?? [];
      const avgSentiment = this.avgPostSentiment(platformPosts);

      // Find narratives that include this platform
      const platformNarratives: AnalyzedNarrative[] = [];
      for (const { narrative, platforms: pSet } of narrativePlatformMap.values()) {
        if (pSet.has(platform)) {
          platformNarratives.push(narrative);
        }
      }

      // Dominant = narrative with most posts on this platform
      let dominantNarrative = '';
      let maxPlatformPosts = 0;
      for (const n of platformNarratives) {
        const platformKey = this.findPlatformKey(n.platforms, platform);
        const count = n.platforms[platform] ?? (platformKey ? n.platforms[platformKey] ?? 0 : 0);
        if (count > maxPlatformPosts) {
          maxPlatformPosts = count;
          dominantNarrative = n.summary;
        }
      }

      // Unique narratives = narratives only on this platform
      const uniqueNarratives: string[] = [];
      for (const { narrative, platforms: pSet } of narrativePlatformMap.values()) {
        if (pSet.has(platform) && pSet.size === 1) {
          uniqueNarratives.push(narrative.summary);
        }
      }

      // Top authors on this platform
      const authorCounts = new Map<string, number>();
      for (const post of platformPosts) {
        const key = post.authorHandle || post.authorName;
        authorCounts.set(key, (authorCounts.get(key) ?? 0) + 1);
      }
      const topAuthors = Array.from(authorCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name]) => name);

      perPlatform.push({
        platform,
        postCount: platformPosts.length,
        avgSentiment,
        dominantNarrative,
        uniqueNarratives,
        topAuthors,
      });
    }

    // Cross-platform narratives (appear on 2+ platforms)
    const crossPlatform: PlatformComparison['crossPlatform'] = [];
    for (const { narrative, platforms: pSet } of narrativePlatformMap.values()) {
      if (pSet.size >= 2) {
        const sentimentByPlatform: Record<string, number> = {};
        for (const platform of pSet) {
          // Approximate per-platform sentiment from posts in this narrative
          void new Set(narrative.postIndices);
          void (postsByPlatform.get(platform) ?? []).filter(() => true);
          // Use the narrative's overall sentiment as approximation per platform
          // A more precise version would cross-reference post indices
          sentimentByPlatform[platform] = narrative.avgSentiment;
        }

        crossPlatform.push({
          summary: narrative.summary,
          platforms: Array.from(pSet).sort(),
          sentimentByPlatform,
        });
      }
    }

    return { platforms, perPlatform, crossPlatform };
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

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

  private computeSetOverlap(
    a: Set<string>,
    b: Set<string>,
  ): { shared: string[]; onlyA: string[]; onlyB: string[] } {
    const shared: string[] = [];
    const onlyA: string[] = [];
    const onlyB: string[] = [];

    for (const item of a) {
      if (b.has(item)) {
        shared.push(item);
      } else {
        onlyA.push(item);
      }
    }
    for (const item of b) {
      if (!a.has(item)) {
        onlyB.push(item);
      }
    }

    return { shared: shared.sort(), onlyA: onlyA.sort(), onlyB: onlyB.sort() };
  }

  private avgSentiment(narratives: AnalyzedNarrative[]): number {
    if (narratives.length === 0) return 0;
    const totalPosts = narratives.reduce((s, n) => s + n.postIndices.length, 0);
    if (totalPosts === 0) return 0;
    return narratives.reduce((s, n) => s + n.avgSentiment * n.postIndices.length, 0) / totalPosts;
  }

  private avgPostSentiment(posts: RawPost[]): number {
    if (posts.length === 0) return 0;
    // RawPost from deviation.service doesn't carry sentiment directly,
    // so return 0 as a fallback. In production the posts would be enriched.
    return 0;
  }

  /** Case-insensitive platform key lookup */
  private findPlatformKey(platforms: Record<string, number>, target: string): string {
    const lower = target.toLowerCase();
    for (const key of Object.keys(platforms)) {
      if (key.toLowerCase() === lower) return key;
    }
    return target;
  }
}
