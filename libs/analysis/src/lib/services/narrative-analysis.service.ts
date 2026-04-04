import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SaturationMetricsService } from './saturation-metrics.service';
import type { SaturationReport } from './saturation-metrics.service';

/**
 * A post with its embedding, used internally during clustering.
 */
interface EmbeddedPost {
  index: number;
  text: string;
  platform: string;
  authorName: string;
  authorHandle: string;
  timestamp: Date;
  sentimentScore: number;
  sentimentLabel: string;
  engagement: number;
  embedding: number[];
}

/**
 * A detected narrative cluster returned by the analysis endpoint.
 */
export interface AnalyzedNarrative {
  id: string;
  /** LLM-generated one-sentence summary */
  summary: string;
  /** Indices into the original posts array */
  postIndices: number[];
  /** Average sentiment score */
  avgSentiment: number;
  /** Sentiment trajectory: { timestamp, score }[] sorted chronologically */
  sentimentTrajectory: Array<{ timestamp: string; score: number }>;
  /** Platform breakdown */
  platforms: Record<string, number>;
  /** Top authors */
  authors: Array<{ name: string; handle: string; postCount: number }>;
  /** First and last post timestamps */
  firstSeen: string;
  lastSeen: string;
  /** Total engagement across all posts */
  totalEngagement: number;
  /** Velocity metrics */
  velocity: {
    postsPerHour: number;
    /** Positive = accelerating, negative = decelerating */
    acceleration: number;
    /** 'surging' | 'growing' | 'steady' | 'fading' */
    trend: 'surging' | 'growing' | 'steady' | 'fading';
  };
  /** Cluster centroid embedding */
  centroidEmbedding: number[];
}

export interface AnalyzeResult {
  narratives: AnalyzedNarrative[];
  /** Posts that didn't cluster (noise) */
  unclustered: number[];
  /** Saturation metrics (present when SaturationMetricsService is available) */
  saturation?: SaturationReport;
}

/**
 * Core narrative intelligence service.
 * Takes raw posts and produces semantically clustered, LLM-summarized,
 * velocity-scored narratives.
 */
