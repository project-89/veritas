import { Logger } from '@nestjs/common';
import type { ExternalSignal, SignalAdapter } from './signal-adapter.interface';

const USER_AGENT = 'Mozilla/5.0 (compatible; Veritas/2.0; +https://github.com/oneirocom/veritas)';

/**
 * GDACS (Global Disaster Alert and Coordination System) adapter.
 *
 * Fetches real-time natural disaster alerts — earthquakes, tropical cyclones,
 * floods, volcanoes, droughts, and wildfires. Free, no API key required.
 *
 * Docs: https://www.gdacs.org/gdacsapi/
 */
export class GdacsAdapter implements SignalAdapter {
  readonly domain = 'social'; // natural disasters affect social conditions
  readonly name = 'GDACS Disaster Alerts';
  readonly scope = 'global' as const;
  readonly maxAgeMs = 60 * 60 * 1000; // 1 hour cache

  private readonly logger = new Logger(GdacsAdapter.name);
  private readonly baseUrl =
    'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH';

  async fetchSignals(params: {
    keywords: string[];
    startDate: string;
    endDate: string;
  }): Promise<ExternalSignal[]> {
    const url = new URL(this.baseUrl);
    url.searchParams.set('alertlevel', 'Green;Orange;Red');
    url.searchParams.set('eventtype', 'EQ;TC;FL;VO;DR;WF');
    url.searchParams.set('limit', '50');

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(url.toString(), {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(15_000),
        });

        if (!response.ok) {
          this.logger.warn(`GDACS returned HTTP ${response.status}`);
          return [];
        }

        const data = (await response.json()) as GdacsResponse;
        return this.mapFeatures(data);
      } catch (err) {
        if (attempt === 0) {
          this.logger.debug(`GDACS attempt 1 failed, retrying: ${err}`);
          continue;
        }
        this.logger.warn(`GDACS fetch failed after 2 attempts: ${err}`);
        return [];
      }
    }

    return [];
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private mapFeatures(data: GdacsResponse): ExternalSignal[] {
    const features = data.features;
    if (!Array.isArray(features)) return [];

    return features.map((feature, i) => {
      const props = feature.properties ?? {};
      const coords = feature.geometry?.coordinates ?? [0, 0];
      const alertLevel = (props['alertlevel'] as string) ?? 'Green';
      const eventtype = (props['eventtype'] as string) ?? 'UNK';

      return {
        id: `gdacs-${eventtype}-${(feature as Record<string, unknown>)['id'] ?? i}`,
        domain: 'social' as const,
        source: 'GDACS',
        title: (props['name'] as string) ?? `${this.eventTypeLabel(eventtype)} Alert`,
        description: (props['description'] as string) ?? '',
        timestamp: props['fromdate']
          ? new Date(props['fromdate'] as string).toISOString()
          : new Date().toISOString(),
        magnitude: this.alertMagnitude(alertLevel),
        metadata: {
          eventtype,
          alertlevel: alertLevel,
          country: (props['country'] as string) ?? '',
          coordinates: { latitude: coords[1], longitude: coords[0] },
        },
      };
    });
  }

  /** Map GDACS alert level to 0-1 magnitude. */
  private alertMagnitude(alertLevel: string): number {
    switch (alertLevel) {
      case 'Red':
        return 1.0;
      case 'Orange':
        return 0.7;
      case 'Green':
      default:
        return 0.3;
    }
  }

  /** Human-readable label for GDACS event type codes. */
  private eventTypeLabel(code?: string): string {
    switch (code) {
      case 'EQ': return 'Earthquake';
      case 'TC': return 'Tropical Cyclone';
      case 'FL': return 'Flood';
      case 'VO': return 'Volcano';
      case 'DR': return 'Drought';
      case 'WF': return 'Wildfire';
      default: return 'Disaster';
    }
  }
}

// ---------------------------------------------------------------------------
// GDACS response types
// ---------------------------------------------------------------------------

export interface GdacsFeature {
  properties?: Record<string, unknown>;
  geometry?: {
    coordinates?: number[]; // [lng, lat]
  };
}

export interface GdacsResponse {
  features?: GdacsFeature[];
}
