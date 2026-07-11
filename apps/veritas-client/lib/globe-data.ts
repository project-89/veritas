/**
 * Transform narrative analysis data into globe points and arcs.
 *
 * IMPORTANT: posts carry no GPS/geolocation. The only honest geographic signal
 * available is which countries are *referenced in the discourse* — country
 * names mentioned in post text, plus country metadata on GDELT event signals.
 * Points therefore represent "this country was referenced by the narrative",
 * NOT where authors are or where a narrative originated. When no country is
 * referenced, the globe is empty rather than inventing plausible-looking
 * geography from platform mix (which it used to do — see git history).
 */
import type {
  AnalyzedNarrative,
  DownstreamEffectsResult,
  InvestigationResult,
  RawPost,
} from './api';

// ---------------------------------------------------------------------------
// Globe data types
// ---------------------------------------------------------------------------

export interface GlobePoint {
  id: string;
  lat: number;
  lng: number;
  label: string;
  size: number; // 0-1, maps to point radius
  color: string;
  type: 'narrative' | 'signal' | 'actor' | 'origin';
  metadata?: Record<string, unknown>;
}

export interface GlobeArc {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: string;
  stroke: number; // line width
  label?: string;
}

// ---------------------------------------------------------------------------
// Country coordinate lookup (~60 major countries)
// ---------------------------------------------------------------------------

const COUNTRY_COORDS: Record<string, { lat: number; lng: number; name: string }> = {
  US: { lat: 39.8, lng: -98.6, name: 'United States' },
  GB: { lat: 54.0, lng: -2.0, name: 'United Kingdom' },
  CA: { lat: 56.1, lng: -106.3, name: 'Canada' },
  AU: { lat: -25.3, lng: 133.8, name: 'Australia' },
  RU: { lat: 61.5, lng: 105.3, name: 'Russia' },
  CN: { lat: 35.9, lng: 104.2, name: 'China' },
  IN: { lat: 20.6, lng: 78.9, name: 'India' },
  DE: { lat: 51.2, lng: 10.4, name: 'Germany' },
  FR: { lat: 46.6, lng: 2.2, name: 'France' },
  JP: { lat: 36.2, lng: 138.3, name: 'Japan' },
  BR: { lat: -14.2, lng: -51.9, name: 'Brazil' },
  MX: { lat: 23.6, lng: -102.6, name: 'Mexico' },
  KR: { lat: 35.9, lng: 127.8, name: 'South Korea' },
  KP: { lat: 40.3, lng: 127.5, name: 'North Korea' },
  IT: { lat: 41.9, lng: 12.6, name: 'Italy' },
  ES: { lat: 40.5, lng: -3.7, name: 'Spain' },
  NL: { lat: 52.1, lng: 5.3, name: 'Netherlands' },
  SE: { lat: 60.1, lng: 18.6, name: 'Sweden' },
  NO: { lat: 60.5, lng: 8.5, name: 'Norway' },
  FI: { lat: 61.9, lng: 25.7, name: 'Finland' },
  DK: { lat: 56.3, lng: 9.5, name: 'Denmark' },
  PL: { lat: 51.9, lng: 19.1, name: 'Poland' },
  UA: { lat: 48.4, lng: 31.2, name: 'Ukraine' },
  TR: { lat: 38.9, lng: 35.2, name: 'Turkey' },
  SA: { lat: 23.9, lng: 45.1, name: 'Saudi Arabia' },
  AE: { lat: 23.4, lng: 53.8, name: 'United Arab Emirates' },
  IL: { lat: 31.0, lng: 34.9, name: 'Israel' },
  EG: { lat: 26.8, lng: 30.8, name: 'Egypt' },
  ZA: { lat: -30.6, lng: 22.9, name: 'South Africa' },
  NG: { lat: 9.1, lng: 8.7, name: 'Nigeria' },
  KE: { lat: -0.0, lng: 37.9, name: 'Kenya' },
  TH: { lat: 15.9, lng: 100.9, name: 'Thailand' },
  VN: { lat: 14.1, lng: 108.3, name: 'Vietnam' },
  PH: { lat: 12.9, lng: 121.8, name: 'Philippines' },
  ID: { lat: -0.8, lng: 113.9, name: 'Indonesia' },
  MY: { lat: 4.2, lng: 101.9, name: 'Malaysia' },
  SG: { lat: 1.4, lng: 103.8, name: 'Singapore' },
  NZ: { lat: -40.9, lng: 174.9, name: 'New Zealand' },
  AR: { lat: -38.4, lng: -63.6, name: 'Argentina' },
  CL: { lat: -35.7, lng: -71.5, name: 'Chile' },
  CO: { lat: 4.6, lng: -74.3, name: 'Colombia' },
  PE: { lat: -9.2, lng: -75.0, name: 'Peru' },
  IR: { lat: 32.4, lng: 53.7, name: 'Iran' },
  IQ: { lat: 33.2, lng: 43.7, name: 'Iraq' },
  PK: { lat: 30.4, lng: 69.3, name: 'Pakistan' },
  BD: { lat: 23.7, lng: 90.4, name: 'Bangladesh' },
  AT: { lat: 47.5, lng: 14.6, name: 'Austria' },
  CH: { lat: 46.8, lng: 8.2, name: 'Switzerland' },
  BE: { lat: 50.5, lng: 4.5, name: 'Belgium' },
  PT: { lat: 39.4, lng: -8.2, name: 'Portugal' },
  GR: { lat: 39.1, lng: 21.8, name: 'Greece' },
  CZ: { lat: 49.8, lng: 15.5, name: 'Czech Republic' },
  RO: { lat: 45.9, lng: 24.97, name: 'Romania' },
  HU: { lat: 47.2, lng: 19.5, name: 'Hungary' },
  IE: { lat: 53.1, lng: -7.7, name: 'Ireland' },
  TW: { lat: 23.7, lng: 121.0, name: 'Taiwan' },
  HK: { lat: 22.4, lng: 114.1, name: 'Hong Kong' },
  ET: { lat: 9.1, lng: 40.5, name: 'Ethiopia' },
  GH: { lat: 7.9, lng: -1.0, name: 'Ghana' },
};

