/**
 * Agentic Causal Reasoning Service
 *
 * Uses Gemini function calling (gemini-3.1-flash-lite) to run a multi-turn
 * investigative loop that evaluates causal relationships between narratives
 * and real-world signals.
 *
 * The LLM acts as a skeptical analyst that can:
 * - Request additional data from any adapter for any time range
 * - Look months/years back for upstream causes
 * - Submit evidence-backed causal chains
 * - Reject spurious correlations with reasoning
 * - Determine causal direction (narrative→effect, effect→narrative, bidirectional)
 */

import type { Part } from '@google/generative-ai';
import { FunctionCallingMode, GoogleGenerativeAI } from '@google/generative-ai';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CAUSAL_TOOLS,
  type CausalChainSubmission,
  type RejectedCorrelation,
  ToolDispatcher,
} from './causal-tool-definitions';
import type { RawPost } from './deviation.service';
import type {
  NarrativeCorrelation,
  TransmissionChain,
  TransmissionChainNode,
} from './downstream-effects.service';
import { SIGNAL_CACHE_STORE, type SignalCacheStore } from './downstream-effects.service';
import type { AnalyzedNarrative } from './narrative-analysis.service';
import type { ExternalSignal, SignalAdapter } from './signal-adapters/signal-adapter.interface';
import { geminiReasoningModel } from './utils/llm-config';
import { LlmBudgetExceededError, LlmGateway } from './utils/llm-gateway';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface CausalAnalysisResult {
  correlations: NarrativeCorrelation[];
  /** All signals the agent fetched during investigation (may be more than initial set) */
  allSignals: ExternalSignal[];
  summary: string;
  rejections: RejectedCorrelation[];
  iterationsUsed: number;
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a causal reasoning analyst for the Veritas narrative intelligence platform. Your job is to determine whether real-world signals are causally connected to online narratives — and in which direction.

## YOUR TOOLS
You have access to tools that let you fetch additional data from financial markets, economic indicators, global news, and more. You can look at ANY time range (up to 2 years back) to investigate upstream causes.

## CRITICAL REASONING RULES

1. SKEPTICISM FIRST. Most correlations are coincidental. It is BETTER to reject a spurious correlation than to invent a plausible-sounding but wrong causal chain. Finding zero valid causal chains is a perfectly acceptable result.

2. SCALE MATTERS. Always compare the scale of the narrative to the scale of the signal:
   - A niche narrative (< 500 posts, single community) CANNOT cause macro market movements
   - Only massive, viral narratives (millions of views, mainstream media pickup) can plausibly affect broad markets
   - When scales don't match, check if the signal caused the narrative instead
   - Include a scale_assessment in every chain you submit

3. DIRECTION MATTERS. Always check timestamps:
   - Signal BEFORE narrative → the real-world event likely triggered the online discussion
   - Narrative BEFORE signal → the narrative may have influenced real-world action (rare for small narratives)
   - Simultaneous → likely a common upstream cause or coincidence

4. CHECK FOR COMMON CAUSES. When a narrative and signal appear correlated:
   - Use search_historical_signals to look further back in time
   - There may be an upstream event that independently caused BOTH the narrative and the signal
   - Example: a regulatory announcement → both crypto price drop AND online fear narratives

5. EVIDENCE REQUIRED. Every link in a chain must cite specific data you retrieved. If you cannot find evidence, lower your confidence or reject the chain. NEVER fabricate data points.

6. USE BOUNDED LANGUAGE. Say "consistent with", "may have contributed to", "plausibly connected". Use "caused" only with confidence > 0.8 and strong evidence.

## PROCESS
1. Review the narratives and initial signals presented to you
2. Identify the most promising or suspicious correlations
3. Use tools to gather additional evidence — look at different time ranges, check upstream causes
4. For plausible links: submit_causal_chain with full evidence and direction
5. For implausible links: reject_correlation with a clear reason
6. When finished: call done() with a summary

## CONSTRAINTS
- You have at most 5 rounds of tool calls. Be strategic about what to investigate.
- Focus on the highest-confidence or most interesting correlations first.
- It is perfectly acceptable to find NO valid causal chains.`;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class CausalReasoningService {
  private readonly logger = new Logger(CausalReasoningService.name);
  private readonly reasoningModel = geminiReasoningModel();
  private readonly MAX_ITERATIONS = 5;
  private readonly genAI: GoogleGenerativeAI | null = null;
  /** Monotonic per-turn counter so gateway cache keys never collide across the stateful chat. */
  private turnCounter = 0;

  constructor(
    private readonly configService: ConfigService,
    @Optional() @Inject(SIGNAL_CACHE_STORE) private readonly signalCache?: SignalCacheStore,
  ) {
    const geminiKey =
      this.configService.get<string>('GEMINI_API_KEY') || process.env['GEMINI_API_KEY'];

    if (geminiKey) {
      this.genAI = new GoogleGenerativeAI(geminiKey);
    }
  }

  /**
   * Run agentic causal analysis.
   * Returns null if the agent cannot run (no API key, critical error).
   */
  async analyze(params: {
    narratives: AnalyzedNarrative[];
    posts: RawPost[];
    initialSignals: ExternalSignal[];
    adapters: SignalAdapter[];
    keywords: string[];
  }): Promise<CausalAnalysisResult | null> {
    if (!this.genAI) {
      this.logger.debug('No Gemini API key — causal reasoning unavailable');
      return null;
    }

    if (params.narratives.length === 0) {
      return null;
    }

    try {
      const { chains, rejections, summary, iterationsUsed, dispatcher } =
        await this.runAgentLoop(params);

      // Transform agent output to existing NarrativeCorrelation[] type
      const correlations = this.toNarrativeCorrelations(
        chains,
        rejections,
        params.narratives,
        params.initialSignals,
        dispatcher.fetchedSignals,
      );

      // Combine initial + agent-fetched signals
      const allSignals = [...params.initialSignals, ...dispatcher.fetchedSignals];

      return {
        correlations,
        allSignals,
        summary,
        rejections,
        iterationsUsed,
      };
    } catch (err) {
      if (err instanceof LlmBudgetExceededError) {
        this.logger.warn(`Causal reasoning agent stopped — ${err.message}`);
      } else {
        this.logger.error(`Causal reasoning agent failed: ${err}`);
      }
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Agentic loop
  // -------------------------------------------------------------------------

  private async runAgentLoop(params: {
    narratives: AnalyzedNarrative[];
    posts: RawPost[];
    initialSignals: ExternalSignal[];
    adapters: SignalAdapter[];
    keywords: string[];
  }): Promise<{
    chains: CausalChainSubmission[];
    rejections: RejectedCorrelation[];
    summary: string;
    iterationsUsed: number;
    dispatcher: ToolDispatcher;
  }> {
    if (!this.genAI) {
      throw new Error('Gemini client is not initialized');
    }

    const model = this.genAI.getGenerativeModel({
      model: this.reasoningModel,
      systemInstruction: SYSTEM_PROMPT,
      // Deterministic reasoning; JSON mode is incompatible with tool calling
      generationConfig: { temperature: 0 },
    });

    const dispatcher = new ToolDispatcher(
      params.adapters,
      params.narratives,
      params.posts,
      this.signalCache,
    );

    const chat = model.startChat({
      tools: [CAUSAL_TOOLS],
      toolConfig: {
        functionCallingConfig: { mode: FunctionCallingMode.AUTO },
      },
    });

    // Build the initial evidence message
    const initialMessage = this.buildInitialMessage(
      params.narratives,
      params.initialSignals,
      params.keywords,
    );

    const chains: CausalChainSubmission[] = [];
    const rejections: RejectedCorrelation[] = [];
    let summary = '';
    let iterationsUsed = 0;

    // Every turn of the tool-calling loop shares one budget scope so the whole
    // multi-turn reasoning chain is bounded as a single unit.
    const contextKey = `causal:${params.narratives.map((n) => n.id).join(',')}`;

    // Send initial message and start the loop
    let response = await this.sendThroughGateway(chat, initialMessage, contextKey);
    iterationsUsed++;

    for (let i = 0; i < this.MAX_ITERATIONS; i++) {
      const functionCalls = response.response.functionCalls();

      if (!functionCalls || functionCalls.length === 0) {
        // Model responded with text only — extract as summary if we don't have one
        if (!summary) {
          try {
            summary = response.response.text();
          } catch {
            // No text available
          }
        }
        break;
      }

      const functionResponses: Part[] = [];
      let doneReached = false;

      for (const call of functionCalls) {
        this.logger.log(
          `Agent tool call: ${call.name}(${JSON.stringify(call.args).slice(0, 200)})`,
        );

        // Handle terminal tools (submit, reject, done) — don't dispatch externally
        if (call.name === 'done') {
          const args = call.args as { summary: string };
          summary = args.summary ?? 'Analysis complete.';
          doneReached = true;
          functionResponses.push({
            functionResponse: { name: call.name, response: { status: 'complete' } },
          });
          continue;
        }

        if (call.name === 'submit_causal_chain') {
          const submission = call.args as unknown as CausalChainSubmission;
          chains.push(submission);
          this.logger.log(
            `Agent submitted chain: "${submission.narrative_summary}" ` +
              `[${submission.direction}] confidence=${submission.overall_confidence}`,
          );
          functionResponses.push({
            functionResponse: {
              name: call.name,
              response: { status: 'accepted', chains_submitted: chains.length },
            },
          });
          continue;
        }

        if (call.name === 'reject_correlation') {
          const rejection = call.args as unknown as RejectedCorrelation;
          rejections.push(rejection);
          this.logger.log(
            `Agent rejected: narrative=${rejection.narrative_id} signal=${rejection.signal_id} — ${rejection.reason}`,
          );
          functionResponses.push({
            functionResponse: {
              name: call.name,
              response: { status: 'recorded' },
            },
          });
          continue;
        }

        // Data-fetching tools: dispatch to adapters
        try {
          const result = await dispatcher.dispatch(call);
          functionResponses.push({
            functionResponse: { name: call.name, response: result },
          });
        } catch (err) {
          functionResponses.push({
            functionResponse: {
              name: call.name,
              response: { error: `Tool execution failed: ${err}` },
            },
          });
        }
      }

      if (doneReached) {
        break;
      }

      // Send function responses back to continue conversation
      response = await this.sendThroughGateway(chat, functionResponses, contextKey);
      iterationsUsed++;
    }

    // If we exhausted iterations without done(), note it
    if (!summary) {
      summary =
        `Analysis completed after ${iterationsUsed} rounds. ` +
        `Found ${chains.length} causal chain(s), rejected ${rejections.length} correlation(s).`;
    }

    this.logger.log(
      `Causal reasoning complete: ${chains.length} chains, ${rejections.length} rejections, ${iterationsUsed} iterations`,
    );

    return { chains, rejections, summary, iterationsUsed, dispatcher };
  }

  /**
   * Route one tool-calling turn through the gateway so the whole reasoning loop
   * shares one concurrency slot + budget scope, without disturbing the stateful
   * chat structure. Each turn gets a unique promptVersion (the chat is
   * stateful, so identical message text on different turns is NOT the same
   * call) to keep the response cache from producing false hits. The full
   * GenerateContentResult is captured out-of-band; the gateway only sees the
   * response text for token accounting.
   */
  private async sendThroughGateway(
    chat: ReturnType<ReturnType<GoogleGenerativeAI['getGenerativeModel']>['startChat']>,
    message: string | Array<string | Part>,
    contextKey: string,
  ): Promise<Awaited<ReturnType<typeof chat.sendMessage>>> {
    this.turnCounter++;
    const promptForAccounting =
      typeof message === 'string' ? message : JSON.stringify(message);
    let captured: Awaited<ReturnType<typeof chat.sendMessage>> | undefined;

    await LlmGateway.instance.run({
      model: this.reasoningModel,
      promptVersion: `causal-turn-${this.turnCounter}`,
      prompt: promptForAccounting,
      contextKey,
      generate: async () => {
        captured = await chat.sendMessage(message);
        let text = '';
        try {
          text = captured.response.text();
        } catch {
          // Tool-call turns often have no text part — accounting falls back to
          // the prompt-side estimate only.
        }
        return text;
      },
    });

    if (!captured) {
      throw new Error('Gateway did not execute the causal reasoning turn');
    }
    return captured;
  }

  // -------------------------------------------------------------------------
  // Initial message construction
  // -------------------------------------------------------------------------

  private buildInitialMessage(
    narratives: AnalyzedNarrative[],
    signals: ExternalSignal[],
    keywords: string[],
  ): string {
    const narrativeSections = narratives
      .map((n, i) => {
        const postCount = n.postIndices.length;
        const platforms = Object.entries(n.platforms ?? {})
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');

        return [
          `### Narrative ${i + 1} [id: ${n.id}]`,
          `Summary: "${n.summary}"`,
          `Active: ${n.firstSeen} → ${n.lastSeen}`,
          `Posts: ${postCount} | Trend: ${n.velocity?.trend ?? 'unknown'} | Platforms: ${platforms || 'unknown'}`,
        ].join('\n');
      })
      .join('\n\n');

    const signalSections = signals
      .map(
        (s, i) =>
          `${i + 1}. [${s.domain}] "${s.title}" (${s.source}, ${s.timestamp}, magnitude: ${s.magnitude.toFixed(2)})` +
          `\n   ${s.description}` +
          `\n   [id: ${s.id}]`,
      )
      .join('\n\n');

    return [
      '## Narratives Under Analysis',
      '',
      narrativeSections,
      '',
      '## Initial Signals',
      `Fetched for ±7 day window around narrative activity. Keywords: ${keywords.join(', ')}`,
      '',
      signalSections || '(No signals were retrieved in the initial fetch)',
      '',
      '---',
      'Analyze these for causal relationships. Use your tools to gather additional evidence as needed.',
      'Remember: skepticism first. Most correlations are coincidental.',
    ].join('\n');
  }

  // -------------------------------------------------------------------------
  // Transform agent output → existing types
  // -------------------------------------------------------------------------

  private toNarrativeCorrelations(
    chains: CausalChainSubmission[],
    rejections: RejectedCorrelation[],
    narratives: AnalyzedNarrative[],
    initialSignals: ExternalSignal[],
    fetchedSignals: ExternalSignal[],
  ): NarrativeCorrelation[] {
    // Group chains by narrative
    const chainsByNarrative = new Map<string, CausalChainSubmission[]>();
    for (const chain of chains) {
      const existing = chainsByNarrative.get(chain.narrative_id) ?? [];
      existing.push(chain);
      chainsByNarrative.set(chain.narrative_id, existing);
    }

    // Build rejected signal set
    const rejectedPairs = new Set(rejections.map((r) => `${r.narrative_id}:${r.signal_id}`));

    const allSignals = [...initialSignals, ...fetchedSignals];

    return narratives.map((narrative) => {
      const narrativeChains = chainsByNarrative.get(narrative.id) ?? [];

      // Convert CausalChainSubmission → TransmissionChain
      const transmissionChains: TransmissionChain[] = narrativeChains.map((chain) => ({
        narrativeId: chain.narrative_id,
        narrativeSummary: chain.narrative_summary,
        chain: chain.chain.map((link) => ({
          node: link.node,
          type: this.validateChainNodeType(link.type),
          description: link.description,
          timestamp: link.timestamp,
          confidence: Math.max(0, Math.min(1, link.confidence)),
        })),
        overallConfidence: Math.max(0, Math.min(1, chain.overall_confidence)),
        // Attach extra metadata that the frontend can use
        direction: chain.direction,
        scaleAssessment: chain.scale_assessment,
        evidence: chain.chain.map((link) => link.evidence),
      }));

      // Build correlatedSignals — signals not rejected for this narrative
      const narrativeMidpoint =
        (new Date(narrative.firstSeen).getTime() + new Date(narrative.lastSeen).getTime()) / 2;
      const msPerDay = 24 * 60 * 60 * 1000;

      const correlatedSignals = allSignals
        .filter((s) => !rejectedPairs.has(`${narrative.id}:${s.id}`))
        .map((signal) => {
          // Find if this signal is referenced in any chain for this narrative
          const relatedChain = narrativeChains.find((c) =>
            c.chain.some(
              (link) =>
                link.evidence.toLowerCase().includes(signal.title.toLowerCase().slice(0, 20)) ||
                link.node.toLowerCase().includes(signal.title.toLowerCase().slice(0, 20)),
            ),
          );

          const signalTs = new Date(signal.timestamp).getTime();
          const offsetDays = (signalTs - narrativeMidpoint) / msPerDay;

          // Map direction to possibleRelationship
          let possibleRelationship: 'caused_by' | 'caused' | 'coincident' | 'amplified';
          if (relatedChain) {
            if (relatedChain.direction === 'narrative_to_effect') possibleRelationship = 'caused';
            else if (relatedChain.direction === 'effect_to_narrative')
              possibleRelationship = 'caused_by';
            else possibleRelationship = 'amplified';
          } else if (Math.abs(offsetDays) < 1) {
            possibleRelationship = 'coincident';
          } else {
            possibleRelationship = offsetDays > 0 ? 'caused' : 'caused_by';
          }

          return {
            signal,
            correlationStrength: relatedChain?.overall_confidence ?? 0.1,
            temporalOffset:
              offsetDays >= 0
                ? `+${Math.round(offsetDays)} days`
                : `${Math.round(offsetDays)} days`,
            possibleRelationship,
          };
        })
        .filter((cs) => cs.correlationStrength > 0.05)
        .sort((a, b) => b.correlationStrength - a.correlationStrength);

      return {
        narrativeId: narrative.id,
        narrativeSummary: narrative.summary,
        correlatedSignals,
        transmissionChains,
      };
    });
  }

  private validateChainNodeType(t?: string): TransmissionChainNode['type'] {
    const valid = ['narrative', 'economic', 'political', 'social', 'market'];
    if (t && valid.includes(t)) return t as TransmissionChainNode['type'];
    if (t === 'media') return 'social';
    return 'social';
  }
}
