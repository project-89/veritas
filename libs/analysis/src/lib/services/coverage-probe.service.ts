import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

const GDELT_DOC_API = 'https://api.gdeltproject.org/api/v2/doc/doc';
const USER_AGENT = 'Mozilla/5.0 (compatible; Veritas/2.0; +https://github.com/oneirocom/veritas)';

export interface CoverageBucket {
  /** ISO date (start of the bucket). */
  date: string;
  /** Article volume in that bucket. */
  value: number;
}

export interface CoverageReport {
  /** Whether the probe actually ran (false = source unavailable / rate-limited). */
  probed: boolean;
  /** Why we couldn't probe, when probed=false. */
  reason?: string;
  source: 'gdelt-timelinevol';
  /** Volume-over-time histogram across the probed span. */
  timeline: CoverageBucket[];
  /** Highest-volume bucket, if any activity was found. */
  peak?: CoverageBucket;
  /** Contiguous high-activity window around the peak (suggested scan window). */
  suggestedWindow?: { start: string; end: string; label: string };
  /**
   * True when meaningful activity exists OUTSIDE the caller's current window —
   * i.e. the user's window is missing the story. Computed by the caller passing
   * its window; here we just expose the timeline + peak.
   */
  totalVolume: number;
}

/**
 * Answers "when was this topic actually active?" using GDELT's timelinevol mode
 * — a single request returns a global news-volume histogram over time. Used to
 * power the adaptive-window UX: when a scan's selected window is sparse, we can
 * tell the user the topic peaked elsewhere and offer to expand to that period,
 * instead of silently returning an empty result.
 *
 * Degrades honestly: if GDELT is unavailable/rate-limited, probed=false and the
 * caller simply doesn't show a suggestion (never a fabricated one).
 */
@Injectable()
export class CoverageProbeService {
  private readonly logger = new Logger(CoverageProbeService.name);

  /**
   * @param query    The topic query.
   * @param timespan GDELT timespan (e.g. '24m', '1y'). Wide by default so we can
   *                 see activity well outside a typical scan window.
   */
  async probe(query: string, timespan = '24m'): Promise<CoverageReport> {
    const empty = (reason: string): CoverageReport => ({
      probed: false,
      reason,
      source: 'gdelt-timelinevol',
      timeline: [],
      totalVolume: 0,
    });

    const terms = query.trim();
    if (!terms) return empty('empty query');

    const url = new URL(GDELT_DOC_API);
    url.searchParams.set('query', `${terms} sourcelang:eng`);
    url.searchParams.set('mode', 'timelinevolraw'); // raw article counts (interpretable)
    url.searchParams.set('format', 'json');
    url.searchParams.set('timespan', timespan);

    let body: unknown;
    try {
      const res = await axios.get<string>(url.toString(), {
        headers: { 'User-Agent': USER_AGENT },
        timeout: 20_000,
        responseType: 'text',
        validateStatus: () => true,
      });
      if (res.status === 429) return empty('GDELT rate-limited');
      if (res.status < 200 || res.status >= 300) return empty(`GDELT HTTP ${res.status}`);
      const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      if (!text.trim().startsWith('{')) return empty('GDELT returned non-JSON');
      body = JSON.parse(text);
    } catch (err) {
      this.logger.debug(`Coverage probe failed: ${(err as Error).message}`);
      return empty('GDELT request failed');
    }

    const timeline = this.parseTimeline(body);
    if (timeline.length === 0) return empty('no timeline data');

    const totalVolume = timeline.reduce((s, b) => s + b.value, 0);
    const peak = timeline.reduce((a, b) => (b.value > a.value ? b : a), timeline[0]!);
    const suggestedWindow = this.windowAroundPeak(timeline, peak);

    return {
      probed: true,
      source: 'gdelt-timelinevol',
      timeline,
      peak,
      suggestedWindow,
      totalVolume,
    };
  }

  private parseTimeline(body: unknown): CoverageBucket[] {
    const b = body as { timeline?: Array<{ data?: Array<{ date?: string; value?: number }> }> };
    const series = b.timeline?.[0]?.data;
    if (!Array.isArray(series)) return [];
    return series
      .map((p) => ({ date: this.toIso(p.date), value: typeof p.value === 'number' ? p.value : 0 }))
      .filter((p) => p.date !== '');
  }

  /**
   * A contiguous window covering the peak: expand out from the peak bucket while
   * volume stays above 25% of the peak. Gives a tight "this is where the story
   * lives" window to suggest.
   */
  private windowAroundPeak(
    timeline: CoverageBucket[],
    peak: CoverageBucket,
  ): CoverageReport['suggestedWindow'] {
    const idx = timeline.findIndex((b) => b.date === peak.date);
    if (idx === -1 || peak.value <= 0) return undefined;
    const floor = peak.value * 0.25;
    let lo = idx;
    let hi = idx;
    while (lo > 0 && (timeline[lo - 1]?.value ?? 0) >= floor) lo--;
    while (hi < timeline.length - 1 && (timeline[hi + 1]?.value ?? 0) >= floor) hi++;
    const start = timeline[lo]!.date;
    const end = timeline[hi]!.date;
    return { start, end, label: `${start.slice(0, 10)} → ${end.slice(0, 10)}` };
  }

  /** GDELT date (YYYYMMDDTHHMMSSZ or YYYYMMDDHHMMSS) -> ISO. */
  private toIso(date?: string): string {
    if (!date) return '';
    const iso = date.replace(
      /^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?Z?$/,
      (_m, y, mo, d, h = '00', mi = '00', s = '00') => `${y}-${mo}-${d}T${h}:${mi}:${s}Z`,
    );
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
  }
}
