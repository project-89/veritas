/**
 * Unicode-safe tokenization for topic extraction.
 *
 * The previous tokenizer was `text.toLowerCase().split(/[^a-z'-]+/)`, which is
 * only correct for unaccented English. On anything else it failed SILENTLY and
 * in two different ways, both of which reached production output:
 *
 *   "tarifs douaniers preferentiels de l'Union europeenne" (with accents)
 *     -> ["les","tarifs","douaniers","pr","f","rentiels","de","l'union",
 *         "europ","enne","sont","contest","s"]
 *     Accented characters acted as SEPARATORS, shattering words into
 *     fragments; those over 2 chars ("rentiels", "enne") survived as topics.
 *
 *   "Пошлины на импорт стали" / "美国对中国商品加征关税"
 *     -> []
 *     Every character is a separator, so non-Latin documents contributed zero
 *     topics and zero entities while looking like a successful classification.
 *
 * The fix is in two parts, and the second matters more than the first:
 *
 *  1. Tokenize on Unicode letter/number classes so words stay intact.
 *  2. Report the script/language situation to the caller so it can ABSTAIN.
 *     Correct multilingual topic extraction is not a tokenizer problem — it
 *     needs per-language stopwords, morphology, and (for zh/ja/th) real word
 *     segmentation, and the downstream NER (`compromise`) is English-only
 *     regardless. So the pipeline's contract is: translate to English at
 *     ingest, run the English stack on the translation. This module's job is
 *     to make the no-translation path fail HONESTLY (abstain, flagged) rather
 *     than emit `rentiels` as if it were a topic.
 */

/**
 * Scripts that do not delimit words with whitespace. Splitting these on
 * separators yields whole sentences, not words, so frequency analysis over
 * them is meaningless without a segmenter.
 */
const UNSEGMENTED_SCRIPT =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Khmer}\p{Script=Lao}]/u;

/** Any letter outside Basic Latin — the signal that the old tokenizer broke. */
const NON_ASCII_LETTER = /[^\p{ASCII}\p{P}\p{Z}\p{N}]/u;

/**
 * Stopwords for the languages we actually ingest, so that an untranslated
 * document does not surface `les`/`des`/`sont` as its defining topics. This is
 * a safety net for the abstention path, NOT a claim of multilingual support:
 * function-word removal alone does not make topic extraction work in a
 * language whose morphology we do not handle.
 */
const MULTILINGUAL_STOP_WORDS = new Set([
  // French
  'les',
  'des',
  'une',
  'dans',
  'pour',
  'sur',
  'avec',
  'sont',
  'est',
  'que',
  'qui',
  'pas',
  'plus',
  'par',
  'aux',
  'ses',
  'ces',
  'cette',
  'nous',
  'vous',
  'leur',
  'leurs',
  'mais',
  'comme',
  'tout',
  'tous',
  'toute',
  'entre',
  'aussi',
  'apres',
  'après',
  'encore',
  'depuis',
  'selon',
  'contre',
  'ainsi',
  'dont',
  'ete',
  'été',
  'etre',
  'être',
  'avoir',
  'fait',
  'faire',
  'peut',
  'sans',
  // Spanish
  'los',
  'las',
  'del',
  'con',
  'por',
  'para',
  'como',
  'pero',
  'sus',
  'este',
  'esta',
  'estos',
  'estas',
  'ese',
  'esa',
  'son',
  'han',
  'hay',
  'mas',
  'más',
  'muy',
  'todo',
  'todos',
  'entre',
  'sobre',
  'desde',
  'hasta',
  'cuando',
  // German
  'der',
  'die',
  'das',
  'den',
  'dem',
  'des',
  'ein',
  'eine',
  'einen',
  'einem',
  'und',
  'oder',
  'aber',
  'auch',
  'nicht',
  'sich',
  'sie',
  'ihr',
  'ihre',
  'mit',
  'von',
  'für',
  'fur',
  'auf',
  'aus',
  'bei',
  'nach',
  'über',
  'uber',
  'wird',
  'wurde',
  'werden',
  'haben',
  'hat',
  'ist',
  'sind',
  'war',
  'waren',
  'dass',
  // Portuguese
  'dos',
  'das',
  'uma',
  'nao',
  'não',
  'mais',
  'como',
  'pelo',
  'pela',
  'seu',
  'sua',
  'seus',
  'suas',
  'este',
  'esse',
  'aquele',
  'foi',
  'foram',
  'ser',
  // Italian
  'gli',
  'delle',
  'degli',
  'nel',
  'nella',
  'sono',
  'anche',
  'come',
  'piu',
  'più',
  'stato',
  'essere',
  'della',
  'dei',
  'alla',
  'alle',
  'agli',
  // Russian
  'что',
  'как',
  'это',
  'для',
  'при',
  'все',
  'уже',
  'его',
  'она',
  'они',
  'был',
  'была',
  'были',
  'быть',
  'если',
  'или',
  'так',
  'том',
  'этом',
  'нет',
  'год',
  'года',
  'году',
  'после',
  'также',
  'может',
  'было',
  'мне',
  'нас',
  // Arabic
  'في',
  'من',
  'على',
  'إلى',
  'الى',
  'عن',
  'مع',
  'هذا',
  'هذه',
  'ذلك',
  'التي',
  'الذي',
  'كان',
  'كانت',
  'قال',
  'لم',
  'لا',
  'ما',
  'أن',
  'ان',
  'إن',
]);

