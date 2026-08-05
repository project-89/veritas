import { LlmBudgetExceededError, LlmGateway } from './llm-gateway';

describe('LlmGateway', () => {
  afterEach(() => {
    LlmGateway.setInstance(null);
    jest.useRealTimers();
  });

  describe('response cache', () => {
    it('returns a cache hit without calling generate again', async () => {
      const gateway = new LlmGateway();
      const generate = jest.fn().mockResolvedValue('response-text');

      const first = await gateway.run({
        model: 'gemini-flash',
        promptVersion: 2,
        prompt: 'same prompt',
        generate,
      });
      const second = await gateway.run({
        model: 'gemini-flash',
        promptVersion: 2,
        prompt: 'same prompt',
        generate,
      });

      expect(first).toBe('response-text');
      expect(second).toBe('response-text');
      expect(generate).toHaveBeenCalledTimes(1);
    });

    it('does NOT cache-collide when model/version/prompt differ', async () => {
      const gateway = new LlmGateway();
      const generate = jest
        .fn()
        .mockResolvedValueOnce('a')
        .mockResolvedValueOnce('b')
        .mockResolvedValueOnce('c');

      await gateway.run({ model: 'm1', promptVersion: 1, prompt: 'p', generate });
      await gateway.run({ model: 'm2', promptVersion: 1, prompt: 'p', generate });
      await gateway.run({ model: 'm1', promptVersion: 2, prompt: 'p', generate });

      expect(generate).toHaveBeenCalledTimes(3);
    });

    it('recomputes after the cache TTL expires', async () => {
      jest.useFakeTimers();
      const gateway = new LlmGateway({ cacheTtlMs: 1000 });
      const generate = jest.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');

      const a = await gateway.run({ model: 'm', promptVersion: 1, prompt: 'p', generate });
      expect(a).toBe('first');

      jest.advanceTimersByTime(1500);

      const b = await gateway.run({ model: 'm', promptVersion: 1, prompt: 'p', generate });
      expect(b).toBe('second');
      expect(generate).toHaveBeenCalledTimes(2);
    });

    it('disables the cache when TTL is 0', async () => {
      const gateway = new LlmGateway({ cacheTtlMs: 0 });
      const generate = jest.fn().mockResolvedValue('x');

      await gateway.run({ model: 'm', promptVersion: 1, prompt: 'p', generate });
      await gateway.run({ model: 'm', promptVersion: 1, prompt: 'p', generate });

      expect(generate).toHaveBeenCalledTimes(2);
    });
  });

  describe('concurrency semaphore', () => {
    it('caps the number of simultaneous in-flight generate calls', async () => {
      const maxConcurrency = 3;
      // Disable cache so every call actually enters the semaphore.
      const gateway = new LlmGateway({ maxConcurrency, cacheTtlMs: 0 });

      let inFlight = 0;
      let peak = 0;
      const releasers: Array<() => void> = [];

      const makeGenerate = () => () =>
        new Promise<string>((resolve) => {
          inFlight++;
          peak = Math.max(peak, inFlight);
          releasers.push(() => {
            inFlight--;
            resolve('done');
          });
        });

      const total = 10;
      const runs = Array.from({ length: total }, (_, i) =>
        gateway.run({
          model: 'm',
          promptVersion: i, // distinct → never a cache hit
          prompt: `prompt-${i}`,
          generate: makeGenerate(),
        }),
      );

      // Let the scheduler admit the first wave.
      await Promise.resolve();
      await Promise.resolve();

      expect(inFlight).toBe(maxConcurrency);
      expect(peak).toBe(maxConcurrency);

      // Drain: releasing one admits the next queued caller.
      while (releasers.length > 0) {
        const release = releasers.shift();
        release?.();
        await Promise.resolve();
        await Promise.resolve();
      }

      await Promise.all(runs);
      expect(peak).toBe(maxConcurrency);
    });
  });

  describe('per-context token budget', () => {
    it('throws LlmBudgetExceededError once the cap is exceeded, without calling generate', async () => {
      // Small cap; a single ~1000-char prompt (~250 tokens) + response blows it.
      const gateway = new LlmGateway({ maxTokensPerContext: 300, cacheTtlMs: 0 });
      const bigPrompt = 'x'.repeat(1000);
      const generate = jest.fn().mockResolvedValue('y'.repeat(400));

      // First call succeeds and records spend > cap.
      await gateway.run({
        model: 'm',
        promptVersion: 1,
        prompt: bigPrompt,
        contextKey: 'inv-1',
        generate,
      });
      expect(generate).toHaveBeenCalledTimes(1);

      // Second call for the same context is blocked before hitting generate.
      await expect(
        gateway.run({
          model: 'm',
          promptVersion: 2,
          prompt: bigPrompt,
          contextKey: 'inv-1',
          generate,
        }),
      ).rejects.toBeInstanceOf(LlmBudgetExceededError);

      expect(generate).toHaveBeenCalledTimes(1); // not called again
    });

    it('scopes budget per context key', async () => {
      const gateway = new LlmGateway({ maxTokensPerContext: 300, cacheTtlMs: 0 });
      const bigPrompt = 'x'.repeat(1000);
      const generate = jest.fn().mockResolvedValue('y'.repeat(400));

      await gateway.run({ model: 'm', promptVersion: 1, prompt: bigPrompt, contextKey: 'a', generate });
      await expect(
        gateway.run({ model: 'm', promptVersion: 2, prompt: bigPrompt, contextKey: 'a', generate }),
      ).rejects.toBeInstanceOf(LlmBudgetExceededError);

      // A different context still has its full budget.
      await expect(
        gateway.run({ model: 'm', promptVersion: 3, prompt: bigPrompt, contextKey: 'b', generate }),
      ).resolves.toBe('y'.repeat(400));
    });

    it('exempts contextless calls from the budget', async () => {
      const gateway = new LlmGateway({ maxTokensPerContext: 1, cacheTtlMs: 0 });
      const generate = jest.fn().mockResolvedValue('ok');

      // No contextKey → never budget-checked, even far over the tiny cap.
      for (let i = 0; i < 5; i++) {
        await expect(
          gateway.run({ model: 'm', promptVersion: i, prompt: 'x'.repeat(1000), generate }),
        ).resolves.toBe('ok');
      }
      expect(generate).toHaveBeenCalledTimes(5);
    });

    it('resetContext clears accumulated spend', async () => {
      const gateway = new LlmGateway({ maxTokensPerContext: 300, cacheTtlMs: 0 });
      const bigPrompt = 'x'.repeat(1000);
      const generate = jest.fn().mockResolvedValue('y'.repeat(400));

      await gateway.run({ model: 'm', promptVersion: 1, prompt: bigPrompt, contextKey: 'c', generate });
      await expect(
        gateway.run({ model: 'm', promptVersion: 2, prompt: bigPrompt, contextKey: 'c', generate }),
      ).rejects.toBeInstanceOf(LlmBudgetExceededError);

      gateway.resetContext('c');

      await expect(
        gateway.run({ model: 'm', promptVersion: 3, prompt: bigPrompt, contextKey: 'c', generate }),
      ).resolves.toBe('y'.repeat(400));
    });
  });

  describe('singleton', () => {
    it('setInstance(null) resets to a fresh default gateway', () => {
      const custom = new LlmGateway({ maxConcurrency: 99 });
      LlmGateway.setInstance(custom);
      expect(LlmGateway.instance).toBe(custom);

      LlmGateway.setInstance(null);
      expect(LlmGateway.instance).not.toBe(custom);
    });
  });
});
