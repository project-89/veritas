import { GoogleGenerativeAI } from '@google/generative-ai';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CausalReasoningService } from './causal-reasoning.service';
import type { RawPost } from './deviation.service';
import type { AnalyzedNarrative } from './narrative-analysis.service';
import { AcledAdapter } from './signal-adapters/acled.adapter';
import { CoinGeckoAdapter } from './signal-adapters/coingecko.adapter';
import { FredAdapter } from './signal-adapters/fred.adapter';
import { GdacsAdapter } from './signal-adapters/gdacs.adapter';
import { GdeltAdapter } from './signal-adapters/gdelt.adapter';
import { LlmHypothesisAdapter } from './signal-adapters/llm-hypothesis.adapter';
import { ReliefWebAdapter } from './signal-adapters/reliefweb.adapter';
import type { ExternalSignal, SignalAdapter } from './signal-adapters/signal-adapter.interface';
import { UsgsAdapter } from './signal-adapters/usgs.adapter';
import { WorldBankAdapter } from './signal-adapters/worldbank.adapter';
import { YahooFinanceAdapter } from './signal-adapters/yahoo-finance.adapter';
import { DETERMINISTIC_JSON_CONFIG, geminiChatModel } from './utils/llm-config';

/** Injection token for the causal reasoning service (avoids circular dependency). */
export const CAUSAL_REASONING_SERVICE = Symbol('CAUSAL_REASONING_SERVICE');

// ---------------------------------------------------------------------------
// Signal cache persistence interface (implemented by SignalCacheRepository)
// ---------------------------------------------------------------------------

/**
 * Injection token for the signal cache store — optional dependency.
 * When provided (by the app module), signals are persisted to MongoDB.
 * When absent (in tests), adapters always fetch fresh.
 */
export const SIGNAL_CACHE_STORE = Symbol('SIGNAL_CACHE_STORE');

/** Minimal interface for signal persistence — decoupled from the repository class. */
export interface SignalCacheStore {
  findGlobalCache(
    adapterName: string,
    startDate: string,
    endDate: string,
  ): Promise<{ signals: CachedSignalData[]; fetchedAt: Date } | null>;
  findQueryCache(
    adapterName: string,
    keywords: string[],
    startDate: string,
    endDate: string,
  ): Promise<{ signals: CachedSignalData[]; fetchedAt: Date } | null>;
  saveSignals(params: {
    adapterName: string;
    scope: 'global' | 'query';
    keywords: string[];
    startDate: string;
    endDate: string;
    signals: CachedSignalData[];
    maxAgeMs: number;
  }): Promise<void>;
}

/** Shape of a signal stored in the cache — matches ExternalSignal. */
export type CachedSignalData = ExternalSignal;

// ---------------------------------------------------------------------------
// Mycelium types (mirrored from @veritas-nx/visualization to avoid cross-lib dep)
// ---------------------------------------------------------------------------

export interface MyceliumNode {
  id: string;
  narrativeId: string;
  content: string;
  timestamp: Date;
  strength: number;
  position?: { x: number; y: number; z: number };
  connections: string[];
  type: 'root' | 'branch' | 'leaf';
  metrics: { influence: number; growth: number; color: string };
}

export interface MyceliumBranch {
  id: string;
  sourceId: string;
  targetId: string;
  strength: number;
  type: 'primary' | 'secondary' | 'tertiary';
  metrics: { width: number; color: string; age: number };
}

export interface MyceliumCluster {
  id: string;
  name: string;
  description: string;
  color: string;
  nodes: string[];
  centralNodeId: string;
  metrics: { cohesion: number; influence: number; growth: number };
}

