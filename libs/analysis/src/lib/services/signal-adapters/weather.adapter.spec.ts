import { classifyWeather, WEATHER_LOCATIONS, type WeatherReading } from './weather.adapter';

function reading(o: Partial<WeatherReading>): WeatherReading {
  return {
    location: { name: 'Test', lat: 0, lng: 0 },
    tempMax: null,
    tempMin: null,
    precipSum: null,
    windMax: null,
    ...o,
  };
}

describe('classifyWeather', () => {
  it('returns null for benign conditions', () => {
    expect(classifyWeather(reading({ tempMax: 28, tempMin: 15, precipSum: 3, windMax: 20 }))).toBeNull();
  });

  it('flags extreme heat, escalating to critical past 45C', () => {
    expect(classifyWeather(reading({ tempMax: 41 }))?.severity).toBe('high');
    expect(classifyWeather(reading({ tempMax: 47 }))?.severity).toBe('critical');
    expect(classifyWeather(reading({ tempMax: 41 }))?.kind).toBe('heat');
  });

  it('flags extreme cold, rain, and wind', () => {
    expect(classifyWeather(reading({ tempMin: -30 }))?.kind).toBe('cold');
    expect(classifyWeather(reading({ precipSum: 60 }))?.kind).toBe('rain');
    expect(classifyWeather(reading({ windMax: 90 }))?.kind).toBe('wind');
    expect(classifyWeather(reading({ windMax: 110 }))?.severity).toBe('critical');
  });

  it('picks the most severe breach when several conditions qualify', () => {
    // high heat + critical wind → critical wind wins
    const s = classifyWeather(reading({ tempMax: 41, windMax: 110 }));
    expect(s?.severity).toBe('critical');
    expect(s?.kind).toBe('wind');
  });

  it('has a curated, non-empty global location set', () => {
    expect(WEATHER_LOCATIONS.length).toBeGreaterThan(40);
    // spans hemispheres
    expect(WEATHER_LOCATIONS.some((l) => l.lat > 40)).toBe(true);
    expect(WEATHER_LOCATIONS.some((l) => l.lat < -20)).toBe(true);
  });
});
