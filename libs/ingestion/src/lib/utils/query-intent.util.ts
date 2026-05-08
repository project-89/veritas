export type SearchMode = 'topic' | 'claim';

const QUERY_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'have',
  'in',
  'into',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'was',
  'were',
  'with',
]);

const TOKEN_CANONICAL_MAP: Record<string, string> = {
  chinese: 'china',
  iranian: 'iran',
  missiles: 'missile',
  rockets: 'rocket',
  drones: 'drone',
  warheads: 'warhead',
  weapons: 'weapon',
  sends: 'send',
  sent: 'send',
  sending: 'send',
  shipped: 'send',
  shipping: 'send',
  ship: 'send',
  delivers: 'deliver',
  delivered: 'deliver',
  delivering: 'deliver',
  transfers: 'transfer',
  transferred: 'transfer',
  transferring: 'transfer',
  moved: 'move',
  moving: 'move',
  supplied: 'supply',
  supplying: 'supply',
};

const ACTION_TERMS = new Set([
  'send',
  'deliver',
  'transfer',
  'move',
  'supply',
  'launch',
  'fire',
  'deploy',
  'smuggle',
  'route',
]);

const EVIDENCE_TERMS = new Set([
  'missile',
  'rocket',
  'drone',
  'weapon',
  'warhead',
  'launcher',
  'battery',
  'payload',
  'shipment',
]);

export interface ClaimQueryPlan {
  originalQuery: string;
  normalizedQuery: string;
  significantTerms: string[];
  actorTerms: string[];
  actionTerms: string[];
  evidenceTerms: string[];
  anchorTerms: string[];
  searchTerms: string[];
  compactQuery: string;
}

export function normalizeSearchMode(value: unknown): SearchMode {
  return value === 'claim' ? 'claim' : 'topic';
}

export function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, ' ')
    .split(/\s+/)
    .map((token) => normalizeQueryToken(token))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractSignificantQueryTerms(query: string): string[] {
  return Array.from(
    new Set(
      normalizeSearchText(query)
        .split(/\s+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= 3 && !QUERY_STOPWORDS.has(term)),
    ),
  );
}

export function looksLikeClaimQuery(query: string): boolean {
  const plan = buildClaimQueryPlan(query);
  return (
    plan.anchorTerms.length > 0 ||
    (plan.actorTerms.length >= 2 && plan.evidenceTerms.length > 0 && plan.actionTerms.length > 0)
  );
}

export function buildClaimQueryPlan(query: string): ClaimQueryPlan {
  const normalizedQuery = normalizeSearchText(query);
  const significantTerms = extractSignificantQueryTerms(query);

  const anchorTerms = significantTerms.filter((term) => /\d/.test(term) || term.includes('-'));
  const actionTerms = significantTerms.filter((term) => ACTION_TERMS.has(term));
  const evidenceTerms = significantTerms.filter((term) => EVIDENCE_TERMS.has(term));
  const actorTerms = significantTerms.filter(
    (term) =>
      !anchorTerms.includes(term) && !actionTerms.includes(term) && !evidenceTerms.includes(term),
  );

  const searchTerms = Array.from(
    new Set([
      ...anchorTerms,
      ...actorTerms.slice(0, 3),
      ...evidenceTerms.slice(0, 2),
      ...actionTerms.slice(0, 1),
      ...significantTerms,
    ]),
  ).slice(0, 6);

  return {
    originalQuery: query,
    normalizedQuery,
    significantTerms,
    actorTerms,
    actionTerms,
    evidenceTerms,
    anchorTerms,
    searchTerms,
    compactQuery: searchTerms.join(' '),
  };
}

function normalizeQueryToken(rawToken: string): string {
  const token = rawToken.trim().toLowerCase();
  if (!token) return '';

  if (/^df-?41$/.test(token)) {
    return 'df-41';
  }

  return TOKEN_CANONICAL_MAP[token] ?? token;
}