export interface MyceliumData {
  nodes: MyceliumNode[];
  branches: MyceliumBranch[];
  clusters: MyceliumCluster[];
  metadata: {
    timestamp: Date;
    totalStrength: number;
    dominantClusterId: string;
    timeframe: { start: Date; end: Date };
  };
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single node in a transmission chain connecting narrative to real-world effect. */
export interface TransmissionChainNode {
  node: string;
  type: 'narrative' | 'economic' | 'political' | 'social' | 'market';
  description: string;
  timestamp?: string;
  confidence: number;
}

/** A transmission chain showing how a narrative connects to real-world effects. */
export interface TransmissionChain {
  narrativeId: string;
  narrativeSummary: string;
  chain: TransmissionChainNode[];
  overallConfidence: number;
}

/** A correlation between a narrative and external signals. */
export interface NarrativeCorrelation {
  narrativeId: string;
  narrativeSummary: string;
  correlatedSignals: Array<{
    signal: ExternalSignal;
    correlationStrength: number;
    temporalOffset: string;
    possibleRelationship: 'caused_by' | 'caused' | 'coincident' | 'amplified';
  }>;
  transmissionChains: TransmissionChain[];
}

/** Full result of downstream effects analysis. */
export interface DownstreamEffectsResult {
  narrativeCorrelations: NarrativeCorrelation[];
  externalSignals: ExternalSignal[];
  summary: string;
}

// ---------------------------------------------------------------------------
// Domain colour palette for mycelium visualization
// ---------------------------------------------------------------------------

const DOMAIN_COLORS: Record<string, string> = {
  narrative: '#8B5CF6', // purple
  economic: '#10B981', // green
  political: '#EF4444', // red
  social: '#3B82F6', // blue
  market: '#F59E0B', // amber
  media: '#EC4899', // pink
};

const CLUSTER_COLORS = [
  '#8B5CF6',
  '#10B981',
  '#EF4444',
  '#3B82F6',
  '#F59E0B',
  '#EC4899',
  '#06B6D4',
  '#84CC16',
];

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class DownstreamEffectsService {
  private readonly logger = new Logger(DownstreamEffectsService.name);
  private readonly genAI: GoogleGenerativeAI | null = null;
  private readonly chatModel = geminiChatModel();
  private readonly adapters: SignalAdapter[] = [];

  constructor(
    private readonly configService: ConfigService,
    @Optional() @Inject(SIGNAL_CACHE_STORE) private readonly signalCache?: SignalCacheStore,
    @Optional()
    @Inject(CAUSAL_REASONING_SERVICE)
    private readonly causalReasoning?: CausalReasoningService,
  ) {
    const geminiKey =
      this.configService.get<string>('GEMINI_API_KEY') || process.env['GEMINI_API_KEY'];

    if (geminiKey) {
      this.genAI = new GoogleGenerativeAI(geminiKey);
    } else {
      this.logger.warn('GEMINI_API_KEY not set — downstream effects will use fallback mode');
    }

    // Register adapters — real-world data sources only by default.
    this.adapters.push(new GdeltAdapter());
    this.adapters.push(new YahooFinanceAdapter());
    this.adapters.push(new WorldBankAdapter());
    this.adapters.push(new FredAdapter());
    this.adapters.push(new CoinGeckoAdapter());
    this.adapters.push(new AcledAdapter());
    this.adapters.push(new UsgsAdapter());
    this.adapters.push(new GdacsAdapter());
    this.adapters.push(new ReliefWebAdapter());

    // The LLM-hypothesis adapter INVENTS plausible signals rather than
    // fetching real ones. Feeding synthetic signals into causal reasoning
    // contaminates the evidence chain, so it is opt-in only.
    if (process.env['ENABLE_LLM_HYPOTHESIS_SIGNALS'] === 'true') {
      this.logger.warn(
        'LLM-hypothesis signal adapter ENABLED — downstream-effects output will mix synthetic (hypothesized) signals with real data',
      );
      this.adapters.push(new LlmHypothesisAdapter(this.genAI));
    }
  }

  // -------------------------------------------------------------------------
  // Main entry point
  // -------------------------------------------------------------------------

  /**
   * Analyze downstream effects of the given narratives.
   * Fetches external signals via adapters, correlates them with narratives,
   * and generates transmission chains.
   */
  async analyze(
    narratives: AnalyzedNarrative[],
    posts: RawPost[],
  ): Promise<DownstreamEffectsResult> {
    if (narratives.length === 0) {
      return {
        narrativeCorrelations: [],
        externalSignals: [],
        summary: 'No narratives to analyze.',
      };
    }

    // 1. Extract keywords from narratives
    const keywords = this.extractKeywords(narratives, posts);

    // 2. Determine time range
    const { startDate, endDate } = this.computeTimeRange(narratives);

    // 3. Fetch initial signals from all adapters
    const externalSignals = await this.fetchAllSignals(keywords, startDate, endDate);

    // 4. Try agentic causal reasoning first (gemini-3.1-pro-preview)
    if (this.causalReasoning) {
      try {
        const agentResult = await this.causalReasoning.analyze({
          narratives,
          posts,
          initialSignals: externalSignals,
          adapters: this.adapters,
          keywords,
        });

        if (agentResult) {
          this.logger.log(
            `Causal agent: ${agentResult.correlations.length} correlations, ` +
              `${agentResult.rejections.length} rejections, ${agentResult.iterationsUsed} iterations`,
          );
          return {
            narrativeCorrelations: agentResult.correlations,
            externalSignals: agentResult.allSignals,
            summary: agentResult.summary,
          };
        }
      } catch (err) {
        this.logger.warn(
          `Causal reasoning agent failed, falling back to simple correlation: ${err}`,
        );
      }
    }

    // 5. FALLBACK: Simple correlation + LLM chain generation
    const correlations = this.correlateSignals(narratives, externalSignals);
    await this.generateTransmissionChains(correlations, posts);
    const summary = await this.generateSummary(correlations, externalSignals);

    return {
      narrativeCorrelations: correlations,
      externalSignals,
      summary,
    };
  }

  // -------------------------------------------------------------------------
  // Keyword extraction
  // -------------------------------------------------------------------------

  /**
   * Extract representative keywords from narrative summaries and post content.
   */
  extractKeywords(narratives: AnalyzedNarrative[], posts: RawPost[]): string[] {
    const words = new Map<string, number>();

    // Weight narrative summaries heavily
    for (const n of narratives) {
      const tokens = this.tokenize(n.summary);
      for (const t of tokens) {
        words.set(t, (words.get(t) ?? 0) + 3);
      }
    }

    // Also sample post text
    const samplePosts = posts.slice(0, 50);
    for (const p of samplePosts) {
      const tokens = this.tokenize(p.text);
      for (const t of tokens) {
        words.set(t, (words.get(t) ?? 0) + 1);
      }
    }

    // Return top keywords by frequency, excluding stop words
    return Array.from(words.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([word]) => word)
      .slice(0, 20);
  }

  private tokenize(text: string): string[] {
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'being',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'shall',
      'can',
      'to',
      'of',
      'in',
      'for',
      'on',
      'with',
      'at',
      'by',
      'from',
      'as',
      'into',
      'through',
      'during',
      'before',
      'after',
      'above',
      'below',
      'between',
      'out',
      'off',
      'up',
      'down',
      'about',
      'and',
      'but',
      'or',
      'nor',
      'not',
      'so',
      'yet',
      'both',
      'either',
      'neither',
      'each',
      'every',
      'all',
      'any',
      'few',
      'more',
      'most',
      'other',
      'some',
      'such',
      'no',
      'only',
      'own',
      'same',
      'than',
      'too',
      'very',
      'just',
      'because',
      'it',
      'its',
      'this',
      'that',
      'these',
      'those',
      'i',
      'me',
      'my',
      'myself',
      'we',
      'our',
      'you',
      'your',
      'he',
      'him',
      'his',
      'she',
      'her',
      'they',
      'them',
      'their',
      'what',
      'which',
      'who',
      'whom',
      'how',
      'when',
      'where',
      'why',
    ]);

    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));
  }

  // -------------------------------------------------------------------------
  // Time range
  // -------------------------------------------------------------------------

  computeTimeRange(narratives: AnalyzedNarrative[]): { startDate: string; endDate: string } {
    let minTs = Infinity;
    let maxTs = -Infinity;

    for (const n of narratives) {
      const first = new Date(n.firstSeen).getTime();
      const last = new Date(n.lastSeen).getTime();
      if (first < minTs) minTs = first;
      if (last > maxTs) maxTs = last;
    }

    // Extend +-7 days to capture lagging real-world effects
    // Truncate to the hour for consistent cache key matching
    const msPerDay = 24 * 60 * 60 * 1000;
    const msPerHour = 60 * 60 * 1000;
    const startMs = Math.floor((minTs - 7 * msPerDay) / msPerHour) * msPerHour;
    const endMs = Math.ceil((maxTs + 7 * msPerDay) / msPerHour) * msPerHour;
    const startDate = new Date(startMs).toISOString();
    const endDate = new Date(endMs).toISOString();

    return { startDate, endDate };
  }

  // -------------------------------------------------------------------------
  // Signal fetching
  // -------------------------------------------------------------------------

  /**
   * Fetch signals from all adapters, using the DB cache when available.
   * Each adapter is checked individually — only stale/missing adapters re-fetch.
   */
  private async fetchAllSignals(
    keywords: string[],
    startDate: string,
    endDate: string,
  ): Promise<ExternalSignal[]> {
    const allSignals: ExternalSignal[] = [];

    // Process each adapter individually — check cache, fetch if stale
    const adapterPromises = this.adapters.map(async (adapter) => {
      // 1. Check DB cache for this adapter
      if (this.signalCache) {
        try {
          const cached =
            adapter.scope === 'global'
              ? await this.signalCache.findGlobalCache(adapter.name, startDate, endDate)
              : await this.signalCache.findQueryCache(adapter.name, keywords, startDate, endDate);

          if (cached) {
            const age = Date.now() - new Date(cached.fetchedAt).getTime();
            this.logger.log(
              `Cache hit: "${adapter.name}" — ${cached.signals.length} signals ` +
                `(${Math.round(age / 3600000)}h old, max ${Math.round(adapter.maxAgeMs / 3600000)}h)`,
            );
            return cached.signals;
          }
        } catch (err) {
          this.logger.warn(`Cache lookup failed for "${adapter.name}": ${err}`);
        }
      }

      // 2. Cache miss or no cache store — fetch fresh from adapter
      let timeoutHandle: NodeJS.Timeout | undefined;
      try {
        const signals = await Promise.race([
          adapter.fetchSignals({ keywords, startDate, endDate }),
          new Promise<ExternalSignal[]>((_, reject) => {
            timeoutHandle = setTimeout(() => reject(new Error('timeout')), 10_000);
            timeoutHandle.unref?.();
          }),
        ]);

        this.logger.log(
          `Fetched fresh: "${adapter.name}" [${adapter.scope}] — ${signals.length} signals`,
        );

        // 3. Persist to DB cache for future requests
        if (this.signalCache && signals.length > 0) {
          this.signalCache
            .saveSignals({
              adapterName: adapter.name,
              scope: adapter.scope,
              keywords: adapter.scope === 'query' ? keywords : [],
              startDate,
              endDate,
              signals,
              maxAgeMs: adapter.maxAgeMs,
            })
            .catch((err) => {
              this.logger.warn(`Failed to cache signals for "${adapter.name}": ${err}`);
            });
        }

        return signals;
      } catch (err) {
        this.logger.warn(`Adapter "${adapter.name}" [${adapter.scope}] failed: ${err}`);
        return [] as ExternalSignal[];
      } finally {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
      }
    });

    // Run all adapter fetches in parallel
    const results = await Promise.allSettled(adapterPromises);
    for (const result of results) {
      if (result.status === 'fulfilled') {
        allSignals.push(...result.value);
      }
    }

    return allSignals;
  }

  // -------------------------------------------------------------------------
  // Correlation engine
  // -------------------------------------------------------------------------

  /**
   * Correlate external signals with narratives based on:
   * 1. Temporal alignment (signal within +-7 days of narrative peak)
   * 2. Keyword overlap between narrative summary and signal description
   */
  correlateSignals(
    narratives: AnalyzedNarrative[],
    signals: ExternalSignal[],
  ): NarrativeCorrelation[] {
    return narratives.map((narrative) => {
      const narrativeKeywords = new Set(this.tokenize(narrative.summary));
      const narrativeMidpoint =
        (new Date(narrative.firstSeen).getTime() + new Date(narrative.lastSeen).getTime()) / 2;
      const msPerDay = 24 * 60 * 60 * 1000;

      const correlatedSignals = signals.map((signal) => {
        // Temporal proximity score (1.0 = same day, 0.0 = 7+ days apart)
        const signalTs = new Date(signal.timestamp).getTime();
        const daysDiff = Math.abs(signalTs - narrativeMidpoint) / msPerDay;
        const temporalScore = Math.max(0, 1 - daysDiff / 7);

        // Keyword overlap score
        const signalKeywords = this.tokenize(`${signal.title} ${signal.description}`);
        const overlapCount = signalKeywords.filter((w) => narrativeKeywords.has(w)).length;
        const keywordScore =
          signalKeywords.length > 0
            ? Math.min(
                1,
                overlapCount / Math.max(1, Math.min(narrativeKeywords.size, signalKeywords.length)),
              )
            : 0;

        // Combined correlation strength
        const correlationStrength =
          temporalScore * 0.4 + keywordScore * 0.3 + signal.magnitude * 0.3;

        // Determine temporal offset and relationship
        const offsetDays = (signalTs - narrativeMidpoint) / msPerDay;
        const temporalOffset =
          offsetDays >= 0 ? `+${Math.round(offsetDays)} days` : `${Math.round(offsetDays)} days`;

        let possibleRelationship: 'caused_by' | 'caused' | 'coincident' | 'amplified';
        if (Math.abs(offsetDays) < 1) {
          possibleRelationship = 'coincident';
        } else if (offsetDays > 0) {
          possibleRelationship = 'caused'; // signal came after narrative
        } else {
          possibleRelationship = 'caused_by'; // signal came before narrative
        }

        // Upgrade to "amplified" if correlation is strong and temporal is close
        if (correlationStrength > 0.6 && Math.abs(offsetDays) < 3) {
          possibleRelationship = 'amplified';
        }

        return {
          signal,
          correlationStrength,
          temporalOffset,
          possibleRelationship,
        };
      });

      // Sort by correlation strength and keep meaningful ones
      const sorted = correlatedSignals
        .filter((c) => c.correlationStrength > 0.1)
        .sort((a, b) => b.correlationStrength - a.correlationStrength);

      return {
        narrativeId: narrative.id,
        narrativeSummary: narrative.summary,
        correlatedSignals: sorted,
        transmissionChains: [], // populated in next step
      };
    });
  }

  // -------------------------------------------------------------------------
  // Transmission chain generation
  // -------------------------------------------------------------------------

  /**
   * Use LLM to generate causal transmission chains for each narrative-signal pair.
   * Modifies correlations in place.
   */
  async generateTransmissionChains(
    correlations: NarrativeCorrelation[],
    posts: RawPost[],
  ): Promise<void> {
    for (const correlation of correlations) {
      if (correlation.correlatedSignals.length === 0) continue;

      const chains = await this.buildChainForCorrelation(correlation, posts);
      correlation.transmissionChains = chains;
    }
  }

  private async buildChainForCorrelation(
    correlation: NarrativeCorrelation,
    posts: RawPost[],
  ): Promise<TransmissionChain[]> {
    const topSignals = correlation.correlatedSignals.slice(0, 5);
    if (topSignals.length === 0) return [];

    if (!this.genAI) {
      return this.fallbackTransmissionChains(correlation, topSignals);
    }

    const model = this.genAI.getGenerativeModel({
      model: this.chatModel,
      generationConfig: DETERMINISTIC_JSON_CONFIG,
    });

    const signalSummaries = topSignals
      .map(
        (cs, i) =>
          `Signal ${i + 1}: [${cs.signal.domain}] "${cs.signal.title}" — ${cs.signal.description} (correlation: ${cs.correlationStrength.toFixed(2)}, offset: ${cs.temporalOffset})`,
      )
      .join('\n');

    // Sample posts from this narrative for context
    const samplePostTexts = posts
      .slice(0, 5)
      .map((p) => p.text.slice(0, 200))
      .join('\n- ');

    const prompt = `You are an analyst tracing how an online narrative might produce real-world downstream effects.

Narrative: "${correlation.narrativeSummary}"

Sample posts:
- ${samplePostTexts}

Correlated real-world signals (these occurred in the same time period — correlation, NOT necessarily causation):
${signalSummaries}

CRITICAL RULES FOR CAUSAL REASONING:
1. SCALE MATTERS: A narrative about a small/niche topic (a meme coin, a small project, a local event) CANNOT plausibly cause macro-level effects (Bitcoin price movement, stock market shifts, national policy changes). Do NOT claim small narratives caused large-scale market movements.
2. DIRECTION MATTERS: In crypto, small tokens follow Bitcoin — not the other way around. In markets, retail sentiment rarely moves indices. A correlation in time does NOT mean the narrative caused the signal.
3. If a signal is clearly too large in scale to be caused by this narrative, either:
   - Reverse the direction: explain how the macro signal may have INFLUENCED the narrative (e.g., "Bitcoin's decline may have amplified negative sentiment around Project89")
   - Skip the signal: assign very low confidence (< 0.2) and note that causation is implausible
4. Focus on effects AT THE NARRATIVE'S OWN SCALE: community sentiment, project reputation, investor confidence in that specific project, related niche markets.
5. Use BOUNDED language: "consistent with", "may have contributed to", "plausibly connected".

For each signal where a plausible causal link exists, trace a transmission chain from the narrative to the effect.
Each chain should have 3-5 nodes, starting with the narrative and ending with the effect.
Each node has a type (narrative, economic, political, social, or market).
Include a confidence score (0-1) for each node and an overall confidence for the chain.

Respond ONLY with a JSON array of objects:
[{
  "narrativeId": string,
  "narrativeSummary": string,
  "chain": [{ "node": string, "type": string, "description": string, "confidence": number }],
  "overallConfidence": number
}]

No other text.`;

    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonMatch = text.match(/\[[\s\S]*\]/);

      if (!jsonMatch) {
        return this.fallbackTransmissionChains(correlation, topSignals);
      }

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        narrativeId?: string;
        narrativeSummary?: string;
        chain?: Array<{
          node?: string;
          type?: string;
          description?: string;
          timestamp?: string;
          confidence?: number;
        }>;
        overallConfidence?: number;
      }>;

      return parsed.map((item) => ({
        narrativeId: correlation.narrativeId,
        narrativeSummary: correlation.narrativeSummary,
        chain: (item.chain ?? []).map((n) => ({
          node: n.node ?? '',
          type: this.validateChainNodeType(n.type),
          description: n.description ?? '',
          timestamp: n.timestamp,
          confidence: Math.max(0, Math.min(1, n.confidence ?? 0.5)),
        })),
        overallConfidence: Math.max(0, Math.min(1, item.overallConfidence ?? 0.5)),
      }));
    } catch (err) {
      this.logger.warn(`Transmission chain LLM call failed: ${err}`);
      return this.fallbackTransmissionChains(correlation, topSignals);
    }
  }

  private fallbackTransmissionChains(
    correlation: NarrativeCorrelation,
    signals: NarrativeCorrelation['correlatedSignals'],
  ): TransmissionChain[] {
    return signals.slice(0, 3).map((cs) => ({
      narrativeId: correlation.narrativeId,
      narrativeSummary: correlation.narrativeSummary,
      chain: [
        {
          node: correlation.narrativeSummary,
          type: 'narrative' as const,
          description: 'Origin narrative gaining traction on social media',
          confidence: 0.8,
        },
        {
          node: 'Public discourse shift',
          type: 'social' as const,
          description: `Increased discussion consistent with "${correlation.narrativeSummary}"`,
          confidence: 0.5,
        },
        {
          node: cs.signal.title,
          type:
            cs.signal.domain === 'media'
              ? ('social' as const)
              : (cs.signal.domain as TransmissionChainNode['type']),
          description: cs.signal.description,
          confidence: cs.correlationStrength,
        },
      ],
      overallConfidence: cs.correlationStrength * 0.7,
    }));
  }

  private validateChainNodeType(t?: string): TransmissionChainNode['type'] {
    const valid = ['narrative', 'economic', 'political', 'social', 'market'];
    if (t && valid.includes(t)) return t as TransmissionChainNode['type'];
    return 'social';
  }

  // -------------------------------------------------------------------------
  // Summary generation
  // -------------------------------------------------------------------------

  private async generateSummary(
    correlations: NarrativeCorrelation[],
    signals: ExternalSignal[],
  ): Promise<string> {
    const totalChains = correlations.reduce((sum, c) => sum + c.transmissionChains.length, 0);

    if (totalChains === 0) {
      return `Analyzed ${correlations.length} narrative(s) against ${signals.length} external signal(s). No strong downstream effect correlations were detected.`;
    }

    if (!this.genAI) {
      const domains = new Set(signals.map((s) => s.domain));
      return `Analyzed ${correlations.length} narrative(s) against ${signals.length} hypothesized signal(s) across ${domains.size} domain(s). Found ${totalChains} potential transmission chain(s). These are hypothesized correlations — real API integrations are needed for evidence-based analysis.`;
    }

    const model = this.genAI.getGenerativeModel({
      model: this.chatModel,
      generationConfig: DETERMINISTIC_JSON_CONFIG,
    });
    const chainSummaries = correlations
      .flatMap((c) =>
        c.transmissionChains.map(
          (tc) =>
            `"${tc.narrativeSummary}" -> ${tc.chain.map((n) => n.node).join(' -> ')} (confidence: ${tc.overallConfidence.toFixed(2)})`,
        ),
      )
      .slice(0, 10)
      .join('\n');

    const prompt = `Summarize these narrative-to-real-world transmission chains in 2-3 sentences. Use cautious language ("consistent with", "may be connected to"). Focus on the most significant patterns.

${chainSummaries}`;

    try {
      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    } catch {
      return `Identified ${totalChains} potential transmission chain(s) across ${correlations.length} narrative(s). Further analysis with real-world data sources recommended.`;
    }
  }

  // -------------------------------------------------------------------------
  // Mycelium visualization transform
  // -------------------------------------------------------------------------

  /**
   * Transform analyzed narratives and their downstream correlations into
   * MyceliumData for the NarrativeMyceliumVisualization component.
   *
   * Mapping:
   * - Narrative clusters -> root/branch nodes
   * - Transmission chain nodes -> leaf nodes
   * - Connections -> branches
   * - Confidence -> branch strength
   */
  toMyceliumData(
    narratives: AnalyzedNarrative[],
    correlations: NarrativeCorrelation[],
  ): MyceliumData {
    const nodes: MyceliumNode[] = [];
    const branches: MyceliumBranch[] = [];
    const clusters: MyceliumCluster[] = [];

    let branchIdCounter = 0;

    // Build a correlation lookup
    const corrMap = new Map<string, NarrativeCorrelation>();
    for (const c of correlations) {
      corrMap.set(c.narrativeId, c);
    }

    for (let ni = 0; ni < narratives.length; ni++) {
      const narrative = narratives[ni];
      if (!narrative) {
        continue;
      }
      const color = CLUSTER_COLORS[ni % CLUSTER_COLORS.length] ?? '#999';
      const correlation = corrMap.get(narrative.id);
      const clusterNodeIds: string[] = [];

      // Root node: the narrative itself
      const rootId = `narrative-root-${ni}`;
      nodes.push({
        id: rootId,
        narrativeId: narrative.id,
        content: narrative.summary || `Narrative ${ni + 1}`,
        timestamp: new Date(narrative.firstSeen),
        strength: Math.min(1, narrative.postIndices.length / 20),
        connections: [],
        type: 'root',
        metrics: {
          influence: Math.min(1, narrative.totalEngagement / 1000),
          growth:
            narrative.velocity.trend === 'surging'
              ? 0.9
              : narrative.velocity.trend === 'growing'
                ? 0.6
                : narrative.velocity.trend === 'fading'
                  ? 0.1
                  : 0.3,
          color,
        },
      });
      clusterNodeIds.push(rootId);

      // For each transmission chain, add intermediate + leaf nodes
      if (correlation) {
        for (let ci = 0; ci < correlation.transmissionChains.length; ci++) {
          const chain = correlation.transmissionChains[ci];
          if (!chain) {
            continue;
          }
          let parentId = rootId;

          for (let step = 0; step < chain.chain.length; step++) {
            const chainNode = chain.chain[step];
            if (!chainNode) {
              continue;
            }
            // Skip first node if it's the narrative itself (avoid duplication)
            if (step === 0 && chainNode.type === 'narrative') continue;

            const nodeId = `chain-${ni}-${ci}-${step}`;
            const isLast = step === chain.chain.length - 1;
            const nodeColor = DOMAIN_COLORS[chainNode.type] ?? color;

            nodes.push({
              id: nodeId,
              narrativeId: narrative.id,
              content: chainNode.node,
              timestamp: chainNode.timestamp
                ? new Date(chainNode.timestamp)
                : new Date(narrative.lastSeen),
              strength: chainNode.confidence,
              connections: [parentId],
              type: isLast ? 'leaf' : 'branch',
              metrics: {
                influence: chainNode.confidence,
                growth: chain.overallConfidence * 0.5,
                color: nodeColor,
              },
            });
            clusterNodeIds.push(nodeId);

            // Add branch connecting parent to this node
            branches.push({
              id: `branch-${branchIdCounter++}`,
              sourceId: parentId,
              targetId: nodeId,
              strength: chainNode.confidence,
              type: step === 1 ? 'primary' : step === 2 ? 'secondary' : 'tertiary',
              metrics: {
                width: 1 + chainNode.confidence * 3,
                color: nodeColor,
                age: chain.overallConfidence,
              },
            });

            // Update parent connections
            const parentNode = nodes.find((n) => n.id === parentId);
            if (parentNode) {
              parentNode.connections.push(nodeId);
            }

            parentId = nodeId;
          }
        }

        // Also add signal nodes directly if no transmission chains
        if (correlation.transmissionChains.length === 0) {
          for (let si = 0; si < Math.min(3, correlation.correlatedSignals.length); si++) {
            const cs = correlation.correlatedSignals[si];
            if (!cs) {
              continue;
            }
            const signalNodeId = `signal-${ni}-${si}`;
            const nodeColor = DOMAIN_COLORS[cs.signal.domain] ?? '#999';

            nodes.push({
              id: signalNodeId,
              narrativeId: narrative.id,
              content: cs.signal.title,
              timestamp: new Date(cs.signal.timestamp),
              strength: cs.correlationStrength,
              connections: [rootId],
              type: 'leaf',
              metrics: {
                influence: cs.signal.magnitude,
                growth: cs.correlationStrength * 0.3,
                color: nodeColor,
              },
            });
            clusterNodeIds.push(signalNodeId);

            branches.push({
              id: `branch-${branchIdCounter++}`,
              sourceId: rootId,
              targetId: signalNodeId,
              strength: cs.correlationStrength,
              type: 'secondary',
              metrics: {
                width: 1 + cs.correlationStrength * 2,
                color: nodeColor,
                age: cs.correlationStrength,
              },
            });

            const rootNode = nodes.find((n) => n.id === rootId);
            if (rootNode) {
              rootNode.connections.push(signalNodeId);
            }
          }
        }
      }

      // Build cluster
      clusters.push({
        id: `cluster-${ni}`,
        name: narrative.summary || `Narrative ${ni + 1}`,
        description: `Downstream effects of "${narrative.summary || 'this narrative'}"`,
        color,
        nodes: clusterNodeIds,
        centralNodeId: rootId,
        metrics: {
          cohesion: correlation
            ? correlation.transmissionChains.reduce((s, tc) => s + tc.overallConfidence, 0) /
              Math.max(1, correlation.transmissionChains.length)
            : 0.5,
          influence: Math.min(1, narrative.totalEngagement / 1000),
          growth:
            narrative.velocity.trend === 'surging'
              ? 0.9
              : narrative.velocity.trend === 'growing'
                ? 0.6
                : 0.3,
        },
      });
    }

    // Add cross-cluster branches for narratives that share signal domains
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const narrativeI = narratives[i];
        const narrativeJ = narratives[j];
        if (!narrativeI || !narrativeJ) {
          continue;
        }
        const corrI = corrMap.get(narrativeI.id);
        const corrJ = corrMap.get(narrativeJ.id);
        if (!corrI || !corrJ) continue;

        const domainsI = new Set(corrI.correlatedSignals.map((cs) => cs.signal.domain));
        const domainsJ = new Set(corrJ.correlatedSignals.map((cs) => cs.signal.domain));
        const shared = [...domainsI].filter((d) => domainsJ.has(d));

        if (shared.length > 0) {
          // Connect leaf nodes from shared domains
          const leafI = nodes.find((n) => n.narrativeId === narrativeI.id && n.type === 'leaf');
          const leafJ = nodes.find((n) => n.narrativeId === narrativeJ.id && n.type === 'leaf');
          if (leafI && leafJ) {
            branches.push({
              id: `cross-${branchIdCounter++}`,
              sourceId: leafI.id,
              targetId: leafJ.id,
              strength: 0.2 * shared.length,
              type: 'tertiary',
              metrics: {
                width: 0.5 + shared.length * 0.5,
                color: '#666666',
                age: 0.3,
              },
            });
            leafI.connections.push(leafJ.id);
            leafJ.connections.push(leafI.id);
          }
        }
      }
    }

    // Determine dominant cluster
    const dominantCluster = clusters.reduce(
      (best, c) => (c.metrics.influence > (best?.metrics.influence ?? 0) ? c : best),
      clusters[0],
    );

    // Compute timestamps
    const timestamps = narratives.flatMap((n) => [
      new Date(n.firstSeen).getTime(),
      new Date(n.lastSeen).getTime(),
    ]);
    const minTs = Math.min(...timestamps);
    const maxTs = Math.max(...timestamps);

    return {
      nodes,
      branches,
      clusters,
      metadata: {
        timestamp: new Date(),
        totalStrength: nodes.reduce((sum, n) => sum + n.strength, 0),
        dominantClusterId: dominantCluster?.id ?? '',
        timeframe: {
          start: new Date(minTs),
          end: new Date(maxTs),
        },
      },
    };
  }
}