// Reverse lookup: country name -> ISO code
const NAME_TO_CODE: Record<string, string> = {};
for (const [code, info] of Object.entries(COUNTRY_COORDS)) {
  NAME_TO_CODE[info.name.toLowerCase()] = code;
}
// Common aliases
const ALIASES: Record<string, string> = {
  usa: 'US',
  'united states of america': 'US',
  america: 'US',
  uk: 'GB',
  england: 'GB',
  britain: 'GB',
  'great britain': 'GB',
  russia: 'RU',
  'russian federation': 'RU',
  china: 'CN',
  'peoples republic of china': 'CN',
  prc: 'CN',
  korea: 'KR',
  'south korea': 'KR',
  'north korea': 'KP',
  japan: 'JP',
  germany: 'DE',
  france: 'FR',
  india: 'IN',
  brazil: 'BR',
  mexico: 'MX',
  canada: 'CA',
  australia: 'AU',
  israel: 'IL',
  iran: 'IR',
  iraq: 'IQ',
  turkey: 'TR',
  turkiye: 'TR',
  'saudi arabia': 'SA',
  saudi: 'SA',
  uae: 'AE',
  dubai: 'AE',
  ukraine: 'UA',
  taiwan: 'TW',
  'hong kong': 'HK',
  nigeria: 'NG',
  'south africa': 'ZA',
  egypt: 'EG',
  pakistan: 'PK',
  switzerland: 'CH',
};
for (const [alias, code] of Object.entries(ALIASES)) {
  NAME_TO_CODE[alias] = code;
}

// Build a regex that matches any country name in text
const allCountryNames = [
  ...Object.values(COUNTRY_COORDS).map((c) => c.name),
  ...Object.keys(ALIASES),
].sort((a, b) => b.length - a.length); // longer first to avoid partial matches