@Injectable()
export class NarrativeAnalysisService {
  private readonly logger = new Logger(NarrativeAnalysisService.name);
  private readonly genAI: GoogleGenerativeAI | null = null;
  private readonly embeddingModel: string = 'gemini-embedding-2-preview';
  private readonly chatModel: string = 'gemini-2.0-flash';

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly saturationMetrics?: SaturationMetricsService,
  ) {
    const geminiKey =
      this.configService.get<string>('GEMINI_API_KEY') ||
      process.env['GEMINI_API_KEY'];

    if (geminiKey) {
      this.genAI = new GoogleGenerativeAI(geminiKey);
      this.logger.log(
        `NarrativeAnalysisService initialized (embedding: ${this.embeddingModel}, chat: ${this.chatModel})`,
      );
    } else {
      this.logger.warn(
        'GEMINI_API_KEY not set — narrative analysis will use fallback clustering',
      );
    }
  }

  /**
   * Main entry point: analyze an array of posts and return clustered narratives.
   */
  async analyze(
    posts: Array<{
      text: string;
      platform: string;
      authorName: string;
      authorHandle: string;
      timestamp: string;
      sentiment?: { score: number; label: string };
      engagement?: { likes: number; comments: number; shares: number };
    }>,
  ): Promise<AnalyzeResult> {
    if (posts.length === 0) {
      return { narratives: [], unclustered: [] };
    }

    this.logger.log(`Analyzing ${posts.length} posts...`);

    // Step 1: Generate embeddings
    const embeddings = await this.batchEmbed(posts.map((p) => p.text));

    // Step 2: Build EmbeddedPost array
    const embedded: EmbeddedPost[] = posts.map((p, i) => ({
      index: i,
      text: p.text,
      platform: p.platform,
      authorName: p.authorName,
      authorHandle: p.authorHandle,
      timestamp: new Date(p.timestamp),
      sentimentScore: p.sentiment?.score ?? 0,
      sentimentLabel: p.sentiment?.label ?? 'neutral',
      engagement:
        (p.engagement?.likes ?? 0) +
        (p.engagement?.comments ?? 0) +
        (p.engagement?.shares ?? 0),
      embedding: embeddings[i] ?? [],
    }));

    // Step 3: Cluster
    // Cosine similarity threshold for clustering.
    // Higher = tighter clusters (fewer, more specific narratives).
    // Lower = looser clusters (more, broader narratives).
    // gemini-embedding-2-preview produces 3072-dim embeddings where posts about the
    // same topic often have 0.6-0.85 similarity. Using 0.75 forces the algorithm to
    // split posts into distinct sub-narratives within a topic.
    const { clusters, noise } = this.agglomerativeCluster(embedded, 0.75);
    this.logger.log(
      `Clustered into ${clusters.length} narratives (${noise.length} unclustered)`,
    );

    // Step 4: Build narrative objects with metrics
    const narratives: AnalyzedNarrative[] = [];
    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i]!;
      const narrative = this.buildNarrativeMetrics(cluster, i);
      narratives.push(narrative);
    }

    // Step 5: LLM summarization (batched)
    await this.summarizeNarratives(narratives, posts);

    // Sort by post count descending
    narratives.sort((a, b) => b.postIndices.length - a.postIndices.length);

    const unclustered = noise.map((p) => p.index);

    // Step 6: Compute saturation metrics if service is available
    const saturation = this.saturationMetrics
      ? this.saturationMetrics.computeSaturation({
          narratives,
          totalPosts: posts.length,
          unclusteredCount: unclustered.length,
        })
      : undefined;

    return {
      narratives,
      unclustered,
      ...(saturation ? { saturation } : {}),
    };
  }

  // ---------------------------------------------------------------------------
  // Embedding
  // ---------------------------------------------------------------------------

  /**
   * Generate embeddings for an array of texts using Gemini text-embedding-004.
   * Batches in groups of 100 (API limit).
   */
  private async batchEmbed(texts: string[]): Promise<number[][]> {
    if (!this.genAI) {
      this.logger.warn('No Gemini key — using fallback hash embeddings');
      return texts.map((t) => this.fallbackEmbedding(t));
    }

    // Try embedding models in order of preference
    const modelsToTry = [this.embeddingModel, 'gemini-embedding-001'];
    let model = this.genAI.getGenerativeModel({ model: modelsToTry[0]! });
    const BATCH_SIZE = 100;
    const allEmbeddings: number[][] = [];
    let fallbackToNext = false;

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE).map((t) => ({
        content: { role: 'user' as const, parts: [{ text: t.slice(0, 2000) }] },
      }));

      try {
        const result = await model.batchEmbedContents({ requests: batch });
        for (const emb of result.embeddings) {
          allEmbeddings.push(emb.values);
        }
        this.logger.debug(
          `Embedded batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(texts.length / BATCH_SIZE)}`,
        );
      } catch (err) {
        // If first model fails on first batch, try fallback model
        if (i === 0 && !fallbackToNext && modelsToTry.length > 1) {
          this.logger.warn(
            `Model ${modelsToTry[0]} failed, trying ${modelsToTry[1]}: ${err}`,
          );
          fallbackToNext = true;
          model = this.genAI.getGenerativeModel({ model: modelsToTry[1]! });
          // Retry this batch with fallback model
          try {
            const retryResult = await model.batchEmbedContents({ requests: batch });
            for (const emb of retryResult.embeddings) {
              allEmbeddings.push(emb.values);
            }
            continue;
          } catch (retryErr) {
            this.logger.error(`Fallback model also failed: ${retryErr}`);
          }
        } else {
          this.logger.error(`Embedding batch failed: ${err}`);
        }
        // Fill with fallback embeddings for this batch
        for (const t of texts.slice(i, i + BATCH_SIZE)) {
          allEmbeddings.push(this.fallbackEmbedding(t));
        }
      }
    }

    return allEmbeddings;
  }

  /** Simple hash-based fallback when Gemini is unavailable */
  private fallbackEmbedding(text: string): number[] {
    const dim = 768;
    const vec = new Array(dim).fill(0);
    const words = text.toLowerCase().split(/\s+/).slice(0, 100);
    for (let i = 0; i < words.length; i++) {
      const word = words[i]!;
      for (let j = 0; j < word.length; j++) {
        const pos = (i * 7 + j * 13 + word.charCodeAt(j)) % dim;
        vec[pos] += word.charCodeAt(j) / 255 / words.length;
      }
    }
    const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    return mag === 0 ? vec : vec.map((v) => v / mag);
  }

  // ---------------------------------------------------------------------------
  // Clustering
  // ---------------------------------------------------------------------------

  /**
   * Agglomerative clustering with average linkage.
   * Merges the two most similar clusters until similarity drops below threshold.
   * Returns clusters with >= 2 posts; singletons go to noise.
   */
  private agglomerativeCluster(
    posts: EmbeddedPost[],
    similarityThreshold: number,
  ): { clusters: EmbeddedPost[][]; noise: EmbeddedPost[] } {
    if (posts.length <= 1) {
      return { clusters: [], noise: posts };
    }

    // Start with each post as its own cluster
    let clusters: EmbeddedPost[][] = posts.map((p) => [p]);

    // Precompute similarity matrix (upper triangle)
    const n = posts.length;
    const sim = new Float32Array(n * n);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const s = this.cosineSimilarity(posts[i]!.embedding, posts[j]!.embedding);
        sim[i * n + j] = s;
        sim[j * n + i] = s;
      }
    }

    // Average linkage: similarity between clusters = avg of pairwise similarities
    // Use a greedy approach: repeatedly merge the two most similar clusters
    while (clusters.length > 1) {
      let bestSim = -1;
      let bestI = -1;
      let bestJ = -1;

      for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
          const avgSim = this.averageLinkage(clusters[i]!, clusters[j]!, sim, n);
          if (avgSim > bestSim) {
            bestSim = avgSim;
            bestI = i;
            bestJ = j;
          }
        }
      }

      if (bestSim < similarityThreshold || bestI < 0 || bestJ < 0) break;

      // Merge bestJ into bestI
      clusters[bestI] = [...(clusters[bestI] ?? []), ...(clusters[bestJ] ?? [])];
      clusters.splice(bestJ, 1);
    }

    // Separate real clusters (>= 2 posts) from noise (singletons)
    const realClusters: EmbeddedPost[][] = [];
    const noise: EmbeddedPost[] = [];
    for (const cluster of clusters) {
      if (cluster.length >= 2) {
        realClusters.push(cluster);
      } else {
        noise.push(...cluster);
      }
    }

    return { clusters: realClusters, noise };
  }

  private averageLinkage(
    a: EmbeddedPost[],
    b: EmbeddedPost[],
    simMatrix: Float32Array,
    n: number,
  ): number {
    let total = 0;
    for (const p of a) {
      for (const q of b) {
        total += simMatrix[p.index * n + q.index] ?? 0;
      }
    }
    return total / (a.length * b.length);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
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

  // ---------------------------------------------------------------------------
  // Metrics
  // ---------------------------------------------------------------------------

  private buildNarrativeMetrics(
    cluster: EmbeddedPost[],
    index: number,
  ): AnalyzedNarrative {
    // Sort by timestamp
    const sorted = [...cluster].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );

    // Platform breakdown
    const platforms: Record<string, number> = {};
    for (const p of cluster) {
      platforms[p.platform] = (platforms[p.platform] ?? 0) + 1;
    }

    // Author aggregation
    const authorMap = new Map<
      string,
      { name: string; handle: string; count: number }
    >();
    for (const p of cluster) {
      const key = p.authorHandle || p.authorName;
      const existing = authorMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        authorMap.set(key, {
          name: p.authorName,
          handle: p.authorHandle,
          count: 1,
        });
      }
    }
    const authors = Array.from(authorMap.values())
      .map((a) => ({ name: a.name, handle: a.handle, postCount: a.count }))
      .sort((a, b) => b.postCount - a.postCount);

    // Sentiment trajectory (bucket by day or hour depending on range)
    const firstTs = sorted[0]!.timestamp.getTime();
    const lastTs = sorted[sorted.length - 1]!.timestamp.getTime();
    const range = lastTs - firstTs;
    const bucketMs =
      range > 7 * 24 * 60 * 60 * 1000
        ? 24 * 60 * 60 * 1000 // daily for > 7 days
        : 60 * 60 * 1000; // hourly otherwise

    const sentimentBuckets = new Map<number, { sum: number; count: number }>();
    for (const p of sorted) {
      const bucket =
        Math.floor((p.timestamp.getTime() - firstTs) / bucketMs) * bucketMs +
        firstTs;
      const existing = sentimentBuckets.get(bucket);
      if (existing) {
        existing.sum += p.sentimentScore;
        existing.count++;
      } else {
        sentimentBuckets.set(bucket, {
          sum: p.sentimentScore,
          count: 1,
        });
      }
    }
    const sentimentTrajectory = Array.from(sentimentBuckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([ts, data]) => ({
        timestamp: new Date(ts).toISOString(),
        score: data.sum / data.count,
      }));

    // Velocity
    const velocity = this.calculateVelocity(sorted);

    // Centroid embedding
    const dim = cluster[0]?.embedding.length ?? 768;
    const centroid = new Array(dim).fill(0) as number[];
    for (const p of cluster) {
      for (let i = 0; i < dim; i++) {
        centroid[i] = (centroid[i] ?? 0) + (p.embedding[i] ?? 0) / cluster.length;
      }
    }

    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;

    return {
      id: `narrative-${index}`,
      summary: '', // Filled by LLM step
      postIndices: cluster.map((p) => p.index),
      avgSentiment:
        cluster.reduce((s, p) => s + p.sentimentScore, 0) / cluster.length,
      sentimentTrajectory,
      platforms,
      authors,
      firstSeen: first.timestamp.toISOString(),
      lastSeen: last.timestamp.toISOString(),
      totalEngagement: cluster.reduce((s, p) => s + p.engagement, 0),
      velocity,
      centroidEmbedding: centroid,
    };
  }

  private calculateVelocity(
    sorted: EmbeddedPost[],
  ): AnalyzedNarrative['velocity'] {
    if (sorted.length < 2) {
      return { postsPerHour: 0, acceleration: 0, trend: 'steady' };
    }

    const firstTs = sorted[0]!.timestamp.getTime();
    const lastTs = sorted[sorted.length - 1]!.timestamp.getTime();
    const hours = Math.max((lastTs - firstTs) / (1000 * 60 * 60), 0.1);
    const postsPerHour = sorted.length / hours;

    // Acceleration: compare first-half rate to second-half rate
    const mid = Math.floor(sorted.length / 2);
    const midTs = sorted[mid]!.timestamp.getTime();

    const firstHalfHours = Math.max((midTs - firstTs) / (1000 * 60 * 60), 0.1);
    const secondHalfHours = Math.max(
      (lastTs - midTs) / (1000 * 60 * 60),
      0.1,
    );

    const firstHalfRate = mid / firstHalfHours;
    const secondHalfRate = (sorted.length - mid) / secondHalfHours;

    const acceleration =
      firstHalfRate > 0
        ? (secondHalfRate - firstHalfRate) / firstHalfRate
        : 0;

    let trend: AnalyzedNarrative['velocity']['trend'] = 'steady';
    if (acceleration > 0.5) trend = 'surging';
    else if (acceleration > 0.1) trend = 'growing';
    else if (acceleration < -0.3) trend = 'fading';

    return { postsPerHour, acceleration, trend };
  }

  // ---------------------------------------------------------------------------
  // LLM Summarization
  // ---------------------------------------------------------------------------

  /**
   * Summarize all narratives in a single batched LLM call.
   * Modifies narratives in place.
   */
  private async summarizeNarratives(
    narratives: AnalyzedNarrative[],
    posts: Array<{ text: string }>,
  ): Promise<void> {
    if (!this.genAI || narratives.length === 0) {
      // Fallback: use most-engaged post text
      for (const n of narratives) {
        const texts = n.postIndices.map((i) => posts[i]?.text ?? '');
        const firstText = texts[0] ?? '';
        n.summary =
          firstText.slice(0, 120) + (firstText.length > 120 ? '...' : '');
      }
      return;
    }

    const model = this.genAI.getGenerativeModel({ model: this.chatModel });

    // Build prompt with sample posts from each narrative
    const sections = narratives.map((n, idx) => {
      const sampleTexts = n.postIndices
        .slice(0, 8)
        .map((i) => (posts[i]?.text ?? '').slice(0, 200))
        .join('\n- ');
      return `[Narrative ${idx}] (${n.postIndices.length} posts, sentiment: ${n.avgSentiment.toFixed(2)})\n- ${sampleTexts}`;
    });

    const prompt = `You are analyzing social media narratives. For each numbered narrative below, write a concise summary of the core claim or theme. Use as many words as needed to capture the nuance, but be direct.

Rules:
- Do NOT start with "This narrative" or "These posts" — jump straight to the substance
- Good: "Solana meme tokens gaining traction as AI agent narrative grows on crypto Twitter"
- Good: "Community frustration over project going silent — speculation about whether team abandoned it"
- Good: "Insider wallet tracking reveals pre-listing accumulation patterns tied to Binance listings"
- Bad: "This narrative discusses community frustration..."
- Do NOT editorialize or judge — describe what the posts are saying

Domain knowledge: Long alphanumeric strings (32-44 chars) are cryptocurrency wallet/contract addresses. Tokens prefixed with $ (like $GOAT, $ACT) are crypto tickers. Subreddit names (r/...) are Reddit communities.

Respond ONLY with a JSON array of strings, one per narrative, in order. No other text.

${sections.join('\n\n')}`;

    try {
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        // Fix common LLM JSON issues: trailing commas
        const cleaned = jsonMatch[0]!.replace(/,\s*]/g, ']').replace(/,\s*}/g, '}');
        const summaries = JSON.parse(cleaned) as string[];
        for (let i = 0; i < Math.min(summaries.length, narratives.length); i++) {
          const summary = summaries[i];
          if (typeof summary === 'string' && summary.length > 0) {
            narratives[i]!.summary = summary;
          }
        }
      }
    } catch (err) {
      this.logger.warn(`LLM summarization failed: ${err}`);
    }

    // Fill any missing summaries with fallback
    for (const n of narratives) {
      if (!n.summary) {
        const firstIdx = n.postIndices[0] ?? 0;
        const text = posts[firstIdx]?.text ?? '';
        n.summary = text.slice(0, 120) + (text.length > 120 ? '...' : '');
      }
    }
  }
}
