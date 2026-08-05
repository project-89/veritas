import { GoogleGenerativeAI } from '@google/generative-ai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DETERMINISTIC_JSON_CONFIG, extractFirstJsonObject, geminiChatModel } from './utils/llm-config';
import { LlmGateway } from './utils/llm-gateway';

export const TRANSLATION_PROMPT_VERSION = 1;

/**
 * How much of a single item is sent for translation, by kind. Headlines are
 * short by nature; bodies and social posts need more room, but are still
 * bounded so one long document can't dominate a batch's token cost.
 */
const MAX_CHARS_BY_KIND = {
  headline: 300,
  body: 1200,
  post: 800,
} as const;

export type TranslationKind = keyof typeof MAX_CHARS_BY_KIND;

/**
 * The canonical normalized-text contract. Everything downstream of ingest
 * (embedding, classification, topic extraction, clustering) reads
 * `textEn ?? text`, and `translated` records which one it got — so a
 * translation failure is visible in the data rather than indistinguishable
 * from native English.
 */
export interface TranslatedText {
  /** The original text, exactly as ingested. Never overwritten. */
  text: string;
  /** English rendering, or null when translation was unavailable. */
  textEn: string | null;
  /** ISO 639-1 code of the original, or 'en'. */
  language: string;
  /** True only when `textEn` came back from a successful translation. */
  translated: boolean;
}

/**
 * Translation to English for non-English sources (domestic state media: RIA
 * Novosti, IRNA, ...; foreign-language social posts; non-English article
 * bodies). Translations are always MARKED as translations — the original text
 * is kept alongside, never silently replaced.
 *
 * This runs at INGEST, before clustering, embedding and topic extraction,
 * because all three are language-bound: story clustering matches on shared
 * title tokens (a Russian headline shares none with its English counterpart),
 * the default embedding path is lexical, and the NER stack is English-only.
 *
 * Returns null per item when translation is unavailable (no key, failure,
 * budget) so callers degrade honestly: show the original text untranslated
 * rather than dropping the item or pretending it was English.
 */
@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);
  private readonly genAI: GoogleGenerativeAI | null = null;
  private readonly chatModel: string = geminiChatModel();

  // Titles repeat across poll cycles; don't pay Gemini twice for the same one.
  private readonly cache = new Map<string, string>();
  private static readonly CACHE_MAX = 2000;

  constructor(private readonly configService: ConfigService) {
    const geminiKey =
      this.configService.get<string>('GEMINI_API_KEY') || process.env['GEMINI_API_KEY'];
    if (geminiKey) {
      this.genAI = new GoogleGenerativeAI(geminiKey);
    } else {
      this.logger.warn('GEMINI_API_KEY not set -- headline translation unavailable');
    }
  }

  get available(): boolean {
    return this.genAI !== null;
  }

  /**
   * Translate headlines to English in one batched call. Result[i] corresponds
   * to texts[i]; null means "no translation available" (caller keeps original).
   */
  async translateHeadlines(
    texts: string[],
    sourceLanguage: string,
  ): Promise<Array<string | null>> {
    return this.translateTexts(texts, sourceLanguage, 'headline');
  }

  /**
   * Normalize a batch to English, returning the full `TranslatedText` contract
   * rather than bare strings. Items already in English pass through untouched
   * and cost nothing.
   */
  async normalize(
    texts: string[],
    sourceLanguage: string,
    kind: TranslationKind = 'post',
  ): Promise<TranslatedText[]> {
    if (sourceLanguage === 'en') {
      return texts.map((text) => ({ text, textEn: text, language: 'en', translated: false }));
    }
    const translations = await this.translateTexts(texts, sourceLanguage, kind);
    return texts.map((text, i) => {
      const textEn = translations[i] ?? null;
      return { text, textEn, language: sourceLanguage, translated: textEn !== null };
    });
  }

  /**
   * Translate a batch to English in one call. Result[i] corresponds to
   * texts[i]; null means "no translation available" (caller keeps original).
   */
  async translateTexts(
    texts: string[],
    sourceLanguage: string,
    kind: TranslationKind = 'post',
  ): Promise<Array<string | null>> {
    if (texts.length === 0) return [];
    if (!this.genAI) return texts.map(() => null);

    const results: Array<string | null> = texts.map(
      (t) => this.cache.get(cacheKey(t, kind)) ?? null,
    );
    const pending = texts
      .map((text, index) => ({ text, index }))
      .filter(({ index }) => results[index] === null);
    if (pending.length === 0) return results;

    const model = this.genAI.getGenerativeModel({
      model: this.chatModel,
      generationConfig: DETERMINISTIC_JSON_CONFIG,
    });

    const maxChars = MAX_CHARS_BY_KIND[kind];
    const numbered = pending.map(
      (p, i) => `${i}: ${p.text.replace(/\s+/g, ' ').slice(0, maxChars)}`,
    );
    const noun = kind === 'headline' ? 'news headlines' : kind === 'body' ? 'news article excerpts' : 'social media posts';
    const prompt = `Translate these ${noun} from "${sourceLanguage}" to English. Preserve meaning and tone exactly — do not soften, editorialize, or summarize. Keep proper nouns recognizable (transliterate names).

${numbered.join('\n')}

Return STRICT JSON: {"translations": ["<english text for 0>", "<for 1>", ...]} with exactly ${pending.length} entries, in order.`;

    try {
      const responseText = await LlmGateway.instance.run({
        model: this.chatModel,
        promptVersion: TRANSLATION_PROMPT_VERSION,
        prompt,
        contextKey: `translation-${kind}`,
        generate: () => model.generateContent(prompt).then((r) => r.response.text()),
      });
      const json = extractFirstJsonObject(responseText);
      const parsed = json ? (JSON.parse(json) as { translations?: unknown[] }) : {};
      const translations = Array.isArray(parsed.translations) ? parsed.translations : [];
      pending.forEach(({ text, index }, i) => {
        const t = translations[i];
        if (typeof t === 'string' && t.trim().length > 0) {
          results[index] = t.trim();
          this.writeCache(cacheKey(text, kind), t.trim());
        }
      });
    } catch (err) {
      this.logger.warn(`Translation failed (${kind}, ${sourceLanguage}): ${err}`);
    }
    return results;
  }

  private writeCache(key: string, value: string): void {
    this.cache.delete(key);
    this.cache.set(key, value);
    while (this.cache.size > TranslationService.CACHE_MAX) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }
}

// Keyed by kind as well as text: the per-kind character caps mean the same
// input can legitimately produce different translations.
function cacheKey(text: string, kind: TranslationKind): string {
  return `${kind}:${text.replace(/\s+/g, ' ').trim().toLowerCase()}`;
}
