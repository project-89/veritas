import { krippendorffAlpha } from './krippendorff';

const pair = (a: string, b: string) => ({ a, b });
const repeat = (p: { a: string; b: string }, n: number) => Array.from({ length: n }, () => p);

describe('krippendorffAlpha', () => {
  it('matches a hand-computed example', () => {
    // 10 binary items: both "1" ×4, both "0" ×4, disagree ×2.
    // D_o = 4/20 = 0.2; marginals 10/10 → D_e = 1 − 180/380 ≈ 0.5263;
    // α = 1 − 0.2/0.5263 = 0.62. Worked by hand, not by the code under test.
    const r = krippendorffAlpha([
      ...repeat(pair('1', '1'), 4),
      ...repeat(pair('0', '0'), 4),
      pair('1', '0'),
      pair('0', '1'),
    ]);

    expect(r.alpha).toBeCloseTo(0.62, 2);
    expect(r.observedDisagreement).toBeCloseTo(0.2, 5);
    expect(r.expectedDisagreement).toBeCloseTo(0.5263, 3);
  });

  it('reports 1 for perfect agreement with real variation', () => {
    const r = krippendorffAlpha([...repeat(pair('x', 'x'), 5), ...repeat(pair('y', 'y'), 5)]);
    expect(r.alpha).toBe(1);
  });

  it('scores a majority-class guesser near zero despite high accuracy', () => {
    // Gold: 95 absent / 5 present. Coder always says absent → 95% accuracy.
    // Chance correction is the whole point: that coder has learned NOTHING,
    // and α says so where accuracy flatters it.
    const r = krippendorffAlpha([
      ...repeat(pair('absent', 'absent'), 95),
      ...repeat(pair('present', 'absent'), 5),
    ]);

    expect(r.alpha).toBeLessThan(0.05);
    expect(r.alpha).toBeGreaterThan(-0.1);
  });

  it('goes negative on systematic disagreement', () => {
    const r = krippendorffAlpha([
      ...repeat(pair('x', 'y'), 10),
      ...repeat(pair('y', 'x'), 10),
    ]);
    expect(r.alpha).toBeLessThan(0);
  });

  it('drops items missing a value from either coder', () => {
    const r = krippendorffAlpha([
      ...repeat(pair('x', 'x'), 10),
      ...repeat(pair('y', 'y'), 2),
      { a: 'x', b: null },
      { a: undefined, b: 'y' },
    ]);
    expect(r.pairedItems).toBe(12);
    expect(r.alpha).toBe(1);
  });

  it('abstains below the stability floor', () => {
    const r = krippendorffAlpha(repeat(pair('x', 'x'), 5));
    expect(r.alpha).toBeNull();
    expect(r.insufficientReason).toMatch(/need >=10/);
  });

  it('abstains when there is no variation to agree about', () => {
    const r = krippendorffAlpha(repeat(pair('same', 'same'), 20));
    expect(r.alpha).toBeNull();
    expect(r.insufficientReason).toMatch(/no variation/);
  });
});
