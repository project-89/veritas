import { GoogleGenerativeAI } from '@google/generative-ai';
import { Logger } from '@nestjs/common';
import type { ExternalSignal, SignalAdapter } from './signal-adapter.interface';

/**
 * MVP signal adapter that uses Gemini to hypothesize downstream effects
 * rather than calling external APIs.
 *
 * Given narrative keywords and a time range, it asks the LLM:
 * "If this narrative is widely believed, what economic/political/social
 * consequences might follow?"
 */
export class LlmHypothesisAdapter implements SignalAdapter {
  readonly domain = 'hypothesis';
  readonly scope = 'query' as const;
  readonly maxAgeMs = 24 * 60 * 60 * 1000; // 24h — synthetic, no external data to refresh
  readonly name = 'LLM Hypothesis Engine';

  private readonly logger = new Logger(LlmHypothesisAdapter.name);
  private readonly chatModel = 'gemini-2.0-flash';

  constructor(private readonly genAI: GoogleGenerativeAI | null) {}

  async fetchSignals(params: {
    keywords: string[];
    startDate: string;
    endDate: string;
  }): Promise<ExternalSignal[]> {
    if (!this.genAI) {
      this.logger.warn('No Gemini key — returning fallback hypothesized signals');
      return this.fallbackSignals(params.keywords);
    }

    const model = this.genAI.getGenerativeModel({ model: this.chatModel });

    const prompt = `You are an analyst tracking how online narratives create real-world effects.

Given these narrative keywords/themes: ${params.keywords.join(', ')}
Time period: ${params.startDate} to ${params.endDate}

Hypothesize 3-6 plausible real-world signals (events, market movements, policy changes, social reactions) that could be downstream effects of these narratives gaining traction.

For each signal, assess:
- Which domain it falls into (economic, political, social, market, or media)
- A plausible source that would report it (e.g. "Reuters", "Yahoo Finance", "Google Trends")
- The magnitude of the effect (0-1 scale, where 1 = major disruption)
- A plausible timestamp within the given range

Use bounded, evidence-based language. Say "consistent with" not "caused by".

Respond ONLY with a JSON array of objects with these fields:
{ "domain": string, "source": string, "title": string, "description": string, "timestamp": string (ISO), "magnitude": number, "metadata": {} }

No other text outside the JSON array.`;

    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonMatch = text.match(/\[[\s\S]*\]/);

      if (!jsonMatch) {
        this.logger.warn('LLM hypothesis: no JSON array found in response');
        return this.fallbackSignals(params.keywords);
      }

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        domain?: string;
        source?: string;
        title?: string;
        description?: string;
        timestamp?: string;
        magnitude?: number;
        metadata?: Record<string, unknown>;
      }>;

      return parsed.map((item, i) => ({
        id: `llm-hyp-${i}`,
        domain: this.validateDomain(item.domain),
        source: item.source ?? 'LLM Hypothesis',
        title: item.title ?? `Hypothesized effect ${i + 1}`,
        description: item.description ?? '',
        timestamp: item.timestamp ?? params.startDate,
        magnitude: Math.max(0, Math.min(1, item.magnitude ?? 0.5)),
        metadata: { ...item.metadata, hypothesized: true },
      }));
    } catch (err) {
      this.logger.warn(`LLM hypothesis generation failed: ${err}`);
      return this.fallbackSignals(params.keywords);
    }
  }

  /** Deterministic fallback when Gemini is unavailable. */
  private fallbackSignals(keywords: string[]): ExternalSignal[] {
    const domains: ExternalSignal['domain'][] = [
      'economic',
      'political',
      'social',
      'market',
      'media',
    ];
    const topic = keywords.slice(0, 3).join(', ') || 'unknown topic';

    return domains.slice(0, 3).map((domain, i) => ({
      id: `fallback-${i}`,
      domain,
      source: 'Fallback Hypothesis',
      title: `Potential ${domain} effect of "${topic}" narrative`,
      description: `Deterministic fallback estimate of a plausible ${domain} consequence if the "${topic}" narrative gains widespread traction.`,
      timestamp: new Date().toISOString(),
      magnitude: 0.3 + i * 0.15,
      metadata: { hypothesized: true, fallback: true },
    }));
  }

  private validateDomain(d?: string): ExternalSignal['domain'] {
    const valid = ['economic', 'political', 'social', 'market', 'media'];
    if (d && valid.includes(d)) return d as ExternalSignal['domain'];
    return 'social';
  }
}
