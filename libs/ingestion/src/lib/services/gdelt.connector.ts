import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { EventEmitter } from 'events';
import type { NarrativeInsight } from '../../types/narrative-insight.interface';
import type { SocialMediaPost } from '../../types/social-media.types';
import type { ConnectorSearchOptions, DataConnector } from '../interfaces/data-connector.interface';
import type { SourceNode } from '../schemas';
import { buildSearchQuery, extractSignificantTerms } from '../utils/query-match.util';
import { TransformOnIngestService } from './transform/transform-on-ingest.service';
import { SourceRateLimiter } from './utils/source-rate-limiter';

const USER_AGENT = 'Mozilla/5.0 (compatible; Veritas/2.0; +https://github.com/oneirocom/veritas)';
const GDELT_DOC_API = 'https://api.gdeltproject.org/api/v2/doc/doc';

interface GdeltArticle {
  url?: string;
  title?: string;
  seendate?: string;
  domain?: string;
  language?: string;
  sourcecountry?: string;
}

interface GdeltResponse {
  articles?: GdeltArticle[];
}

interface SearchOptions extends ConnectorSearchOptions {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

/**
 * GDELT DOC 2.0 ingestion connector.
 *
 * Query-driven global news coverage — the GDELT Project indexes news articles
 * worldwide in near real-time. This complements the curated RSS catalog by
 * surfacing breaking coverage from outlets NOT in the feed list. Each article
 * becomes a post whose "author" is the publishing domain (news outlets, not
 * individuals). No API key required; rate-limited to 1 req / 5s (handled by the
 * shared SourceRateLimiter).
 *
 * Defaults to English (`sourcelang:eng`) so results stay relevant to English
 * queries and analyzable downstream; override with GDELT_SOURCE_LANG (e.g. a
 * different ISO code, or empty for all languages / full multilingual coverage).
 *
 * Docs: https://blog.gdeltproject.org/gdelt-doc-2-0-api-exploring-the-world/
 */
@Injectable()
export class GdeltConnector implements DataConnector {
  platform = 'gdelt' as const;

  private readonly logger = new Logger(GdeltConnector.name);

  constructor(private readonly transformService: TransformOnIngestService) {}

  async connect(): Promise<void> {
    this.logger.log('GDELT DOC connector ready');
  }

  async disconnect(): Promise<void> {
    // No persistent connection
  }

  async validateCredentials(): Promise<boolean> {
    return true; // Keyless public API
  }

  async searchContent(query: string, options?: SearchOptions): Promise<SocialMediaPost[]> {
    if (extractSignificantTerms(query).length === 0) return [];

    const articles = await this.fetchArticles(query, options);
    const limit = options?.limit ?? 50;

    const posts = articles
      .filter((a) => a.url && a.title)
      .map((a) => this.transformArticle(a))
      .filter((p): p is SocialMediaPost => p !== null);

    // NOTE: no title-based relevance filter here. GDELT applies the query to
    // article CONTENT server-side, but we only receive the title — so
    // matchesQuery(title) would wrongly drop relevant articles whose headline
    // doesn't literally contain the query terms. GDELT's search IS the filter.

    // Date filter (GDELT timespan is coarse; enforce the exact window here).
    const dateFiltered = this.filterByDate(posts, options?.startDate, options?.endDate);

    return dateFiltered.slice(0, limit);
  }

  async searchWithRawData(
    query: string,
    options?: SearchOptions,
  ): Promise<{ posts: SocialMediaPost[]; insights: NarrativeInsight[] }> {
    const posts = await this.searchContent(query, options);
    if (posts.length === 0) return { posts: [], insights: [] };
    const insights = await this.transformService.transformBatch(posts);
    this.logger.log(`GDELT: ${posts.length} articles, ${insights.length} insights`);
    return { posts, insights };
  }

  async searchAndTransform(
    query: string,
    options?: ConnectorSearchOptions,
  ): Promise<NarrativeInsight[]> {
    const { insights } = await this.searchWithRawData(query, options as SearchOptions);
    return insights;
  }

  streamAndTransform(keywords: string[]): EventEmitter {
    const emitter = new EventEmitter();
    const initial = setTimeout(() => {
      void (async () => {
        try {
          const insights = await this.searchAndTransform(keywords.join(' '));
          for (const insight of insights) emitter.emit('data', insight);
        } catch {
          // ignore
        }
        emitter.emit('end');
      })();
    }, 0);
    initial.unref?.();
    return emitter;
  }

