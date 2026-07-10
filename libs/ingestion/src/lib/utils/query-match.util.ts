/**
 * Shared query-relevance matching for connectors that filter fetched content
 * locally (curated channels, boards, feeds, and as a safety net over platform
 * search results).
 *
 * The previous per-connector logic — `keywords.some(kw => text.includes(kw))`
 * over the raw query split on whitespace — had two failure modes that flooded
 * results with off-topic content:
 *   1. Substring matching: "ai" matched "chain", "blockchain", "maintain",
 *      "available", "pair", "campaign"… so an "AI" query pulled in crypto,
 *      which is saturated with those words.
 *   2. Stopwords + any-match: "is" matched "this", "crisis", "list"… and a
 *      single weak hit was enough to include a post.
 *
 * This util fixes both: strip stopwords, match on WORD BOUNDARIES, and require
 * enough of the meaningful query terms to be present.
 */

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  'do', 'does', 'did', 'has', 'have', 'had', 'of', 'to', 'in', 'on', 'at',
  'by', 'for', 'with', 'from', 'as', 'into', 'onto', 'over', 'under', 'about',
  'and', 'or', 'but', 'if', 'then', 'than', 'so', 'not', 'no', 'up', 'out',
  'it', 'its', 'this', 'that', 'these', 'those', 'there', 'here',
  'i', 'you', 'we', 'they', 'he', 'she', 'me', 'us', 'them', 'him', 'her',
  'my', 'your', 'our', 'their', 'his', 'who', 'whom', 'whose',
  'what', 'which', 'when', 'where', 'why', 'how',
  'will', 'would', 'can', 'could', 'should', 'shall', 'may', 'might', 'must',
  'get', 'got', 'just', 'like', 'also', 'very', 'more', 'most', 'some', 'any',
]);

/**
 * Significant, lowercased query terms: punctuation stripped, stopwords removed,
 * terms shorter than 2 chars dropped. Preserves order, de-duplicated.
 */
export function extractSignificantTerms(query: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const raw of query.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 2 || STOPWORDS.has(raw) || seen.has(raw)) continue;
    seen.add(raw);
    terms.push(raw);
  }
  return terms;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-word (boundary) test — "ai" matches "an AI model", not "blockchain". */
function containsWord(lowerText: string, term: string): boolean {
  return new RegExp(`\\b${escapeRegExp(term)}\\b`).test(lowerText);
}

/**
 * How many significant query terms must appear for a match.
 * - 1–2 terms: all of them (so "AI conscious" needs both "ai" AND "conscious",
 *   which excludes "AI crypto token" posts that lack "conscious").
 * - 3+ terms: at least half (rounded up), so longer queries tolerate phrasing
 *   variation without demanding an exact-word pile-up.
 */
export function requiredTermMatches(termCount: number): number {
  return termCount <= 2 ? termCount : Math.ceil(termCount / 2);
}

/**
 * Does `text` satisfy `query` under the relevance rules above? A query with no
 * significant terms (empty or all stopwords) matches everything — the caller
 * decides whether to fetch at all.
 */
export function matchesQuery(text: string, query: string): boolean {
  const terms = extractSignificantTerms(query);
  if (terms.length === 0) return true;
  const lower = text.toLowerCase();
  let matched = 0;
  for (const term of terms) {
    if (containsWord(lower, term)) matched++;
  }
  return matched >= requiredTermMatches(terms.length);
}
