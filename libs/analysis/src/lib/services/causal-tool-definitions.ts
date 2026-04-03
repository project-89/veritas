/**
 * Gemini function calling tool definitions for the agentic causal reasoning system.
 *
 * The LLM uses these tools to investigate causal relationships between
 * narratives and real-world signals — fetching additional evidence,
 * submitting evidence-backed chains, and rejecting spurious correlations.
 */

import { SchemaType } from '@google/generative-ai';
import type {
  FunctionDeclarationsTool,
  FunctionCall,
} from '@google/generative-ai';
import { Logger } from '@nestjs/common';
import type { SignalAdapter, ExternalSignal } from './signal-adapters/signal-adapter.interface';
import type { AnalyzedNarrative } from './narrative-analysis.service';
import type { RawPost } from './deviation.service';
import type { SignalCacheStore } from './downstream-effects.service';

// ---------------------------------------------------------------------------
// Tool declarations for Gemini function calling
// ---------------------------------------------------------------------------

export const CAUSAL_TOOLS: FunctionDeclarationsTool = {
  functionDeclarations: [
    {
      name: 'fetch_signals',
      description:
        'Fetch real-world signals from a specific data source for a given time range. ' +
        'Use this to investigate hypotheses by looking at different time periods or data domains. ' +
        'Available adapters: "GDELT Global News" (media/news articles), ' +
        '"Yahoo Finance Markets" (market data — S&P 500, Dow, Oil, Gold, Bitcoin), ' +
        '"World Bank Economic Indicators" (annual macro: inflation, GDP, unemployment for 10 economies), ' +
        '"FRED Economic Data" (US economic: fed funds rate, jobless claims, VIX, CPI, treasury spread), ' +
        '"LLM Hypothesis Engine" (AI-generated hypothetical downstream effects).',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          adapter_name: {
            type: SchemaType.STRING,
            description:
              'Exact name of the adapter. One of: "GDELT Global News", "Yahoo Finance Markets", ' +
              '"World Bank Economic Indicators", "FRED Economic Data", "LLM Hypothesis Engine"',
          },
          start_date: {
            type: SchemaType.STRING,
            description: 'ISO 8601 start date (e.g., "2025-01-01")',
          },
          end_date: {
            type: SchemaType.STRING,
            description: 'ISO 8601 end date (e.g., "2025-06-01")',
          },
          keywords: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description:
              'Keywords to filter results. Required for GDELT and LLM Hypothesis. ' +
              'Optional for others (ignored by market/economic adapters).',
          },
        },
        required: ['adapter_name', 'start_date', 'end_date'],
      },
    },
    {
      name: 'get_narrative_context',
      description:
        'Get the full posts, metadata, and temporal details for a specific narrative. ' +
        'Use this to understand exactly what people are saying in a narrative before making causal claims.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          narrative_id: {
            type: SchemaType.STRING,
            description: 'The ID of the narrative to retrieve',
          },
        },
        required: ['narrative_id'],
      },
    },
    {
      name: 'search_historical_signals',
      description:
        'Search across ALL adapters in a specific domain for a time range. ' +
        'Use this to look for upstream causes or long-range historical context. ' +
        'For example, to check if a macro event months ago triggered the current situation.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          domain: {
            type: SchemaType.STRING,
            description: 'Domain to search: "economic", "political", "social", "market", "media"',
          },
          start_date: {
            type: SchemaType.STRING,
            description: 'ISO 8601 start date',
          },
          end_date: {
            type: SchemaType.STRING,
            description: 'ISO 8601 end date',
          },
          keywords: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: 'Optional keywords to narrow the search',
          },
        },
        required: ['domain', 'start_date', 'end_date'],
      },
    },
    {
      name: 'submit_causal_chain',
      description:
        'Submit a finalized, evidence-backed causal chain. ' +
        'Every link in the chain MUST reference specific data you retrieved via other tools. ' +
        'Do NOT submit chains where you fabricated evidence.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          narrative_id: { type: SchemaType.STRING },
          narrative_summary: { type: SchemaType.STRING },
          direction: {
            type: SchemaType.STRING,
            description:
              'Causal direction: "narrative_to_effect" (narrative caused the real-world signal), ' +
              '"effect_to_narrative" (real-world event caused or amplified the narrative), ' +
              'or "bidirectional" (mutual reinforcement loop)',
          },
          chain: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                node: {
                  type: SchemaType.STRING,
                  description: 'Short label for this step in the chain',
                },
                type: {
                  type: SchemaType.STRING,
                  description: 'One of: narrative, economic, political, social, market, media',
                },
                description: {
                  type: SchemaType.STRING,
                  description: 'Explanation of what happened at this step',
                },
                evidence: {
                  type: SchemaType.STRING,
                  description:
                    'Specific signal data, dates, or reasoning that supports this link. ' +
                    'Must reference actual data you retrieved.',
                },
                timestamp: {
                  type: SchemaType.STRING,
                  description: 'When this step occurred (ISO 8601)',
                },
                confidence: {
                  type: SchemaType.NUMBER,
                  description: '0-1 confidence in this specific link',
                },
              },
              required: ['node', 'type', 'description', 'evidence', 'confidence'],
            },
          },
          overall_confidence: {
            type: SchemaType.NUMBER,
            description: '0-1 overall confidence in the full chain',
          },
          scale_assessment: {
            type: SchemaType.STRING,
            description:
              'Does the narrative plausibly operate at the scale of the claimed effect? ' +
              'e.g., "Narrative has ~200 posts in a niche community — too small to move Bitcoin, ' +
              'but consistent with project-level reputation damage."',
          },
        },
        required: [
          'narrative_id',
          'narrative_summary',
          'direction',
          'chain',
          'overall_confidence',
          'scale_assessment',
        ],
      },
    },
    {
      name: 'reject_correlation',
      description:
        'Explicitly reject a correlation between a narrative and a signal as spurious. ' +
        'Use this when the correlation is coincidental, the scale is wrong, ' +
        'or there is no plausible causal mechanism.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          narrative_id: { type: SchemaType.STRING },
          signal_id: { type: SchemaType.STRING },
          reason: {
            type: SchemaType.STRING,
            description:
              'Clear explanation of why this correlation is spurious ' +
              '(e.g., "Scale mismatch: 50-post niche narrative cannot move S&P 500")',
          },
        },
        required: ['narrative_id', 'signal_id', 'reason'],
      },
    },
    {
      name: 'done',
      description:
        'Signal that your analysis is complete. Call this after submitting all valid ' +
        'causal chains and rejecting all spurious correlations.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          summary: {
            type: SchemaType.STRING,
            description:
              'Brief summary of findings — what causal relationships were found, ' +
              'what was rejected, and key insights.',
          },
        },
        required: ['summary'],
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Typed interfaces for agent outputs
// ---------------------------------------------------------------------------

