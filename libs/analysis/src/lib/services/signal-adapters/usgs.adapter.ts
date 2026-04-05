import { Logger } from '@nestjs/common';
import type { ExternalSignal, SignalAdapter } from './signal-adapter.interface';

const USER_AGENT = 'Mozilla/5.0 (compatible; Veritas/2.0; +https://github.com/oneirocom/veritas)';

/**
 * USGS Earthquake Hazards adapter.
 *
 * Fetches significant earthquakes (M4.5+) from the USGS FDSN Event API.
 * Free, no key required. Global scope — data is independent of keywords.
 *
 * Docs: https://earthquake.usgs.gov/fdsnws/event/1/
 */
export class UsgsAdapter implements SignalAdapter {
  readonly domain = 'social';
  readonly scope = 'global' as const;
  readonly maxAgeMs = 60 * 60 * 1000; // 1 hour
  readonly name = 'USGS Earthquake Hazards';

  private readonly logger = new Logger(UsgsAdapter.name);
  private readonly baseUrl = 'https://earthquake.usgs.gov/fdsnws/event/1/query';

  async fetchSignals(params: {
    keywords: string[];
    startDate: string;
    endDate: string;
  }): Promise<ExternalSignal[]> {
    const url = new URL(this.baseUrl);
    url.searchParams.set('format', 'geojson');
    url.searchParams.set('minmagnitude', '4.5');
    url.searchParams.set('orderby', 'time');
    url.searchParams.set('limit', '50');
    url.searchParams.set('starttime', this.toIsoDate(params.startDate));
    url.searchParams.set('endtime', this.toIsoDate(params.endDate));

    // Retry once on timeout
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(url.toString(), {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(15_000),
        });

        if (!response.ok) {
          this.logger.warn(`USGS returned HTTP ${response.status}`);
          return [];
        }

        const data = (await response.json()) as UsgsGeoJsonResponse;
        return this.mapQuakes(data);
      } catch (err) {
        if (attempt === 0) {
          this.logger.debug(`USGS attempt 1 failed, retrying: ${err}`);
          continue;
        }
        this.logger.warn(`USGS fetch failed after 2 attempts: ${err}`);
        return [];
      }
    }

    return [];
  }

  // ---------------------------------------------------------------------------
  // Mappers
  // ---------------------------------------------------------------------------

  private mapQuakes(data: UsgsGeoJsonResponse): ExternalSignal[] {
    if (!data.features || !Array.isArray(data.features)) return [];

    return data.features.map((feature, i) => {
      const props = feature.properties ?? {};
      const coords = feature.geometry?.coordinates ?? [];
      const mag = props.mag ?? 0;
      const tsunami = props.tsunami ?? 0;

      return {
        id: `usgs-${(feature as Record<string, unknown>)['id'] ?? i}`,
        domain: 'social' as const,
        source: 'USGS',
        title: `M${mag.toFixed(1)} Earthquake — ${props.place ?? 'Unknown location'}`,
        description: [
          props.type ?? 'earthquake',
          tsunami ? 'Tsunami warning' : null,
          coords.length >= 2
            ? `[${coords[1]?.toFixed(2)}, ${coords[0]?.toFixed(2)}]`
            : null,
        ]
          .filter(Boolean)
          .join(' | '),
        timestamp: props.time
          ? new Date(props.time).toISOString()
          : new Date().toISOString(),
        magnitude: this.quakeMagnitude(mag),
        metadata: {
          mag,
          place: props.place ?? '',
          type: props.type ?? 'earthquake',
          tsunami: tsunami > 0,
          coordinates:
            coords.length >= 3
              ? { longitude: coords[0], latitude: coords[1], depth: coords[2] }
              : {},
        },
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Convert ISO date string to YYYY-MM-DD for USGS API. */
  private toIsoDate(isoDate: string): string {
    const d = new Date(isoDate);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }

  /**
   * Normalize earthquake magnitude to 0-1 scale.
   * M4.5 = 0.3, M6 = 0.6, M7 = 0.8, M8+ = 1.0
   */
  private quakeMagnitude(mag: number): number {
    if (mag >= 8) return 1.0;
    if (mag >= 7) return 0.8;
    if (mag >= 6) return 0.6;
    if (mag >= 4.5) return 0.3;
    return 0.1;
  }
}

// ---------------------------------------------------------------------------
// USGS GeoJSON response types
// ---------------------------------------------------------------------------

export interface UsgsProperties {
  mag?: number;
  place?: string;
  time?: number;
  type?: string;
  tsunami?: number;
}

export interface UsgsGeometry {
  type?: string;
  coordinates?: number[];
}

export interface UsgsFeature {
  properties?: UsgsProperties;
  geometry?: UsgsGeometry;
}

export interface UsgsGeoJsonResponse {
  type?: string;
  features?: UsgsFeature[];
}
