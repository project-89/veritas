import { GoogleGenerativeAI } from '@google/generative-ai';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cosineSimilarity } from '../utils/math';
import type { SaturationReport } from './saturation-metrics.service';
import { SaturationMetricsService } from './saturation-metrics.service';
import { DETERMINISTIC_JSON_CONFIG, geminiChatModel } from './utils/llm-config';
import { LlmBudgetExceededError, LlmGateway } from './utils/llm-gateway';

/** Injection token for the EmbeddingCacheRepository (optional — provided by app module) */
export const EMBEDDING_CACHE_STORE = Symbol('EMBEDDING_CACHE_STORE');

/** Interface for the embedding cache to avoid hard dependency on ingestion lib */
interface EmbeddingCacheStore {
  getEmbedding(contentHash: string, model: string): Promise<number[] | null>;
  setEmbedding(contentHash: string, model: string, embedding: number[]): Promise<void>;
  getBatchEmbeddings(contentHashes: string[], model: string): Promise<Map<string, number[]>>;
}

/**
 * Hash text content for embedding cache lookups.
 * Uses the first 2000 chars (same truncation as the embedding service).
 */
function hashText(text: string): string {
  let hash = 0;
  const str = text.slice(0, 2000);
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return `emb-${hash.toString(36)}`;
}

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
  claimFacets: string[];
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
  /** Whether this is a repeated cluster or a high-signal singleton */
  supportLevel?: 'clustered' | 'emerging';
}

export interface AnalyzeResult {
  narratives: AnalyzedNarrative[];
  /** Posts that didn't cluster (noise) */
  unclustered: number[];
  /** Saturation metrics (present when SaturationMetricsService is available) */
  saturation?: SaturationReport;
  /**
   * Provenance of the clustering. Consumers must NOT present hash-fallback
   * clusters as semantic, nor first-post summaries as LLM synthesis.
   * - embeddingSource: 'gemini' (real semantic vectors), 'hash-fallback' (a
   *   character-hash bag-of-words substitute used when the embedding API is
   *   unavailable — NOT semantic), or 'mixed' (some batches fell back).
   * - summarySource: 'llm', 'first-post' (raw truncated post text), or 'mixed'.
   */
  embeddingSource: 'gemini' | 'hash-fallback' | 'mixed';
  summarySource: 'llm' | 'first-post' | 'mixed';
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
  private readonly embeddingModel: string;
  private readonly embeddingFallbackModels: string[];
  private readonly embeddingBatchSize: number;
  private readonly embeddingCharLimit: number;
  private readonly embeddingRetryBaseMs: number;
  private readonly embeddingMaxRetries: number;
  private readonly chatModel: string = geminiChatModel();

