import type { ConfigService } from '@nestjs/config';
import {
  STANCE_CONFIDENCE_FLOOR,
  type StanceResult,
  StanceService,
  stancesOppose,
} from './stance.service';

const noKeyConfig = { get: () => undefined } as unknown as ConfigService;

function res(stance: StanceResult['stance'], confidence: number): StanceResult {
  return { stance, confidence };
}

describe('stancesOppose', () => {
  const high = STANCE_CONFIDENCE_FLOOR + 0.1;
  const low = STANCE_CONFIDENCE_FLOOR - 0.1;

  it('opposes confident favor vs confident against', () => {
    expect(stancesOppose(res('favor', high), res('against', high))).toBe(true);
    expect(stancesOppose(res('against', high), res('favor', high))).toBe(true);
  });

  it('does not oppose when either side is below the confidence floor', () => {
    // A false split fragments a real narrative, so uncertainty must not split.
    expect(stancesOppose(res('favor', low), res('against', high))).toBe(false);
    expect(stancesOppose(res('favor', high), res('against', low))).toBe(false);
  });

  it('never treats unclear as opposition', () => {
    expect(stancesOppose(res('unclear', 1), res('against', 1))).toBe(false);
    expect(stancesOppose(res('unclear', 1), res('favor', 1))).toBe(false);
    expect(stancesOppose(res('unclear', 1), res('unclear', 1))).toBe(false);
  });

  it('never treats neutral as opposition', () => {
    // Reporting on a topic is not taking the opposite side to an advocate.
    expect(stancesOppose(res('neutral', 1), res('favor', 1))).toBe(false);
    expect(stancesOppose(res('neutral', 1), res('against', 1))).toBe(false);
  });

  it('does not oppose agreeing stances', () => {
    expect(stancesOppose(res('favor', 1), res('favor', 1))).toBe(false);
    expect(stancesOppose(res('against', 1), res('against', 1))).toBe(false);
  });
});

describe('StanceService without an API key', () => {
  let service: StanceService;

  beforeEach(() => {
    delete process.env['GEMINI_API_KEY'];
    service = new StanceService(noKeyConfig);
  });

  it('reports itself unavailable rather than throwing', () => {
    expect(service.available).toBe(false);
  });

  it('returns unclear at confidence 0 for every post', async () => {
    const out = await service.classify(['a', 'b'], 'gun control');

    expect(out).toEqual([
      { stance: 'unclear', confidence: 0 },
      { stance: 'unclear', confidence: 0 },
    ]);
    // And that must never split a cluster.
    expect(stancesOppose(out[0]!, out[1]!)).toBe(false);
  });

  it('returns an empty array for empty input', async () => {
    expect(await service.classify([], 'target')).toEqual([]);
  });

  it('returns unclear when the target is blank', async () => {
    const out = await service.classify(['some post'], '   ');
    expect(out[0]).toEqual({ stance: 'unclear', confidence: 0 });
  });
});
