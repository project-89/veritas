import { GoogleGenerativeAI } from '@google/generative-ai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DETERMINISTIC_JSON_CONFIG, extractFirstJsonObject, geminiChatModel } from './utils/llm-config';
import { LlmGateway } from './utils/llm-gateway';

export const TRANSLATION_PROMPT_VERSION = 1;

/**
 * Headline translation for non-English sources (domestic state media: RIA
 * Novosti, IRNA, ...). Translations are always MARKED as translations by the
 * caller — the original text is kept alongside, never silently replaced.
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
    if (texts.length === 0) return [];
    if (!this.genAI) return texts.map(() => null);

    const results: Array<string | null> = texts.map((t) => this.cache.get(cacheKey(t)) ?? null);
    const pending = texts
      .map((text, index) => ({ text, index }))
      .filter(({ index }) => results[index] === null);
    if (pending.length === 0) return results;

    const model = this.genAI.getGenerativeModel({
      model: this.chatModel,
      generationConfig: DETERMINISTIC_JSON_CONFIG,
    });

    const numbered = pending.map((p, i) => `${i}: ${p.text.replace(/\s+/g, ' ').slice(0, 300)}`);
    const prompt = `Translate these news headlines from "${sourceLanguage}" to English. Preserve meaning and tone exactly — do not soften, editorialize, or summarize. Keep proper nouns recognizable (transliterate names).

${numbered.join('\n')}

Return STRICT JSON: {"translations": ["<english headline for 0>", "<for 1>", ...]} with exactly ${pending.length} entries, in order.`;

    try {
      const responseText = await LlmGateway.instance.run({
        model: this.chatModel,
        promptVersion: TRANSLATION_PROMPT_VERSION,
        prompt,
        contextKey: 'rss-headline-translation',
        generate: () => model.generateContent(prompt).then((r) => r.response.text()),
      });
      const json = extractFirstJsonObject(responseText);
      const parsed = json ? (JSON.parse(json) as { translations?: unknown[] }) : {};
      const translations = Array.isArray(parsed.translations) ? parsed.translations : [];
      pending.forEach(({ text, index }, i) => {
        const t = translations[i];
        if (typeof t === 'string' && t.trim().length > 0) {
          results[index] = t.trim();
          this.writeCache(cacheKey(text), t.trim());
        }
      });
    } catch (err) {
      this.logger.warn(`Headline translation failed (${sourceLanguage}): ${err}`);
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

function cacheKey(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}
