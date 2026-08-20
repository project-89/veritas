import { tokenizeWords } from '@veritas/shared/utils';

/**
 * Near-duplicate detection over a corpus.
 *
 * This is load-bearing twice over:
 *
 *  - REPETITION. Copy-paste amplification is the oldest coordination signal
 *    there is, and it survives paraphrase far better than exact matching
 *    suggests once you compare shingles rather than strings.
 *
 *  - SOURCE INDEPENDENCE. The newsroom rule is two INDEPENDENT sources, and
 *    two outlets running the same wire copy are one source. Counting them as
 *    two is how a single fabrication becomes "widely reported". Textual
 *    near-duplication is the most direct evidence of shared origin we can
 *    compute, so this function is what makes corroboration counting honest
 *    rather than arithmetic.
 *
 * Shingling + Jaccard rather than embeddings, deliberately: this must measure
 * SHARED WORDING, not shared meaning. Two independent reporters describing the
 * same event should NOT count as duplicates — that is genuine corroboration —
 * whereas embedding similarity would happily call them near-identical and
 * erase the distinction this exists to draw.
 */

export interface DuplicateCluster {
  /** Indices into the input array. Always length >= 2. */
  members: number[];
  /** Mean pairwise Jaccard within the cluster. */
  cohesion: number;
}

export interface DuplicationResult {
  clusters: DuplicateCluster[];
  /** Share of items that are a near-duplicate of at least one other item. */
  duplicateRate: number | null;
  /** Largest cluster size, absolute. */
  largestClusterSize: number;
  itemCount: number;
  insufficientReason?: string;
}

/** Word n-gram width. 5 is the usual choice for prose near-duplicate work. */
const SHINGLE_SIZE = 5;
const MIN_ITEMS = 4;
/** Items shorter than this cannot produce a meaningful shingle set. */
const MIN_TOKENS = SHINGLE_SIZE + 2;

/** Overlapping word n-grams. Order-sensitive, so reordered text is not a duplicate. */
export function shingles(text: string, size = SHINGLE_SIZE): Set<string> {
  const tokens = tokenizeWords(text);
  const out = new Set<string>();
  if (tokens.length < size) {
    // Too short to shingle — fall back to the token set so it can still match
    // an identical short post, rather than silently matching nothing.
    if (tokens.length > 0) out.add(tokens.join(' '));
    return out;
  }
  for (let i = 0; i + size <= tokens.length; i++) {
    out.add(tokens.slice(i, i + size).join(' '));
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const item of small) if (large.has(item)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

/**
 * Group near-duplicates by single-linkage over the Jaccard graph.
 *
 * Single linkage (transitive) rather than requiring all-pairs similarity,
 * because copy-paste chains drift: A and B share 90%, B and C share 90%, A and
 * C may share 70%. They are still one propagating text.
 */
export function findNearDuplicates(
  texts: readonly string[],
  threshold = 0.6,
): DuplicationResult {
  const itemCount = texts.length;
  if (itemCount < MIN_ITEMS) {
    return {
      clusters: [],
      duplicateRate: null,
      largestClusterSize: 0,
      itemCount,
      insufficientReason: `need >=${MIN_ITEMS} items to measure a duplicate rate, got ${itemCount}`,
    };
  }

  const sets = texts.map((t) => shingles(t));
  const eligible = sets.map((s, i) => tokenizeWords(texts[i] as string).length >= MIN_TOKENS && s.size > 0);

  // Union-find over pairs above threshold.
  const parent = Array.from({ length: itemCount }, (_, i) => i);
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r] as number;
    while (parent[x] !== r) {
      const next = parent[x] as number;
      parent[x] = r;
      x = next;
    }
    return r;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  for (let i = 0; i < itemCount; i++) {
    if (!eligible[i]) continue;
    for (let j = i + 1; j < itemCount; j++) {
      if (!eligible[j]) continue;
      const score = jaccard(sets[i] as Set<string>, sets[j] as Set<string>);
      if (score >= threshold) union(i, j);
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < itemCount; i++) {
    if (!eligible[i]) continue;
    const root = find(i);
    const g = groups.get(root);
    if (g) g.push(i);
    else groups.set(root, [i]);
  }

  const clusters: DuplicateCluster[] = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    let sum = 0;
    let pairs = 0;
    for (let a = 0; a < members.length; a++) {
      for (let b = a + 1; b < members.length; b++) {
        sum += jaccard(
          sets[members[a] as number] as Set<string>,
          sets[members[b] as number] as Set<string>,
        );
        pairs++;
      }
    }
    clusters.push({ members, cohesion: pairs === 0 ? 0 : sum / pairs });
  }
  clusters.sort((a, b) => b.members.length - a.members.length);

  const duplicated = clusters.reduce((sum, c) => sum + c.members.length, 0);
  return {
    clusters,
    duplicateRate: duplicated / itemCount,
    largestClusterSize: clusters[0]?.members.length ?? 0,
    itemCount,
  };
}

/**
 * Corroboration count that discounts derivative sources.
 *
 * Naive counting treats every outlet carrying a story as independent
 * confirmation. It is not: syndicated copy, common ownership, and downstream
 * aggregation all collapse to a single origin. This returns BOTH numbers so a
 * consumer can see the discount rather than just its result — "9 reports, 3
 * independent" is a more useful finding than either number alone.
 *
 * @param items text plus an ownership key (outlet, owner, or account)
 */
export function countIndependentSources(
  items: readonly { text: string; sourceKey: string }[],
  threshold = 0.6,
): {
  rawCount: number;
  independentCount: number;
  /** Groups collapsed into one source, with why. */
  collapsed: Array<{ reason: 'shared-text' | 'shared-owner'; members: string[] }>;
} {
  const rawCount = items.length;
  const collapsed: Array<{ reason: 'shared-text' | 'shared-owner'; members: string[] }> = [];

  // 1. Common ownership — two outlets under one owner are one source.
  const byOwner = new Map<string, number[]>();
  items.forEach((item, i) => {
    const g = byOwner.get(item.sourceKey);
    if (g) g.push(i);
    else byOwner.set(item.sourceKey, [i]);
  });
  for (const [owner, idx] of byOwner) {
    if (idx.length > 1) {
      collapsed.push({ reason: 'shared-owner', members: idx.map(() => owner) });
    }
  }

  // 2. Shared wording — syndicated or copied text, regardless of outlet.
  const dup = findNearDuplicates(
    items.map((i) => i.text),
    threshold,
  );

  // An owner group is one unit; a text cluster is one unit; anything in both
  // must not be double-counted, so union them.
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let r = x;
    while ((parent.get(r) ?? r) !== r) r = parent.get(r) as number;
    return r;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };
  items.forEach((_, i) => parent.set(i, i));
  for (const idx of byOwner.values()) {
    for (let k = 1; k < idx.length; k++) union(idx[0] as number, idx[k] as number);
  }
  for (const cluster of dup.clusters) {
    for (let k = 1; k < cluster.members.length; k++) {
      union(cluster.members[0] as number, cluster.members[k] as number);
      collapsed.push({
        reason: 'shared-text',
        members: cluster.members.map((m) => items[m]?.sourceKey ?? String(m)),
      });
    }
  }

  const roots = new Set<number>();
  items.forEach((_, i) => roots.add(find(i)));

  return { rawCount, independentCount: roots.size, collapsed };
}
