import { Logger } from '@nestjs/common';
import type { ExternalSignal, SignalAdapter } from './signal-adapter.interface';

const USER_AGENT = 'Mozilla/5.0 (compatible; Veritas/2.0; +https://github.com/oneirocom/veritas)';

/** FRED series to track — high-frequency US economic indicators */
interface SeriesDef {
  id: string;
  name: string;
  unit: string;
  /** Threshold for "significant" move (in absolute units) */
  significantThreshold: number;
}

const SERIES: SeriesDef[] = [
  { id: 'DFF', name: 'Federal Funds Rate', unit: '%', significantThreshold: 0.25 },
  { id: 'ICSA', name: 'Initial Jobless Claims', unit: 'claims', significantThreshold: 20000 },
  { id: 'T10Y2Y', name: '10Y-2Y Treasury Spread', unit: '%', significantThreshold: 0.15 },
  { id: 'DCOILWTICO', name: 'WTI Crude Oil Price', unit: 'USD/bbl', significantThreshold: 3 },
  { id: 'VIXCLS', name: 'VIX Volatility Index', unit: 'index', significantThreshold: 3 },
  { id: 'BAMLH0A0HYM2', name: 'High Yield Bond Spread', unit: '%', significantThreshold: 0.3 },
  { id: 'CPIAUCSL', name: 'Consumer Price Index', unit: 'index', significantThreshold: 0.3 },
  { id: 'UNRATE', name: 'Unemployment Rate', unit: '%', significantThreshold: 0.2 },
];

/**
 * FRED (Federal Reserve Economic Data) adapter.
 *
 * Fetches high-frequency US economic data series and detects
 * significant moves that may correlate with narrative events.
 *
 * Requires FRED_API_KEY environment variable (free from https://fred.stlouisfed.org/docs/api/api_key.html).
 *
 * API docs: https://fred.stlouisfed.org/docs/api/fred/
 */
export class FredAdapter implements SignalAdapter {
  readonly domain = 'economic';
  readonly scope = 'global' as const;
  readonly maxAgeMs = 24 * 60 * 60 * 1000; // 24h — fastest FRED series (VIX, fed funds) update daily
  readonly name = 'FRED Economic Data';

  private readonly logger = new Logger(FredAdapter.name);
  private readonly baseUrl = 'https://api.stlouisfed.org/fred';
  private readonly apiKey: string | null;

  constructor() {
    this.apiKey = process.env['FRED_API_KEY'] ?? null;
    if (!this.apiKey) {
      this.logger.warn('FRED_API_KEY not set — FRED adapter will return no signals');
    }
  }

  async fetchSignals(params: {
    keywords: string[];
    startDate: string;
    endDate: string;
  }): Promise<ExternalSignal[]> {
    if (!this.apiKey) return [];

    const startDate = this.formatDate(params.startDate);
    const endDate = this.formatDate(params.endDate);

    const results = await Promise.allSettled(
      SERIES.map((series) => this.fetchSeries(series, startDate, endDate)),
    );

    const signals: ExternalSignal[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        signals.push(...result.value);
      }
    }

    this.logger.debug(`FRED: found ${signals.length} significant economic signals`);
    return signals;
  }

  private async fetchSeries(
    series: SeriesDef,
    startDate: string,
    endDate: string,
  ): Promise<ExternalSignal[]> {
    const url = `${this.baseUrl}/series/observations?series_id=${series.id}&api_key=${this.apiKey}&file_type=json&observation_start=${startDate}&observation_end=${endDate}&sort_order=asc`;

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(8_000),
      });

      if (!response.ok) {
        this.logger.warn(`FRED ${series.id}: HTTP ${response.status}`);
        return [];
      }

      const data = (await response.json()) as {
        observations?: Array<{
          date: string;
          value: string;
        }>;
      };

      if (!data.observations || !Array.isArray(data.observations)) return [];

      return this.detectSignificantMoves(series, data.observations);
    } catch (err) {
      this.logger.warn(`FRED ${series.id} failed: ${err instanceof Error ? err.message : err}`);
      return [];
    }
  }

  private detectSignificantMoves(
    series: SeriesDef,
    observations: Array<{ date: string; value: string }>,
  ): ExternalSignal[] {
    const signals: ExternalSignal[] = [];

    // Filter out missing values (FRED uses "." for missing)
    const valid = observations
      .filter((o) => o.value !== '.' && !isNaN(Number(o.value)))
      .map((o) => ({ date: o.date, value: Number(o.value) }));

    if (valid.length < 2) return signals;

    // Detect significant changes between consecutive observations
    for (let i = 1; i < valid.length; i++) {
      const prev = valid[i - 1]!;
      const curr = valid[i]!;
      const change = curr.value - prev.value;
      const absChange = Math.abs(change);

      if (absChange >= series.significantThreshold) {
        const direction = change > 0 ? 'rose' : 'fell';
        const pctChange = prev.value !== 0 ? (change / Math.abs(prev.value)) * 100 : 0;

        signals.push({
          id: `fred-${series.id}-${curr.date}`,
          domain: 'economic',
          source: 'FRED (Federal Reserve)',
          title: `${series.name} ${direction} ${this.formatChange(absChange, series.unit)}`,
          description: `${series.name} moved from ${prev.value.toFixed(2)} to ${curr.value.toFixed(2)} ${series.unit} (${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(1)}%)`,
          timestamp: new Date(curr.date).toISOString(),
          magnitude: Math.min(1, absChange / (series.significantThreshold * 3)),
          metadata: {
            seriesId: series.id,
            seriesName: series.name,
            previousValue: prev.value,
            currentValue: curr.value,
            change,
            pctChange,
            unit: series.unit,
          },
        });
      }
    }

    return signals;
  }

  private formatChange(value: number, unit: string): string {
    if (unit === '%') return `${value.toFixed(2)}pp`;
    if (unit === 'claims') return `${Math.round(value).toLocaleString()}`;
    if (unit === 'USD/bbl') return `$${value.toFixed(2)}`;
    return `${value.toFixed(2)} ${unit}`;
  }

  private formatDate(isoDate: string): string {
    const d = new Date(isoDate);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
}
