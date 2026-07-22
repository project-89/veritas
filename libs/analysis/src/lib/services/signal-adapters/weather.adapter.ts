import { Logger } from '@nestjs/common';
import type { ExternalSignal, SignalAdapter } from './signal-adapter.interface';

/**
 * Global severe-weather signal via Open-Meteo (free, keyless).
 *
 * NOT a paint-the-atmosphere overlay (decoration). This closes a real gap:
 * NOAA/NWS alerts are US-only, and EONET/GDACS cover named storms and floods
 * but not heat/cold extremes. This surfaces genuinely SEVERE conditions —
 * extreme heat, extreme cold, torrential rain, damaging wind — at major
 * population and strategic centers worldwide, as discrete ground-truth events
 * that narratives get built on (heat-emergency blame, grid failures,
 * crop/migration stories).
 *
 * Thresholds are ABSOLUTE (not baseline-anomaly): a condition qualifies only
 * when it is severe by any measure, honestly labeled as such.
 *
 * Docs: https://open-meteo.com/en/docs
 */

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';
const BATCH_SIZE = 50; // locations per multi-point request

export interface WeatherLocation {
  name: string;
  lat: number;
  lng: number;
}

export interface WeatherReading {
  location: WeatherLocation;
  tempMax: number | null;
  tempMin: number | null;
  precipSum: number | null;
  windMax: number | null;
}

interface Severity {
  kind: 'heat' | 'cold' | 'rain' | 'wind';
  severity: 'high' | 'critical';
  magnitude: number;
  label: string;
}

/**
 * Most severe breach for a reading, or null if nothing qualifies. Pure and
 * exported so thresholds are unit-testable without a live API.
 */
export function classifyWeather(r: WeatherReading): Severity | null {
  const candidates: Severity[] = [];
  const { tempMax, tempMin, precipSum, windMax } = r;

  if (tempMax != null && tempMax >= 40) {
    candidates.push({
      kind: 'heat',
      severity: tempMax >= 45 ? 'critical' : 'high',
      magnitude: tempMax >= 45 ? 0.9 : 0.72,
      label: `Extreme heat ${Math.round(tempMax)}°C`,
    });
  }
  if (tempMin != null && tempMin <= -25) {
    candidates.push({
      kind: 'cold',
      severity: tempMin <= -35 ? 'critical' : 'high',
      magnitude: tempMin <= -35 ? 0.9 : 0.72,
      label: `Extreme cold ${Math.round(tempMin)}°C`,
    });
  }
  if (precipSum != null && precipSum >= 50) {
    candidates.push({
      kind: 'rain',
      severity: precipSum >= 100 ? 'critical' : 'high',
      magnitude: precipSum >= 100 ? 0.88 : 0.7,
      label: `Torrential rain ${Math.round(precipSum)}mm/24h`,
    });
  }
  if (windMax != null && windMax >= 75) {
    candidates.push({
      kind: 'wind',
      severity: windMax >= 100 ? 'critical' : 'high',
      magnitude: windMax >= 100 ? 0.88 : 0.7,
      label: `Damaging wind ${Math.round(windMax)}km/h`,
    });
  }

  if (candidates.length === 0) return null;
  // Critical over high; then by magnitude.
  candidates.sort(
    (a, b) =>
      (b.severity === 'critical' ? 1 : 0) - (a.severity === 'critical' ? 1 : 0) ||
      b.magnitude - a.magnitude,
  );
  return candidates[0] ?? null;
}

