import { findNearDuplicates } from './duplication';

/**
 * Coordination detection over a post corpus (analysis-quality-plan Phase D).
 *
 * Coordination is NETWORK-level evidence: several accounts moving together in
 * ways random assignment would not produce. It is deliberately separate from
 * per-account automation signals — a coordinated network is a finding whether
 * or not any member is scripted, and one odd account is not evidence of a
 * network.
 *
 * Two co-activity edge types, both computable from data we hold:
 *   co-duplication  distinct accounts posting near-identical text
 *   co-timing       distinct accounts posting within a tight window,
 *                   repeatedly
 *
 * THE NULL MODEL IS LABEL PERMUTATION. Texts and timestamps stay exactly as
 * observed; only the author labels are shuffled (preserving each account's
 * post count). That answers the precise question: given that these posts with
 * these texts at these times exist, could this PAIRING of accounts arise by
 * chance? A burst or a viral copy-paste raises everyone's co-activity — the
 * permutation null absorbs that, so only pairings beyond it surface.
 *
 * Significance uses the MAX-STATISTIC across permutations: a pair is flagged
 * only if its observed score exceeds what the single most co-active pair
 * reaches under permutation. That controls the family-wise error over all
 * pairs tested — with hundreds of accounts there are tens of thousands of
 * pairs, and per-pair thresholds would be guaranteed to flag noise
 * (detection-methodology §3.3).
 */

export interface CoordinationPost {
  text: string;
  authorHandle: string;
  timestamp: string;
}

export interface CoordinatedGroup {
  members: string[];
  /** Distinct-author post pairs sharing a near-duplicate cluster. */
  sharedDuplicatePairs: number;
  /** Distinct-author post pairs inside the co-timing window. */
  coTimedPairs: number;
  /** Empirical p vs the permuted max-pair distribution (never exactly 0). */
  pValue: number;
  evidence: string;
}

export interface CoordinationResult {
  groups: CoordinatedGroup[];
  postCount: number;
  authorCount: number;
  pairsTested: number;
  permutations: number;
  insufficientReason?: string;
}

const MIN_POSTS = 12;
const MIN_AUTHORS = 4;
const DEFAULT_PERMUTATIONS = 200;
/** Two posts this close together count as co-timed. */
const CO_TIMING_WINDOW_MS = 60_000;
/**
 * Cap on close-in-time post pairs. A pathological single-minute corpus is
 * quadratic; beyond this the co-timing signal is saturated anyway and we
 * abstain on that edge type rather than grind.
 */
const MAX_CLOSE_PAIRS = 250_000;

