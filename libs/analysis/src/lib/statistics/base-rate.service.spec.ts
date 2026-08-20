import { type ArchivedEvent, BaseRateService, type BaseRateStore } from './base-rate.service';

const DAY = 24 * 60 * 60 * 1000;
const CORPUS_START = Date.UTC(2026, 0, 1);
const CORPUS_END = Date.UTC(2026, 6, 1);

/**
 * Store backed by a synthetic archive with a KNOWN background rate, so the
 * service's output can be checked against the right answer rather than against
 * itself.
 */
function makeStore(eventsPerDay: number, spike?: { startMs: number; count: number }): BaseRateStore {
  const events: ArchivedEvent[] = [];
  let id = 0;
  let day = 0;
  for (let t = CORPUS_START; t < CORPUS_END; t += DAY) {
    // Vary the daily count deterministically. A perfectly constant background
    // has ZERO variance, which makes effect size undefined — realistic corpora
    // fluctuate, and a fixture that does not would test the wrong thing.
    const jitter = [-1, 0, 1, 2, 0, -1, 1][day % 7] as number;
    const todaysCount = Math.max(1, eventsPerDay + jitter);
    day++;
    for (let i = 0; i < todaysCount; i++) {
      events.push({
        eventId: `e${id++}`,
        timestamp: new Date(t + i * 1000).toISOString(),
        category: 'political',
      });
    }
  }
  if (spike) {
    for (let i = 0; i < spike.count; i++) {
      events.push({
        eventId: `spike${i}`,
        timestamp: new Date(spike.startMs + i * 1000).toISOString(),
        category: 'political',
      });
    }
  }
  return {
    async findInWindow(startMs, endMs, filter) {
      return events.filter((e) => {
        const t = Date.parse(e.timestamp);
        if (t < startMs || t >= endMs) return false;
        if (filter?.category && e.category !== filter.category) return false;
        return true;
      });
    },
    async timeRange() {
      return { earliestMs: CORPUS_START, latestMs: CORPUS_END };
    },
  };
}

const countEvents = (events: ArchivedEvent[]): number => events.length;

describe('BaseRateService', () => {
  it('finds a genuine spike surprising against the background rate', async () => {
    // Background is 3/day; the observed window holds 60 in one day.
    const spikeStart = Date.UTC(2026, 3, 15);
    const svc = new BaseRateService(makeStore(3, { startMs: spikeStart, count: 60 }));

    const r = await svc.compare(spikeStart, spikeStart + DAY, countEvents, {
      filter: { category: 'political' },
    });

    expect(r.observed).toBeGreaterThan(60);
    expect(r.expected).toBeCloseTo(3, 0);
    expect(r.pValue).toBeLessThan(0.01);
    expect(r.effectSize).toBeGreaterThan(3);
  });

  it('does NOT flag an ordinary window — the case the system gets wrong today', async () => {
    // Same background everywhere. A window is "notable" only versus a baseline,
    // and here there is nothing to notice.
    const svc = new BaseRateService(makeStore(3));
    const ordinary = Date.UTC(2026, 3, 15);

    const r = await svc.compare(ordinary, ordinary + DAY, countEvents, {
      filter: { category: 'political' },
    });

    expect(r.pValue).toBeGreaterThan(0.05);
  });

  it('is deterministic — the same seed reproduces the same finding', async () => {
    // A finding you cannot reproduce is not evidence.
    const svc = new BaseRateService(makeStore(3));
    const at = Date.UTC(2026, 2, 10);

    const a = await svc.compare(at, at + DAY, countEvents, { seed: 7 });
    const b = await svc.compare(at, at + DAY, countEvents, { seed: 7 });

    expect(a.pValue).toBe(b.pValue);
    expect(a.expected).toBe(b.expected);
  });

  it('excludes the observation window from its own null', async () => {
    // Otherwise the baseline contains the very thing being tested and the
    // comparison is circular — the spike would raise its own expectation.
    const spikeStart = Date.UTC(2026, 3, 15);
    const svc = new BaseRateService(makeStore(3, { startMs: spikeStart, count: 500 }));

    const r = await svc.compare(spikeStart, spikeStart + DAY, countEvents, {});

    // Expectation stays at background despite a huge spike inside the corpus.
    expect(r.expected).toBeLessThan(10);
  });

  it('abstains cleanly when no store is configured', async () => {
    const r = await new BaseRateService().compare(0, DAY, countEvents);

    expect(r.pValue).toBeNull();
    expect(r.insufficientReason).toMatch(/no base-rate store/);
  });

  it('abstains when the corpus is empty', async () => {
    const empty: BaseRateStore = {
      async findInWindow() {
        return [];
      },
      async timeRange() {
        return null;
      },
    };

    const r = await new BaseRateService(empty).compare(0, DAY, countEvents);
    expect(r.insufficientReason).toMatch(/corpus is empty/);
  });

  it('reports availability so callers can degrade honestly', () => {
    expect(new BaseRateService().available).toBe(false);
    expect(new BaseRateService(makeStore(1)).available).toBe(true);
  });
});
