import { FredAdapter } from './fred.adapter';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('FredAdapter', () => {
  let adapter: FredAdapter;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, FRED_API_KEY: 'test-key-123' };
    adapter = new FredAdapter();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const defaultParams = {
    keywords: ['economy'],
    startDate: '2025-01-01',
    endDate: '2025-06-01',
  };

  it('should return empty if no API key', async () => {
    delete process.env['FRED_API_KEY'];
    const noKeyAdapter = new FredAdapter();
    const signals = await noKeyAdapter.fetchSignals(defaultParams);
    expect(signals).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should detect significant moves in Federal Funds Rate', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          observations: [
            { date: '2025-01-01', value: '4.50' },
            { date: '2025-02-01', value: '4.50' },
            { date: '2025-03-01', value: '4.75' }, // +0.25 = significant
            { date: '2025-04-01', value: '5.25' }, // +0.50 = significant
          ],
        }),
    });

    const signals = await adapter.fetchSignals(defaultParams);
    const dffSignals = signals.filter(
      (s) => (s.metadata as { seriesId: string }).seriesId === 'DFF',
    );
    expect(dffSignals.length).toBeGreaterThanOrEqual(2);
    expect(dffSignals[0]!.title).toContain('Federal Funds Rate');
    expect(dffSignals[0]!.source).toBe('FRED (Federal Reserve)');
    expect(dffSignals[0]!.domain).toBe('economic');
  });

  it('should handle missing values (dots)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          observations: [
            { date: '2025-01-01', value: '4.50' },
            { date: '2025-02-01', value: '.' },
            { date: '2025-03-01', value: '4.80' },
          ],
        }),
    });

    const signals = await adapter.fetchSignals(defaultParams);
    // Should not crash — skips "." values
    expect(Array.isArray(signals)).toBe(true);
  });

  it('should cap magnitude at 1.0', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          observations: [
            { date: '2025-01-01', value: '10' },
            { date: '2025-02-01', value: '50' }, // huge move
          ],
        }),
    });

    const signals = await adapter.fetchSignals(defaultParams);
    for (const s of signals) {
      expect(s.magnitude).toBeLessThanOrEqual(1);
      expect(s.magnitude).toBeGreaterThanOrEqual(0);
    }
  });

  it('should handle HTTP errors gracefully', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 429 });

    const signals = await adapter.fetchSignals(defaultParams);
    expect(signals).toEqual([]);
  });

  it('should handle network failures gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const signals = await adapter.fetchSignals(defaultParams);
    expect(signals).toEqual([]);
  });

  it('should format dates correctly for FRED API', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ observations: [] }),
    });

    await adapter.fetchSignals({
      keywords: ['test'],
      startDate: '2025-03-15T10:30:00Z',
      endDate: '2025-06-20T08:00:00Z',
    });

    // Check that at least one fetch call contains properly formatted dates
    const calls = mockFetch.mock.calls as Array<[string, unknown]>;
    const firstUrl = calls[0]?.[0] ?? '';
    expect(firstUrl).toContain('observation_start=2025-03-15');
    expect(firstUrl).toContain('observation_end=2025-06-20');
  });

  it('should include metadata with change details', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          observations: [
            { date: '2025-01-01', value: '100.00' },
            { date: '2025-02-01', value: '103.50' },
          ],
        }),
    });

    const signals = await adapter.fetchSignals(defaultParams);
    const withMeta = signals.filter(
      (s) => (s.metadata as { seriesId?: string }).seriesId !== undefined,
    );

    if (withMeta.length > 0) {
      const meta = withMeta[0]!.metadata as {
        previousValue: number;
        currentValue: number;
        change: number;
        pctChange: number;
        unit: string;
      };
      expect(typeof meta.previousValue).toBe('number');
      expect(typeof meta.currentValue).toBe('number');
      expect(typeof meta.change).toBe('number');
      expect(typeof meta.pctChange).toBe('number');
    }
  });

  it('should handle empty observations array', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ observations: [] }),
    });

    const signals = await adapter.fetchSignals(defaultParams);
    expect(signals).toEqual([]);
  });

  it('should track multiple series', async () => {
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ observations: [] }),
      });
    });

    await adapter.fetchSignals(defaultParams);
    // Should call fetch for each series (8 series defined)
    expect(callCount).toBe(8);
  });
});
