import { Logger } from '@nestjs/common';
import type { ExternalSignal, SignalAdapter } from './signal-adapter.interface';

const USER_AGENT = 'Mozilla/5.0 (compatible; Veritas/2.0; +https://github.com/oneirocom/veritas)';

/** Themes that indicate higher-severity humanitarian situations. */
const HIGH_SEVERITY_THEMES = new Set([
  'Protection and Human Rights',
  'Shelter and Non-Food Items',
  'Mine Action',
  'Peacekeeping and Peacebuilding',
  'Camp Coordination and Camp Management',
]);

const MEDIUM_SEVERITY_THEMES = new Set([
  'Food and Nutrition',
  'Health',
  'Water Sanitation Hygiene',
  'Education',
  'Agriculture',
  'Climate Change and Environment',
]);

/**
 * ReliefWeb adapter — UN OCHA humanitarian reports.
 *
 * Fetches the latest humanitarian situation reports from the ReliefWeb API.
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

  async fetchSignals(params: {
    keywords: string[];
    startDate: string;
    endDate: string;
  }): Promise<ExternalSignal[]> {
    const url = new URL(this.baseUrl);
    url.searchParams.set('appname', 'veritas');
    url.searchParams.set('limit', '50');
    url.searchParams.set('filter[operator]', 'AND');
    url.searchParams.set('filter[conditions][0][field]', 'date.created');
    url.searchParams.set('filter[conditions][0][value][from]', params.startDate);
    url.searchParams.set('filter[conditions][0][value][to]', params.endDate);
    url.searchParams.set('sort[]', 'date.created:desc');
    // Request specific fields
    url.searchParams.set('fields[include][]', 'title,date,country,primary_country,source,theme');

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(url.toString(), {
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

    return items.map((item, i) => {
      const fields = item.fields ?? {};
      const themes: string[] = Array.isArray(fields.theme)
        ? fields.theme.map((t: { name?: string }) => t.name ?? '')
        : [];
      const primaryCountry = fields.primary_country as { name?: string } | undefined;
      const countryArr = fields.country as Array<{ name?: string }> | undefined;
      const country = primaryCountry?.name
        ?? (Array.isArray(countryArr) && countryArr.length > 0
          ? countryArr[0]?.name
          : '')
        ?? '';
      const sources: string[] = Array.isArray(fields.source)
        ? fields.source.map((s: { name?: string }) => s.name ?? '')
        : [];

      const dateObj = fields.date as { created?: string } | undefined;
      const dateCreated = dateObj?.created
        ? new Date(dateObj.created).toISOString()
        : new Date().toISOString();

      return {
        id: `reliefweb-${item.id ?? i}-${Date.now()}`,
        domain: 'political' as const,
        source: 'ReliefWeb',
        title: (fields.title as string) ?? 'Untitled report',
        description: [country, ...sources.slice(0, 2)].filter(Boolean).join(' | '),
        timestamp: dateCreated,
        magnitude: this.themeMagnitude(themes),
        metadata: {
          country,
          themes,
          sources,
        },
      };
    });
  }

  /** Derive a 0-1 magnitude from the report's themes. */
  private themeMagnitude(themes: string[]): number {
    if (themes.some((t) => HIGH_SEVERITY_THEMES.has(t))) return 0.9;
    if (themes.some((t) => MEDIUM_SEVERITY_THEMES.has(t))) return 0.6;
    return 0.4;
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
  data?: ReliefWebItem[];
}