export interface CausalChainSubmission {
  narrative_id: string;
  narrative_summary: string;
  direction: 'narrative_to_effect' | 'effect_to_narrative' | 'bidirectional';
  chain: CausalChainLink[];
  overall_confidence: number;
  scale_assessment: string;
}

export interface CausalChainLink {
  node: string;
  type: string;
  description: string;
  evidence: string;
  timestamp?: string;
  confidence: number;
}

export interface RejectedCorrelation {
  narrative_id: string;
  signal_id: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Tool dispatcher — routes LLM function calls to real adapter invocations
// ---------------------------------------------------------------------------

/** Maximum lookback from earliest narrative date */
const MAX_LOOKBACK_MS = 2 * 365 * 24 * 60 * 60 * 1000; // 2 years

export class ToolDispatcher {
  private readonly logger = new Logger(ToolDispatcher.name);
  private readonly adapterMap: Map<string, SignalAdapter>;
  private readonly narrativeMap: Map<string, AnalyzedNarrative>;
  private readonly earliestDate: number;

  /** All signals fetched during the session (for cache / dedup) */
  readonly fetchedSignals: ExternalSignal[] = [];

  constructor(
    private readonly adapters: SignalAdapter[],
    private readonly narratives: AnalyzedNarrative[],
    private readonly posts: RawPost[],
    private readonly signalCache?: SignalCacheStore,
  ) {
    this.adapterMap = new Map(adapters.map((a) => [a.name, a]));
    this.narrativeMap = new Map(narratives.map((n) => [n.id, n]));

    // Determine earliest narrative date for lookback cap
    const dates = narratives.map((n) => new Date(n.firstSeen).getTime());
    this.earliestDate = dates.length > 0 ? Math.min(...dates) : Date.now();
  }

  /**
   * Dispatch a function call from the LLM to the appropriate handler.
   * Returns a JSON-serializable result object.
   */
  async dispatch(call: FunctionCall): Promise<object> {
    const args = call.args as Record<string, unknown>;

    switch (call.name) {
      case 'fetch_signals':
        return this.handleFetchSignals(args);
      case 'get_narrative_context':
        return this.handleGetNarrativeContext(args);
      case 'search_historical_signals':
        return this.handleSearchHistorical(args);
      default:
        return { error: `Unknown tool: ${call.name}` };
    }
  }

  // ---- fetch_signals ----

