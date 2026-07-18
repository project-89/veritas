import { Logger } from '@nestjs/common';
import type { ExternalSignal, SignalAdapter } from './signal-adapter.interface';

const USER_AGENT = 'Mozilla/5.0 (compatible; Veritas/2.0; +https://github.com/oneirocom/veritas)';

// EONET category → coarse magnitude (0..1) since EONET rarely carries a scalar.
// Capped BELOW the 0.7 high-severity threshold: an EONET entry means "NASA is
// tracking this natural event", not "this is an emergency" — it carries no
// impact/intensity data, so a routine prescribed burn would otherwise rank the
// same as a disaster. Sources with real impact scalars and alert levels
// (GDACS, USGS) own the high/critical range.
const CATEGORY_MAGNITUDE: Record<string, number> = {
  volcanoes: 0.65,
  severeStorms: 0.65,
  earthquakes: 0.6,
  wildfires: 0.55,
  floods: 0.55,
  landslides: 0.5,
  tempExtremes: 0.5,
  drought: 0.45,
  manmade: 0.45,
  seaLakeIce: 0.4,
  snow: 0.35,
  dustHaze: 0.35,
  waterColor: 0.3,
};

/**
 * NASA EONET (Earth Observatory Natural Event Tracker).
 *
 * Free, no key. Global scope — tracks open natural events with coordinates:
 * wildfires, severe storms, volcanoes, sea/lake ice, floods, earthquakes,
 * drought, dust & haze, landslides, temperature extremes. Enriches the
 * environmental "ground-truth" layer across both land and sea.
 *
 * Docs: https://eonet.gsfc.nasa.gov/docs/v3
 */
export class EonetAdapter implements SignalAdapter {
  readonly domain = 'social';
  readonly scope = 'global' as const;
  readonly maxAgeMs = 60 * 60 * 1000; // 1 hour
  readonly name = 'NASA EONET';

  private readonly logger = new Logger(EonetAdapter.name);
  private readonly baseUrl = 'https://eonet.gsfc.nasa.gov/api/v3/events';

  async fetchSignals(): Promise<ExternalSignal[]> {
    const url = new URL(this.baseUrl);
    url.searchParams.set('status', 'open');
    url.searchParams.set('limit', '150');
    url.searchParams.set('days', '30');

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(url.toString(), {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
          this.logger.warn(`EONET returned HTTP ${response.status}`);
          return [];
        }
        const data = (await response.json()) as EonetResponse;
        return this.map(data);
      } catch (err) {
        if (attempt === 0) {
          this.logger.debug(`EONET attempt 1 failed, retrying: ${err}`);
          continue;
        }
        this.logger.warn(`EONET fetch failed after 2 attempts: ${err}`);
        return [];
      }
    }
    return [];
  }

  private map(data: EonetResponse): ExternalSignal[] {
    const out: ExternalSignal[] = [];
    for (const ev of data.events ?? []) {
      const geoms = ev.geometry ?? [];
      const latest = geoms[geoms.length - 1];
      if (!latest) continue;
      const point = this.extractPoint(latest);
      if (!point) continue;
      const cat = ev.categories?.[0];
      const catId = cat?.id ?? '';
      out.push({
        id: `eonet-${ev.id}`,
        domain: 'social',
        source: 'NASA EONET',
        title: ev.title,
        description: cat?.title ? `${cat.title}: ${ev.title}` : ev.title,
        // These are status=open (currently active) events; timestamp them at
        // ingestion so they surface as current, keeping the real last-observed
        // date in metadata for provenance.
        timestamp: new Date().toISOString(),
        magnitude: CATEGORY_MAGNITUDE[catId] ?? 0.5,
        metadata: {
          coordinates: { latitude: point.lat, longitude: point.lng },
          eonetCategory: cat?.title ?? 'Natural Event',
          eonetCategoryId: catId,
          eonetObservedAt: latest.date,
          link: ev.link,
        },
      });
    }
    return out;
  }

  private extractPoint(geom: EonetGeometry): { lat: number; lng: number } | null {
    const c = geom.coordinates;
    if (geom.type === 'Point' && Array.isArray(c) && typeof c[0] === 'number') {
      return { lng: c[0] as number, lat: c[1] as number };
    }
    if (geom.type === 'Polygon' && Array.isArray(c) && Array.isArray(c[0])) {
      const ring = (c as number[][][])[0] ?? [];
      if (ring.length === 0) return null;
      let sx = 0;
      let sy = 0;
      for (const p of ring) {
        sx += p[0] ?? 0;
        sy += p[1] ?? 0;
      }
      return { lng: sx / ring.length, lat: sy / ring.length };
    }
    return null;
  }
}

interface EonetResponse {
  events?: EonetEvent[];
}
interface EonetEvent {
  id: string;
  title: string;
  link?: string;
  categories?: Array<{ id: string; title: string }>;
  geometry?: EonetGeometry[];
}
interface EonetGeometry {
  date?: string;
  type?: string;
  coordinates?: unknown;
}
