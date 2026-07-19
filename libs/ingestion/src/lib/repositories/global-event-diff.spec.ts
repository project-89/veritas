import { diffEventChanges } from './global-event.repository';

const base = {
  title: 'Gay top MP resigns over surrogacy controversy',
  severity: 'medium',
  location: { lat: 51.2, lng: 10.4, label: 'Germany' },
};

describe('diffEventChanges', () => {
  it('detects a retitle (the stealth-edit signal)', () => {
    const changes = diffEventChanges(base, {
      ...base,
      title: 'Senior MP resigns over surrogacy controversy',
    });
    expect(changes).toEqual([
      {
        field: 'title',
        previous: 'Gay top MP resigns over surrogacy controversy',
        next: 'Senior MP resigns over surrogacy controversy',
      },
    ]);
  });

  it('ignores whitespace/case-only title differences', () => {
    expect(
      diffEventChanges(base, { ...base, title: '  GAY TOP MP resigns over surrogacy controversy ' }),
    ).toEqual([]);
  });

  it('detects severity moves', () => {
    const changes = diffEventChanges(base, { ...base, severity: 'high' });
    expect(changes).toEqual([{ field: 'severity', previous: 'medium', next: 'high' }]);
  });

  it('detects location moves beyond coordinate noise, ignores jitter', () => {
    expect(
      diffEventChanges(base, { ...base, location: { lat: 51.3, lng: 10.5, label: 'Germany' } }),
    ).toEqual([]);
    const moved = diffEventChanges(base, {
      ...base,
      location: { lat: 48.0, lng: 3.0, label: 'France' },
    });
    expect(moved).toHaveLength(1);
    expect(moved[0]?.field).toBe('location');
  });

  it('returns [] for identical versions', () => {
    expect(diffEventChanges(base, { ...base })).toEqual([]);
  });
});