  // Per-run provenance counters (reset at the start of each analyze()). The
  // analysis queue processes these jobs sequentially per worker.
  private runEmbedFallbacks = 0;
  private runEmbedTotal = 0;
  private runSummaryFallbacks = 0;
  private runSummaryTotal = 0;

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly saturationMetrics?: SaturationMetricsService,
    @Optional()
    @Inject(EMBEDDING_CACHE_STORE)
    private readonly embeddingCache?: EmbeddingCacheStore,
  ) {
    this.embeddingModel =
      this.configService.get<string>('GEMINI_EMBEDDING_MODEL') ||
      process.env['GEMINI_EMBEDDING_MODEL'] ||
      'gemini-embedding-001';
    this.embeddingFallbackModels = ['gemini-embedding-001', 'gemini-embedding-2-preview'].filter(
      (model, index, arr) => arr.indexOf(model) === index && model !== this.embeddingModel,
    );
    this.embeddingBatchSize = Math.max(
      8,
      Number(
        this.configService.get<string>('GEMINI_EMBED_BATCH_SIZE') ||
          process.env['GEMINI_EMBED_BATCH_SIZE'] ||
          '32',
      ) || 32,
    );
    this.embeddingCharLimit = Math.max(
      256,
      Number(
        this.configService.get<string>('GEMINI_EMBED_CHAR_LIMIT') ||
          process.env['GEMINI_EMBED_CHAR_LIMIT'] ||
          '1200',
      ) || 1200,
    );
    this.embeddingRetryBaseMs = Math.max(
      100,
      Number(
        this.configService.get<string>('GEMINI_EMBED_RETRY_BASE_MS') ||
          process.env['GEMINI_EMBED_RETRY_BASE_MS'] ||
          '1500',
      ) || 1500,
    );
    this.embeddingMaxRetries = Math.max(
      0,
      Number(
        this.configService.get<string>('GEMINI_EMBED_MAX_RETRIES') ||
          process.env['GEMINI_EMBED_MAX_RETRIES'] ||
          '4',
      ) || 4,
    );

    const geminiKey =
      this.configService.get<string>('GEMINI_API_KEY') || process.env['GEMINI_API_KEY'];

    if (geminiKey) {
      this.genAI = new GoogleGenerativeAI(geminiKey);
      this.logger.log(
        `NarrativeAnalysisService initialized (embedding: ${this.embeddingModel}, chat: ${this.chatModel})`,
      );
    } else {
      this.logger.warn('GEMINI_API_KEY not set — narrative analysis will use fallback clustering');
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
      return { narratives: [], unclustered: [], embeddingSource: 'gemini', summarySource: 'llm' };
    }

    this.logger.log(`Analyzing ${posts.length} posts...`);

    // Reset per-run provenance counters.
    this.runEmbedFallbacks = 0;
    this.runEmbedTotal = 0;
    this.runSummaryFallbacks = 0;
    this.runSummaryTotal = 0;

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
        (p.engagement?.likes ?? 0) + (p.engagement?.comments ?? 0) + (p.engagement?.shares ?? 0),
      embedding: embeddings[i] ?? [],
      claimFacets: this.extractClaimFacets(p.text),
    }));

    // Step 3: Cluster
    // Cosine similarity threshold for clustering.
    // Higher = tighter clusters (fewer, more specific narratives).
    // Lower = looser clusters (more, broader narratives).
    // gemini-embedding-2-preview produces 3072-dim embeddings where posts about the
    // same topic often have 0.6-0.85 similarity. Using 0.75 forces the algorithm to
    // split posts into distinct sub-narratives within a topic.
    const { clusters, emerging, noise } = this.agglomerativeCluster(embedded, 0.75);
    this.logger.log(
      `Clustered into ${clusters.length} narratives (+${emerging.length} emerging, ${noise.length} unclustered)`,
    );

    // Step 4: Build narrative objects with metrics
    const narratives: AnalyzedNarrative[] = [];
    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
      if (!cluster) continue;
      const narrative = this.buildNarrativeMetrics(cluster, i, 'clustered');
      narratives.push(narrative);
    }

    for (let i = 0; i < emerging.length; i++) {
      const cluster = emerging[i];
      if (!cluster) continue;
      const narrative = this.buildNarrativeMetrics(cluster, clusters.length + i, 'emerging');
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

    this.runEmbedTotal = posts.length;
    const embeddingSource: AnalyzeResult['embeddingSource'] =
      this.runEmbedFallbacks === 0
        ? 'gemini'
        : this.runEmbedFallbacks >= this.runEmbedTotal
          ? 'hash-fallback'
          : 'mixed';
    const summarySource: AnalyzeResult['summarySource'] =
      this.runSummaryFallbacks === 0
        ? 'llm'
        : this.runSummaryFallbacks >= this.runSummaryTotal
          ? 'first-post'
          : 'mixed';
    if (embeddingSource !== 'gemini') {
      this.logger.warn(
        `Narrative clustering used ${embeddingSource} embeddings (${this.runEmbedFallbacks}/${this.runEmbedTotal} fallback) — NOT fully semantic`,
      );
    }

    return {
      narratives,
      unclustered,
      embeddingSource,
      summarySource,
      ...(saturation ? { saturation } : {}),
    };
  }

  // ---------------------------------------------------------------------------
  // Embedding
  // ---------------------------------------------------------------------------

  /**
   * Generate embeddings for an array of texts using Gemini embeddings.
   * Uses conservative batches and backoff to avoid slamming Vertex embedding quotas.
   */
  private async batchEmbed(texts: string[]): Promise<number[][]> {
    if (!this.genAI) {
      this.logger.warn('No Gemini key — using fallback hash embeddings');
      return texts.map((t) => this.fallbackEmbedding(t));
    }

    const modelName = this.embeddingModel;

    // --- Check embedding cache for already-computed embeddings ---
    const hashes = texts.map((t) => hashText(t));
    const cachedMap = new Map<string, number[]>();

    if (this.embeddingCache) {
      try {
        const cached = await this.embeddingCache.getBatchEmbeddings(hashes, modelName);
        for (const [h, emb] of cached) {
          cachedMap.set(h, emb);
        }
        if (cachedMap.size > 0) {
          this.logger.log(
            `Embedding cache hit: ${cachedMap.size}/${texts.length} texts already cached`,
          );
        }
      } catch (err) {
        this.logger.warn(`Embedding cache lookup failed: ${err}`);
      }
    }

    // Build list of uncached texts (preserving original indices)
    const uncachedIndices: number[] = [];
    const uncachedTexts: string[] = [];
    for (let i = 0; i < texts.length; i++) {
      const hash = hashes[i];
      const text = texts[i];
      if (!hash || text == null) continue;
      if (!cachedMap.has(hash)) {
        uncachedIndices.push(i);
        uncachedTexts.push(text);
      }
    }

    // --- Embed only uncached texts via Gemini ---
    const freshEmbeddings = new Map<number, number[]>();

    if (uncachedTexts.length > 0) {
      const modelsToTry = [modelName, ...this.embeddingFallbackModels];
      const primaryModel = modelsToTry[0] ?? modelName;
      let model = this.genAI.getGenerativeModel({ model: primaryModel });
      const BATCH_SIZE = this.embeddingBatchSize;
      let embIdx = 0;
      let fallbackToNext = false;

      for (let i = 0; i < uncachedTexts.length; i += BATCH_SIZE) {
        const batchTexts = uncachedTexts.slice(i, i + BATCH_SIZE);
        const batch = batchTexts.map((t) => ({
          content: { role: 'user' as const, parts: [{ text: this.truncateForEmbedding(t) }] },
        }));

        try {
          const result = await this.embedBatchWithRetry(model, batch, primaryModel);
          for (let j = 0; j < result.embeddings.length; j++) {
            const origIdx = uncachedIndices[embIdx];
            const embedding = result.embeddings[j];
            if (origIdx == null || !embedding) {
              embIdx++;
              continue;
            }
            freshEmbeddings.set(origIdx, embedding.values);
            embIdx++;
          }
          this.logger.debug(
            `Embedded batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(uncachedTexts.length / BATCH_SIZE)}`,
          );
        } catch (err) {
          if (i === 0 && !fallbackToNext && modelsToTry.length > 1) {
            this.logger.warn(`Model ${modelsToTry[0]} failed, trying ${modelsToTry[1]}: ${err}`);
            fallbackToNext = true;
            const fallbackModel = modelsToTry[1];
            if (!fallbackModel) {
              this.logger.error(`Fallback model also failed: ${err}`);
              continue;
            }
            model = this.genAI.getGenerativeModel({ model: fallbackModel });
            try {
              const retryResult = await this.embedBatchWithRetry(model, batch, fallbackModel);
              for (let j = 0; j < retryResult.embeddings.length; j++) {
                const origIdx = uncachedIndices[embIdx];
                const embedding = retryResult.embeddings[j];
                if (origIdx == null || !embedding) {
                  embIdx++;
                  continue;
                }
                freshEmbeddings.set(origIdx, embedding.values);
                embIdx++;
              }
              continue;
            } catch (retryErr) {
              this.logger.error(`Fallback model also failed: ${retryErr}`);
            }
          } else {
            this.logger.error(`Embedding batch failed: ${err}`);
          }
          // Fill with fallback embeddings for this batch
          for (const t of batchTexts) {
            const origIdx = uncachedIndices[embIdx];
            if (origIdx == null) {
              embIdx++;
              continue;
            }
            freshEmbeddings.set(origIdx, this.fallbackEmbedding(t));
            embIdx++;
          }
        }
      }

      // --- Store fresh embeddings in cache ---
      if (this.embeddingCache) {
        try {
          for (const [origIdx, emb] of freshEmbeddings) {
            const h = hashes[origIdx];
            if (!h) continue;
            // Fire-and-forget — don't block on cache writes
            this.embeddingCache.setEmbedding(h, modelName, emb).catch((cacheError) => {
              this.logger.debug(
                `Failed to persist embedding cache entry for model ${modelName}: ${cacheError}`,
              );
            });
          }
        } catch {
          // Best effort
        }
      }
    }

    // --- Assemble final result in original order ---
    const allEmbeddings: number[][] = [];
    for (let i = 0; i < texts.length; i++) {
      const h = hashes[i];
      if (!h) {
        allEmbeddings.push(this.fallbackEmbedding(texts[i] ?? ''));
        continue;
      }
      const cached = cachedMap.get(h);
      if (cached) {
        allEmbeddings.push(cached);
      } else {
        allEmbeddings.push(freshEmbeddings.get(i) ?? this.fallbackEmbedding(texts[i] ?? ''));
      }
    }

    return allEmbeddings;
  }

  private truncateForEmbedding(text: string): string {
    return text.slice(0, this.embeddingCharLimit);
  }

  private isRateLimitError(err: unknown): boolean {
    const message = err instanceof Error ? err.message : String(err);
    return (
      message.includes('429') ||
      message.includes('Too Many Requests') ||
      message.includes('Quota exceeded') ||
      message.includes('RESOURCE_EXHAUSTED')
    );
  }

  private async embedBatchWithRetry(
    model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>,
    batch: Array<{ content: { role: 'user'; parts: Array<{ text: string }> } }>,
    modelLabel: string,
  ): Promise<Awaited<ReturnType<typeof model.batchEmbedContents>>> {
    let attempt = 0;
    while (true) {
      try {
        return await model.batchEmbedContents({ requests: batch });
      } catch (err) {
        if (!this.isRateLimitError(err) || attempt >= this.embeddingMaxRetries) {
          throw err;
        }

        const backoffMs = this.embeddingRetryBaseMs * 2 ** attempt;
        this.logger.warn(
          `Embedding rate limit for ${modelLabel}; retrying batch in ${backoffMs}ms (attempt ${attempt + 1}/${this.embeddingMaxRetries})`,
        );
        await this.sleep(backoffMs);
        attempt += 1;
      }
    }
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Simple hash-based fallback when Gemini is unavailable (NOT semantic). */
  private fallbackEmbedding(text: string): number[] {
    this.runEmbedFallbacks++;
    const dim = 768;
    const vec = new Array(dim).fill(0);
    const words = text.toLowerCase().split(/\s+/).slice(0, 100);
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (!word) continue;
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
  ): { clusters: EmbeddedPost[][]; emerging: EmbeddedPost[][]; noise: EmbeddedPost[] } {
    if (posts.length <= 1) {
      const only = posts[0];
      if (!only) return { clusters: [], emerging: [], noise: [] };
      return this.isEmergingNarrativeCandidate(only)
        ? { clusters: [], emerging: [[only]], noise: [] }
        : { clusters: [], emerging: [], noise: posts };
    }

    // Start with each post as its own cluster
    const clusters: EmbeddedPost[][] = posts.map((p) => [p]);

    // Precompute similarity matrix (upper triangle)
    const n = posts.length;
    const sim = new Float32Array(n * n);
    for (let i = 0; i < n; i++) {
      const leftPost = posts[i];
      if (!leftPost) continue;
      for (let j = i + 1; j < n; j++) {
        const rightPost = posts[j];
        if (!rightPost) continue;
        const s = this.cosineSimilarity(leftPost.embedding, rightPost.embedding);
        const adjusted = this.adjustNarrativeSimilarity(leftPost, rightPost, s);
        sim[i * n + j] = adjusted;
        sim[j * n + i] = adjusted;
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
          const leftCluster = clusters[i];
          const rightCluster = clusters[j];
          if (!leftCluster || !rightCluster) continue;
          const avgSim = this.averageLinkage(leftCluster, rightCluster, sim, n);
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
    const emerging: EmbeddedPost[][] = [];
    const noise: EmbeddedPost[] = [];
    for (const cluster of clusters) {
      if (cluster.length >= 2) {
        realClusters.push(cluster);
      } else if (cluster[0] && this.isEmergingNarrativeCandidate(cluster[0])) {
        emerging.push(cluster);
      } else {
        noise.push(...cluster);
      }
    }

    emerging.sort((a, b) => this.getEmergingCandidateScore(b) - this.getEmergingCandidateScore(a));

    return { clusters: realClusters, emerging: emerging.slice(0, 8), noise };
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
    return cosineSimilarity(a, b);
  }

  // ---------------------------------------------------------------------------
  // Metrics
  // ---------------------------------------------------------------------------

  private buildNarrativeMetrics(
    cluster: EmbeddedPost[],
    index: number,
    supportLevel: 'clustered' | 'emerging' = 'clustered',
  ): AnalyzedNarrative {
    // Sort by timestamp
    const sorted = [...cluster].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (!first || !last) {
      throw new Error('buildNarrativeMetrics requires at least one post');
    }

    // Platform breakdown
    const platforms: Record<string, number> = {};
    for (const p of cluster) {
      platforms[p.platform] = (platforms[p.platform] ?? 0) + 1;
    }

    // Author aggregation
    const authorMap = new Map<string, { name: string; handle: string; count: number }>();
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
    const firstTs = first.timestamp.getTime();
    const lastTs = last.timestamp.getTime();
    const range = lastTs - firstTs;
    const bucketMs =
      range > 7 * 24 * 60 * 60 * 1000
        ? 24 * 60 * 60 * 1000 // daily for > 7 days
        : 60 * 60 * 1000; // hourly otherwise

    const sentimentBuckets = new Map<number, { sum: number; count: number }>();
    for (const p of sorted) {
      const bucket = Math.floor((p.timestamp.getTime() - firstTs) / bucketMs) * bucketMs + firstTs;
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

    return {
      id: `narrative-${index}`,
      summary: '', // Filled by LLM step
      postIndices: cluster.map((p) => p.index),
      avgSentiment: cluster.reduce((s, p) => s + p.sentimentScore, 0) / cluster.length,
      sentimentTrajectory,
      platforms,
      authors,
      firstSeen: first.timestamp.toISOString(),
      lastSeen: last.timestamp.toISOString(),
      totalEngagement: cluster.reduce((s, p) => s + p.engagement, 0),
      velocity,
      centroidEmbedding: centroid,
      supportLevel,
    };
  }

  private adjustNarrativeSimilarity(a: EmbeddedPost, b: EmbeddedPost, cosine: number): number {
    let adjusted = cosine;

    const aFacets = new Set(a.claimFacets);
    const bFacets = new Set(b.claimFacets);
    const overlap = [...aFacets].filter((facet) => bFacets.has(facet));

    if (aFacets.size > 0 && bFacets.size > 0 && overlap.length === 0) {
      adjusted *= 0.72;
    } else if (overlap.length > 0) {
      adjusted *= 1.08;
    }

    const isAccusation = (facets: Set<string>) =>
      facets.has('scam') || facets.has('investigation') || facets.has('onchain');
    const isPromotion = (facets: Set<string>) =>
      facets.has('promotion') || facets.has('legitimacy');

    if (
      ((isAccusation(aFacets) && isPromotion(bFacets)) ||
        (isAccusation(bFacets) && isPromotion(aFacets))) &&
      Math.abs(a.sentimentScore - b.sentimentScore) >= 0.35
    ) {
      adjusted *= 0.68;
    }

    return Math.max(0, Math.min(1, adjusted));
  }

  private extractClaimFacets(text: string): string[] {
    const lower = text.toLowerCase();
    const facets = new Set<string>();

    if (/\b(scam|fraud|rug pull|rugpull|ponzi|fake project|warning)\b/.test(lower)) {
      facets.add('scam');
    }
    if (/\b(presale|launch|buy now|moon|100x|airdrop|token sale|whitelist)\b/.test(lower)) {
      facets.add('promotion');
    }
    if (/\b(review|analysis|explainer|deep dive|walkthrough|breakdown)\b/.test(lower)) {
      facets.add('analysis');
    }
    if (/\b(wallet|contract|deployer|etherscan|transaction|on-chain|onchain|funds)\b/.test(lower)) {
      facets.add('onchain');
    }
    if (/\b(audit|certik|kyc|doxx|partnership|roadmap|utility)\b/.test(lower)) {
      facets.add('legitimacy');
    }
    if (/\b(exposed|investigation|sleuth|traced|evidence|proof)\b/.test(lower)) {
      facets.add('investigation');
    }

    return [...facets];
  }

  private isEmergingNarrativeCandidate(post: EmbeddedPost): boolean {
    return this.scoreEmergingNarrativeCandidate(post) >= 2;
  }

  private getEmergingCandidateScore(cluster: EmbeddedPost[]): number {
    const candidate = cluster[0] ?? cluster[cluster.length - 1];
    return candidate ? this.scoreEmergingNarrativeCandidate(candidate) : 0;
  }

  private scoreEmergingNarrativeCandidate(post: EmbeddedPost): number {
    let score = 0;
    if (post.claimFacets.length > 0) score += 2;
    if (post.platform === 'youtube' || post.platform === 'rss') score += 1;
    if (post.text.trim().length >= 220) score += 1;
    if (post.engagement >= 25) score += 1;
    return score;
  }

  private calculateVelocity(sorted: EmbeddedPost[]): AnalyzedNarrative['velocity'] {
    // Trend/acceleration are pure noise below this many posts — a 2-post
    // cluster over 3 minutes must not report "20 posts/hr, surging".
    const MIN_POSTS_FOR_TREND = 5;

    if (sorted.length < 2) {
      return { postsPerHour: 0, acceleration: 0, trend: 'steady' };
    }

    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (!first || !last) {
      return { postsPerHour: 0, acceleration: 0, trend: 'steady' };
    }
    const firstTs = first.timestamp.getTime();
    const lastTs = last.timestamp.getTime();

    // For small clusters, floor the span at 1 hour so a handful of posts in a
    // few minutes doesn't manufacture a huge per-hour rate. Larger clusters use
    // the real (6-minute floored) span.
    const spanFloorHours = sorted.length < MIN_POSTS_FOR_TREND ? 1 : 0.1;
    const hours = Math.max((lastTs - firstTs) / (1000 * 60 * 60), spanFloorHours);
    const postsPerHour = sorted.length / hours;

    // Below the sample-size floor, report volume but never a directional trend.
    if (sorted.length < MIN_POSTS_FOR_TREND) {
      return { postsPerHour, acceleration: 0, trend: 'steady' };
    }

    // Acceleration: compare first-half rate to second-half rate
    const mid = Math.floor(sorted.length / 2);
    const midPoint = sorted[mid];
    if (!midPoint) {
      return { postsPerHour, acceleration: 0, trend: 'steady' };
    }
    const midTs = midPoint.timestamp.getTime();

    const firstHalfHours = Math.max((midTs - firstTs) / (1000 * 60 * 60), 0.1);
    const secondHalfHours = Math.max((lastTs - midTs) / (1000 * 60 * 60), 0.1);

    const firstHalfRate = mid / firstHalfHours;
    const secondHalfRate = (sorted.length - mid) / secondHalfHours;

    const acceleration = firstHalfRate > 0 ? (secondHalfRate - firstHalfRate) / firstHalfRate : 0;

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
    this.runSummaryTotal += narratives.length;
    if (!this.genAI || narratives.length === 0) {
      // Fallback: use most-engaged post text
      for (const n of narratives) {
        const texts = n.postIndices.map((i) => posts[i]?.text ?? '');
        const firstText = texts[0] ?? '';
        n.summary = firstText.slice(0, 120) + (firstText.length > 120 ? '...' : '');
        this.runSummaryFallbacks++;
      }
      return;
    }

    const model = this.genAI.getGenerativeModel({
      model: this.chatModel,
      generationConfig: DETERMINISTIC_JSON_CONFIG,
    });

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
      const responseText = await LlmGateway.instance.run({
        model: this.chatModel,
        promptVersion: 1,
        prompt,
        generate: () => model.generateContent(prompt).then((r) => r.response.text()),
      });
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);

      if (jsonMatch) {
        // Fix common LLM JSON issues: trailing commas
        const cleaned = jsonMatch[0].replace(/,\s*]/g, ']').replace(/,\s*}/g, '}');
        const summaries = JSON.parse(cleaned) as string[];
        for (let i = 0; i < Math.min(summaries.length, narratives.length); i++) {
          const summary = summaries[i];
          if (typeof summary === 'string' && summary.length > 0) {
            const narrative = narratives[i];
            if (narrative) {
              narrative.summary = summary;
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof LlmBudgetExceededError) {
        this.logger.warn(`LLM summarization skipped — ${err.message}`);
      } else {
        this.logger.warn(`LLM summarization failed: ${err}`);
      }
    }

    // Fill any missing summaries with fallback (LLM failed for these).
    for (const n of narratives) {
      if (!n.summary) {
        const firstIdx = n.postIndices[0] ?? 0;
        const text = posts[firstIdx]?.text ?? '';
        n.summary = text.slice(0, 120) + (text.length > 120 ? '...' : '');
        this.runSummaryFallbacks++;
      }
    }
  }
}
