import axios from 'axios';
import { CoverageProbeService } from './coverage-probe.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function timelineResponse(points: Array<{ date: string; value: number }>) {
  return {
    status: 200,
    data: JSON.stringify({ timeline: [{ series: 'Volume', data: points }] }),
  };
}

describe('CoverageProbeService', () => {
  let service: CoverageProbeService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CoverageProbeService();
  });

  it('parses the GDELT timeline and finds the peak + suggested window', async () => {
    mockedAxios.get.mockResolvedValue(
      timelineResponse([
        { date: '20260101T000000Z', value: 2 },
        { date: '20260201T000000Z', value: 40 }, // peak
        { date: '20260301T000000Z', value: 15 }, // >= 25% of peak (10) — in window
        { date: '20260401T000000Z', value: 1 }, // < 25% — outside
      ]),
    );

    const r = await service.probe('bitcoin etf');

    expect(r.probed).toBe(true);
    expect(r.totalVolume).toBe(58);
    expect(r.peak?.value).toBe(40);
    expect(r.peak?.date).toBe('2026-02-01T00:00:00.000Z');
    // Window expands around the peak while volume stays >= 25% of peak.
    expect(r.suggestedWindow?.start).toBe('2026-02-01T00:00:00.000Z');
    expect(r.suggestedWindow?.end).toBe('2026-03-01T00:00:00.000Z');
  });

  it('degrades honestly on 429 (probed=false, no fabricated suggestion)', async () => {
    mockedAxios.get.mockResolvedValue({ status: 429, data: 'rate limited' });
    const r = await service.probe('anything');
    expect(r.probed).toBe(false);
    expect(r.reason).toContain('rate-limited');
    expect(r.suggestedWindow).toBeUndefined();
    expect(r.timeline).toEqual([]);
  });

  it('degrades on network error', async () => {
    mockedAxios.get.mockRejectedValue(new Error('ECONNREFUSED'));
    const r = await service.probe('anything');
    expect(r.probed).toBe(false);
    expect(r.reason).toContain('failed');
  });

  it('degrades when GDELT returns non-JSON (rate-limit text)', async () => {
    mockedAxios.get.mockResolvedValue({
      status: 200,
      data: 'Please limit requests to one every 5 seconds',
    });
    const r = await service.probe('anything');
    expect(r.probed).toBe(false);
  });

  it('returns probed=false for an empty timeline', async () => {
    mockedAxios.get.mockResolvedValue(timelineResponse([]));
    const r = await service.probe('anything');
    expect(r.probed).toBe(false);
    expect(r.reason).toBe('no timeline data');
  });

  it('does not call the API for an empty query', async () => {
    const r = await service.probe('   ');
    expect(r.probed).toBe(false);
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });
});
