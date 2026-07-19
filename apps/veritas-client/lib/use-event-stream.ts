import { useEffect, useRef, useState } from 'react';
import type { GlobalEvent } from './global-event.types';

const MAX_EVENTS = 500;
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const RECENT_EVENTS_CACHE_KEY = 'veritas:worldmap:recent-events';
const RECENT_EVENTS_CACHE_TTL_MS = 5 * 60 * 1000;

type RecentEventsCache = {
  events: GlobalEvent[];
  fetchedAt: number;
};

let recentEventsMemoryCache: RecentEventsCache | null = null;
let recentEventsInFlight: Promise<GlobalEvent[]> | null = null;

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeText(value: string | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9,\s-]/g, ' ')
    .replace(/\s+/g, ' ');
}

function roundCoord(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1) : '0.0';
}

function bucketTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'invalid';
  const bucketMs = 15 * 60 * 1000;
  return String(Math.floor(date.getTime() / bucketMs));
}

function eventSignature(event: GlobalEvent): string {
  return [
    event.source,
    event.category,
    normalizeTitle(event.title),
    roundCoord(event.location.lat),
    roundCoord(event.location.lng),
    bucketTimestamp(event.timestamp),
  ].join('|');
}

function hasExactCoordinates(event: GlobalEvent): boolean {
  const coords = event.metadata.coordinates as
    | { latitude?: number; longitude?: number }
    | undefined;
  return Number.isFinite(coords?.latitude) && Number.isFinite(coords?.longitude);
}

function locationSpecificityScore(event: GlobalEvent): number {
  const label = event.location.label?.trim() ?? '';
  let score = 0;
  if (hasExactCoordinates(event)) score += 100;
  if (label.length >= 24) score += 5;
  if (/[0-9]/.test(label)) score += 3;
  if (label.includes(',')) score += 2;
  return score;
}

function sourcePriority(source: string): number {
  if (source === 'USGS') return 5;
  if (source === 'GDACS') return 4;
  if (source === 'ReliefWeb') return 3;
  if (source === 'GDELT') return 2;
  if (source.startsWith('RSS:')) return 1;
  return 0;
}

