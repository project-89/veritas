import { Logger } from '@nestjs/common';
import type { ExternalSignal, SignalAdapter } from './signal-adapter.interface';

const GFW_EVENTS_URL = 'https://gateway.api.globalfishingwatch.org/v3/events';
const GFW_DATASET = 'public-global-events:latest';

/**
 * Global Fishing Watch — maritime intelligence signal.
 *
 * NOT a "paint every ship" layer (that's commercial AIS / cosplay noise). GFW
 * surfaces the EVENTS that carry signal: a vessel going dark (AIS gap), two
 * ships meeting at sea (encounter — i.e. a ship-to-ship transfer of cargo or
 * catch), and loitering. These correlate directly with the narrative layer:
 * sanctions-evasion "shadow fleet" transfers, Red Sea shipping incidents,
 * illegal-fishing disputes.
 *
 * Free but token-gated: set GFW_API_TOKEN (free research token from
 * globalfishingwatch.org/our-apis). Without it the adapter is inert and
 * reports unavailable — the map simply has no maritime layer.
 *
 * Docs: https://globalfishingwatch.org/our-apis/documentation
 */

/** Per event type: coarse magnitude (0..1) and a human label. Ordered by
 *  intelligence value — going dark or meeting at sea beats a routine port call. */
const EVENT_META: Record<string, { magnitude: number; label: string }> = {
  gap: { magnitude: 0.78, label: 'AIS gap (vessel went dark)' },
  encounter: { magnitude: 0.72, label: 'Ship-to-ship encounter' },
  loitering: { magnitude: 0.6, label: 'Loitering at sea' },
  fishing: { magnitude: 0.4, label: 'Fishing activity' },
  port_visit: { magnitude: 0.3, label: 'Port visit' },
};

/** Event types worth surfacing by default — the intelligence-bearing ones. */
const DEFAULT_TYPES = ['encounter', 'loitering', 'gap'];

interface GfwEvent {
  id?: string;
  type?: string;
  start?: string;
  end?: string;
  position?: { lat?: number; lon?: number };
  vessel?: { id?: string; name?: string; ssvid?: string; flag?: string };
  regions?: { eez?: string[]; rfmo?: string[] };
}

/**
 * Pure transform GFW event → ExternalSignal. Exported so the mapping is
 * unit-testable against the documented schema WITHOUT a live token.
 */
export function mapGfwEvents(entries: GfwEvent[]): ExternalSignal[] {
  const out: ExternalSignal[] = [];
  for (const ev of entries) {
    const lat = ev.position?.lat;
    const lon = ev.position?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const type = ev.type ?? 'unknown';
    const meta = EVENT_META[type] ?? { magnitude: 0.5, label: type };
    const vesselName = ev.vessel?.name?.trim() || ev.vessel?.ssvid || 'Unknown vessel';
    const flag = ev.vessel?.flag ? ` (${ev.vessel.flag})` : '';
    out.push({
      id: `gfw-${ev.id ?? `${type}-${lat}-${lon}-${ev.start ?? ''}`}`,
      domain: 'social',
      source: 'Global Fishing Watch',
      title: `${meta.label}: ${vesselName}${flag}`,
      description:
        `${meta.label} detected via AIS. Vessel: ${vesselName}${flag}.` +
        (ev.regions?.eez?.length ? ` EEZ: ${ev.regions.eez.join(', ')}.` : ''),
      timestamp: ev.end ?? ev.start ?? new Date().toISOString(),
      magnitude: meta.magnitude,
      metadata: {
        coordinates: { latitude: lat, longitude: lon },
        gfwEventType: type,
        vesselName,
        vesselFlag: ev.vessel?.flag,
        mmsi: ev.vessel?.ssvid,
        eez: ev.regions?.eez,
      },
    });
  }
  return out;
}

export class GfwMaritimeAdapter implements SignalAdapter {
  readonly domain = 'social';
  readonly scope = 'global' as const;
  readonly maxAgeMs = 60 * 60 * 1000;
  readonly name = 'Global Fishing Watch';

  private readonly logger = new Logger(GfwMaritimeAdapter.name);
  private readonly token = process.env['GFW_API_TOKEN'];

  /** Whether a token is configured — capability gate. */
  get available(): boolean {
    return Boolean(this.token);
  }

  async fetchSignals(): Promise<ExternalSignal[]> {
    if (!this.token) return []; // inert without a token

    // Recent window — GFW events lag AIS by a bit, so a few days back.
    const now = new Date();
    const end = now.toISOString().slice(0, 10);
    const start = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const url = new URL(GFW_EVENTS_URL);
    url.searchParams.set('datasets[0]', GFW_DATASET);
    url.searchParams.set('start-date', start);
    url.searchParams.set('end-date', end);
    url.searchParams.set('limit', '200');
    for (const [i, t] of DEFAULT_TYPES.entries()) url.searchParams.set(`types[${i}]`, t);

    try {
      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        this.logger.warn(`GFW events returned HTTP ${response.status}`);
        return [];
      }
      const data = (await response.json()) as { entries?: GfwEvent[]; events?: GfwEvent[] };
      // GFW has used both `entries` and `events` as the array key across versions.
      return mapGfwEvents(data.entries ?? data.events ?? []);
    } catch (err) {
      this.logger.warn(`GFW events fetch failed: ${err}`);
      return [];
    }
  }
}
