import type { GlobalEvent } from '../../types/global-event';
import { dedupeGlobalEvents, locationAnchor, significantTitleTokens } from './dedupe-global-events';

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

describe('locationAnchor', () => {
  it('prefers country code, then region, then a lat/lng cell', () => {
    expect(locationAnchor({ lat: 1, lng: 2, label: 'x', countryCode: 'NC' })).toBe('cc:nc');
    expect(locationAnchor({ lat: 1, lng: 2, label: 'x', region: 'Pacific' })).toBe('rg:pacific');
    expect(locationAnchor({ lat: 1.4, lng: 2.6, label: 'x' })).toBe('ll:1,3');
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
