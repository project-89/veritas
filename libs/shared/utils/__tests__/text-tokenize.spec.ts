import {
  isMultilingualStopWord,
  nonLatinScript,
  tokenizeForTopics,
  tokenizeWords,
} from '../src/lib/text-tokenize';

describe('tokenizeWords', () => {
  it('keeps accented Latin words intact instead of shattering them', () => {
    // The regression this module exists for: the old `split(/[^a-z'-]+/)`
    // turned "préférentiels" into ["pr", "f", "rentiels"].
    const tokens = tokenizeWords("Les tarifs douaniers préférentiels de l'Union européenne");

    expect(tokens).toContain('préférentiels');
    expect(tokens).toContain('européenne');
    expect(tokens).not.toContain('rentiels');
    expect(tokens).not.toContain('enne');
    expect(tokens).not.toContain('pr');
  });

  it('keeps apostrophes and hyphens word-internal but strips them at the edges', () => {
    expect(tokenizeWords("l'union co-operation 'quoted'")).toEqual([
      "l'union",
      'co-operation',
      'quoted',
    ]);
  });

  it('tokenizes Cyrillic rather than returning nothing', () => {
    expect(tokenizeWords('Пошлины на импорт стали')).toEqual(['пошлины', 'на', 'импорт', 'стали']);
  });

  it('returns an empty array for empty input', () => {
    expect(tokenizeWords('')).toEqual([]);
  });
});

describe('tokenizeForTopics', () => {
  it('marks plain English as usable', () => {
    const result = tokenizeForTopics('tariffs on imported steel and aluminium');

    expect(result.usable).toBe(true);
    expect(result.nonLatin).toBe(false);
    expect(result.tokens).toContain('tariffs');
  });

  it('marks accented French as usable and flags it as non-Latin-ASCII', () => {
    const result = tokenizeForTopics('Les tarifs douaniers préférentiels');

    expect(result.usable).toBe(true);
    expect(result.nonLatin).toBe(true);
  });

  it('abstains on unsegmented scripts instead of silently returning no topics', () => {
    const result = tokenizeForTopics('美国对中国商品加征关税');

    expect(result.usable).toBe(false);
    expect(result.reason).toBe('unsegmented-script');
    expect(result.nonLatin).toBe(true);
  });

  it('abstains when there are no word tokens at all', () => {
    const result = tokenizeForTopics('!!! ??? ...');

    expect(result.usable).toBe(false);
    expect(result.reason).toBe('no-tokens');
  });
});

describe('isMultilingualStopWord', () => {
  it('recognises French function words that previously ranked as topics', () => {
    // These are exactly what surfaced as "co-occurrences" for a `tarifs` query.
    for (const word of ['les', 'des', 'sont', 'pour', 'dans']) {
      expect(isMultilingualStopWord(word)).toBe(true);
    }
  });

  it('recognises function words across the other ingested languages', () => {
    expect(isMultilingualStopWord('der')).toBe(true); // German
    expect(isMultilingualStopWord('los')).toBe(true); // Spanish
    expect(isMultilingualStopWord('что')).toBe(true); // Russian
    expect(isMultilingualStopWord('في')).toBe(true); // Arabic
  });

  it('does not swallow meaningful content words', () => {
    expect(isMultilingualStopWord('tarifs')).toBe(false);
    expect(isMultilingualStopWord('douaniers')).toBe(false);
    expect(isMultilingualStopWord('пошлины')).toBe(false);
  });
});

describe('nonLatinScript', () => {
  it.each([
    ['Cyrillic', 'Пошлины на импорт'],
    ['Han', '关税'],
    ['Arabic', 'الرسوم الجمركية'],
    ['Hangul', '관세'],
  ])('detects %s', (_name, text) => {
    expect(nonLatinScript(text)).toBe(true);
  });

  it('does not flag accented Latin text', () => {
    // Accented French must NOT trip the abstention gate — it is analysable
    // once translated, and the tokenizer handles it correctly either way.
    expect(nonLatinScript('Les tarifs préférentiels de l’Union européenne')).toBe(false);
  });

  it('does not flag plain English', () => {
    expect(nonLatinScript('tariffs on imported steel')).toBe(false);
  });
});
