import type { GdeltResponse } from './gdelt.adapter';
import { GdeltAdapter } from './gdelt.adapter';

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

const sampleGdeltResponse: GdeltResponse = {
  articles: [
    {
      url: 'https://example.com/article1',
      title: 'Oil prices surge amid sanctions concerns',
      seendate: '20250605T143000Z',
      domain: 'reuters.com',
      language: 'English',
      sourcecountry: 'United States',
      tone: '-5.2,3.1,8.3,1.2',
    },
    {
      url: 'https://example.com/article2',
      title: 'Economic sanctions impact global trade',
      seendate: '20250606T090000Z',
      domain: 'bbc.co.uk',
      language: 'English',
      sourcecountry: 'United Kingdom',
      tone: '2.0,1.0,3.0,0.5',
    },
  ],
};

const defaultParams = {
  keywords: ['sanctions', 'oil'],
  startDate: '2025-06-01T00:00:00Z',
  endDate: '2025-06-14T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GdeltAdapter', () => {
  const adapter = new GdeltAdapter();

  it('has correct domain and name', () => {
    expect(adapter.domain).toBe('media');
    expect(adapter.name).toBe('GDELT Global News');
  });

  // -------------------------------------------------------------------------
  // Date conversion
  // -------------------------------------------------------------------------

  describe('toGdeltDate', () => {
    it('converts ISO date to GDELT format', () => {
      expect(adapter.toGdeltDate('2025-06-01T12:30:45Z')).toBe('20250601123045');
    });

    it('handles midnight', () => {
      expect(adapter.toGdeltDate('2025-01-15T00:00:00Z')).toBe('20250115000000');
    });
  });

  // -------------------------------------------------------------------------
  // Article mapping
  // -------------------------------------------------------------------------

  describe('mapArticles', () => {
    it('maps GDELT articles to ExternalSignal[]', () => {
      const signals = adapter.mapArticles(sampleGdeltResponse);

      expect(signals).toHaveLength(2);
      expect(signals[0]?.domain).toBe('media');
      expect(signals[0]?.source).toBe('GDELT');
      expect(signals[0]?.title).toBe('Oil prices surge amid sanctions concerns');
      expect(signals[0]?.description).toContain('reuters.com');
      expect(signals[0]?.description).toContain('United States');
      expect(signals[0]?.metadata['url']).toBe('https://example.com/article1');
    });

    it('computes magnitude from tone (more extreme = higher)', () => {
      const signals = adapter.mapArticles(sampleGdeltResponse);
      // Tone -5.2 -> magnitude = abs(-5.2)/15 ~ 0.347
      expect(signals[0]?.magnitude).toBeCloseTo(5.2 / 15, 2);
      // Tone 2.0 -> magnitude = abs(2.0)/15 ~ 0.133
      expect(signals[1]?.magnitude).toBeCloseTo(2.0 / 15, 2);
    });

    it('returns empty array for missing articles', () => {
      expect(adapter.mapArticles({} as GdeltResponse)).toEqual([]);
      expect(adapter.mapArticles({ articles: undefined } as GdeltResponse)).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // fetchSignals integration
  // -------------------------------------------------------------------------

  describe('fetchSignals', () => {
    it('fetches and parses GDELT data', async () => {
      mockFetch(async () => new Response(JSON.stringify(sampleGdeltResponse), { status: 200 }));

      const signals = await adapter.fetchSignals(defaultParams);

      expect(signals).toHaveLength(2);
      expect(signals[0]?.title).toContain('Oil prices');
    });

    it('returns empty array on HTTP error', async () => {
      mockFetch(async () => new Response('', { status: 500 }));

      const signals = await adapter.fetchSignals(defaultParams);
      expect(signals).toEqual([]);
    });

    it('returns empty array on network error', async () => {
      mockFetch(async () => {
        throw new Error('Network unreachable');
      });

      const signals = await adapter.fetchSignals(defaultParams);
      expect(signals).toEqual([]);
    });

    it('returns empty array when response has no articles', async () => {
      mockFetch(async () => new Response(JSON.stringify({ articles: [] }), { status: 200 }));

      const signals = await adapter.fetchSignals(defaultParams);
      expect(signals).toEqual([]);
    });
  });
});
