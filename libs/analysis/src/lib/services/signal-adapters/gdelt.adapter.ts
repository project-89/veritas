import { Logger } from '@nestjs/common';
import type { ExternalSignal, SignalAdapter } from './signal-adapter.interface';

const USER_AGENT = 'Mozilla/5.0 (compatible; Veritas/2.0; +https://github.com/oneirocom/veritas)';

/**
 * GDELT (Global Database of Events, Language and Tone) adapter.
 *
 * Uses the free GDELT DOC 2.0 API to fetch news articles matching narrative
 * keywords. No API key is required.
 *
 * Docs: https://blog.gdeltproject.org/gdelt-doc-2-0-api-exploring-the-world/
 */
export class GdeltAdapter implements SignalAdapter {
  readonly domain = 'media';
  readonly scope = 'query' as const;
  readonly maxAgeMs = 6 * 60 * 60 * 1000; // 6h — news articles indexed in near real-time
  readonly name = 'GDELT Global News';

  private readonly logger = new Logger(GdeltAdapter.name);
  private readonly baseUrl = 'https://api.gdeltproject.org/api/v2/doc/doc';

  async fetchSignals(params: {
    keywords: string[];
    startDate: string;
    endDate: string;
  }): Promise<ExternalSignal[]> {
    try {
      const query = this.buildQuery(params.keywords);
      const startDt = this.toGdeltDate(params.startDate);
      const endDt = this.toGdeltDate(params.endDate);

      const url = new URL(this.baseUrl);
      url.searchParams.set('query', query);
      url.searchParams.set('mode', 'artlist');
      url.searchParams.set('maxrecords', '50');
      url.searchParams.set('format', 'json');
      url.searchParams.set('startdatetime', startDt);
      url.searchParams.set('enddatetime', endDt);

      const response = await fetch(url.toString(), {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(8_000),
      });

      if (!response.ok) {
        this.logger.warn(`GDELT returned HTTP ${response.status}`);
        return [];
      }

      const data = (await response.json()) as GdeltResponse;
      return this.mapArticles(data);
    } catch (err) {
      this.logger.warn(`GDELT fetch failed: ${err}`);
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Build a GDELT query string from keywords (OR-joined, top 5). */
  private buildQuery(keywords: string[]): string {
    return keywords.slice(0, 5).join(' OR ');
  }

  /**
   * Convert an ISO date string to GDELT date format: YYYYMMDDHHMMSS.
   */
  toGdeltDate(isoDate: string): string {
    const d = new Date(isoDate);
    const pad = (n: number, len = 2) => String(n).padStart(len, '0');
    return [
      d.getUTCFullYear(),
      pad(d.getUTCMonth() + 1),
      pad(d.getUTCDate()),
      pad(d.getUTCHours()),
      pad(d.getUTCMinutes()),
      pad(d.getUTCSeconds()),
    ].join('');
  }

  /**
   * Map GDELT article list to ExternalSignal[].
   */
  mapArticles(data: GdeltResponse): ExternalSignal[] {
    if (!data.articles || !Array.isArray(data.articles)) return [];

    return data.articles.map((article, i) => {
      const tone = this.parseTone(article.tone);
      return {
        id: `gdelt-${i}-${Date.now()}`,
        domain: 'media' as const,
        source: 'GDELT',
        title: article.title ?? 'Untitled article',
        description: [article.domain, article.sourcecountry].filter(Boolean).join(' | '),
        timestamp: this.parseSeenDate(article.seendate),
        magnitude: this.toneMagnitude(tone),
        metadata: {
          url: article.url ?? '',
          domain: article.domain ?? '',
          country: article.sourcecountry ?? '',
          language: article.language ?? '',
          tone,
        },
      };
    });
  }

  /**
   * GDELT tone is a comma-separated string: positive,negative,polarity,...
   * We extract the first value (average tone, can be negative).
   */
  private parseTone(tone?: string): number {
    if (!tone) return 0;
    const first = Number.parseFloat(tone.split(',')[0] ?? '0');
    return Number.isFinite(first) ? first : 0;
  }

  /** Map absolute tone value to a 0-1 magnitude. Tone ranges roughly -25 to +25. */
  private toneMagnitude(tone: number): number {
    return Math.min(1, Math.abs(tone) / 15);
  }

  /** Parse GDELT seendate (YYYYMMDDTHHMMSS or similar) to ISO string. */
  private parseSeenDate(seendate?: string): string {
    if (!seendate) return new Date().toISOString();
    try {
      // GDELT returns dates like "20250601T120000Z" or "20250601120000"
      const cleaned = seendate.replace(/[^0-9T]/g, '');
      if (cleaned.length >= 14) {
        const y = cleaned.slice(0, 4);
        const m = cleaned.slice(4, 6);
        const d = cleaned.slice(6, 8);
        const h = cleaned.slice(9, 11) || cleaned.slice(8, 10);
        const min = cleaned.slice(11, 13) || cleaned.slice(10, 12);
        const s = cleaned.slice(13, 15) || cleaned.slice(12, 14);
        return new Date(`${y}-${m}-${d}T${h}:${min}:${s}Z`).toISOString();
      }
      return new Date(seendate).toISOString();
    } catch {
      return new Date().toISOString();
    }
  }
}

// ---------------------------------------------------------------------------
// GDELT response types
// ---------------------------------------------------------------------------

export interface GdeltArticle {
  url?: string;
  title?: string;
  seendate?: string;
  domain?: string;
  language?: string;
  sourcecountry?: string;
  socialimage?: string;
  tone?: string;
}

export interface GdeltResponse {
  articles?: GdeltArticle[];
}
