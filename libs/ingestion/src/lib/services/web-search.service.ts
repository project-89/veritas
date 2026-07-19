import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * General web search for query enrichment — when a scan topic is vague, a
 * quick web pass tells us what the topic actually refers to, which entities
 * are involved, and where the conversation lives, before we spend a full
 * multi-connector scan on a fuzzy query.
 *
 * Providers, keyless first:
 * - DuckDuckGo HTML endpoint (no key, HTML-parsed, best-effort)
 * - Google News RSS search (no key, structured, dated)
 * - Brave Search API when BRAVE_SEARCH_API_KEY is set (better ranking)
 *
 * Every result carries its provider so downstream consumers know the
 * provenance and reliability of what they're reading.
 */

export interface WebSearchResult {
  title: string;
  url: string;
  snippet?: string;
  source?: string;
  publishedAt?: string;
  provider: 'brave' | 'duckduckgo' | 'google-news';
}

export interface WebSearchResponse {
  query: string;
  providers: string[];
  results: WebSearchResult[];
}

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/** Decode DuckDuckGo's redirect links (/l/?uddg=<encoded-target>&rut=...). */
export function decodeDuckDuckGoUrl(href: string): string | null {
  try {
    const url = new URL(href, 'https://duckduckgo.com');
    const target = url.searchParams.get('uddg');
    if (target) return decodeURIComponent(target);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString();
    return null;
  } catch {
    return null;
  }
}

/** Strip tags + collapse whitespace + decode common entities. */
function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Best-effort extraction from the DuckDuckGo HTML results page. */
export function parseDuckDuckGoHtml(html: string, limit: number): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  // Each organic result renders as <a class="result__a" href="...">title</a>
  // ... <a class="result__snippet" ...>snippet</a>
  const linkRe = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetRe = /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  const snippets: string[] = [];
  for (const m of html.matchAll(snippetRe)) {
    snippets.push(htmlToText(m[1] ?? ''));
  }
  let i = 0;
  for (const m of html.matchAll(linkRe)) {
    const url = decodeDuckDuckGoUrl(m[1] ?? '');
    const title = htmlToText(m[2] ?? '');
    if (!url || !title) continue;
    results.push({ title, url, snippet: snippets[i], provider: 'duckduckgo' });
    i++;
    if (results.length >= limit) break;
  }
  return results;
}

@Injectable()
export class WebSearchService {
  private readonly logger = new Logger(WebSearchService.name);
  private readonly braveKey: string | undefined;

  constructor(configService: ConfigService) {
    this.braveKey =
      configService.get<string>('BRAVE_SEARCH_API_KEY') || process.env['BRAVE_SEARCH_API_KEY'];
  }

  get providers(): string[] {
    return [...(this.braveKey ? ['brave'] : []), 'duckduckgo', 'google-news'];
  }

  /**
   * General web search: Brave when a key is configured, else DuckDuckGo.
   * Returns [] on failure — callers treat web context as best-effort.
   */
  async searchWeb(query: string, limit = 8): Promise<WebSearchResult[]> {
    if (this.braveKey) {
      const brave = await this.searchBrave(query, limit);
      if (brave.length > 0) return brave;
      // Brave failing shouldn't silence the keyless fallback.
    }
    return this.searchDuckDuckGo(query, limit);
  }

  /** News-specific search via Google News RSS — structured, dated, keyless. */
  async searchNews(query: string, limit = 8): Promise<WebSearchResult[]> {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
      const Parser = (await import('rss-parser')).default;
      const parser = new Parser({ timeout: 10_000 });
      const feed = await parser.parseURL(url);
      return (feed.items ?? []).slice(0, limit).map((item) => {
        // Google News titles end with " - Source Name".
        const title = item.title ?? '';
        const dashIdx = title.lastIndexOf(' - ');
        return {
          title: dashIdx > 0 ? title.slice(0, dashIdx) : title,
          url: item.link ?? '',
          source: dashIdx > 0 ? title.slice(dashIdx + 3) : undefined,
          publishedAt: item.pubDate,
          provider: 'google-news' as const,
        };
      });
    } catch (err) {
      this.logger.warn(`Google News search failed: ${err}`);
      return [];
    }
  }

  /** Combined pass: web + news, deduplicated by URL. */
  async searchAll(query: string, limit = 8): Promise<WebSearchResponse> {
    const [web, news] = await Promise.all([
      this.searchWeb(query, limit),
      this.searchNews(query, limit),
    ]);
    const seen = new Set<string>();
    const results: WebSearchResult[] = [];
    for (const r of [...web, ...news]) {
      if (!r.url || seen.has(r.url)) continue;
      seen.add(r.url);
      results.push(r);
    }
    return { query, providers: this.providers, results };
  }

  private async searchDuckDuckGo(query: string, limit: number): Promise<WebSearchResult[]> {
    try {
      const response = await fetch(
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
        {
          headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
          signal: AbortSignal.timeout(12_000),
        },
      );
      if (!response.ok) {
        this.logger.warn(`DuckDuckGo returned HTTP ${response.status}`);
        return [];
      }
      return parseDuckDuckGoHtml(await response.text(), limit);
    } catch (err) {
      this.logger.warn(`DuckDuckGo search failed: ${err}`);
      return [];
    }
  }

  private async searchBrave(query: string, limit: number): Promise<WebSearchResult[]> {
    try {
      const response = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`,
        {
          headers: {
            Accept: 'application/json',
            'X-Subscription-Token': this.braveKey ?? '',
          },
          signal: AbortSignal.timeout(12_000),
        },
      );
      if (!response.ok) {
        this.logger.warn(`Brave Search returned HTTP ${response.status}`);
        return [];
      }
      const data = (await response.json()) as {
        web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
      };
      return (data.web?.results ?? [])
        .filter((r) => r.title && r.url)
        .slice(0, limit)
        .map((r) => ({
          title: htmlToText(r.title ?? ''),
          url: r.url ?? '',
          snippet: r.description ? htmlToText(r.description) : undefined,
          provider: 'brave' as const,
        }));
    } catch (err) {
      this.logger.warn(`Brave search failed: ${err}`);
      return [];
    }
  }
}
