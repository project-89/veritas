import type { WorldBankApiResponse, WorldBankDataRow } from './worldbank.adapter';
import { WorldBankAdapter } from './worldbank.adapter';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

function mockFetch(impl: (url: string) => Promise<Response>): void {
  globalThis.fetch = impl as typeof globalThis.fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRow(
  countryId: string,
  countryName: string,
  date: string,
  value: number | null,
): WorldBankDataRow {
  return {
    indicator: { id: 'FP.CPI.TOTL.ZG', value: 'Inflation, consumer prices' },
    country: { id: countryId, value: countryName },
    countryiso3code: countryId === 'US' ? 'USA' : countryId,
    date,
    value,
  };
}

/** Response with a clear outlier: US at 12% vs others clustering around 2-5%. */
const sampleResponse: WorldBankApiResponse = [
  { page: 1, pages: 1, per_page: 200, total: 9 },
  [
    makeRow('US', 'United States', '2025', 12.0), // outlier
    makeRow('GB', 'United Kingdom', '2025', 3.5),
    makeRow('DE', 'Germany', '2025', 2.1),
    makeRow('JP', 'Japan', '2025', 1.5),
    makeRow('FR', 'France', '2025', 2.8),
    makeRow('CN', 'China', '2025', 0.5),
    makeRow('IN', 'India', '2025', 5.0),
    makeRow('BR', 'Brazil', '2025', 4.2),
    // Non-focus country — should be filtered from signals (but included in stats)
    makeRow('ZW', 'Zimbabwe', '2025', 4.0),
  ],
];

const defaultParams = {
  keywords: ['inflation'],
  startDate: '2025-01-01T00:00:00Z',
  endDate: '2025-12-31T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorldBankAdapter', () => {
  const adapter = new WorldBankAdapter();

  it('has correct domain and name', () => {
    expect(adapter.domain).toBe('economic');
    expect(adapter.name).toBe('World Bank Economic Indicators');
  });

  // -------------------------------------------------------------------------
  // Data parsing
  // -------------------------------------------------------------------------

  describe('parseIndicatorData', () => {
    const indicator = { code: 'FP.CPI.TOTL.ZG', name: 'Inflation (CPI)', unit: '%' };

    it('detects outlier values (>1 std dev from mean)', () => {
      const signals = adapter.parseIndicatorData(indicator, sampleResponse);

      // US at 12% should definitely be an outlier
      const usSignal = signals.find((s) => s.title.includes('United States'));
      expect(usSignal).toBeDefined();
      expect(usSignal?.domain).toBe('economic');
      expect(usSignal?.source).toBe('World Bank');
      expect(usSignal?.title).toContain('Inflation (CPI)');
      expect(usSignal?.title).toContain('above');
    });

    it('excludes non-focus countries', () => {
      const signals = adapter.parseIndicatorData(indicator, sampleResponse);
      const zw = signals.find((s) => s.title.includes('Zimbabwe'));
      expect(zw).toBeUndefined();
    });

    it('includes metadata with zScore and country info', () => {
      const signals = adapter.parseIndicatorData(indicator, sampleResponse);
      const usSignal = signals.find((s) => s.title.includes('United States'));
      expect(usSignal?.metadata['zScore']).toBeDefined();
      expect(usSignal?.metadata['countryCode']).toBe('USA');
      expect(usSignal?.metadata['indicatorCode']).toBe('FP.CPI.TOTL.ZG');
    });

    it('caps magnitude at 1.0', () => {
      const signals = adapter.parseIndicatorData(indicator, sampleResponse);
      for (const s of signals) {
        expect(s.magnitude).toBeLessThanOrEqual(1);
        expect(s.magnitude).toBeGreaterThanOrEqual(0);
      }
    });

    it('returns empty for missing or insufficient data', () => {
      expect(
        adapter.parseIndicatorData(indicator, [
          { page: 1, pages: 0, total: 0 },
          [],
        ] as WorldBankApiResponse),
      ).toEqual([]);

      // Less than 3 values -> not enough for stats
      expect(
        adapter.parseIndicatorData(indicator, [
          { page: 1, pages: 1, total: 2 },
          [makeRow('US', 'United States', '2025', 5.0), makeRow('GB', 'UK', '2025', 3.0)],
        ] as WorldBankApiResponse),
      ).toEqual([]);
    });

    it('handles null values gracefully', () => {
      const withNulls: WorldBankApiResponse = [
        { page: 1, pages: 1, total: 5 },
        [
          makeRow('US', 'United States', '2025', null),
          makeRow('GB', 'United Kingdom', '2025', 3.0),
          makeRow('DE', 'Germany', '2025', 2.0),
          makeRow('JP', 'Japan', '2025', 1.0),
        ],
      ];
      // Should not crash, just skip null rows
      const signals = adapter.parseIndicatorData(indicator, withNulls);
      expect(signals).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // fetchSignals integration
  // -------------------------------------------------------------------------

  describe('fetchSignals', () => {
    it('fetches all indicators and merges signals', async () => {
      mockFetch(async () => new Response(JSON.stringify(sampleResponse), { status: 200 }));

      const signals = await adapter.fetchSignals(defaultParams);

      // 3 indicators, each returning some outliers from focus countries
      expect(signals.length).toBeGreaterThan(0);
      expect(signals.every((s) => s.domain === 'economic')).toBe(true);
    });

    it('returns empty array on HTTP error', async () => {
      mockFetch(async () => new Response('', { status: 500 }));

      const signals = await adapter.fetchSignals(defaultParams);
      expect(signals).toEqual([]);
    });

    it('returns empty array on network error', async () => {
      mockFetch(async () => {
        throw new Error('DNS resolution failed');
      });

      const signals = await adapter.fetchSignals(defaultParams);
      expect(signals).toEqual([]);
    });
  });
});
