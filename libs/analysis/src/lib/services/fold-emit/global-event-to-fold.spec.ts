import type { GlobalEvent } from '../../types/global-event';
import { globalEventToFold } from './global-event-to-fold';

function makeEvent(overrides: Partial<GlobalEvent> = {}): GlobalEvent {
  return {
    id: 'rss-BBC-romania-reactor',
    source: 'RSS:BBC World',
    category: 'political',
    severity: 'medium',
    title: 'Romania shuts down its only nuclear reactor',
    description: 'Low Danube water levels forced the shutdown.',
    timestamp: '2026-08-14T12:30:00.000Z',
    location: { lat: 44.4, lng: 28.0, label: 'Romania', region: 'geocoded', countryCode: 'RO' },
    magnitude: 0.5,
    metadata: {},
    expiresAt: '2026-08-21T12:30:00.000Z',
    ...overrides,
  } as GlobalEvent;
}

describe('globalEventToFold', () => {
  it('produces a well-formed 0.7 record with a stable urn id', () => {
    const out = globalEventToFold(makeEvent());

    expect(out.specVersion).toBe('0.7');
    expect(out.id).toBe('urn:veritas:event:rss-BBC-romania-reactor');
    expect(out.author.kind).toBe('ingest');
    expect(out.at.t).toBe(Date.parse('2026-08-14T12:30:00.000Z'));
    expect(out.at.worldDate).toBe('2026-08-14T12:30');
    expect(out.capture.scope.workspace).toBe('veritas');
    expect(out.changes.length).toBeGreaterThan(0);
  });

  it('marks source-reported values observed and our classifications derived', () => {
    const out = globalEventToFold(makeEvent());
    const byComponent = (c: string) =>
      out.changes.find((ch) => 'component' in ch && ch.component === c);

    // The source said this.
    expect(byComponent('x.veritas.headline')?.provenance?.basis).toBe('observed');
    // We decided this.
    expect(byComponent('x.veritas.category')?.provenance?.basis).toBe('derived');
    expect(byComponent('x.veritas.severity')?.provenance?.basis).toBe('derived');
  });

  it('never asserts causation — causedBy stays empty at this layer', () => {
    // The only causal signal available here is temporal ordering, which is
    // exactly the inference causal Phase 0 removed.
    expect(globalEventToFold(makeEvent()).causedBy).toBeUndefined();
  });

  it('emits magnitude as estimated with no invented confidence', () => {
    const out = globalEventToFold(makeEvent());

    expect(out.magnitude?.basis).toBe('estimated');
    expect(out.magnitude?.confidence).toBeUndefined();
    expect(out.magnitude?.value).toBe(0.5);
  });

  it('distinguishes a real geocode from a region-centroid placeholder', () => {
    const geocoded = globalEventToFold(makeEvent());
    const centroid = globalEventToFold(
      makeEvent({
        location: { lat: 20, lng: 0, label: 'Global', region: 'global' },
      } as Partial<GlobalEvent>),
    );

    const conf = (e: ReturnType<typeof globalEventToFold>) =>
      e.changes.find((c) => 'component' in c && c.component === 'core.position')?.provenance
        ?.confidence;

    expect(conf(geocoded)).toBe(0.8);
    // A centroid is a placeholder for an unknown position, not a location.
    expect(conf(centroid)).toBe(0.2);
  });

  it('carries source ownership and translation provenance when present', () => {
    const out = globalEventToFold(
      makeEvent({
        metadata: { feedOwnership: 'state-media', originalLanguage: 'ru', translated: true },
      }),
    );
    const components = out.changes
      .filter((c) => 'component' in c)
      .map((c) => (c as { component: string }).component);

    expect(components).toContain('x.veritas.source-ownership');
    expect(components).toContain('x.veritas.original-language');
    expect(components).toContain('x.veritas.translated');
  });

  it('records a failed translation as estimated rather than derived', () => {
    const out = globalEventToFold(
      makeEvent({ metadata: { originalLanguage: 'ru', translated: false } }),
    );
    const mark = out.changes.find(
      (c) => 'component' in c && c.component === 'x.veritas.translated',
    );

    // translated:false means we showed the original untranslated — a consumer
    // must be able to tell that apart from a successful translation.
    expect(mark?.provenance?.basis).toBe('estimated');
  });
});
