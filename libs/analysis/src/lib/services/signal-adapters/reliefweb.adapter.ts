import { Logger } from '@nestjs/common';
import type { ExternalSignal, SignalAdapter } from './signal-adapter.interface';

const USER_AGENT = 'Mozilla/5.0 (compatible; Veritas/2.0; +https://github.com/oneirocom/veritas)';

/**
 * ReliefWeb adapter — UN OCHA humanitarian reports.
 *
 * Fetches the latest humanitarian situation reports from the ReliefWeb API v1.
 * Free, no API key required (just an appname parameter).
 *
 * Docs: https://apidoc.rwlabs.org/
 */
export class ReliefWebAdapter implements SignalAdapter {
  readonly domain = 'political';
  readonly name = 'ReliefWeb Humanitarian';
  readonly scope = 'global' as const;
  readonly maxAgeMs = 6 * 60 * 60 * 1000; // 6 hour cache

  private readonly logger = new Logger(ReliefWebAdapter.name);
  private readonly baseUrl = 'https://api.reliefweb.int/v1/reports';

  async fetchSignals(_params: {
    keywords: string[];
    startDate: string;
    endDate: string;
  }): Promise<ExternalSignal[]> {
    const url =
      `${this.baseUrl}?appname=veritas&limit=50&preset=latest` +
      '&fields[include][]=title' +
      '&fields[include][]=date.created' +
      '&fields[include][]=country.name' +
      '&fields[include][]=source.name' +
      '&fields[include][]=body-html';

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(15_000),
        });

        if (!response.ok) {
          this.logger.warn(`ReliefWeb returned HTTP ${response.status}`);
          return [];
        }

        const data = (await response.json()) as ReliefWebResponse;
        return this.mapReports(data);
      } catch (err) {
        if (attempt === 0) {
          this.logger.debug(`ReliefWeb attempt 1 failed, retrying: ${err}`);
          continue;
        }
        this.logger.warn(`ReliefWeb fetch failed after 2 attempts: ${err}`);
        return [];
      }
    }

    return [];
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private mapReports(data: ReliefWebResponse): ExternalSignal[] {
    const items = data.data;
    if (!Array.isArray(items)) return [];

    return items.map((item) => {
      const fields = item.fields ?? {};

      const title = (fields['title'] as string) ?? 'Untitled report';

      const dateObj = fields['date'] as { created?: string } | undefined;
      const timestamp = dateObj?.created
        ? new Date(dateObj.created).toISOString()
        : new Date().toISOString();

      const countryArr = fields['country'] as Array<{ name?: string }> | undefined;
      const country = Array.isArray(countryArr) && countryArr.length > 0
        ? countryArr[0]?.name ?? ''
        : '';

      const sourceArr = fields['source'] as Array<{ name?: string }> | undefined;
      const sourceName = Array.isArray(sourceArr) && sourceArr.length > 0
        ? sourceArr[0]?.name ?? ''
        : '';

      const bodyHtml = (fields['body-html'] as string) ?? '';
      const description = this.stripHtml(bodyHtml).slice(0, 300) || title;

      return {
        id: `reliefweb-${item.id}`,
        domain: 'political' as const,
        source: 'ReliefWeb',
        title,
        description,
        timestamp,
        magnitude: 0.5,
        metadata: {
          country,
          source: sourceName,
        },
      };
    });
  }

  /** Strip HTML tags and decode common entities. */
  private stripHtml(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/p>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }
}

// ---------------------------------------------------------------------------
// ReliefWeb response types
// ---------------------------------------------------------------------------

export interface ReliefWebItem {
  id?: string | number;
  fields?: Record<string, unknown>;
}

export interface ReliefWebResponse {
  count?: number;
  data?: ReliefWebItem[];
}
