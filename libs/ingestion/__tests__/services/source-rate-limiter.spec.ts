import {
  SourceRateLimiter,
  type PlatformRateConfig,
} from '../../src/lib/services/utils/source-rate-limiter';

describe('SourceRateLimiter', () => {
  afterEach(() => {
    SourceRateLimiter.setInstance(null);
  });

  function makeLimiter(overrides: Record<string, Partial<PlatformRateConfig>>) {
    return new SourceRateLimiter(overrides);
  }

  it('spaces sequential requests by at least minIntervalMs', async () => {
    const limiter = makeLimiter({ testsource: { minIntervalMs: 50, maxConcurrent: 1 } });
    const starts: number[] = [];

    for (let i = 0; i < 3; i++) {
      await limiter.schedule('testsource', async () => {
        starts.push(Date.now());
      });
    }

    expect(starts).toHaveLength(3);
    const first = starts[0];
    const second = starts[1];
    const third = starts[2];
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error('expected three request start times');
    }
    // Allow small timer slop but enforce real spacing.
    expect(second - first).toBeGreaterThanOrEqual(45);
    expect(third - second).toBeGreaterThanOrEqual(45);
  });

  it('caps concurrent requests at maxConcurrent', async () => {
    const limiter = makeLimiter({ testsource: { minIntervalMs: 0, maxConcurrent: 2 } });
    let inFlight = 0;
    let peak = 0;

    await Promise.all(
      Array.from({ length: 6 }, () =>
        limiter.schedule('testsource', async () => {
          inFlight++;
          peak = Math.max(peak, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 20));
          inFlight--;
        }),
      ),
    );

    expect(peak).toBeLessThanOrEqual(2);
  });

  it('pauses the whole platform during a signaled cooldown', async () => {
    const limiter = makeLimiter({ testsource: { minIntervalMs: 0, maxConcurrent: 2 } });

    limiter.notifyRateLimited('testsource', 1000);
    const before = Date.now();
    await limiter.schedule('testsource', async () => undefined);
    expect(Date.now() - before).toBeGreaterThanOrEqual(950);
  });

  it('releases the slot when the scheduled function throws', async () => {
    const limiter = makeLimiter({ testsource: { minIntervalMs: 0, maxConcurrent: 1 } });

    await expect(
      limiter.schedule('testsource', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    // Slot must be free again — this hangs forever if release leaked.
    await expect(limiter.schedule('testsource', async () => 'ok')).resolves.toBe('ok');
  });

  it('isolates platforms from each other', async () => {
    const limiter = makeLimiter({
      slow: { minIntervalMs: 5000, maxConcurrent: 1 },
      fast: { minIntervalMs: 0, maxConcurrent: 4 },
    });

    // Occupy `slow`'s pacing window, then confirm `fast` is unaffected.
    await limiter.schedule('slow', async () => undefined);
    const before = Date.now();
    await limiter.schedule('fast', async () => undefined);
    expect(Date.now() - before).toBeLessThan(500);
  });

  it('parses Retry-After headers in seconds and HTTP-date form', () => {
    const seconds = SourceRateLimiter.retryAfterMsFrom({
      get: (name) => (name === 'retry-after' ? '7' : null),
    });
    expect(seconds).toBe(7000);

    const futureDate = new Date(Date.now() + 30_000).toUTCString();
    const dated = SourceRateLimiter.retryAfterMsFrom({
      get: (name) => (name === 'retry-after' ? futureDate : null),
    });
    expect(dated).toBeGreaterThan(25_000);
    expect(dated).toBeLessThanOrEqual(31_000);

    const missing = SourceRateLimiter.retryAfterMsFrom({ get: () => null });
    expect(missing).toBeUndefined();
  });

  it('applies known platform defaults and env-free instantiation', () => {
    const limiter = makeLimiter({});
    expect(limiter.getConfig('4chan').minIntervalMs).toBeGreaterThanOrEqual(1000);
    expect(limiter.getConfig('reddit').maxConcurrent).toBe(1);
    // Unknown platforms fall back to the conservative default.
    expect(limiter.getConfig('unknown-source').maxConcurrent).toBe(2);
  });
});
