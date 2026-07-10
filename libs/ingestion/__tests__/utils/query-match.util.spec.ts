import {
  extractSignificantTerms,
  matchesQuery,
  requiredTermMatches,
} from '../../src/lib/utils/query-match.util';

describe('extractSignificantTerms', () => {
  it('drops stopwords and short tokens, lowercases, dedupes', () => {
    expect(extractSignificantTerms('Is AI conscious')).toEqual(['ai', 'conscious']);
    expect(extractSignificantTerms('the war in Ukraine')).toEqual(['war', 'ukraine']);
    expect(extractSignificantTerms('AI ai AI')).toEqual(['ai']);
  });

  it('returns empty for all-stopword queries', () => {
    expect(extractSignificantTerms('is it the a')).toEqual([]);
  });
});

describe('requiredTermMatches', () => {
  it('requires all for 1-2 terms, half (rounded up) for more', () => {
    expect(requiredTermMatches(1)).toBe(1);
    expect(requiredTermMatches(2)).toBe(2);
    expect(requiredTermMatches(3)).toBe(2);
    expect(requiredTermMatches(4)).toBe(2);
    expect(requiredTermMatches(6)).toBe(3);
  });
});

describe('matchesQuery', () => {
  it('matches a genuinely relevant post', () => {
    expect(matchesQuery('Do you think AI could be conscious one day?', 'Is AI conscious')).toBe(
      true,
    );
  });

  it('excludes crypto noise that only shares the ambiguous term', () => {
    // "AI" appears, but "conscious" does not — the whole reason the old
    // substring filter flooded with crypto.
    expect(
      matchesQuery('New AI token launching on the blockchain, pairs available now', 'Is AI conscious'),
    ).toBe(false);
  });

  it('does NOT substring-match "ai" inside "blockchain"/"chain"/"available"', () => {
    expect(matchesQuery('blockchain chain available maintain campaign domain', 'AI')).toBe(false);
  });

  it('matches "AI" as a standalone word', () => {
    expect(matchesQuery('this is about AI, mostly', 'AI')).toBe(true);
  });

  it('is not fooled by the stopword "is" matching "this"/"crisis"', () => {
    expect(matchesQuery('this crisis persists in the list', 'is')).toBe(true); // "is" is a stopword → no significant terms → matches all
    expect(matchesQuery('this crisis persists', 'is bitcoin crashing')).toBe(false); // needs bitcoin+crashing
  });

  it('single-term query needs that one word', () => {
    expect(matchesQuery('bitcoin hits new high', 'bitcoin')).toBe(true);
    expect(matchesQuery('ethereum hits new high', 'bitcoin')).toBe(false);
  });

  it('longer query tolerates some missing terms (half rule)', () => {
    // 4 significant terms → need 2
    expect(matchesQuery('Russia and Ukraine talks continue', 'ukraine war russia invasion')).toBe(
      true,
    );
    expect(matchesQuery('completely unrelated cooking recipe', 'ukraine war russia invasion')).toBe(
      false,
    );
  });
});