function earthquakeMagnitude(event: GlobalEvent): number | null {
  const raw = event.metadata.mag;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

function isEarthquakeLike(event: GlobalEvent): boolean {
  if (event.category !== 'environmental') return false;

  const metadataType = normalizeText(
    typeof event.metadata.type === 'string' ? event.metadata.type : '',
  );
  const text = `${normalizeText(event.title)} ${normalizeText(event.description)} ${normalizeText(event.location.label)}`;
  return (
    metadataType.includes('earthquake') || text.includes('earthquake') || text.includes(' seismic ')
  );
}

function geoDistanceDegrees(a: GlobalEvent, b: GlobalEvent): number {
  if (
    !Number.isFinite(a.location.lat) ||
    !Number.isFinite(a.location.lng) ||
    !Number.isFinite(b.location.lat) ||
    !Number.isFinite(b.location.lng)
  ) {
    return Number.POSITIVE_INFINITY;
  }

  const dLat = a.location.lat - b.location.lat;
  const dLng = a.location.lng - b.location.lng;
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

function labelsOverlap(a: GlobalEvent, b: GlobalEvent): boolean {
  const candidatesA = [normalizeText(a.location.label), normalizeText(a.title)].filter(Boolean);
  const candidatesB = [normalizeText(b.location.label), normalizeText(b.title)].filter(Boolean);

  for (const left of candidatesA) {
    for (const right of candidatesB) {
      const shorter = left.length <= right.length ? left : right;
      const longer = left.length > right.length ? left : right;
      if (shorter.length >= 4 && longer.includes(shorter)) {
        return true;
      }
    }
  }

  return false;
}

function sameCountryHint(a: GlobalEvent, b: GlobalEvent): boolean {
  if (a.location.countryCode && b.location.countryCode) {
    return a.location.countryCode.toLowerCase() === b.location.countryCode.toLowerCase();
  }
  return labelsOverlap(a, b);
}

function areCorrelatedEarthquakes(a: GlobalEvent, b: GlobalEvent): boolean {
  if (a.source === b.source) return false;
  if (!isEarthquakeLike(a) || !isEarthquakeLike(b)) return false;

  const aTs = new Date(a.timestamp).getTime();
  const bTs = new Date(b.timestamp).getTime();
  if (!Number.isFinite(aTs) || !Number.isFinite(bTs) || Math.abs(aTs - bTs) > 6 * 60 * 60 * 1000) {
    return false;
  }

  const magnitudeA = earthquakeMagnitude(a);
  const magnitudeB = earthquakeMagnitude(b);
  const similarMagnitude =
    magnitudeA == null || magnitudeB == null || Math.abs(magnitudeA - magnitudeB) <= 0.6;
  if (!similarMagnitude) return false;

  const nearByCoords = geoDistanceDegrees(a, b) <= 3.5;
  const broadAndSpecificPair = hasExactCoordinates(a) !== hasExactCoordinates(b);

  if (nearByCoords) return true;
  if (broadAndSpecificPair && sameCountryHint(a, b)) return true;
  return false;
}

function compareEventQuality(a: GlobalEvent, b: GlobalEvent): number {
  const specificityDelta = locationSpecificityScore(a) - locationSpecificityScore(b);
  if (specificityDelta !== 0) return specificityDelta;

  const sourceDelta = sourcePriority(a.source) - sourcePriority(b.source);
  if (sourceDelta !== 0) return sourceDelta;

  const magA = earthquakeMagnitude(a) ?? a.magnitude ?? 0;
  const magB = earthquakeMagnitude(b) ?? b.magnitude ?? 0;
  if (magA !== magB) return magA - magB;

  return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
}

function mergeEvents(existing: GlobalEvent[], incoming: GlobalEvent[]): GlobalEvent[] {
  const byId = new Map<string, GlobalEvent>();
  const signatureToId = new Map<string, string>();

  for (const event of [...incoming, ...existing]) {
    const signature = eventSignature(event);
    const existingBySignatureId = signatureToId.get(signature);

    if (existingBySignatureId && existingBySignatureId !== event.id) {
      const current = byId.get(existingBySignatureId);
      if (!current) {
        signatureToId.set(signature, event.id);
        byId.set(event.id, event);
        continue;
      }

      const currentTs = new Date(current.timestamp).getTime();
      const nextTs = new Date(event.timestamp).getTime();
      const keepIncoming =
        Number.isFinite(nextTs) && (!Number.isFinite(currentTs) || nextTs >= currentTs);

      if (keepIncoming) {
        byId.delete(existingBySignatureId);
        byId.set(event.id, event);
        signatureToId.set(signature, event.id);
      }
      continue;
    }

    const existingById = byId.get(event.id);
    if (!existingById) {
      byId.set(event.id, event);
      signatureToId.set(signature, event.id);
      continue;
    }

    const existingTs = new Date(existingById.timestamp).getTime();
    const nextTs = new Date(event.timestamp).getTime();
    if (Number.isFinite(nextTs) && (!Number.isFinite(existingTs) || nextTs >= existingTs)) {
      byId.set(event.id, event);
      signatureToId.set(signature, event.id);
    }
  }

  const exactDeduped = Array.from(byId.values());
  const correlated: GlobalEvent[] = [];

  const qualitySorted = [...exactDeduped].sort((a, b) => {
    const qualityDelta = compareEventQuality(b, a);
    if (qualityDelta !== 0) return qualityDelta;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  for (const event of qualitySorted) {
    const existingIdx = correlated.findIndex((current) => areCorrelatedEarthquakes(current, event));
    if (existingIdx === -1) {
      correlated.push(event);
      continue;
    }

    const current = correlated[existingIdx];
    if (!current) {
      correlated.push(event);
      continue;
    }

    if (compareEventQuality(event, current) > 0) {
      correlated[existingIdx] = event;
    }
  }

  return correlated
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, MAX_EVENTS);
}

function canUseSessionStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

function readRecentEventsCache(): RecentEventsCache | null {
  if (recentEventsMemoryCache) {
    return recentEventsMemoryCache;
  }

  if (!canUseSessionStorage()) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(RECENT_EVENTS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RecentEventsCache>;
    if (!Array.isArray(parsed.events) || typeof parsed.fetchedAt !== 'number') {
      return null;
    }
    recentEventsMemoryCache = {
      events: parsed.events as GlobalEvent[],
      fetchedAt: parsed.fetchedAt,
    };
    return recentEventsMemoryCache;
  } catch {
    return null;
  }
}

function writeRecentEventsCache(events: GlobalEvent[]): GlobalEvent[] {
  const normalized = mergeEvents([], events);
  const nextCache: RecentEventsCache = {
    events: normalized,
    fetchedAt: Date.now(),
  };
  recentEventsMemoryCache = nextCache;

  if (canUseSessionStorage()) {
    try {
      window.sessionStorage.setItem(RECENT_EVENTS_CACHE_KEY, JSON.stringify(nextCache));
    } catch {
      // Ignore storage failures.
    }
  }

  return normalized;
}

function isCacheFresh(cache: RecentEventsCache | null): boolean {
  return !!cache && Date.now() - cache.fetchedAt < RECENT_EVENTS_CACHE_TTL_MS;
}

async function fetchRecentEvents(force = false): Promise<GlobalEvent[]> {
  const existingCache = readRecentEventsCache();
  if (!force && existingCache && isCacheFresh(existingCache)) {
    return existingCache.events;
  }

  if (!force && recentEventsInFlight) {
    return recentEventsInFlight;
  }

  // 500, not 200: the environmental layer (EONET) is high-volume, and at 200
  // the newest-first cut starved whole categories — every non-crypto economic
  // event ranked below the cutoff and the world map showed ECON 0.
  recentEventsInFlight = fetch(`${API_BASE}/events/recent?limit=500`)
    .then((r) => r.json())
    .then((data) => {
      const normalized = Array.isArray(data) ? writeRecentEventsCache(data as GlobalEvent[]) : [];
      return normalized;
    })
    .finally(() => {
      recentEventsInFlight = null;
    });

  return recentEventsInFlight;
}

export function prefetchRecentEvents(force = false): Promise<GlobalEvent[]> {
  return fetchRecentEvents(force).catch(() => readRecentEventsCache()?.events ?? []);
}

export function useEventStream(options?: { categories?: string[]; regions?: string[] }): {
  events: GlobalEvent[];
  connected: boolean;
  error: string | null;
} {
  const [events, setEvents] = useState<GlobalEvent[]>(() => readRecentEventsCache()?.events ?? []);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const categoriesKey = options?.categories?.join(',') ?? '';
  const regionsKey = options?.regions?.join(',') ?? '';

  useEffect(() => {
    // 1. Hydrate from warm cache immediately, then refresh recent events in background.
    const cached = readRecentEventsCache();
    if (cached?.events?.length) {
      setEvents(cached.events);
    }

    void fetchRecentEvents()
      .then((freshEvents) => {
        setEvents((prev) => mergeEvents(prev, freshEvents));
      })
      .catch(() => undefined);

    // 2. Open SSE connection
    const params = new URLSearchParams();
    if (categoriesKey) params.set('categories', categoriesKey);
    if (regionsKey) params.set('regions', regionsKey);

    const url = `${API_BASE}/events/stream${params.toString() ? `?${params}` : ''}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.addEventListener('event', (e) => {
      try {
        const event = JSON.parse(e.data) as GlobalEvent;
        setEvents((prev) => {
          const merged = mergeEvents(prev, [event]);
          writeRecentEventsCache(merged);
          return merged;
        });
      } catch {
        // Ignore malformed events
      }
    });

    es.onopen = () => {
      setConnected(true);
      setError(null);
    };
    es.onerror = () => {
      setConnected(false);
      setError('Connection lost — reconnecting...');
    };

    return () => {
      es.close();
    };
  }, [categoriesKey, regionsKey]);

  return { events, connected, error };
}
