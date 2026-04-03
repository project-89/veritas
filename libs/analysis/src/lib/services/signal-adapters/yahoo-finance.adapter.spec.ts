import type { YahooChartResponse } from './yahoo-finance.adapter';
import { YahooFinanceAdapter } from './yahoo-finance.adapter';

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

const baseTs = Math.floor(new Date('2025-06-03T14:00:00Z').getTime() / 1000);

/** Chart with one significant move (>2%) and one minor move. */
const sampleChart: YahooChartResponse = {
  chart: {
    result: [
      {
        timestamp: [baseTs, baseTs + 86400, baseTs + 86400 * 2],
        indicators: {
          quote: [
            {
              open: [5000, 5000, 5000],
              close: [4850, 5010, 5250], // -3%, +0.2%, +5%
            },
          ],
        },
      },
    ],
  },
};

const defaultParams = {
  keywords: ['sanctions'],
  startDate: '2025-06-01T00:00:00Z',
  endDate: '2025-06-14T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('YahooFinanceAdapter', () => {
  const adapter = new YahooFinanceAdapter();

  it('has correct domain and name', () => {
    expect(adapter.domain).toBe('market');
    expect(adapter.name).toBe('Yahoo Finance Markets');
  });

  // -------------------------------------------------------------------------
  // Chart parsing
  // -------------------------------------------------------------------------

  describe('parseChart', () => {
    it('detects significant moves (>2%)', () => {
      const signals = adapter.parseChart(
        '^GSPC',
        sampleChart,
        defaultParams.startDate,
        defaultParams.endDate,
      );

      // Should pick up the -3% and +5% moves, not the +0.2%
      expect(signals).toHaveLength(2);

      const drop = signals.find((s) => s.title.includes('dropped'));
      const surge = signals.find((s) => s.title.includes('surged'));

      expect(drop).toBeDefined();
      expect(drop?.title).toContain('S&P 500');
      expect(drop?.title).toContain('3.0%');

      expect(surge).toBeDefined();
      expect(surge?.title).toContain('5.0%');
    });

    it('computes magnitude capped at 1.0', () => {
      const signals = adapter.parseChart(
        '^GSPC',
        sampleChart,
        defaultParams.startDate,
        defaultParams.endDate,
      );
      for (const s of signals) {
        expect(s.magnitude).toBeGreaterThanOrEqual(0);
        expect(s.magnitude).toBeLessThanOrEqual(1);
      }
    });

    it('returns empty for missing chart data', () => {
      expect(
        adapter.parseChart(
          '^GSPC',
          {} as YahooChartResponse,
          defaultParams.startDate,
          defaultParams.endDate,
        ),
      ).toEqual([]);

      expect(
        adapter.parseChart(
          '^GSPC',
          { chart: { result: [] } },
          defaultParams.startDate,
          defaultParams.endDate,
        ),
      ).toEqual([]);
    });

    it('uses the symbol name in signal metadata', () => {
      const signals = adapter.parseChart(
        'BTC-USD',
        sampleChart,
        defaultParams.startDate,
        defaultParams.endDate,
      );
      expect(signals[0]?.title).toContain('Bitcoin');
      expect(signals[0]?.metadata['symbol']).toBe('BTC-USD');
    });
  });

  // -------------------------------------------------------------------------
  // fetchSignals integration
  // -------------------------------------------------------------------------

  describe('fetchSignals', () => {
    it('fetches all symbols and merges signals', async () => {
      mockFetch(async () => new Response(JSON.stringify(sampleChart), { status: 200 }));

      const signals = await adapter.fetchSignals(defaultParams);

      // 5 symbols, each returning 2 significant moves
      expect(signals).toHaveLength(10);
    });

    it('handles 403 gracefully (returns empty for that symbol)', async () => {
      mockFetch(async () => new Response('Forbidden', { status: 403 }));

      const signals = await adapter.fetchSignals(defaultParams);
      expect(signals).toEqual([]);
    });

    it('handles network errors gracefully', async () => {
      mockFetch(async () => {
        throw new Error('ECONNREFUSED');
      });

      const signals = await adapter.fetchSignals(defaultParams);
      expect(signals).toEqual([]);
    });

    it('returns partial results when some symbols fail', async () => {
      let callCount = 0;
      mockFetch(async () => {
        callCount++;
        if (callCount <= 2) {
          return new Response(JSON.stringify(sampleChart), { status: 200 });
        }
        return new Response('Forbidden', { status: 403 });
      });

      const signals = await adapter.fetchSignals(defaultParams);
      // 2 successful symbols * 2 significant moves each = 4
      expect(signals).toHaveLength(4);
    });
  });
});
