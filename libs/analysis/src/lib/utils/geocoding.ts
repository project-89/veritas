// ---------------------------------------------------------------------------
// Geocoding utilities — lightweight country/region coordinate resolution
// ---------------------------------------------------------------------------

export const REGION_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  us: { lat: 39.8, lng: -98.6 },
  uk: { lat: 54.0, lng: -2.0 },
  europe: { lat: 50.0, lng: 10.0 },
  asia_pacific: { lat: 35.0, lng: 105.0 },
  asia: { lat: 35.0, lng: 105.0 },
  middle_east: { lat: 29.0, lng: 42.0 },
  africa: { lat: 2.0, lng: 22.0 },
  latin_america: { lat: -15.0, lng: -60.0 },
  global: { lat: 20.0, lng: 0.0 },
  north_america: { lat: 45.0, lng: -100.0 },
  south_asia: { lat: 20.0, lng: 78.0 },
  east_asia: { lat: 35.0, lng: 120.0 },
  southeast_asia: { lat: 5.0, lng: 110.0 },
  central_asia: { lat: 42.0, lng: 65.0 },
  oceania: { lat: -25.0, lng: 135.0 },
  caribbean: { lat: 18.0, lng: -72.0 },
  central_america: { lat: 14.0, lng: -87.0 },
  eastern_europe: { lat: 50.0, lng: 30.0 },
  western_europe: { lat: 48.0, lng: 3.0 },
  northern_europe: { lat: 62.0, lng: 15.0 },
  southern_europe: { lat: 41.0, lng: 15.0 },
  west_africa: { lat: 10.0, lng: -5.0 },
  east_africa: { lat: 0.0, lng: 35.0 },
  southern_africa: { lat: -25.0, lng: 25.0 },
  north_africa: { lat: 28.0, lng: 10.0 },
};