const COUNTRY_REGEX = new RegExp(
  `\\b(${allCountryNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'gi',
);

// ---------------------------------------------------------------------------
// Helper: resolve country code from various sources
// ---------------------------------------------------------------------------

function resolveCountryCode(raw: string): string | null {
  const upper = raw.trim().toUpperCase();
  if (COUNTRY_COORDS[upper]) return upper;

  const lower = raw.trim().toLowerCase();
  const fromName = NAME_TO_CODE[lower];
  if (fromName) return fromName;

  return null;
}

// ---------------------------------------------------------------------------
// Helper: extract countries mentioned in text
// ---------------------------------------------------------------------------

function extractCountriesFromText(text: string): string[] {
  const matches = text.match(COUNTRY_REGEX);
  if (!matches) return [];
  const codes = new Set<string>();
  for (const m of matches) {
    const code = resolveCountryCode(m);
    if (code) codes.add(code);
  }
  return Array.from(codes);
}

// ---------------------------------------------------------------------------
// Sentiment -> color
// ---------------------------------------------------------------------------

function sentimentToColor(avgSentiment: number): string {
  if (avgSentiment > 0.2) return '#00E676'; // green
  if (avgSentiment < -0.2) return '#FF1744'; // red
  return '#FF6B2B'; // nerv-orange neutral
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildGlobeData(params: {
  narratives: AnalyzedNarrative[];
  posts: RawPost[];
  downstream?: DownstreamEffectsResult | null;
  investigation?: InvestigationResult | null;
}): { points: GlobePoint[]; arcs: GlobeArc[] } {
  const { narratives, posts, downstream, investigation } = params;

  // Accumulate per-country data
  interface CountryBucket {
    code: string;
    postCount: number;
    sentimentSum: number;
    sentimentCount: number;
    earliestTimestamp: string | null;
    narrativeIds: Set<string>;
  }

  const countryMap = new Map<string, CountryBucket>();

  function getOrCreateBucket(code: string): CountryBucket {
    let bucket = countryMap.get(code);
    if (!bucket) {
      bucket = {
        code,
        postCount: 0,
        sentimentSum: 0,
        sentimentCount: 0,
        earliestTimestamp: null,
        narrativeIds: new Set(),
      };
      countryMap.set(code, bucket);
    }
    return bucket;
  }

  // 1. Extract countries from post text + GDELT signal metadata
  for (let pi = 0; pi < posts.length; pi++) {
    const post = posts[pi];
    if (!post) continue;
    const codes = extractCountriesFromText(post.text);

    // Check for GDELT metadata country (platform === 'gdelt' or 'news')
    // The post metadata might include country info in the text or authorHandle
    // We also check the platform name for country signals
    for (const code of codes) {
      const bucket = getOrCreateBucket(code);
      bucket.postCount++;
      if (post.sentiment) {
        bucket.sentimentSum += post.sentiment.score;
        bucket.sentimentCount++;
      }
      if (!bucket.earliestTimestamp || post.timestamp < bucket.earliestTimestamp) {
        bucket.earliestTimestamp = post.timestamp;
      }
      // Find which narrative this post belongs to
      for (const n of narratives) {
        if (n.postIndices.includes(pi)) {
          bucket.narrativeIds.add(n.id);
        }
      }
    }
  }

  // 2. Extract countries from GDELT downstream signals
  if (downstream?.externalSignals) {
    for (const signal of downstream.externalSignals) {
      const meta = signal.metadata;
      const country = (meta?.country ?? meta?.sourcecountry ?? meta?.sourceCountry) as
        | string
        | undefined;
      if (country) {
        const code = resolveCountryCode(country);
        if (code) {
          const bucket = getOrCreateBucket(code);
          bucket.postCount += 1;
          if (
            signal.timestamp &&
            (!bucket.earliestTimestamp || signal.timestamp < bucket.earliestTimestamp)
          ) {
            bucket.earliestTimestamp = signal.timestamp;
          }
        }
      }

      // Also extract from signal title/description
      const textCodes = extractCountriesFromText(`${signal.title} ${signal.description}`);
      for (const code of textCodes) {
        const bucket = getOrCreateBucket(code);
        bucket.postCount += 1;
      }
    }
  }

  // 3. Extract from investigation user platform presence
  if (investigation?.users) {
    for (const userResult of investigation.users) {
      // Platform presence doesn't directly map to countries, but flags might
      for (const flag of userResult.flags) {
        const codes = extractCountriesFromText(flag);
        for (const code of codes) {
          getOrCreateBucket(code).postCount += 1;
        }
      }
      // Extract countries from user profile summary
      if (userResult.user.profile?.summary) {
        const codes = extractCountriesFromText(userResult.user.profile.summary);
        for (const code of codes) {
          getOrCreateBucket(code).postCount += 1;
        }
      }
    }
  }

  // NOTE: no synthetic fallback. If nothing referenced a country, the globe
  // stays empty and the panel shows an honest "no geographic references"
  // state, rather than fabricating dots from platform mix.

  // ---------------------------------------------------------------------------
  // Build points
  // ---------------------------------------------------------------------------

  const buckets = Array.from(countryMap.values());
  const maxPostCount = Math.max(1, ...buckets.map((b) => b.postCount));

  const points: GlobePoint[] = buckets
    .map((bucket) => {
      const coords = COUNTRY_COORDS[bucket.code];
      if (!coords) return null;

      const avgSentiment =
        bucket.sentimentCount > 0 ? bucket.sentimentSum / bucket.sentimentCount : 0;

      return {
        id: `country-${bucket.code}`,
        lat: coords.lat,
        lng: coords.lng,
        label: coords.name,
        size: Math.max(0.1, bucket.postCount / maxPostCount),
        color: sentimentToColor(avgSentiment),
        type: 'narrative',
        metadata: {
          countryCode: bucket.code,
          // "references" not "posts" — a country dot means it was named in the
          // discourse (post text or GDELT signal), not that posts came from it.
          referenceCount: bucket.postCount,
          avgSentiment,
          narrativeCount: bucket.narrativeIds.size,
        },
      } as GlobePoint;
    })
    .filter((p): p is GlobePoint => p !== null);

  // ---------------------------------------------------------------------------
  // Build arcs: UNDIRECTED links between countries co-referenced by the same
  // narrative. There is no real directional/temporal flow between countries
  // (the timestamps are narrative first-seen, not per-country adoption), so we
  // do not imply a source→target direction.
  // ---------------------------------------------------------------------------

  const arcs: GlobeArc[] = [];
  const arcSet = new Set<string>();

  for (let i = 0; i < buckets.length; i++) {
    for (let j = i + 1; j < buckets.length; j++) {
      const a = buckets[i];
      const b = buckets[j];
      if (!a || !b) continue;
      const coordsA = COUNTRY_COORDS[a.code];
      const coordsB = COUNTRY_COORDS[b.code];
      if (!coordsA || !coordsB) continue;

      // Find shared narratives
      const shared = new Set<string>();
      for (const nid of a.narrativeIds) {
        if (b.narrativeIds.has(nid)) shared.add(nid);
      }

      if (shared.size === 0) continue;

      const arcKey = `${a.code}-${b.code}`;
      if (arcSet.has(arcKey)) continue;
      arcSet.add(arcKey);

      arcs.push({
        startLat: coordsA.lat,
        startLng: coordsA.lng,
        endLat: coordsB.lat,
        endLng: coordsB.lng,
        color: '#5B6B8A',
        stroke: Math.min(3, 0.5 + shared.size * 0.8),
        label: `Co-referenced by ${shared.size} narrative${shared.size > 1 ? 's' : ''}`,
      });
    }
  }

  return { points, arcs };
}

export { COUNTRY_COORDS };