// Curated global centers — major population and strategic locations across all
// inhabited continents. Deliberately finite: severe weather at places people
// live is the signal; painting the whole grid is not.
export const WEATHER_LOCATIONS: WeatherLocation[] = [
  // Asia
  { name: 'Delhi', lat: 28.6, lng: 77.2 }, { name: 'Mumbai', lat: 19.08, lng: 72.88 },
  { name: 'Karachi', lat: 24.86, lng: 67.0 }, { name: 'Dhaka', lat: 23.81, lng: 90.41 },
  { name: 'Beijing', lat: 39.9, lng: 116.4 }, { name: 'Shanghai', lat: 31.23, lng: 121.47 },
  { name: 'Tokyo', lat: 35.68, lng: 139.69 }, { name: 'Seoul', lat: 37.57, lng: 126.98 },
  { name: 'Bangkok', lat: 13.75, lng: 100.5 }, { name: 'Jakarta', lat: -6.21, lng: 106.85 },
  { name: 'Manila', lat: 14.6, lng: 120.98 }, { name: 'Ho Chi Minh City', lat: 10.82, lng: 106.63 },
  { name: 'Tehran', lat: 35.69, lng: 51.39 }, { name: 'Baghdad', lat: 33.31, lng: 44.36 },
  { name: 'Riyadh', lat: 24.71, lng: 46.68 }, { name: 'Dubai', lat: 25.2, lng: 55.27 },
  { name: 'Kolkata', lat: 22.57, lng: 88.36 }, { name: 'Hong Kong', lat: 22.32, lng: 114.17 },
  { name: 'Novosibirsk', lat: 55.01, lng: 82.93 }, { name: 'Yakutsk', lat: 62.03, lng: 129.73 },
  // Europe
  { name: 'London', lat: 51.51, lng: -0.13 }, { name: 'Paris', lat: 48.85, lng: 2.35 },
  { name: 'Madrid', lat: 40.42, lng: -3.7 }, { name: 'Rome', lat: 41.9, lng: 12.5 },
  { name: 'Berlin', lat: 52.52, lng: 13.4 }, { name: 'Moscow', lat: 55.75, lng: 37.62 },
  { name: 'Kyiv', lat: 50.45, lng: 30.52 }, { name: 'Istanbul', lat: 41.01, lng: 28.98 },
  { name: 'Athens', lat: 37.98, lng: 23.73 }, { name: 'Warsaw', lat: 52.23, lng: 21.01 },
  // Africa
  { name: 'Cairo', lat: 30.04, lng: 31.24 }, { name: 'Lagos', lat: 6.52, lng: 3.38 },
  { name: 'Kinshasa', lat: -4.32, lng: 15.31 }, { name: 'Nairobi', lat: -1.29, lng: 36.82 },
  { name: 'Johannesburg', lat: -26.2, lng: 28.05 }, { name: 'Khartoum', lat: 15.5, lng: 32.56 },
  { name: 'Addis Ababa', lat: 9.03, lng: 38.74 }, { name: 'Casablanca', lat: 33.57, lng: -7.59 },
  { name: 'Dakar', lat: 14.72, lng: -17.47 }, { name: 'Timbuktu', lat: 16.77, lng: -3.0 },
  // North America
  { name: 'New York', lat: 40.71, lng: -74.01 }, { name: 'Los Angeles', lat: 34.05, lng: -118.24 },
  { name: 'Chicago', lat: 41.88, lng: -87.63 }, { name: 'Houston', lat: 29.76, lng: -95.37 },
  { name: 'Phoenix', lat: 33.45, lng: -112.07 }, { name: 'Mexico City', lat: 19.43, lng: -99.13 },
  { name: 'Toronto', lat: 43.65, lng: -79.38 }, { name: 'Winnipeg', lat: 49.9, lng: -97.14 },
  { name: 'Miami', lat: 25.76, lng: -80.19 }, { name: 'Havana', lat: 23.11, lng: -82.37 },
  // South America
  { name: 'São Paulo', lat: -23.55, lng: -46.63 }, { name: 'Rio de Janeiro', lat: -22.91, lng: -43.17 },
  { name: 'Buenos Aires', lat: -34.6, lng: -58.38 }, { name: 'Lima', lat: -12.05, lng: -77.04 },
  { name: 'Bogotá', lat: 4.71, lng: -74.07 }, { name: 'Santiago', lat: -33.45, lng: -70.67 },
  { name: 'Caracas', lat: 10.48, lng: -66.9 }, { name: 'Manaus', lat: -3.12, lng: -60.02 },
  // Oceania
  { name: 'Sydney', lat: -33.87, lng: 151.21 }, { name: 'Melbourne', lat: -37.81, lng: 144.96 },
  { name: 'Perth', lat: -31.95, lng: 115.86 }, { name: 'Auckland', lat: -36.85, lng: 174.76 },
];

interface OpenMeteoResponse {
  latitude?: number;
  longitude?: number;
  daily?: {
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_sum?: number[];
    wind_speed_10m_max?: number[];
  };
}

export class WeatherAdapter implements SignalAdapter {
  readonly domain = 'social';
  readonly scope = 'global' as const;
  readonly maxAgeMs = 60 * 60 * 1000; // 1 hour
  readonly name = 'Open-Meteo';

  private readonly logger = new Logger(WeatherAdapter.name);

  async fetchSignals(): Promise<ExternalSignal[]> {
    const readings: WeatherReading[] = [];
    for (let i = 0; i < WEATHER_LOCATIONS.length; i += BATCH_SIZE) {
      const batch = WEATHER_LOCATIONS.slice(i, i + BATCH_SIZE);
      try {
        readings.push(...(await this.fetchBatch(batch)));
      } catch (err) {
        this.logger.warn(`Open-Meteo batch failed: ${err}`);
      }
    }

    const out: ExternalSignal[] = [];
    for (const r of readings) {
      const sev = classifyWeather(r);
      if (!sev) continue;
      out.push({
        id: `weather-${r.location.name.replace(/\W/g, '-').toLowerCase()}-${sev.kind}`,
        domain: 'social',
        source: 'Open-Meteo',
        title: `${sev.label}: ${r.location.name}`,
        description: `Severe weather at ${r.location.name}: ${sev.label} (Open-Meteo forecast).`,
        timestamp: new Date().toISOString(),
        magnitude: sev.magnitude,
        metadata: {
          coordinates: { latitude: r.location.lat, longitude: r.location.lng },
          place: r.location.name,
          weatherKind: sev.kind,
        },
      });
    }
    return out;
  }

  private async fetchBatch(batch: WeatherLocation[]): Promise<WeatherReading[]> {
    const url = new URL(OPEN_METEO_URL);
    url.searchParams.set('latitude', batch.map((l) => l.lat).join(','));
    url.searchParams.set('longitude', batch.map((l) => l.lng).join(','));
    url.searchParams.set(
      'daily',
      'temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max',
    );
    url.searchParams.set('wind_speed_unit', 'kmh');
    url.searchParams.set('forecast_days', '1');
    url.searchParams.set('timezone', 'auto');

    const response = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as OpenMeteoResponse | OpenMeteoResponse[];
    // Multi-location returns an array; a single location returns an object.
    const arr = Array.isArray(data) ? data : [data];
    return arr.map((d, i) => ({
      location: batch[i] ?? { name: 'Unknown', lat: d.latitude ?? 0, lng: d.longitude ?? 0 },
      tempMax: d.daily?.temperature_2m_max?.[0] ?? null,
      tempMin: d.daily?.temperature_2m_min?.[0] ?? null,
      precipSum: d.daily?.precipitation_sum?.[0] ?? null,
      windMax: d.daily?.wind_speed_10m_max?.[0] ?? null,
    }));
  }
}