/** What the tokenizer could determine about a text's usability. */
export interface TokenizationResult {
  /** Lowercased word tokens, accents preserved. Empty when unusable. */
  tokens: string[];
  /**
   * True when frequency-based topic extraction over these tokens is
   * meaningful. False means the caller MUST abstain rather than emit topics.
   */
  usable: boolean;
  /** Why `usable` is false — surfaced so abstention is explainable, not silent. */
  reason?: 'unsegmented-script' | 'no-tokens';
  /** True when the text contains letters outside Basic Latin. */
  nonLatin: boolean;
}

/**
 * Tokenize text into lowercased words without destroying non-ASCII letters.
 *
 * Apostrophes and hyphens stay word-internal ("l'union", "co-operation");
 * everything else that is not a Unicode letter or number is a separator.
 */
export function tokenizeWords(text: string): string[] {
  if (!text) return [];
  return (
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}'’-]+/u)
      // Strip apostrophes/hyphens that ended up leading or trailing.
      .map((token) => token.replace(/^['’-]+|['’-]+$/gu, ''))
      .filter(Boolean)
  );
}

/**
 * Tokenize and decide whether the result can honestly support topic
 * extraction. Callers that get `usable: false` must not emit topics.
 */
export function tokenizeForTopics(text: string): TokenizationResult {
  const nonLatin = NON_ASCII_LETTER.test(text ?? '');

  // Han/Kana/Thai/Khmer/Lao need a segmenter we do not have. Whitespace
  // splitting yields sentence-length "words"; frequency over those is noise.
  if (UNSEGMENTED_SCRIPT.test(text ?? '')) {
    return { tokens: [], usable: false, reason: 'unsegmented-script', nonLatin };
  }

  const tokens = tokenizeWords(text);
  if (tokens.length === 0) {
    return { tokens, usable: false, reason: 'no-tokens', nonLatin };
  }

  return { tokens, usable: true, nonLatin };
}

/** True when the token is a known function word in a language we ingest. */
export function isMultilingualStopWord(token: string): boolean {
  return MULTILINGUAL_STOP_WORDS.has(token);
}

/**
 * True when the text is written in a non-Latin script (Cyrillic, Han, Arabic,
 * ...). Unlike a franc-min verdict this is not a guess — it is direct evidence
 * that the English-only NLP stack cannot process the text, and it holds even
 * for strings far too short for reliable language detection.
 */
export function nonLatinScript(text: string): boolean {
  if (!text) return false;
  return /[\p{Script=Cyrillic}\p{Script=Han}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Devanagari}\p{Script=Thai}\p{Script=Greek}]/u.test(
    text,
  );
}
