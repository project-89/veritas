import { benjaminiHochberg } from './multiple-comparisons';
import { compareToNull } from './null-model';

/** Deterministic pseudo-random so these tests never flake. */
function seededNormals(n: number, mean: number, sd: number, seed = 42): number[] {
  let s = seed;
  const rand = (): number => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    // Box-Muller
    const u1 = Math.max(rand(), 1e-12);
    const u2 = rand();
    out.push(mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2));
  }
  return out;
}

describe('compareToNull', () => {
  it('flags an observation far above the null', () => {
    const nulls = seededNormals(500, 10, 2);
    const r = compareToNull(25, nulls, 'greater');

    expect(r.expected).toBeCloseTo(10, 0);
    expect(r.pValue).toBeLessThan(0.01);
    expect(r.effectSize).toBeGreaterThan(5);
    expect(r.percentile).toBeGreaterThan(0.99);
  });

  it('does NOT flag an observation sitting inside the null', () => {
    // This is the case the system currently gets wrong everywhere: something
    // co-occurred, but no more than usual.
    const nulls = seededNormals(500, 10, 2);
    const r = compareToNull(10.5, nulls, 'greater');

    expect(r.pValue).toBeGreaterThan(0.2);
    expect(Math.abs(r.effectSize as number)).toBeLessThan(1);
  });

  it('never reports p = 0, however extreme the observation', () => {
    // A permutation test can only say "none of my N samples reached this".
    // Reporting 0 would claim certainty no sample size supports.
    const r = compareToNull(1e9, seededNormals(200, 10, 2), 'greater');

    expect(r.pValue).toBeGreaterThan(0);
    expect(r.pValue).toBeCloseTo(1 / 201, 5);
  });

  it('abstains when there are too few null samples', () => {
    const r = compareToNull(25, seededNormals(20, 10, 2));

    expect(r.pValue).toBeNull();
    expect(r.effectSize).toBeNull();
    expect(r.insufficientReason).toMatch(/need >=50 null samples/);
  });

  it('abstains on effect size when the null has no spread', () => {
    // Dividing by zero would render as a spectacular, meaningless effect.
    const r = compareToNull(5, new Array(100).fill(3));

    expect(r.effectSize).toBeNull();
    expect(r.insufficientReason).toMatch(/zero variance/);
    // The p-value is still meaningful: nothing in the null reached 5.
    expect(r.pValue).toBeCloseTo(1 / 101, 5);
  });

  it('supports a lower tail for statistics where "unusually few" is the signal', () => {
    const nulls = seededNormals(500, 10, 2);
    expect(compareToNull(2, nulls, 'less').pValue).toBeLessThan(0.01);
    expect(compareToNull(2, nulls, 'greater').pValue).toBeGreaterThan(0.9);
  });
});

describe('benjaminiHochberg', () => {
  it('reproduces the textbook worked example', () => {
    // Benjamini & Hochberg (1995), the classic 15-hypothesis example.
    // At FDR 0.05 the first four are rejected.
    const ps = [
      0.0001, 0.0004, 0.0019, 0.0095, 0.0201, 0.0278, 0.0298, 0.0344, 0.0459, 0.324, 0.4262,
      0.5719, 0.6528, 0.759, 1.0,
    ];
    const out = benjaminiHochberg(
      ps.map((p, i) => ({ item: i, pValue: p })),
      0.05,
    );

    expect(out.testsPerformed).toBe(15);
    expect(out.significantCount).toBe(4);
    expect(out.results.filter((r) => r.significant).map((r) => r.item)).toEqual([0, 1, 2, 3]);
  });

  it('keeps q-values monotone in raw p', () => {
    const out = benjaminiHochberg(
      [0.001, 0.01, 0.02, 0.04, 0.2, 0.9].map((p, i) => ({ item: i, pValue: p })),
    );
    const qs = out.results.map((r) => r.qValue);

    for (let i = 1; i < qs.length; i++) {
      expect(qs[i]).toBeGreaterThanOrEqual(qs[i - 1] as number);
    }
    expect(Math.max(...qs)).toBeLessThanOrEqual(1);
  });

  it('suppresses the best-of-noise winner that raw p would pass', () => {
    // 100 pure-noise tests: the smallest p will look "significant" at 0.05 by
    // construction. That is the defect this exists to prevent.
    const noise = Array.from({ length: 100 }, (_, i) => ({
      item: i,
      pValue: (i + 1) / 101,
    }));
    const out = benjaminiHochberg(noise, 0.05);

    expect(noise[0]!.pValue).toBeLessThan(0.05); // raw p would pass
    expect(out.significantCount).toBe(0); // corrected, it does not
  });

  it('reports how many tests were run', () => {
    const out = benjaminiHochberg([{ item: 'a', pValue: 0.01 }]);
    expect(out.testsPerformed).toBe(1);
  });

  it('preserves input order in the results', () => {
    const out = benjaminiHochberg([
      { item: 'high', pValue: 0.9 },
      { item: 'low', pValue: 0.001 },
    ]);
    expect(out.results.map((r) => r.item)).toEqual(['high', 'low']);
  });

  it('drops non-finite p-values rather than corrupting the ranking', () => {
    const out = benjaminiHochberg([
      { item: 'ok', pValue: 0.01 },
      { item: 'abstained', pValue: Number.NaN },
    ]);
    expect(out.testsPerformed).toBe(1);
  });

  it('handles an empty set', () => {
    expect(benjaminiHochberg([]).testsPerformed).toBe(0);
  });
});
