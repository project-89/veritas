import { GoogleGenerativeAI } from '@google/generative-ai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DETERMINISTIC_JSON_CONFIG,
  geminiChatModel,
  LlmGateway,
  parseLlmJsonObject,
} from '@veritas/content-classification/llm';

export const STANCE_PROMPT_VERSION = 1;

/**
 * Position a post takes toward a specific target.
 *
 * `unclear` is a first-class outcome, not a failure. Most social posts do not
 * take a position on any given target, and forcing them into favor/against
 * would be the same over-claiming this codebase has been removing elsewhere.
 */
export type Stance = 'favor' | 'against' | 'neutral' | 'unclear';

export interface StanceResult {
  stance: Stance;
  /** 0-1 self-reported by the model. Only `high` confidence drives hard splits. */
  confidence: number;
}

/**
 * Stance is the position a text takes TOWARD A TARGET. It is not sentiment.
 *
 * This distinction is the whole reason the service exists. Sentiment measures
 * tone; stance measures position. "This is a disaster for gun-control
 * advocates" is negative in tone and pro-gun in stance. Clustering that keys
 * on sentiment — as `adjustNarrativeSimilarity` previously did — will merge
 * opposing narratives and split agreeing ones.
 *
 * The problem it solves for clustering: embedding similarity happily merges
 * "we must ban assault weapons" with "banning assault weapons is tyranny".
 * They share topic, entities and most vocabulary, and cosine similarity sees
 * near-identical vectors. They are opposite narratives, and merging them
 * destroys the thing the platform exists to observe.
 *
 * Degrades honestly: with no API key, every result is `unclear` at confidence
 * 0, and callers must treat that as "no stance information", never as
 * "neutral".
 */
@Injectable()
export class StanceService {
  private readonly logger = new Logger(StanceService.name);
  private readonly genAI: GoogleGenerativeAI | null = null;
  private readonly chatModel: string = geminiChatModel();

  /** Max posts per LLM call. Keeps prompts well inside context and bounds retry cost. */
  private static readonly BATCH_SIZE = 20;
  /** Per-post excerpt length. Stance is usually clear from the opening. */
  private static readonly MAX_CHARS = 400;

  constructor(private readonly configService: ConfigService) {
    const key =
      this.configService.get<string>('GEMINI_API_KEY') || process.env['GEMINI_API_KEY'];
    if (key) {
      this.genAI = new GoogleGenerativeAI(key);
    } else {
      this.logger.warn('GEMINI_API_KEY not set — stance detection unavailable');
    }
  }

  get available(): boolean {
    return this.genAI !== null;
  }

  /**
   * Classify each text's stance toward `target`.
   *
   * Result[i] corresponds to texts[i]. Never throws: on any failure every
   * entry is `unclear`, so clustering falls back to similarity-only behaviour
   * rather than the pipeline breaking.
   */
  async classify(texts: string[], target: string): Promise<StanceResult[]> {
    const unknown: StanceResult[] = texts.map(() => ({ stance: 'unclear', confidence: 0 }));
    if (texts.length === 0) return [];
    if (!this.genAI || !target.trim()) return unknown;

    const results = [...unknown];
    const model = this.genAI.getGenerativeModel({
      model: this.chatModel,
      generationConfig: DETERMINISTIC_JSON_CONFIG,
    });

    for (let start = 0; start < texts.length; start += StanceService.BATCH_SIZE) {
      const batch = texts.slice(start, start + StanceService.BATCH_SIZE);
      const prompt = this.buildPrompt(batch, target);
      try {
        const raw = await LlmGateway.instance.run({
          model: this.chatModel,
          promptVersion: STANCE_PROMPT_VERSION,
          prompt,
          contextKey: 'stance-detection',
          generate: () => model.generateContent(prompt).then((r) => r.response.text()),
        });
        // Lenient parse: gemini-3.x JSON mode intermittently emits a
        // truncated or over-braced object even at finishReason STOP, which
        // would otherwise silently void the whole batch to `unclear`.
        const parsed = (parseLlmJsonObject(raw) ?? {}) as { stances?: unknown[] };
        const list = Array.isArray(parsed.stances) ? parsed.stances : [];
        if (list.length === 0) {
          this.logger.warn(
            `Stance response for "${target}" contained no parseable stances ` +
              `(${batch.length} posts affected)`,
          );
        }
        list.forEach((entry, i) => {
          const idx = start + i;
          if (idx >= results.length) return;
          const coerced = this.coerce(entry);
          if (coerced) results[idx] = coerced;
        });
      } catch (err) {
        this.logger.warn(`Stance classification failed for target "${target}": ${err}`);
        // Leave this batch as `unclear` — an honest absence of information.
      }
    }

    return results;
  }

  private buildPrompt(texts: string[], target: string): string {
    const numbered = texts
      .map((t, i) => `${i}: ${t.replace(/\s+/g, ' ').slice(0, StanceService.MAX_CHARS)}`)
      .join('\n');

    return `Determine each post's STANCE toward this target: "${target}"

Stance is the position the author takes toward the target. It is NOT tone or sentiment.
- "favor"   — supports, defends, or advocates for the target
- "against" — opposes, criticises, or argues against the target
- "neutral" — discusses the target without taking a side (reporting, questions)
- "unclear" — the post does not address the target, or the position cannot be determined

Critical: an angry post can be "favor" and a calm post can be "against". Judge the
POSITION, not the emotion. Example, target "gun control":
  "This is a disaster for gun-control advocates" -> against (negative tone, anti-target position)
  "Furious that they still haven't passed background checks" -> favor (angry tone, pro-target position)

Prefer "unclear" when genuinely uncertain. Do not guess.

${numbered}

Return STRICT JSON: {"stances": [{"stance": "favor"|"against"|"neutral"|"unclear", "confidence": 0.0-1.0}, ...]}
with exactly ${texts.length} entries, in order.`;
  }

  private coerce(entry: unknown): StanceResult | null {
    if (entry === null || typeof entry !== 'object') return null;
    const rec = entry as Record<string, unknown>;
    const stance = rec['stance'];
    if (
      stance !== 'favor' &&
      stance !== 'against' &&
      stance !== 'neutral' &&
      stance !== 'unclear'
    ) {
      return null;
    }
    const rawConf = rec['confidence'];
    const confidence =
      typeof rawConf === 'number' && Number.isFinite(rawConf)
        ? Math.max(0, Math.min(1, rawConf))
        : 0;
    return { stance, confidence };
  }
}

/**
 * Whether two stances are confidently opposed toward the same target.
 *
 * Deliberately strict. This drives a HARD split in clustering, so a false
 * positive fragments a real narrative — worse than the merge it prevents.
 * Only favor-vs-against counts, only above the confidence floor, and
 * `unclear` never splits anything.
 */
export const STANCE_CONFIDENCE_FLOOR = 0.6;

export function stancesOppose(a: StanceResult, b: StanceResult): boolean {
  if (a.confidence < STANCE_CONFIDENCE_FLOOR || b.confidence < STANCE_CONFIDENCE_FLOOR) {
    return false;
  }
  return (
    (a.stance === 'favor' && b.stance === 'against') ||
    (a.stance === 'against' && b.stance === 'favor')
  );
}
