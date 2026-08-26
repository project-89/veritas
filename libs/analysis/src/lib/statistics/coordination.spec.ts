import { type CoordinationPost, detectCoordination } from './coordination';

const MIN = 60_000;
const base = Date.UTC(2026, 5, 1, 12, 0, 0);

function post(text: string, author: string, minute: number): CoordinationPost {
  return { text, authorHandle: author, timestamp: new Date(base + minute * MIN).toISOString() };
}

/** Distinct organic chatter: unique texts, many authors, spread timing. */
function organic(n = 30): CoordinationPost[] {
  const stems = [
    'thinking about the reservoir vote and what it means for rates',
    'the aquifer report had some surprising depth measurements in it',
    'attended the council session tonight and took detailed notes',
    'water table trends in the valley have shifted since the spring',
    'comparing the two proposals side by side over coffee today',
    'my neighbour disagrees with me about the bond measure entirely',
  ];
  const tails = [
    'which surprised me', 'for what it is worth', 'and I remain unsure',
    'though opinions differ', 'as expected honestly', 'more later',
  ];
  return Array.from({ length: n }, (_, i) =>
    post(
      `${stems[i % stems.length]} ${tails[Math.floor(i / stems.length) % tails.length]} v${i}`,
      `citizen${i}`,
      i * 33,
    ),
  );
}

describe('detectCoordination', () => {
  it('finds a copy-paste ring hiding inside organic chatter', () => {
    // Three accounts repeatedly post the same template within a minute of each
    // other, embedded in 30 organic posts.
    const ring = ['ringA', 'ringB', 'ringC'].flatMap((who, wi) =>
      Array.from({ length: 4 }, (_, k) =>
        post(
          `SHARE NOW the council is hiding the real reservoir numbers from you #${k}`,
          who,
          500 + k * 10 + wi * 0.01, // each wave lands within ~1s across the ring
        ),
      ),
    );
    const r = detectCoordination([...organic(), ...ring], { seed: 7 });

    expect(r.groups.length).toBe(1);
    expect(r.groups[0]?.members).toEqual(['ringA', 'ringB', 'ringC']);
    expect(r.groups[0]?.pValue).toBeLessThan(0.05);
    expect(r.groups[0]?.evidence).toMatch(/near-duplicate/);
  });

  it('stays silent on purely organic chatter', () => {
    const r = detectCoordination(organic(40), { seed: 7 });
    expect(r.groups).toEqual([]);
    expect(r.pairsTested).toBeGreaterThanOrEqual(0);
  });

  it('does not flag a viral copy-paste spread across MANY accounts as one ring', () => {
    // 20 different accounts each posting the same meme once: the permutation
    // null absorbs this — under shuffled labels the co-duplication looks the
    // same, because EVERY pairing shares the cluster. No specific pair stands
    // out, so no group should.
    const viral = Array.from({ length: 20 }, (_, i) =>
      post('this meme about the reservoir is everywhere today lol share it', `random${i}`, i * 25),
    );
    const r = detectCoordination([...organic(20), ...viral], { seed: 7 });

    expect(r.groups).toEqual([]);
  });

  it('ignores self-repetition — one account spamming is not a network', () => {
    const spammer = Array.from({ length: 10 }, (_, k) =>
      post('buy my reservoir report now limited offer act fast today', 'selfspam', 600 + k),
    );
    const r = detectCoordination([...organic(20), ...spammer], { seed: 7 });

    expect(r.groups.every((g) => !g.members.includes('selfspam'))).toBe(true);
  });

  it('is deterministic for a given seed', () => {
    const posts = [...organic(), ...['x1', 'x2'].flatMap((who, wi) =>
      Array.from({ length: 5 }, (_, k) =>
        post(`identical coordinated message payload number ${k} spread wide`, who, 900 + k * 5 + wi * 0.01),
      ),
    )];
    const a = detectCoordination(posts, { seed: 99 });
    const b = detectCoordination(posts, { seed: 99 });

    expect(a.groups).toEqual(b.groups);
  });

  it('abstains on tiny corpora with the reason stated', () => {
    const r = detectCoordination(organic(6));
    expect(r.groups).toEqual([]);
    expect(r.insufficientReason).toMatch(/need >=12 posts/);
  });
});
