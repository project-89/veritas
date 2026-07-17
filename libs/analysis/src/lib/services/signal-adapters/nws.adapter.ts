import { Logger } from '@nestjs/common';
import type { ExternalSignal, SignalAdapter } from './signal-adapter.interface';

const USER_AGENT = 'veritas-osint/2.0 (contact: veritas@oneirocom.dev)';

const SEVERITY_MAGNITUDE: Record<string, number> = {
  Extreme: 0.95,
  Severe: 0.8,
  Moderate: 0.55,
  Minor: 0.35,
  Unknown: 0.4,
};

/**
 * NOAA / National Weather Service active alerts.
 *
 * Free, no key (a descriptive User-Agent is required). US-focused but dense and
 * live: tornado / hurricane / flood / winter-storm warnings, as GeoJSON with
 * geometry. Only Severe + Extreme are pulled to keep the signal meaningful.
 *
 * Docs: https://www.weather.gov/documentation/services-web-api
 */
export class NwsAdapter implements SignalAdapter {
  readonly domain = 'social';
  readonly scope = 'global' as const;
  readonly maxAgeMs = 15 * 60 * 1000; // 15 minutes
  readonly name = 'NOAA/NWS Alerts';

  private readonly logger = new Logger(NwsAdapter.name);
  private readonly baseUrl = 'https://api.weather.gov/alerts/active';

  async fetchSignals(): Promise<ExternalSignal[]> {
    const url = new URL(this.baseUrl);
    url.searchParams.set('status', 'actual');
    url.searchParams.set('message_type', 'alert');
    url.searchParams.set('severity', 'Extreme,Severe');
    url.searchParams.set('limit', '150');

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(url.toString(), {
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/geo+json' },
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
          this.logger.warn(`NWS returned HTTP ${response.status}`);
          return [];
        }
        const data = (await response.json()) as NwsResponse;
        return this.map(data);
      } catch (err) {
        if (attempt === 0) {
          this.logger.debug(`NWS attempt 1 failed, retrying: ${err}`);
          continue;
        }
        this.logger.warn(`NWS fetch failed after 2 attempts: ${err}`);
        return [];
      }
    }
    return [];
  }

  private map(data: NwsResponse): ExternalSignal[] {
    const out: ExternalSignal[] = [];
    for (const f of data.features ?? []) {
      const point = this.centroid(f.geometry);
      if (!point) continue; // zone-only alerts with no geometry can't be placed
      const p = f.properties ?? {};
      const area = (p.areaDesc ?? '').split(';')[0]?.trim() ?? '';
      out.push({
        id: `nws-${f.id ?? p.id ?? p.event}-${area}`,
        domain: 'social',
        source: 'NOAA/NWS',
        title: area ? `${p.event ?? 'Weather Alert'} — ${area}` : (p.event ?? 'Weather Alert'),
        description: p.headline ?? p.event ?? 'Weather alert',
        timestamp: p.effective ?? p.sent ?? new Date().toISOString(),
        magnitude: SEVERITY_MAGNITUDE[p.severity ?? 'Unknown'] ?? 0.4,
        metadata: {
          coordinates: { latitude: point.lat, longitude: point.lng },
          nwsSeverity: p.severity ?? 'Unknown',
          nwsEvent: p.event,
          areaDesc: p.areaDesc,
        },
      });
    }
    return out;
  }

  private centroid(geom: NwsGeometry | null | undefined): { lat: number; lng: number } | null {
    if (!geom) return null;
    let ring: number[][] | null = null;
    if (geom.type === 'Polygon' && Array.isArray(geom.coordinates)) {
      ring = (geom.coordinates as number[][][])[0] ?? null;
    } else if (geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
      ring = (geom.coordinates as number[][][][])[0]?.[0] ?? null;
    }
    if (!ring || ring.length === 0) return null;
    let sx = 0;
    let sy = 0;
    for (const p of ring) {
      sx += p[0] ?? 0;
      sy += p[1] ?? 0;
    }
    return { lng: sx / ring.length, lat: sy / ring.length };
  }
}

interface NwsResponse {
  features?: NwsFeature[];
}
interface NwsFeature {
  id?: string;
  geometry?: NwsGeometry | null;
  properties?: {
    id?: string;
    event?: string;
    headline?: string;
    severity?: string;
    areaDesc?: string;
    effective?: string;
    sent?: string;
  };
}
interface NwsGeometry {
  type?: string;
  coordinates?: unknown;
}
