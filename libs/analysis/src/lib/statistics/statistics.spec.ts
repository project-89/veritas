import { measureConcentration } from './concentration';
import { countIndependentSources, findNearDuplicates, jaccard, shingles } from './duplication';
import { measureTemporal } from './temporal';

describe('measureConcentration', () => {
  const many = (id: string, n: number): string[] => Array.from({ length: n }, () => id);

  it('reports near-zero Gini when everyone contributes equally', () => {
    const r = measureConcentration([...many('a', 5), ...many('b', 5), ...many('c', 5)]);
    expect(r.gini).toBeLessThan(0.05);
    expect(r.uniqueContributors).toBe(3);
  });

  it('reports high concentration when a few accounts dominate', () => {
    // 90 of 100 posts from one account is the shape we care about.
    const r = measureConcentration([...many('bot', 90), ...many('a', 1), ...many('b', 1),
      ...many('c', 1), ...many('d', 1), ...many('e', 1), ...many('f', 1), ...many('g', 1),
      ...many('h', 1), ...many('i', 1), ...many('j', 1)]);
    expect(r.gini).toBeGreaterThan(0.7);
    expect(r.hhi).toBeGreaterThan(0.7);
    expect(r.topContributors[0]).toMatchObject({ id: 'bot', count: 90 });
    expect(r.topContributors[0]!.share).toBeCloseTo(0.9, 2);
  });

  it('abstains rather than reporting a confident number on thin data', () => {
    // Three posts from two accounts gives an arithmetically valid Gini that
    // means nothing.
    const r = measureConcentration(['a', 'a', 'b']);
    expect(r.gini).toBeNull();
    expect(r.hhi).toBeNull();
    expect(r.insufficientReason).toMatch(/need >=10 items/);
  });

  it('still reports the evidence when abstaining', () => {
    const r = measureConcentration(['a', 'a', 'b']);
    expect(r.totalItems).toBe(3);
    expect(r.topContributors).toHaveLength(2);
  });
});

describe('measureTemporal', () => {
  const at = (...minutes: number[]): string[] =>
    minutes.map((m) => new Date(Date.UTC(2026, 0, 1, 0, m)).toISOString());

  it('rates evenly spaced posting as low burstiness', () => {
    // Machine-like regularity: identical gaps -> CV near 0.
    const r = measureTemporal(at(0, 10, 20, 30, 40, 50, 60, 70, 80));
    expect(r.burstiness).toBeLessThan(0.1);
  });

  it('rates a spike as high burstiness with a dominant window', () => {
    // Eight posts inside a minute, then one much later.
    const r = measureTemporal(at(0, 0, 0, 0, 0, 0, 0, 0, 600));
    expect(r.burstiness).toBeGreaterThan(1);
    expect(r.peakWindowShare).toBeGreaterThan(0.8);
  });

  it('abstains on too few timestamps', () => {
    const r = measureTemporal(at(0, 5, 10));
    expect(r.burstiness).toBeNull();
    expect(r.insufficientReason).toMatch(/need >=8/);
  });

  it('treats identical timestamps as undefined rather than dividing by zero', () => {
    const r = measureTemporal(at(0, 0, 0, 0, 0, 0, 0, 0));
    expect(r.burstiness).toBeNull();
    expect(r.insufficientReason).toMatch(/one timestamp/);
  });

  it('ignores unparseable timestamps instead of throwing', () => {
    const r = measureTemporal([...at(0, 10, 20, 30, 40, 50, 60, 70), 'not-a-date']);
    expect(r.itemCount).toBe(8);
  });
});

describe('shingling', () => {
  it('is order sensitive, so reordered text is not a duplicate', () => {
    const a = shingles('the quick brown fox jumps over the lazy dog today');
    const b = shingles('today dog lazy the over jumps fox brown quick the');
    expect(jaccard(a, b)).toBeLessThan(0.2);
  });

  it('scores identical text as 1', () => {
    const t = 'nuclear plants reduced output because river water was too warm';
    expect(jaccard(shingles(t), shingles(t))).toBe(1);
  });
});