  private async handleFetchSignals(args: Record<string, unknown>): Promise<object> {
    const adapterName = args['adapter_name'] as string;
    const adapter = this.adapterMap.get(adapterName);

    if (!adapter) {
      const available = [...this.adapterMap.keys()].join(', ');
      return { error: `Unknown adapter "${adapterName}". Available: ${available}` };
    }

    const { startDate, endDate } = this.clampDateRange(
      args['start_date'] as string,
      args['end_date'] as string,
    );
    const keywords = (args['keywords'] as string[]) ?? [];

    try {
      const signals = await Promise.race([
        adapter.fetchSignals({ keywords, startDate, endDate }),
        new Promise<ExternalSignal[]>((_, reject) =>
          setTimeout(() => reject(new Error('Adapter timeout (10s)')), 10_000),
        ),
      ]);

      this.fetchedSignals.push(...signals);
      this.logger.debug(`fetch_signals("${adapterName}", ${startDate}→${endDate}): ${signals.length} signals`);

      // Persist to cache if available
      if (this.signalCache && signals.length > 0) {
        this.signalCache.saveSignals({
          adapterName: adapter.name,
          scope: adapter.scope,
          keywords,
          startDate,
          endDate,
          signals,
          maxAgeMs: adapter.maxAgeMs,
        }).catch(() => {});
      }

      return {
        adapter: adapterName,
        date_range: `${startDate} to ${endDate}`,
        signal_count: signals.length,
        signals: signals.map((s) => ({
          id: s.id,
          domain: s.domain,
          source: s.source,
          title: s.title,
          description: s.description,
          timestamp: s.timestamp,
          magnitude: s.magnitude,
        })),
      };
    } catch (err) {
      return { error: `Adapter "${adapterName}" failed: ${err}` };
    }
  }

  // ---- get_narrative_context ----

  private handleGetNarrativeContext(args: Record<string, unknown>): object {
    const narrativeId = args['narrative_id'] as string;
    const narrative = this.narrativeMap.get(narrativeId);

    if (!narrative) {
      return { error: `Narrative "${narrativeId}" not found` };
    }

    // Get the posts that belong to this narrative
    const narrativePosts = narrative.postIndices
      .map((idx) => this.posts[idx])
      .filter(Boolean)
      .slice(0, 20); // Cap at 20 posts for context length

    return {
      id: narrative.id,
      summary: narrative.summary,
      firstSeen: narrative.firstSeen,
      lastSeen: narrative.lastSeen,
      postCount: narrative.postIndices.length,
      velocity: narrative.velocity,
      platforms: narrative.platforms,
      posts: narrativePosts.map((p) => ({
        text: p!.text.slice(0, 500),
        platform: p!.platform,
        author: p!.authorHandle,
        timestamp: p!.timestamp,
        engagement: p!.engagement,
      })),
    };
  }

  // ---- search_historical_signals ----

  private async handleSearchHistorical(args: Record<string, unknown>): Promise<object> {
    const domain = args['domain'] as string;
    const keywords = (args['keywords'] as string[]) ?? [];
    const { startDate, endDate } = this.clampDateRange(
      args['start_date'] as string,
      args['end_date'] as string,
    );

    // Map domain to relevant adapters
    const domainAdapters = this.adapters.filter((a) => {
      if (domain === 'economic') return ['economic'].includes(a.domain);
      if (domain === 'market') return ['market'].includes(a.domain);
      if (domain === 'media' || domain === 'political' || domain === 'social')
        return ['media', 'hypothesis'].includes(a.domain);
      return true; // unknown domain: try all
    });

    if (domainAdapters.length === 0) {
      // Fall back to all adapters
      domainAdapters.push(...this.adapters);
    }

    const results = await Promise.allSettled(
      domainAdapters.map(async (adapter) => {
        try {
          return await Promise.race([
            adapter.fetchSignals({ keywords, startDate, endDate }),
            new Promise<ExternalSignal[]>((_, reject) =>
              setTimeout(() => reject(new Error('timeout')), 10_000),
            ),
          ]);
        } catch {
          return [] as ExternalSignal[];
        }
      }),
    );

    const signals: ExternalSignal[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        signals.push(...result.value);
      }
    }

    this.fetchedSignals.push(...signals);
    this.logger.debug(`search_historical("${domain}", ${startDate}→${endDate}): ${signals.length} signals`);

    return {
      domain,
      date_range: `${startDate} to ${endDate}`,
      adapters_queried: domainAdapters.map((a) => a.name),
      signal_count: signals.length,
      signals: signals.map((s) => ({
        id: s.id,
        domain: s.domain,
        source: s.source,
        title: s.title,
        description: s.description,
        timestamp: s.timestamp,
        magnitude: s.magnitude,
      })),
    };
  }

  // ---- Date range validation ----

  private clampDateRange(
    startDate: string,
    endDate: string,
  ): { startDate: string; endDate: string } {
    const minAllowed = this.earliestDate - MAX_LOOKBACK_MS;
    const requestedStart = new Date(startDate).getTime();

    if (requestedStart < minAllowed) {
      const clamped = new Date(minAllowed).toISOString().split('T')[0]!;
      this.logger.warn(
        `Date range clamped: requested ${startDate}, max lookback is ${clamped}`,
      );
      return { startDate: clamped, endDate };
    }

    return { startDate, endDate };
  }
}
