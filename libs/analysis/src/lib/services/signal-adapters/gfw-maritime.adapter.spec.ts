import { mapGfwEvents } from './gfw-maritime.adapter';

// Documented GFW /v3/events response shape (globalfishingwatch.org/our-apis).
const encounter = {
  id: 'evt-1',
  type: 'encounter',
  start: '2026-07-19T10:00:00.000Z',
  end: '2026-07-19T14:00:00.000Z',
  position: { lat: 25.4, lon: 56.3 },
  vessel: { id: 'v1', name: 'SHADOW STAR', ssvid: '412000000', flag: 'IRN' },
  regions: { eez: ['Oman'], rfmo: [] },
};

const gap = {
  id: 'evt-2',
  type: 'gap',
  start: '2026-07-18T02:00:00.000Z',
  end: '2026-07-18T20:00:00.000Z',
  position: { lat: 12.1, lon: 43.3 },
  vessel: { name: 'DARK RUNNER', ssvid: '577000000' },
  regions: { eez: [] },
};

describe('mapGfwEvents', () => {
  it('maps an encounter to a ship-to-ship signal with provenance', () => {
    const [sig] = mapGfwEvents([encounter]);
    expect(sig?.source).toBe('Global Fishing Watch');
    expect(sig?.title).toContain('Ship-to-ship encounter');
    expect(sig?.title).toContain('SHADOW STAR');
    expect(sig?.title).toContain('IRN');
    expect(sig?.metadata['coordinates']).toEqual({ latitude: 25.4, longitude: 56.3 });
    expect(sig?.metadata['gfwEventType']).toBe('encounter');
    expect(sig?.metadata['eez']).toEqual(['Oman']);
    // ends dominate the timestamp (event conclusion).
    expect(sig?.timestamp).toBe('2026-07-19T14:00:00.000Z');
  });

  it('ranks a dark-vessel gap above a routine port visit', () => {
    const [gapSig] = mapGfwEvents([gap]);
    const [portSig] = mapGfwEvents([{ ...gap, id: 'p', type: 'port_visit' }]);
    expect(gapSig?.magnitude).toBeGreaterThan(portSig?.magnitude ?? 1);
    expect(gapSig?.title).toContain('went dark');
  });

  it('skips events without a valid position', () => {
    expect(mapGfwEvents([{ ...encounter, position: undefined }])).toHaveLength(0);
    expect(mapGfwEvents([{ ...encounter, position: { lat: 25.4 } }])).toHaveLength(0);
  });

  it('falls back to ssvid when the vessel has no name', () => {
    const [sig] = mapGfwEvents([gap]);
    expect(sig?.title).toContain('DARK RUNNER');
    const [anon] = mapGfwEvents([{ ...gap, vessel: { ssvid: '999' } }]);
    expect(anon?.title).toContain('999');
  });

  it('returns [] for an empty feed', () => {
    expect(mapGfwEvents([])).toEqual([]);
  });
});
