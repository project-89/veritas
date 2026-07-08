import {
  type EngagementProvenance,
  getEngagementProvenance,
} from '../../src/lib/utils/engagement-provenance';

describe('getEngagementProvenance', () => {
  it('marks Reddit reach as inferred and shares as unavailable', () => {
    const p = getEngagementProvenance('reddit');
    expect(p.likes).toBe('real');
    expect(p.comments).toBe('real');
    expect(p.reach).toBe('inferred');
    expect(p.shares).toBe('unavailable');
  });

  it('marks RSS engagement as entirely unavailable', () => {
    const p = getEngagementProvenance('rss');
    const values = Object.values(p) as EngagementProvenance[keyof EngagementProvenance][];
    expect(values.every((v) => v === 'unavailable')).toBe(true);
  });

  it('marks Facebook (fabricated zeros) as entirely unavailable', () => {
    const p = getEngagementProvenance('facebook');
    expect(Object.values(p).every((v) => v === 'unavailable')).toBe(true);
  });

  it('reports YouTube views and likes as real', () => {
    const p = getEngagementProvenance('youtube');
    expect(p.views).toBe('real');
    expect(p.likes).toBe('real');
    expect(p.reach).toBe('unavailable');
  });

  it('is case-insensitive', () => {
    expect(getEngagementProvenance('BlueSky')).toEqual(getEngagementProvenance('bluesky'));
  });

  it('defaults unknown platforms to fully unavailable (under-claim, never over-claim)', () => {
    const p = getEngagementProvenance('some-new-source');
    expect(Object.values(p).every((v) => v === 'unavailable')).toBe(true);
  });
});