export function detectCoordination(
  posts: readonly CoordinationPost[],
  options: { permutations?: number; seed?: number; coTimingWindowMs?: number } = {},
): CoordinationResult {
  const authors = [...new Set(posts.map((p) => p.authorHandle).filter(Boolean))];
  const base: Omit<CoordinationResult, 'insufficientReason'> = {
    groups: [],
    postCount: posts.length,
    authorCount: authors.length,
    pairsTested: 0,
    permutations: 0,
  };

  if (posts.length < MIN_POSTS || authors.length < MIN_AUTHORS) {
    return {
      ...base,
      insufficientReason: `need >=${MIN_POSTS} posts across >=${MIN_AUTHORS} accounts, got ${posts.length} across ${authors.length}`,
    };
  }

  // --- Precompute structures that DO NOT change under label permutation ---

  // Post pairs sharing a near-duplicate cluster.
  const dup = findNearDuplicates(posts.map((p) => p.text));
  const dupPairs: Array<[number, number]> = [];
  for (const cluster of dup.clusters) {
    for (let a = 0; a < cluster.members.length; a++) {
      for (let b = a + 1; b < cluster.members.length; b++) {
        dupPairs.push([cluster.members[a] as number, cluster.members[b] as number]);
      }
    }
  }

  // Post pairs within the co-timing window.
  const windowMs = options.coTimingWindowMs ?? CO_TIMING_WINDOW_MS;
  const byTime = posts
    .map((p, i) => ({ i, t: Date.parse(p.timestamp) }))
    .filter((x) => Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t);
  const closePairs: Array<[number, number]> = [];
  let saturated = false;
  outer: for (let a = 0; a < byTime.length; a++) {
    for (let b = a + 1; b < byTime.length; b++) {
      if ((byTime[b] as { t: number }).t - (byTime[a] as { t: number }).t > windowMs) break;
      closePairs.push([(byTime[a] as { i: number }).i, (byTime[b] as { i: number }).i]);
      if (closePairs.length > MAX_CLOSE_PAIRS) {
        saturated = true;
        break outer;
      }
    }
  }

  // --- Pair scores under a given labelling ---
  const pairKey = (x: string, y: string): string => (x < y ? `${x}|${y}` : `${y}|${x}`);
  const scorePairs = (labels: readonly string[]): Map<string, { dup: number; timed: number }> => {
    const scores = new Map<string, { dup: number; timed: number }>();
    const bump = (i: number, j: number, kind: 'dup' | 'timed'): void => {
      const a = labels[i] as string;
      const b = labels[j] as string;
      if (a === b) return; // self-repetition is an automation signal, not coordination
      const key = pairKey(a, b);
      const cur = scores.get(key) ?? { dup: 0, timed: 0 };
      cur[kind]++;
      scores.set(key, cur);
    };
    for (const [i, j] of dupPairs) bump(i, j, 'dup');
    if (!saturated) for (const [i, j] of closePairs) bump(i, j, 'timed');
    return scores;
  };

  const observedLabels = posts.map((p) => p.authorHandle);
  const observed = scorePairs(observedLabels);

  // --- Permutation null: shuffle the label multiset, keep everything else ---
  const permutations = options.permutations ?? DEFAULT_PERMUTATIONS;
  const rand = mulberry32(options.seed ?? 424242);
  const maxDupNull: number[] = [];
  const maxTimedNull: number[] = [];
  const shuffled = [...observedLabels];
  for (let k = 0; k < permutations; k++) {
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = shuffled[i] as string;
      shuffled[i] = shuffled[j] as string;
      shuffled[j] = tmp;
    }
    let maxDup = 0;
    let maxTimed = 0;
    for (const s of scorePairs(shuffled).values()) {
      if (s.dup > maxDup) maxDup = s.dup;
      if (s.timed > maxTimed) maxTimed = s.timed;
    }
    maxDupNull.push(maxDup);
    maxTimedNull.push(maxTimed);
  }

  // --- Flag pairs beyond the permuted max; group by connected components ---
  const empiricalP = (value: number, nullMax: number[]): number =>
    (nullMax.filter((m) => m >= value).length + 1) / (nullMax.length + 1);

  const elevated: Array<{ a: string; b: string; dup: number; timed: number; p: number }> = [];
  for (const [key, s] of observed) {
    const pDup = s.dup > 0 ? empiricalP(s.dup, maxDupNull) : 1;
    const pTimed = !saturated && s.timed > 0 ? empiricalP(s.timed, maxTimedNull) : 1;
    const p = Math.min(pDup, pTimed);
    if (p < 0.05) {
      const [a, b] = key.split('|') as [string, string];
      elevated.push({ a, b, dup: s.dup, timed: s.timed, p });
    }
  }

  // Union-find over elevated pairs.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while ((parent.get(r) ?? r) !== r) r = parent.get(r) as string;
    return r;
  };
  for (const e of elevated) {
    parent.set(e.a, parent.get(e.a) ?? e.a);
    parent.set(e.b, parent.get(e.b) ?? e.b);
    const ra = find(e.a);
    const rb = find(e.b);
    if (ra !== rb) parent.set(rb, ra);
  }
  const groupMap = new Map<string, { members: Set<string>; dup: number; timed: number; p: number }>();
  for (const e of elevated) {
    const root = find(e.a);
    const g = groupMap.get(root) ?? { members: new Set<string>(), dup: 0, timed: 0, p: 1 };
    g.members.add(e.a);
    g.members.add(e.b);
    g.dup += e.dup;
    g.timed += e.timed;
    g.p = Math.min(g.p, e.p);
    groupMap.set(root, g);
  }

  const groups: CoordinatedGroup[] = [...groupMap.values()]
    .map((g) => ({
      members: [...g.members].sort(),
      sharedDuplicatePairs: g.dup,
      coTimedPairs: g.timed,
      pValue: g.p,
      evidence:
        `${g.members.size} accounts linked by ${g.dup} shared near-duplicate post pair(s)` +
        (saturated
          ? '; co-timing saturated on this corpus and was not scored'
          : ` and ${g.timed} co-timed post pair(s) (<=${Math.round((options.coTimingWindowMs ?? CO_TIMING_WINDOW_MS) / 1000)}s apart)`) +
        `; p=${g.p.toFixed(4)} vs ${permutations} label permutations (max-statistic, family-wise)`,
    }))
    .sort((a, b) => a.pValue - b.pValue);

  return {
    groups,
    postCount: posts.length,
    authorCount: authors.length,
    pairsTested: observed.size,
    permutations,
  };
}

/** Mulberry32 — deterministic given a seed, so findings are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
