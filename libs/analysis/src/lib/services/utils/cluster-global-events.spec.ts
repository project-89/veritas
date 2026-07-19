import type { GlobalEvent } from '../../types/global-event';
import { clusterGlobalEvents, perspectiveOf } from './cluster-global-events';

function makeEvent(overrides: Partial<GlobalEvent>): GlobalEvent {
  return {
    id: overrides.id ?? `id-${Math.abs(JSON.stringify(overrides).length)}`,
    source: overrides.source ?? 'RSS:Test',
    category: overrides.category ?? 'political',
    severity: overrides.severity ?? 'medium',
    title: overrides.title ?? 'Untitled',
    description: overrides.description ?? '',
    timestamp: overrides.timestamp ?? '2026-07-19T12:00:00.000Z',
    location:
      overrides.location ?? { lat: 32.4, lng: 53.7, label: 'Iran', region: 'geocoded' },
    magnitude: overrides.magnitude ?? 0.5,
    metadata: overrides.metadata ?? {},
    expiresAt: overrides.expiresAt ?? '2026-07-26T12:00:00.000Z',
  } as GlobalEvent;
}

describe('perspectiveOf', () => {
  it('derives the class from ownership + audience metadata', () => {
    expect(
      perspectiveOf(makeEvent({ metadata: { feedOwnership: 'state-media', feedAudience: 'domestic' } })),
    ).toBe('state-domestic');
    expect(
      perspectiveOf(makeEvent({ metadata: { feedOwnership: 'state-media', feedAudience: 'international' } })),
    ).toBe('state-international');
    expect(perspectiveOf(makeEvent({ metadata: { feedOwnership: 'public-broadcaster' } }))).toBe(
      'public-broadcaster',
    );
    expect(perspectiveOf(makeEvent({ metadata: {} }))).toBe('independent');
  });
});

describe('clusterGlobalEvents', () => {
  it('groups the same story across outlets and perspective classes', () => {
    const events = [
      makeEvent({
        id: 'tass',
        title: 'US completed another series of strikes on Iran',
        metadata: { feedOwnership: 'state-media', feedAudience: 'domestic' },
      }),
      makeEvent({
        id: 'presstv',
        title: 'US strikes on Iran prove Washington cannot be trusted',
        metadata: { feedOwnership: 'state-media', feedAudience: 'international' },
      }),
      makeEvent({
        id: 'bbc',
        title: 'US carries out fresh strikes on Iran nuclear sites',
        metadata: { feedOwnership: 'public-broadcaster' },
      }),
    ];
    const clusters = clusterGlobalEvents(events);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.events).toHaveLength(3);
    expect(new Set(clusters[0]?.perspectives)).toEqual(
      new Set(['state-domestic', 'state-international', 'public-broadcaster']),
    );
  });

  it('groups across differing feed categories (political vs media)', () => {
    const events = [
      makeEvent({ id: 'a', category: 'political', title: 'US strikes Iran airbase overnight' }),
      makeEvent({ id: 'b', category: 'media', title: 'Iran airbase hit by US strikes' }),
    ];
    expect(clusterGlobalEvents(events)).toHaveLength(1);
  });

  it('does not group unrelated stories', () => {
    const events = [
      makeEvent({ id: 'a', title: 'US strikes Iran airbase overnight' }),
      makeEvent({
        id: 'b',
        title: 'Wildfire evacuation ordered in California mountains',
        location: { lat: 37, lng: -120, label: 'California', region: 'geocoded' },
      }),
    ];
    expect(clusterGlobalEvents(events)).toHaveLength(2);
  });

  it('does not group confidently-geocoded events in different places', () => {
    const events = [
      makeEvent({
        id: 'a',
        title: 'Explosion reported at military base',
        location: { lat: 32.4, lng: 53.7, label: 'Iran', region: 'geocoded' },
      }),
      makeEvent({
        id: 'b',
        title: 'Explosion reported at military base',
        location: { lat: 50.4, lng: 30.5, label: 'Ukraine', region: 'geocoded' },
      }),
    ];
    expect(clusterGlobalEvents(events)).toHaveLength(2);
  });

  it('lets region-fallback locations join a geocoded cluster (outlet home != story location)', () => {
    const events = [
      makeEvent({
        id: 'bbc',
        title: 'US strikes Iran airbase overnight',
        location: { lat: 32.4, lng: 53.7, label: 'Iran', region: 'geocoded' },
      }),
      makeEvent({
        id: 'ria',
        title: 'US strikes on Iran airbase continue',
        // RIA headline that didn't geocode → anchored to Russia (feed home).
        location: { lat: 61.5, lng: 105.0, label: 'russia', region: 'russia' },
        metadata: { feedOwnership: 'state-media', feedAudience: 'domestic' },
      }),
    ];
    expect(clusterGlobalEvents(events)).toHaveLength(1);
  });

  it('splits same-topic stories far apart in time', () => {
    const events = [
      makeEvent({ id: 'a', title: 'US strikes Iran airbase overnight', timestamp: '2026-07-01T00:00:00.000Z' }),
      makeEvent({ id: 'b', title: 'US strikes Iran airbase again', timestamp: '2026-07-19T00:00:00.000Z' }),
    ];
    expect(clusterGlobalEvents(events)).toHaveLength(2);
  });

  it('prefers a non-state-domestic representative headline', () => {
    const events = [
      makeEvent({
        id: 'ria',
        title: 'Enemy strikes repelled heroically over Iran',
        metadata: { feedOwnership: 'state-media', feedAudience: 'domestic' },
      }),
      makeEvent({
        id: 'bbc',
        title: 'US strikes Iran in overnight raid',
        metadata: { feedOwnership: 'public-broadcaster' },
      }),
    ];
    const clusters = clusterGlobalEvents(events);
    expect(clusters[0]?.title).toBe('US strikes Iran in overnight raid');
  });
});
