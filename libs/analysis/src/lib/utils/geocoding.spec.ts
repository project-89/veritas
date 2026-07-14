import { geocodeFromText } from './geocoding';

describe('geocodeFromText', () => {
  it('finds a country named in a headline and returns coordinates', () => {
    const r = geocodeFromText('Protests erupt across France after new law');
    expect(r).not.toBeNull();
    expect(r?.label).toBe('France');
    expect(Number.isFinite(r?.lat)).toBe(true);
    expect(Number.isFinite(r?.lng)).toBe(true);
  });

  it('prefers the more specific (longer) country name', () => {
    const r = geocodeFromText('South Korea and North Korea resume talks');
    // Longest-first ordering means a multi-word name wins over a bare "Korea".
    expect(r?.label === 'South Korea' || r?.label === 'North Korea').toBe(true);
  });

  it('matches whole words only, not substrings', () => {
    // "Chinatown" must not match "China".
    expect(geocodeFromText('A festival in Chinatown')).toBeNull();
  });

  it('returns null when no country is present', () => {
    expect(geocodeFromText('Markets rally on tech earnings')).toBeNull();
    expect(geocodeFromText('')).toBeNull();
  });
});
