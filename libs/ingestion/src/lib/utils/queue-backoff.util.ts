/**
 * Jittered exponential backoff options for BullMQ jobs.
 *
 * BullMQ's exponential backoff uses a fixed base delay, so a burst of jobs
 * failing together retries together (thundering herd against the same
 * source). Randomizing the base delay per job (+0–50%) spreads the retries.
 */
export function jitteredBackoff(baseDelayMs: number): { type: 'exponential'; delay: number } {
  return {
    type: 'exponential',
    delay: Math.round(baseDelayMs * (1 + Math.random() * 0.5)),
  };
}