export const COUNTRY_COORDS: Record<string, { lat: number; lng: number; name: string }> = {
  US: { lat: 39.8, lng: -98.6, name: 'United States' },
  GB: { lat: 54.0, lng: -2.0, name: 'United Kingdom' },
  CN: { lat: 35.0, lng: 105.0, name: 'China' },
  RU: { lat: 61.5, lng: 105.0, name: 'Russia' },
  IN: { lat: 20.6, lng: 79.0, name: 'India' },
  BR: { lat: -14.2, lng: -51.9, name: 'Brazil' },
  AU: { lat: -25.3, lng: 133.8, name: 'Australia' },
  CA: { lat: 56.1, lng: -106.3, name: 'Canada' },
  DE: { lat: 51.2, lng: 10.4, name: 'Germany' },
  FR: { lat: 46.2, lng: 2.2, name: 'France' },
  JP: { lat: 36.2, lng: 138.3, name: 'Japan' },
  KR: { lat: 35.9, lng: 127.8, name: 'South Korea' },
  MX: { lat: 23.6, lng: -102.6, name: 'Mexico' },
  ID: { lat: -0.8, lng: 113.9, name: 'Indonesia' },
  TR: { lat: 39.0, lng: 35.2, name: 'Turkey' },
  SA: { lat: 23.9, lng: 45.1, name: 'Saudi Arabia' },
  ZA: { lat: -30.6, lng: 22.9, name: 'South Africa' },
  NG: { lat: 9.1, lng: 8.7, name: 'Nigeria' },
  EG: { lat: 26.8, lng: 30.8, name: 'Egypt' },
  PK: { lat: 30.4, lng: 69.3, name: 'Pakistan' },
  BD: { lat: 23.7, lng: 90.4, name: 'Bangladesh' },
  PH: { lat: 12.9, lng: 121.8, name: 'Philippines' },
  VN: { lat: 14.1, lng: 108.3, name: 'Vietnam' },
  TH: { lat: 15.9, lng: 100.9, name: 'Thailand' },
  MM: { lat: 21.9, lng: 96.0, name: 'Myanmar' },
  IT: { lat: 41.9, lng: 12.6, name: 'Italy' },
  ES: { lat: 40.5, lng: -3.7, name: 'Spain' },
  PL: { lat: 51.9, lng: 19.1, name: 'Poland' },
  UA: { lat: 48.4, lng: 31.2, name: 'Ukraine' },
  NL: { lat: 52.1, lng: 5.3, name: 'Netherlands' },
  BE: { lat: 50.5, lng: 4.5, name: 'Belgium' },
  SE: { lat: 60.1, lng: 18.6, name: 'Sweden' },
  NO: { lat: 60.5, lng: 8.5, name: 'Norway' },
  FI: { lat: 61.9, lng: 25.7, name: 'Finland' },
  DK: { lat: 56.3, lng: 9.5, name: 'Denmark' },
  CH: { lat: 46.8, lng: 8.2, name: 'Switzerland' },
  AT: { lat: 47.5, lng: 14.6, name: 'Austria' },
  PT: { lat: 39.4, lng: -8.2, name: 'Portugal' },
  GR: { lat: 39.1, lng: 21.8, name: 'Greece' },
  CZ: { lat: 49.8, lng: 15.5, name: 'Czech Republic' },
  RO: { lat: 45.9, lng: 24.9, name: 'Romania' },
  HU: { lat: 47.2, lng: 19.5, name: 'Hungary' },
  IE: { lat: 53.1, lng: -8.0, name: 'Ireland' },
  IL: { lat: 31.0, lng: 34.9, name: 'Israel' },
  IR: { lat: 32.4, lng: 53.7, name: 'Iran' },
  IQ: { lat: 33.2, lng: 43.7, name: 'Iraq' },
  SY: { lat: 35.0, lng: 38.0, name: 'Syria' },
  JO: { lat: 30.6, lng: 36.2, name: 'Jordan' },
  LB: { lat: 33.9, lng: 35.9, name: 'Lebanon' },
  AE: { lat: 23.4, lng: 53.8, name: 'United Arab Emirates' },
  QA: { lat: 25.4, lng: 51.2, name: 'Qatar' },
  KW: { lat: 29.3, lng: 47.5, name: 'Kuwait' },
  AR: { lat: -38.4, lng: -63.6, name: 'Argentina' },
  CL: { lat: -35.7, lng: -71.5, name: 'Chile' },
  CO: { lat: 4.6, lng: -74.3, name: 'Colombia' },
  PE: { lat: -9.2, lng: -75.0, name: 'Peru' },
  VE: { lat: 6.4, lng: -66.6, name: 'Venezuela' },
  EC: { lat: -1.8, lng: -78.2, name: 'Ecuador' },
  KE: { lat: -0.0, lng: 37.9, name: 'Kenya' },
  ET: { lat: 9.1, lng: 40.5, name: 'Ethiopia' },
  GH: { lat: 7.9, lng: -1.0, name: 'Ghana' },
  TZ: { lat: -6.4, lng: 34.9, name: 'Tanzania' },
  CD: { lat: -4.0, lng: 21.8, name: 'Democratic Republic of the Congo' },
  SD: { lat: 12.9, lng: 30.2, name: 'Sudan' },
  MA: { lat: 31.8, lng: -7.1, name: 'Morocco' },
  DZ: { lat: 28.0, lng: 1.7, name: 'Algeria' },
  TN: { lat: 34.0, lng: 9.5, name: 'Tunisia' },
  LY: { lat: 26.3, lng: 17.2, name: 'Libya' },
  AF: { lat: 33.9, lng: 67.7, name: 'Afghanistan' },
  NZ: { lat: -40.9, lng: 174.9, name: 'New Zealand' },
  MY: { lat: 4.2, lng: 101.9, name: 'Malaysia' },
  SG: { lat: 1.4, lng: 103.8, name: 'Singapore' },
  TW: { lat: 23.7, lng: 121.0, name: 'Taiwan' },
  KP: { lat: 40.3, lng: 127.5, name: 'North Korea' },
  NP: { lat: 28.4, lng: 84.1, name: 'Nepal' },
  LK: { lat: 7.9, lng: 80.8, name: 'Sri Lanka' },
  CU: { lat: 21.5, lng: -79.0, name: 'Cuba' },
  HT: { lat: 19.0, lng: -72.0, name: 'Haiti' },
  DO: { lat: 18.7, lng: -70.2, name: 'Dominican Republic' },
  RS: { lat: 44.0, lng: 21.0, name: 'Serbia' },
  BG: { lat: 42.7, lng: 25.5, name: 'Bulgaria' },
  HR: { lat: 45.1, lng: 15.2, name: 'Croatia' },
  SK: { lat: 48.7, lng: 19.7, name: 'Slovakia' },
  SI: { lat: 46.2, lng: 14.8, name: 'Slovenia' },
};

/**
 * Resolve a country code (ISO 3166-1 alpha-2) to coordinates and label.
 * Also handles common full country names by searching the map.
 */
export function resolveCountryCode(
  code: string,
): { lat: number; lng: number; label: string } | null {
  if (!code) return null;

  // Try direct lookup (uppercase)
  const upper = code.trim().toUpperCase();
  const direct = COUNTRY_COORDS[upper];
  if (direct) {
    return { lat: direct.lat, lng: direct.lng, label: direct.name };
  }

  // Try matching by country name (case-insensitive)
  const lower = code.trim().toLowerCase();
  for (const [, entry] of Object.entries(COUNTRY_COORDS)) {
    if (entry.name.toLowerCase() === lower) {
      return { lat: entry.lat, lng: entry.lng, label: entry.name };
    }
  }

  return null;
}

/**
 * Resolve a region string to centroid coordinates and label.
 * Normalizes input by lowercasing and replacing spaces/hyphens with underscores.
 */
export function resolveRegion(region: string): { lat: number; lng: number; label: string } | null {
  if (!region) return null;

  const key = region
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  const centroid = REGION_CENTROIDS[key];
  if (centroid) {
    return { lat: centroid.lat, lng: centroid.lng, label: region };
  }

  return null;
}