describe('findNearDuplicates', () => {
  const BASE = 'Romania has taken its only nuclear reactor offline because Danube water levels fell';

  it('clusters copy-paste amplification', () => {
    const r = findNearDuplicates([
      BASE,
      `${BASE} today`,
      `Breaking: ${BASE}`,
      'Completely unrelated post about a football match at the weekend',
    ]);

    expect(r.largestClusterSize).toBe(3);
    expect(r.duplicateRate).toBeCloseTo(0.75, 2);
  });

  it('does NOT cluster independent reporting of the same event', () => {
    // This is the distinction the whole thing rests on: same meaning, and
    // genuinely different wording, is corroboration — not duplication.
    const r = findNearDuplicates([
      'Romania has taken its only nuclear reactor offline because Danube water levels fell',
      'Low water on the Danube forced Cernavoda to disconnect a unit from the grid this week',
      'Drought conditions in southeastern Europe have curtailed atomic generation capacity',
      'The Romanian operator said cooling constraints required reducing output at the plant',
    ]);

    expect(r.clusters).toHaveLength(0);
    expect(r.duplicateRate).toBe(0);
  });

  it('abstains on too few items', () => {
    const r = findNearDuplicates([BASE, BASE]);
    expect(r.duplicateRate).toBeNull();
    expect(r.insufficientReason).toMatch(/need >=4/);
  });

  it('links a drifting copy-paste chain transitively', () => {
    // A~B and B~C both clear the threshold, but A~C does not — the text has
    // drifted at both ends. Single linkage still recognises one propagating
    // text, which is the point: copy-paste chains mutate as they spread.
    const mid = 'four five six seven eight nine ten eleven twelve thirteen fourteen';
    const a = `one two three ${mid} fifteen sixteen seventeen`;
    const b = `one two three ${mid} alpha beta gamma`;
    const c = `xray yankee zulu ${mid} alpha beta gamma`;

    const r = findNearDuplicates([a, b, c, 'wholly unrelated commentary regarding weekend sport']);

    expect(r.largestClusterSize).toBe(3);
    // Confirm it really is transitive: the end pair alone would not link.
    expect(jaccard(shingles(a), shingles(c))).toBeLessThan(0.6);
    expect(jaccard(shingles(a), shingles(b))).toBeGreaterThanOrEqual(0.6);
  });
});

describe('countIndependentSources', () => {
  const WIRE = 'Reuters reports the reactor was disconnected after river temperatures rose';

  it('collapses syndicated copy to a single source', () => {
    // Four outlets, one wire story. That is ONE source, not four.
    const r = countIndependentSources([
      { text: WIRE, sourceKey: 'outletA' },
      { text: WIRE, sourceKey: 'outletB' },
      { text: `${WIRE}.`, sourceKey: 'outletC' },
      { text: WIRE, sourceKey: 'outletD' },
    ]);

    expect(r.rawCount).toBe(4);
    expect(r.independentCount).toBe(1);
    expect(r.collapsed.some((c) => c.reason === 'shared-text')).toBe(true);
  });

  it('collapses outlets sharing an owner', () => {
    const r = countIndependentSources([
      { text: 'Independently worded report number one about the shutdown event', sourceKey: 'megacorp' },
      { text: 'A different account of the incident with entirely separate phrasing', sourceKey: 'megacorp' },
      { text: 'Yet another distinct writeup using its own words and framing here', sourceKey: 'other' },
    ]);

    expect(r.rawCount).toBe(3);
    expect(r.independentCount).toBe(2);
  });

  it('counts genuinely independent reporting as independent', () => {
    const r = countIndependentSources([
      { text: 'Romania disconnected a reactor as Danube levels dropped sharply', sourceKey: 'a' },
      { text: 'Cooling constraints forced the operator to curtail generation output', sourceKey: 'b' },
      { text: 'Drought across the region has reduced atomic capacity this summer', sourceKey: 'c' },
      { text: 'The plant reduced power because intake temperatures exceeded limits', sourceKey: 'd' },
    ]);

    expect(r.independentCount).toBe(4);
  });

  it('does not double-count an item that is both same-owner and same-text', () => {
    const r = countIndependentSources([
      { text: WIRE, sourceKey: 'megacorp' },
      { text: WIRE, sourceKey: 'megacorp' },
      { text: 'A wholly separate report written independently by another desk', sourceKey: 'indie' },
    ]);

    expect(r.independentCount).toBe(2);
  });
});