  async getAuthorDetails(authorId: string): Promise<Partial<SourceNode>> {
    // Author is the publishing domain.
    return { platform: 'gdelt', name: authorId };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async fetchArticles(query: string, options?: SearchOptions): Promise<GdeltArticle[]> {
    const searchTerms = buildSearchQuery(query);
    const lang = process.env['GDELT_SOURCE_LANG'] ?? 'eng';
    // Unquoted terms = GDELT ANDs them across article content (relevant but not
    // as brittle as an exact-phrase match). Append the language filter.
    const gdeltQuery = [searchTerms, lang ? `sourcelang:${lang}` : ''].filter(Boolean).join(' ');

    const url = new URL(GDELT_DOC_API);
    url.searchParams.set('query', gdeltQuery);
    url.searchParams.set('mode', 'artlist');
    url.searchParams.set('format', 'json');
    url.searchParams.set('maxrecords', String(Math.min(options?.limit ?? 50, 75)));
    url.searchParams.set('sort', 'datedesc');
    url.searchParams.set('timespan', this.resolveTimespan(options));

    // Use axios (not Node fetch/undici — GDELT's server intermittently fails
    // undici with "TypeError: fetch failed" while axios/curl succeed).
    // GDELT throttles aggressively (429s, or stalls connections from a hot IP);
    // treat rate-limits AND transient network/timeout errors as a soft "no
    // results this scan" rather than failing the connector.
    let response: { status: number; data: unknown };
    try {
      response = await SourceRateLimiter.instance.schedule('gdelt', () =>
        axios.get<string>(url.toString(), {
          headers: { 'User-Agent': USER_AGENT },
          timeout: 20_000,
          responseType: 'text',
          // Don't throw on 4xx/5xx — we handle rate-limits/errors explicitly.
          validateStatus: () => true,
        }),
      );
    } catch (err) {
      // Network error / timeout — GDELT stalling a throttled IP. Degrade to empty.
      SourceRateLimiter.instance.notifyRateLimited('gdelt');
      this.logger.warn(
        `GDELT request failed (${err instanceof Error ? err.message : err}) — skipping`,
      );
      return [];
    }

    if (response.status === 429) {
      SourceRateLimiter.instance.notifyRateLimited('gdelt');
      this.logger.warn('GDELT rate-limited (429)');
      return [];
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`GDELT DOC API returned HTTP ${response.status}`);
    }

    // GDELT returns plain text (not JSON) for errors/empty; guard the parse.
    const text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    if (!text.trim().startsWith('{')) return [];
    try {
      const data = JSON.parse(text) as GdeltResponse;
      return data.articles ?? [];
    } catch {
      return [];
    }
  }

  /** Map the requested window to a GDELT timespan (coarse; exact window enforced later). */
  private resolveTimespan(options?: SearchOptions): string {
    if (options?.startDate) {
      const days = Math.ceil((Date.now() - options.startDate.getTime()) / (24 * 60 * 60 * 1000));
      return `${Math.max(1, Math.min(days, 90))}d`; // GDELT DOC caps at ~3 months
    }
    return '7d';
  }

  private transformArticle(article: GdeltArticle): SocialMediaPost | null {
    const url = article.url;
    const title = article.title;
    if (!url || !title) return null;
    const domain = article.domain ?? this.domainFromUrl(url);

    return {
      id: `gdelt-${url.replace(/\W/g, '').slice(-40)}`,
      text: title.trim(),
      platform: this.platform,
      authorId: domain,
      authorName: domain,
      authorHandle: domain,
      url,
      timestamp: this.parseSeenDate(article.seendate),
      engagementMetrics: {
        likes: 0,
        shares: 0,
        comments: 0,
        reach: 0,
        viralityScore: 0,
      },
    };
  }

  private filterByDate(posts: SocialMediaPost[], start?: Date, end?: Date): SocialMediaPost[] {
    if (!start && !end) return posts;
    const startMs = start?.getTime() ?? 0;
    const endMs = end?.getTime() ?? Date.now();
    return posts.filter((p) => {
      const ts = p.timestamp.getTime();
      return ts >= startMs && ts <= endMs;
    });
  }

  /** Parse GDELT seendate (YYYYMMDDTHHMMSSZ) to a Date; fall back to now. */
  private parseSeenDate(seendate?: string): Date {
    if (!seendate) return new Date();
    // YYYYMMDDTHHMMSSZ -> ISO YYYY-MM-DDTHH:MM:SSZ
    const iso = seendate.replace(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/,
      '$1-$2-$3T$4:$5:$6Z',
    );
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }

  private domainFromUrl(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return 'unknown';
    }
  }
}
