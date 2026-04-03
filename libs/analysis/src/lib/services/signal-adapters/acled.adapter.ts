import { Logger } from '@nestjs/common';
import type { ExternalSignal, SignalAdapter } from './signal-adapter.interface';

const USER_AGENT = 'Mozilla/5.0 (compatible; Veritas/2.0; +https://github.com/oneirocom/veritas)';

/**
 * ACLED (Armed Conflict Location & Event Data) adapter.
 *
 * Fetches recent conflict events from the ACLED public read endpoint.
 * Global scope — data is independent of keywords.
 *
 * Docs: https://apidocs.acleddata.com/
 */
export class AcledAdapter implements SignalAdapter {
  readonly domain = 'political';
  readonly scope = 'global' as const;
  readonly maxAgeMs = 6 * 60 * 60 * 1000; // 6 hours
  readonly name = 'ACLED Conflict Events';

  private readonly logger = new Logger(AcledAdapter.name);
  private readonly baseUrl = 'https://api.acleddata.com/acled/read';
  private warnedMissingKey = false;

  async fetchSignals(params: {
    keywords: string[];
    startDate: string;
    endDate: string;
  }): Promise<ExternalSignal[]> {
    // ACLED requires API key + email for access
    const apiKey = process.env['ACLED_API_KEY'];
    const email = process.env['ACLED_EMAIL'];
    if (!apiKey || !email) {
      if (!this.warnedMissingKey) {
        this.warnedMissingKey = true;
        this.logger.log('ACLED_API_KEY and ACLED_EMAIL not set — conflict event data unavailable. Register free at acleddata.com');
      }
      return [];
    }

    const url = new URL(this.baseUrl);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('email', email);
    url.searchParams.set('terms', 'accept');
    url.searchParams.set('limit', '100');

    // Filter by date range
    const startDate = this.toAcledDate(params.startDate);
    const endDate = this.toAcledDate(params.endDate);
    url.searchParams.set('event_date', `${startDate}|${endDate}`);
    url.searchParams.set('event_date_where', 'BETWEEN');

    // Retry once on timeout
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(url.toString(), {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(15_000),
        });

        if (!response.ok) {
          this.logger.warn(`ACLED returned HTTP ${response.status}`);
          return [];
        }

        const data = (await response.json()) as AcledResponse;
        return this.mapEvents(data);
      } catch (err) {
        if (attempt === 0) {
          this.logger.debug(`ACLED attempt 1 failed, retrying: ${err}`);
          continue;
        }
        this.logger.warn(`ACLED fetch failed after 2 attempts: ${err}`);
        return [];
      }
    }

    return [];
  }

  // ---------------------------------------------------------------------------
  // Mappers
  // ---------------------------------------------------------------------------

  private mapEvents(data: AcledResponse): ExternalSignal[] {
    if (!data.data || !Array.isArray(data.data)) return [];

    return data.data.map((event, i) => {
      const fatalities = Number(event.fatalities) || 0;
      return {
        id: `acled-${i}-${Date.now()}`,
        domain: 'political' as const,
        source: 'ACLED',
        title: `${event.event_type ?? 'Unknown event'} — ${event.country ?? 'Unknown'}`,
        description: [
          event.sub_event_type,
          event.region,
          fatalities > 0 ? `${fatalities} fatalities` : null,
        ]
          .filter(Boolean)
          .join(' | '),
        timestamp: this.parseEventDate(event.event_date),
        magnitude: this.fatalitiesMagnitude(fatalities),
        metadata: {
          event_type: event.event_type ?? '',
          sub_event_type: event.sub_event_type ?? '',
          country: event.country ?? '',
          region: event.region ?? '',
          fatalities,
          source: event.source ?? '',
        },
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Convert ISO date to ACLED format: YYYY-MM-DD. */
  private toAcledDate(isoDate: string): string {
    const d = new Date(isoDate);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }

  /** Parse ACLED event_date (YYYY-MM-DD or similar) to ISO string. */
  private parseEventDate(dateStr?: string): string {
    if (!dateStr) return new Date().toISOString();
    try {
      return new Date(dateStr).toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  /**
   * Map fatalities count to a 0-1 magnitude.
   * 0 fatalities = 0.1, 1-5 = 0.3, 6-20 = 0.5, 21-100 = 0.7, 100+ = 1.0
   */
  private fatalitiesMagnitude(fatalities: number): number {
    if (fatalities <= 0) return 0.1;
    if (fatalities <= 5) return 0.3;
    if (fatalities <= 20) return 0.5;
    if (fatalities <= 100) return 0.7;
    return 1.0;
  }
}

// ---------------------------------------------------------------------------
// ACLED response types
// ---------------------------------------------------------------------------

export interface AcledEvent {
  event_date?: string;
  event_type?: string;
  sub_event_type?: string;
  country?: string;
  region?: string;
  fatalities?: string | number;
  source?: string;
}

export interface AcledResponse {
  status?: number;
  success?: boolean;
  data?: AcledEvent[];
}
