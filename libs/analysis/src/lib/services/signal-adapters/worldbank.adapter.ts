import { Logger } from '@nestjs/common';
import type { ExternalSignal, SignalAdapter } from './signal-adapter.interface';

const USER_AGENT = 'Mozilla/5.0 (compatible; Veritas/2.0; +https://github.com/oneirocom/veritas)';

/** World Bank indicator definitions. */
interface IndicatorDef {
  code: string;
  name: string;
  unit: string;
}

const INDICATORS: IndicatorDef[] = [
  { code: 'FP.CPI.TOTL.ZG', name: 'Inflation (CPI)', unit: '%' },
  { code: 'NY.GDP.MKTP.KD.ZG', name: 'GDP Growth', unit: '%' },
  { code: 'SL.UEM.TOTL.ZS', name: 'Unemployment Rate', unit: '%' },
];

/** Major economies to highlight for signals. */
const FOCUS_COUNTRIES = new Set(['US', 'CN', 'JP', 'DE', 'GB', 'FR', 'IN', 'BR', 'CA', 'AU']);

/**
 * World Bank Open Data adapter for macro-economic signals.
 *
 * Uses the free World Bank API (v2) to fetch annual/quarterly indicator data.
 * No API key is required. Data is typically annual and lagged, so this provides
 * macro-economic context rather than real-time signals.
 *
 * API docs: https://datahelpdesk.worldbank.org/knowledgebase/articles/898581
 */
export class WorldBankAdapter implements SignalAdapter {
  readonly domain = 'economic';
  readonly scope = 'global' as const;
  readonly maxAgeMs = 30 * 24 * 60 * 60 * 1000; // 30 days — annual data with 1-2 year lag
  readonly name = 'World Bank Economic Indicators';

  private readonly logger = new Logger(WorldBankAdapter.name);
  private readonly baseUrl = 'https://api.worldbank.org/v2';

  async fetchSignals(params: {
    keywords: string[];
    startDate: string;
    endDate: string;
  }): Promise<ExternalSignal[]> {
    const startYear = new Date(params.startDate).getUTCFullYear();
    const endYear = new Date(params.endDate).getUTCFullYear();
    // Extend range by 1 year to capture lagged data
    const dateRange = `${startYear - 1}:${endYear}`;

    const results = await Promise.allSettled(
      INDICATORS.map((indicator) => this.fetchIndicator(indicator, dateRange)),
    );

    const signals: ExternalSignal[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        signals.push(...result.value);
      }
    }
    return signals;
  }

  // ---------------------------------------------------------------------------
  // Per-indicator fetch
  // ---------------------------------------------------------------------------

  private async fetchIndicator(
    indicator: IndicatorDef,
    dateRange: string,
  ): Promise<ExternalSignal[]> {
    try {
      const url =
        `${this.baseUrl}/country/all/indicator/${indicator.code}` +
        `?date=${dateRange}&format=json&per_page=200`;

      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(8_000),
      });

      if (!response.ok) {
        this.logger.warn(`World Bank HTTP ${response.status} for ${indicator.code}`);
        return [];
      }

      const data = (await response.json()) as WorldBankApiResponse;
      return this.parseIndicatorData(indicator, data);
    } catch (err) {
      this.logger.warn(`World Bank fetch failed for ${indicator.code}: ${err}`);
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Data parsing
  // ---------------------------------------------------------------------------

  /**
   * Parse World Bank response and detect statistically significant values.
   *
   * The response is an array where [0] is paging metadata, [1] is data rows.
   * We focus on major economies and flag values that deviate significantly
   * from the indicator's mean across all countries.
   */
  parseIndicatorData(indicator: IndicatorDef, data: WorldBankApiResponse): ExternalSignal[] {
    const rows = data[1];
    if (!Array.isArray(rows) || rows.length === 0) return [];

    // Collect all non-null values for stats
    const allValues = rows
      .map((r) => r.value)
      .filter((v): v is number => v != null && Number.isFinite(v));

    if (allValues.length < 3) return [];

    const mean = allValues.reduce((s, v) => s + v, 0) / allValues.length;
    const variance = allValues.reduce((s, v) => s + (v - mean) ** 2, 0) / allValues.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return [];

    const signals: ExternalSignal[] = [];

    for (const row of rows) {
      if (row.value == null || !Number.isFinite(row.value)) continue;

      const countryCode = row.countryiso3code ?? row.country?.id ?? '';
      const countryId = row.country?.id ?? '';

      // Only flag focus countries to keep signal count manageable
      if (!FOCUS_COUNTRIES.has(countryId) && !FOCUS_COUNTRIES.has(countryCode)) {
        continue;
      }

      const zScore = (row.value - mean) / stdDev;

      // Flag if more than 1 std dev from mean
      if (Math.abs(zScore) > 1) {
        const direction = zScore > 0 ? 'above' : 'below';
        const countryName = row.country?.value ?? countryCode;
        const year = row.date ?? 'unknown';

        signals.push({
          id: `wb-${indicator.code}-${countryCode}-${year}`,
          domain: 'economic',
          source: 'World Bank',
          title: `${countryName}: ${indicator.name} ${direction} average (${row.value.toFixed(1)}${indicator.unit})`,
          description: `${countryName}'s ${indicator.name} of ${row.value.toFixed(2)}${indicator.unit} in ${year} is ${Math.abs(zScore).toFixed(1)} standard deviations ${direction} the global mean of ${mean.toFixed(2)}${indicator.unit}`,
          timestamp: `${year}-06-30T00:00:00Z`, // Mid-year approximation
          magnitude: Math.min(1, Math.abs(zScore) / 3),
          metadata: {
            indicatorCode: indicator.code,
            indicatorName: indicator.name,
            country: countryName,
            countryCode,
            year,
            value: row.value,
            unit: indicator.unit,
            zScore: Math.round(zScore * 100) / 100,
            globalMean: Math.round(mean * 100) / 100,
          },
        });
      }
    }

    return signals;
  }
}

// ---------------------------------------------------------------------------
// World Bank API response types
// ---------------------------------------------------------------------------

export interface WorldBankDataRow {
  indicator?: { id?: string; value?: string };
  country?: { id?: string; value?: string };
  countryiso3code?: string;
  date?: string;
  value: number | null;
  unit?: string;
  decimal?: number;
}

export interface WorldBankPaging {
  page?: number;
  pages?: number;
  per_page?: number;
  total?: number;
}

/** World Bank v2 API returns [pagingMeta, dataRows]. */
export type WorldBankApiResponse = [WorldBankPaging, WorldBankDataRow[]];
