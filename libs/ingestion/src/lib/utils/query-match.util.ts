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
 *
 * All of it is Unicode-aware, which it originally was not. The old
 * `split(/[^a-z0-9]+/)` extracted ZERO terms from any non-Latin query, and
 * because "no significant terms" means "match everything", a Cyrillic or CJK
 * query silently disabled relevance filtering in every connector that calls
 * matchesQuery directly (Telegram, RSS, Reddit, the web scraper) while
 * returning nothing at all in the ones that guard on term count (4chan). Even
 * with terms in hand, matching would still have failed: JS `\b` is defined
 * over [A-Za-z0-9_], so /\bпошлины\b/ does not match "пошлины".
 *
 * (`libs/content-classification/.../text-tokenize.ts` solves the neighbouring
 * problem for topic extraction. Kept separate deliberately: this util is
 * dependency-free and the two have different rules — query matching wants
 * substring semantics for unsegmented scripts, topic extraction must abstain
 * on them.)
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
  for (const raw of query.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    // Unsegmented scripts (Han, Kana, Thai...) have no whitespace between
    // words, so a "term" here is a whole phrase. A 1-char CJK term is still
    // meaningful, unlike a 1-char Latin one, so the length floor only applies
    // to scripts that actually delimit words.
    const minLength = UNSEGMENTED_SCRIPT.test(raw) ? 1 : 2;
    if (raw.length < minLength || STOPWORDS.has(raw) || seen.has(raw)) continue;
    seen.add(raw);
    terms.push(raw);
  }
  return terms;
}

/**
 * Low-signal words that survive stopword stripping but hurt platform SEARCH.
 * Platform search endpoints (Twitter, Bluesky, Farcaster, YouTube) treat
 * space-separated terms as AND, so every extra weak term further constrains
 * the result set. Empirically, "truly behind alberta separatist movement
 * canada" returned 0 tweets while "alberta separatist movement canada"
 * returned 11 — the filler words "truly"/"behind" were the difference.
 *
 * These are dropped ONLY when building a search query, never when relevance-
 * matching already-fetched content (matchesQuery keeps using STOPWORDS only).
 */
const SEARCH_FILLER = new Set([
  'truly', 'really', 'actually', 'basically', 'literally', 'simply', 'exactly',
  'behind', 'involved', 'responsible', 'going', 'happening', 'around',
  'regarding', 'concerning', 'related', 'actual', 'real', 'true', 'thing',
  'things', 'stuff', 'people', 'someone', 'something', 'anyone', 'anything',
]);

/**
 * Turn a raw user query into an effective platform-search string.
 *
 * Platform search matches fairly literally, so a natural-language question
 * ("Who is truly behind the Alberta separatist movement in Canada?") returns
 * almost nothing. Reducing it to a capped set of significant terms
 * ("alberta separatist movement canada") turns it into a high-recall keyword
 * search. Because search is AND-based, we both drop filler AND cap the term
 * count — more terms means fewer results.
 *
 * A bare handle/single token (no whitespace) is returned unchanged so account
 * and hashtag lookups keep working.
 */
export function buildSearchQuery(query: string, maxTerms = 5): string {
  const trimmed = query.trim();
  if (!/\s/.test(trimmed)) return trimmed;
  const terms = extractSignificantTerms(trimmed).filter((t) => !SEARCH_FILLER.has(t));
  if (terms.length === 0) return trimmed;
  return terms.slice(0, maxTerms).join(' ');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Scripts that do not put whitespace between words. Terms in these scripts are
 * matched as plain substrings, because there is no boundary to anchor to —
 * "关税" inside "美国对中国商品加征关税" is a genuine hit, not a partial-word
 * false positive like "ai" inside "blockchain".
 */
const UNSEGMENTED_SCRIPT =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Khmer}\p{Script=Lao}]/u;

/**
 * Whole-word (boundary) test — "ai" matches "an AI model", not "blockchain".
 *
 * Uses Unicode lookarounds rather than `\b`: `\b` is defined over
 * [A-Za-z0-9_], so it silently fails to match any Cyrillic/Greek/Arabic term
 * and mis-fires around accented Latin.
 */
function containsWord(lowerText: string, term: string): boolean {
  if (UNSEGMENTED_SCRIPT.test(term)) {
    return lowerText.includes(term);
  }
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, 'u').test(
    lowerText,
  );
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
