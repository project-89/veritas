import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';
import type { NarrativeInsight } from '../../types/narrative-insight.interface';
import type { ConnectorSearchOptions, DataConnector } from '../interfaces/data-connector.interface';
import type { SourceNode } from '../schemas';

const USER_AGENT = 'Mozilla/5.0 (compatible; Veritas/2.0; +https://github.com/oneirocom/veritas)';

/**
 * Event categories that Wikipedia uses on the Current Events portal.
 */
const EVENT_CATEGORIES = [
  'Armed conflicts and attacks',
  'Arts and culture',
  'Business and economy',
  'Disasters and accidents',
  'International relations',
  'Law and crime',
  'Politics and elections',
  'Science and technology',
  'Sports',
] as const;

interface ParsedEvent {
  text: string;
  url: string;
  category: string;
}

/**
 * Wikipedia Current Events connector.
 *
 * Fetches today's current events from the Wikipedia Portal:Current_events page
 * via the MediaWiki parse API. No API key required.
 */
@Injectable()
export class WikipediaEventsConnector implements DataConnector {
  platform = 'wikipedia' as const;

  private readonly logger = new Logger(WikipediaEventsConnector.name);
  private readonly apiUrl = 'https://en.wikipedia.org/w/api.php';

  async connect(): Promise<void> {
    this.logger.log('Wikipedia Events connector ready');
  }

  async disconnect(): Promise<void> {
    // No persistent connection
  }

  async validateCredentials(): Promise<boolean> {
    return true; // Always available — no auth needed
  }

  /**
   * Search current events and transform into anonymised NarrativeInsight objects.
   */
  async searchAndTransform(
    query: string,
    options?: ConnectorSearchOptions,
  ): Promise<NarrativeInsight[]> {
    try {
      const events = await this.fetchAndParse(query, options?.limit);
      const now = new Date();

      return events.map((ev, i) => ({
        id: `wiki-insight-${i}-${Date.now()}`,
        contentHash: this.simpleHash(ev.text),
        sourceHash: this.simpleHash('wikipedia-portal'),
        platform: 'wikipedia',
        timestamp: now,
        themes: [ev.category],
        entities: [],
        sentiment: { score: 0, label: 'neutral' as const, confidence: 0.5 },
        engagement: { total: 0, breakdown: {} },
        narrativeScore: 0.4,
        processedAt: now,
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      }));
    } catch (err) {
      this.logger.error(`Wikipedia searchAndTransform failed: ${err}`);
      return [];
    }
  }

  streamAndTransform(keywords: string[]): EventEmitter {
    const emitter = new EventEmitter();
    // Wikipedia current events don't stream — emit once then close
    const initialFetch = setTimeout(() => {
      void (async () => {
        try {
          const insights = await this.searchAndTransform(keywords.join(' '));
          for (const insight of insights) {
            emitter.emit('data', insight);
          }
        } catch {
          // ignore
        }
        emitter.emit('end');
      })();
    }, 0);
    initialFetch.unref?.();
    return emitter;
  }

  async getAuthorDetails(authorId: string): Promise<Partial<SourceNode>> {
    void authorId;
    return {
      platform: 'wikipedia',
      name: 'Wikipedia',
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async fetchAndParse(query: string, limit?: number): Promise<ParsedEvent[]> {
    const html = await this.fetchCurrentEventsHtml();
    if (!html) return [];

    const events = this.parseEventsFromHtml(html);

    // Filter by query keywords if provided
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((k) => k.length > 2);

    const filtered =
      keywords.length > 0
        ? events.filter((e) => keywords.some((kw) => e.text.toLowerCase().includes(kw)))
        : events;

    return filtered.slice(0, limit ?? 50);
  }

  private async fetchCurrentEventsHtml(): Promise<string | null> {
    const url = new URL(this.apiUrl);
    url.searchParams.set('action', 'parse');
    url.searchParams.set('page', 'Portal:Current_events');
    url.searchParams.set('prop', 'text');
    url.searchParams.set('format', 'json');

    const response = await fetch(url.toString(), {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      this.logger.warn(`Wikipedia API returned HTTP ${response.status}`);
      return null;
    }

    const data = (await response.json()) as {
      parse?: { text?: { '*'?: string } };
    };
    return data.parse?.text?.['*'] ?? null;
  }

  /**
   * Parse event items from the Wikipedia Current Events HTML.
   * The page has date headings followed by categorized <ul> lists.
   * We extract individual <li> elements as events.
   */
  private parseEventsFromHtml(html: string): ParsedEvent[] {
    const events: ParsedEvent[] = [];

    // Match <li> content — each represents one event
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    for (let match = liRegex.exec(html); match !== null; match = liRegex.exec(html)) {
      const rawContent = match[1];
      if (!rawContent) continue;

      // Strip inner HTML tags to get plain text
      const text = rawContent
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();

      // Skip very short items or navigation elements
      if (text.length < 20) continue;

      // Try to detect category from preceding content
      const category = this.detectCategory(html, match.index);

      // Extract first link as URL if present
      const linkMatch = rawContent.match(/href="([^"]+)"/);
      const relativeUrl = linkMatch?.[1] ?? '';
      const eventUrl = relativeUrl.startsWith('/')
        ? `https://en.wikipedia.org${relativeUrl}`
        : relativeUrl || 'https://en.wikipedia.org/wiki/Portal:Current_events';

      events.push({ text, url: eventUrl, category });
    }

    return events;
  }

  /** Try to detect which event category a list item belongs to. */
  private detectCategory(html: string, position: number): string {
    const preceding = html.slice(Math.max(0, position - 2000), position);

    for (const cat of EVENT_CATEGORIES) {
      if (preceding.lastIndexOf(cat) !== -1) {
        return cat;
      }
    }
    return 'general';
  }

  /** Deterministic but non-reversible hash for anonymisation. */
  private simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const chr = input.charCodeAt(i);
      hash = ((hash << 5) - hash + chr) | 0;
    }
    return `wiki-${Math.abs(hash).toString(36)}`;
  }
}
