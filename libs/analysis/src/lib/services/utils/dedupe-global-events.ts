import type { GeoLocation, GlobalEvent } from '../../types/global-event';

/**
 * Collapses near-duplicate global events that describe the SAME real-world
 * happening reported by multiple sources (e.g. a New Caledonia earthquake
 * arriving from USGS, GDACS, ReliefWeb and several news RSS feeds). Each source
 * mints its own event id, so id-based dedup alone lets these through — the feed
 * ends up a wall of the same event.
 *
 * An event is treated as a duplicate of an already-kept one when all hold:
 *   - same category,
 *   - same location anchor (country code › region › ~1° lat/lng cell),
 *   - timestamps within `windowMs`,
 *   - content-token overlap ≥ `overlapThreshold`.
 *
 * Content tokens are the significant title words with the location name removed
 * (the anchor already encodes place, and the location name appears in every
 * title there, which would otherwise inflate similarity). Overlap uses the
 * overlap coefficient (intersection / smaller set) rather than Jaccard, so a
 * terse wire headline still matches a longer, more descriptive one about the
 * same happening.
 *
 * The first occurrence wins, so callers should pass events newest/highest-
 * priority first (getRecentEvents already sorts by recency). It intentionally
 * does NOT merge events far apart in time or place — two distinct quakes days
 * apart, or in different countries, are kept separate.
 */

const DEFAULT_WINDOW_MS = 12 * 60 * 60 * 1000; // 12h
const DEFAULT_OVERLAP = 0.5;

// Common headline/newswire noise that shouldn't drive similarity.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'over', 'into', 'after', 'amid', 'near',
  'says', 'said', 'new', 'has', 'have', 'will', 'that', 'this', 'are', 'was',
  'were', 'been', 'update', 'updates', 'breaking', 'live', 'watch', 'video',
  'report', 'reports', 'latest', 'news', 'about', 'more', 'than', 'its', 'their',
]);

export function significantTitleTokens(title: string): Set<string> {
  return new Set(
    (title || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 4 && !STOPWORDS.has(t)),
  );
}

export function locationAnchor(location: GeoLocation | undefined | null): string {
  if (!location) return 'global';
  if (location.countryCode) return `cc:${location.countryCode.toLowerCase()}`;
  if (location.region) return `rg:${location.region.toLowerCase()}`;
  if (Number.isFinite(location.lat) && Number.isFinite(location.lng)) {
    return `ll:${Math.round(location.lat)},${Math.round(location.lng)}`;
  }
  return 'global';
}

/** Significant title tokens with the location name removed — the anchor already
 *  encodes place, so the shared location word must not drive similarity. */
export function contentTokens(title: string, locationLabel?: string | null): Set<string> {
  const tokens = significantTitleTokens(title);
  if (locationLabel) {
    for (const locToken of significantTitleTokens(locationLabel)) {
      tokens.delete(locToken);
    }
  }
  return tokens;
}

/** Overlap coefficient: intersection over the smaller set (0..1). */
export function overlapCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / Math.min(a.size, b.size);
}

export interface DedupeOptions {
  /** Max time apart for two events to be considered the same happening. */
  windowMs?: number;
  /** Minimum content-token overlap coefficient to treat as a duplicate. */
  overlapThreshold?: number;
}

interface KeptSignature {
  tokens: Set<string>;
  anchor: string;
  category: GlobalEvent['category'];
  time: number;
}

export function dedupeGlobalEvents(
  events: GlobalEvent[],
  options: DedupeOptions = {},
): GlobalEvent[] {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const overlapThreshold = options.overlapThreshold ?? DEFAULT_OVERLAP;

  const kept: KeptSignature[] = [];
  const result: GlobalEvent[] = [];

  for (const event of events) {
    const tokens = contentTokens(event.title, event.location?.label);
    const anchor = locationAnchor(event.location);
    const time = new Date(event.timestamp).getTime();

    // With no significant tokens we can't judge similarity — keep it rather than
    // risk collapsing unrelated events.
    let isDuplicate = false;
    if (tokens.size > 0) {
      for (const sig of kept) {
        if (sig.category !== event.category) continue;
        if (sig.anchor !== anchor) continue;
        if (Number.isFinite(time) && Number.isFinite(sig.time) && Math.abs(sig.time - time) > windowMs) {
          continue;
        }
        if (overlapCoefficient(tokens, sig.tokens) >= overlapThreshold) {
          isDuplicate = true;
          break;
        }
      }
    }

    if (isDuplicate) continue;
    kept.push({ tokens, anchor, category: event.category, time });
    result.push(event);
  }

  return result;
}
