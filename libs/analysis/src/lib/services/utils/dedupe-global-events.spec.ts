import type { GlobalEvent } from '../../types/global-event';
import { dedupeGlobalEvents, sameLocation, significantTitleTokens } from './dedupe-global-events';

function makeEvent(overrides: Partial<GlobalEvent>): GlobalEvent {
  return {
    id: overrides.id ?? 'id-1',
    source: overrides.source ?? 'test',
    category: overrides.category ?? 'environmental',
    severity: overrides.severity ?? 'medium',
    title: overrides.title ?? 'Untitled',
    description: overrides.description ?? '',
    timestamp: overrides.timestamp ?? '2026-07-13T12:00:00.000Z',
    location: overrides.location ?? { lat: -21, lng: 165, label: 'New Caledonia', countryCode: 'NC' },
    magnitude: overrides.magnitude ?? 1,
    metadata: overrides.metadata ?? {},
    expiresAt: overrides.expiresAt ?? '2026-07-20T12:00:00.000Z',
  } as GlobalEvent;
}

describe('significantTitleTokens', () => {
  it('drops stopwords and short tokens', () => {
    const tokens = significantTitleTokens('Breaking: Earthquake in New Caledonia');
    expect(tokens.has('earthquake')).toBe(true);
    expect(tokens.has('caledonia')).toBe(true);
    expect(tokens.has('new')).toBe(false); // short
    expect(tokens.has('breaking')).toBe(false); // stopword
  });
});

describe('sameLocation', () => {
  it('matches on country code when both are known', () => {
    expect(
      sameLocation(
        { lat: 1, lng: 2, label: 'x', countryCode: 'NC' },
        { lat: 40, lng: 90, label: 'y', countryCode: 'NC' },
      ),
    ).toBe(true);
    expect(
      sameLocation(
        { lat: 1, lng: 2, label: 'x', countryCode: 'NC' },
        { lat: 1, lng: 2, label: 'y', countryCode: 'JP' },
      ),
    ).toBe(false);
  });

  it('falls back to geographic proximity when a country code is missing', () => {
    // ~1.7° apart — same happening from two sources with slightly different coords.
    expect(
      sameLocation(
        { lat: -56.3, lng: -27.5, label: 'South Sandwich Islands' },
        { lat: -57.0, lng: -26.0, label: 'South Sandwich Islands Region' },
      ),
    ).toBe(true);
    // Far apart → distinct.
    expect(
      sameLocation(
        { lat: -56.3, lng: -27.5, label: 'a' },
        { lat: 35, lng: 139, label: 'b' },
      ),
    ).toBe(false);
  });

  it('treats the antimeridian as continuous', () => {
    expect(
      sameLocation({ lat: 0, lng: 179, label: 'a' }, { lat: 0, lng: -179, label: 'b' }),
    ).toBe(true);
  });
});

describe('dedupeGlobalEvents', () => {
  it('collapses the same happening reported by multiple sources', () => {
    const events = [
      makeEvent({ id: 'usgs-1', source: 'USGS', title: 'M6.2 Earthquake strikes New Caledonia' }),
      makeEvent({ id: 'gdacs-1', source: 'GDACS', title: 'Earthquake in New Caledonia' }),
      makeEvent({ id: 'rss-1', source: 'Reuters', title: 'Powerful earthquake hits New Caledonia region' }),
    ];
    const result = dedupeGlobalEvents(events);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('usgs-1'); // first wins
  });

  it('collapses the same quake reported with slightly different coords and no country code', () => {
    const events = [
      makeEvent({
        id: 'usgs-ss',
        source: 'USGS',
        title: 'M4.9 Earthquake — South Sandwich Islands region',
        location: { lat: -56.3, lng: -27.5, label: 'South Sandwich Islands region' },
      }),
      makeEvent({
        id: 'news-ss',
        source: 'GDACS',
        title: 'Earthquake in South Sandwich Islands Region',
        location: { lat: -57.0, lng: -26.2, label: 'South Sandwich Islands Region' },
      }),
    ];
    const result = dedupeGlobalEvents(events);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('usgs-ss');
  });

  it('keeps distinct same-source events with generic titles (e.g. EONET wildfires)', () => {
    // Two separate wildfires from the same source near each other must NOT merge
    // just because they share the word "wildfire" — only cross-source dupes do.
    const events = [
      makeEvent({ id: 'eonet-1', source: 'NASA EONET', title: 'Wildfire', location: { lat: 37, lng: -120, label: 'Wildfire' } }),
      makeEvent({ id: 'eonet-2', source: 'NASA EONET', title: 'Wildfire', location: { lat: 38, lng: -121, label: 'Wildfire' } }),
    ];
    expect(dedupeGlobalEvents(events)).toHaveLength(2);
  });

  it('keeps genuinely distinct events at the same location', () => {
    const events = [
      makeEvent({ id: 'a', title: 'Earthquake in New Caledonia' }),
      makeEvent({ id: 'b', title: 'Cyclone approaches New Caledonia coast' }),
    ];
    expect(dedupeGlobalEvents(events)).toHaveLength(2);
  });

  it('keeps same-title events far apart in time (distinct occurrences)', () => {
    const events = [
      makeEvent({ id: 'a', title: 'Earthquake in New Caledonia', timestamp: '2026-07-01T00:00:00.000Z' }),
      makeEvent({ id: 'b', title: 'Earthquake in New Caledonia', timestamp: '2026-07-13T00:00:00.000Z' }),
    ];
    expect(dedupeGlobalEvents(events)).toHaveLength(2);
  });

  it('collapses same-location repeats within a wide window (feed read-path)', () => {
    // GDACS country-level report + USGS specific report of the same quake, but
    // landing ~2 days apart — the feed dedup window must span that.
    const events = [
      makeEvent({
        id: 'gdacs',
        source: 'GDACS',
        title: 'Earthquake in Philippines',
        location: { lat: 5.18, lng: 125.68, label: 'Philippines' },
        timestamp: '2026-07-14T08:00:00.000Z',
      }),
      makeEvent({
        id: 'usgs',
        source: 'USGS',
        title: 'M5.2 Earthquake — 56 km SSW of Sarangani, Philippines',
        location: { lat: 4.94, lng: 125.24, label: '56 km SSW of Sarangani, Philippines' },
        timestamp: '2026-07-12T08:00:00.000Z',
      }),
    ];
    // Default 12h window keeps them; a 7-day feed window collapses them.
    expect(dedupeGlobalEvents(events)).toHaveLength(2);
    expect(dedupeGlobalEvents(events, { windowMs: 7 * 24 * 60 * 60 * 1000 })).toHaveLength(1);
  });

  it('does not merge similar titles in different countries', () => {
    const events = [
      makeEvent({ id: 'a', title: 'Earthquake reported', location: { lat: -21, lng: 165, label: 'NC', countryCode: 'NC' } }),
      makeEvent({ id: 'b', title: 'Earthquake reported', location: { lat: 35, lng: 139, label: 'JP', countryCode: 'JP' } }),
    ];
    expect(dedupeGlobalEvents(events)).toHaveLength(2);
  });

  it('keeps events across different categories', () => {
    const events = [
      makeEvent({ id: 'a', category: 'environmental', title: 'Flooding hits coastal towns' }),
      makeEvent({ id: 'b', category: 'political', title: 'Flooding hits coastal towns' }),
    ];
    expect(dedupeGlobalEvents(events)).toHaveLength(2);
  });
});
