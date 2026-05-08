import { GoogleGenerativeAI } from '@google/generative-ai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { afinn165 } from 'afinn-165';
import * as francMin from 'franc-min';
import { NlpServiceResponse } from '../types/content.types';

/**
 * Result of content classification including all analysis aspects
 */
export interface ContentClassification {
  /**
   * Content categories based on topic modeling
   */
  categories: string[];

  /**
   * Sentiment analysis results
   */
  sentiment: {
    /**
     * Numerical score from -1 (negative) to 1 (positive)
     */
    score: number;

    /**
     * Categorical label for sentiment
     */
    label: 'positive' | 'negative' | 'neutral';

    /**
     * Confidence level for sentiment classification (0-1)
     */
    confidence: number;
  };

  /**
   * Toxicity score from 0 (non-toxic) to 1 (extremely toxic)
   */
  toxicity: number;

  /**
   * Subjectivity score from 0 (objective) to 1 (subjective)
   */
  subjectivity: number;

  /**
   * Detected language code (ISO 639-1)
   */
  language: string;

  /**
   * Main topics detected in the content
   */
  topics: string[];

  /**
   * Named entities extracted from the content
   */
  entities: Array<{
    /**
     * Entity text as it appears in the content
     */
    text: string;

    /**
     * Entity type (person, organization, location, etc.)
     */
    type: string;

    /**
     * Confidence level for entity detection (0-1)
     */
    confidence: number;
  }>;
}

/**
 * Service responsible for analyzing and classifying text content
 * This is a critical component that provides NLP capabilities to the platform
 */
@Injectable()
export class ContentClassificationService {
  private readonly logger = new Logger(ContentClassificationService.name);
  private readonly nlpEndpoint: string | null = null;
  private readonly apiKey: string | null = null;
  private readonly geminiModel: ReturnType<GoogleGenerativeAI['getGenerativeModel']> | null = null;

  constructor(private readonly configService: ConfigService) {
    // Initialize NLP service configuration
    this.nlpEndpoint = this.configService.get<string>('NLP_SERVICE_ENDPOINT') || null;
    this.apiKey = this.configService.get<string>('NLP_SERVICE_API_KEY') || null;

    // Initialize Gemini for sentiment analysis
    const geminiKey =
      this.configService.get<string>('GEMINI_API_KEY') || process.env['GEMINI_API_KEY'];
    if (geminiKey) {
      try {
        const genAI = new GoogleGenerativeAI(geminiKey);
        this.geminiModel = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' });
        this.logger.log('Gemini sentiment analysis enabled (gemini-3.1-flash-lite-preview)');
      } catch (err) {
        this.logger.warn(`Failed to initialize Gemini: ${err}`);
      }
    }

    // NLP endpoint is optional — local processing (afinn + franc) works fine without it

    this.logger.log('Content classification service initialized');
  }

  /**
   * Classify content using NLP techniques
   * @param text Content text to analyze
   * @returns Promise resolving to ContentClassification with analysis results
   */
  async classifyContent(text: string): Promise<ContentClassification> {
    try {
      this.logger.debug(`Classifying content (${text.length} chars)`);

      // If external NLP service is configured, use it
      if (this.nlpEndpoint && this.apiKey) {
        return await this.classifyWithExternalService(text);
      }

      // Otherwise use local processing
      return this.classifyLocally(text);
    } catch (error) {
      this.logger.error(
        `Classification error: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Provide fallback classification rather than failing completely
      return this.getFallbackClassification();
    }
  }

  /**
   * Classify multiple texts in batch for better performance
   * @param texts Array of text content to analyze
   * @returns Promise resolving to array of ContentClassification results
   */
  async batchClassify(texts: string[]): Promise<ContentClassification[]> {
    if (!texts.length) return [];

    try {
      this.logger.debug(`Batch classifying ${texts.length} texts`);

      // If external NLP service is configured, use batch API
      if (this.nlpEndpoint && this.apiKey) {
        return await this.batchClassifyWithExternalService(texts);
      }

      // Classify locally first (topics, entities, language)
      const localResults = texts.map((text) => this.classifyLocally(text));

      // If Gemini is available, enhance sentiment with LLM
      if (this.geminiModel) {
        try {
          const geminiSentiments = await this.batchSentimentWithGemini(texts);
          for (let i = 0; i < localResults.length; i++) {
            const geminiResult = geminiSentiments[i];
            const localResult = localResults[i];
            if (geminiResult && localResult) {
              localResult.sentiment = geminiResult;
            }
          }
          this.logger.debug(
            `Enhanced ${geminiSentiments.filter(Boolean).length}/${texts.length} texts with Gemini sentiment`,
          );
        } catch (err) {
          this.logger.warn(
            `Gemini sentiment failed, using AFINN fallback: ${err instanceof Error ? err.message : err}`,
          );
        }
      }

      return localResults;
    } catch (error) {
      this.logger.error(
        `Batch classification error: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Return fallback classifications
      return texts.map(() => this.getFallbackClassification());
    }
  }

  /**
   * Update existing classification with new content
   * This allows incremental updates without reprocessing everything
   * @param existingClassification Previous classification results
   * @param newText Updated text content
   * @returns Promise resolving to updated ContentClassification
   */
  async updateClassification(
    existingClassification: ContentClassification,
    newText: string,
  ): Promise<ContentClassification> {
    // For significant text changes, do a full reclassification
    if (this.shouldRecompute(existingClassification, newText)) {
      return this.classifyContent(newText);
    }

    // For minor changes, perform a delta update
    try {
      const deltaClassification = await this.classifyContent(newText);

      // Merge classifications, biased toward new results
      return {
        categories: [
          ...new Set([...deltaClassification.categories, ...existingClassification.categories]),
        ],
        sentiment: deltaClassification.sentiment,
        toxicity: deltaClassification.toxicity,
        subjectivity: deltaClassification.subjectivity,
        language: deltaClassification.language,
        topics: [...new Set([...deltaClassification.topics, ...existingClassification.topics])],
        entities: this.mergeEntities(existingClassification.entities, deltaClassification.entities),
      };
    } catch (error) {
      this.logger.error(
        `Update classification error: ${error instanceof Error ? error.message : String(error)}`,
      );
      return existingClassification;
    }
  }

  /**
   * Classify content using external NLP service
   * This leverages advanced ML models for better accuracy
   */
  private async classifyWithExternalService(text: string): Promise<ContentClassification> {
    if (!this.nlpEndpoint || !this.apiKey) {
      throw new Error('External NLP service not configured');
    }

    try {
      // Call external NLP API
      const response = await fetch(this.nlpEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error(`NLP service error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Map external service response to our internal format
      return this.mapServiceResponseToClassification(data);
    } catch (error) {
      this.logger.error(
        `External NLP service error: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Fall back to local processing
      return this.classifyLocally(text);
    }
  }

  /**
   * Batch classify content using external NLP service
   */
  private async batchClassifyWithExternalService(
    texts: string[],
  ): Promise<ContentClassification[]> {
    if (!this.nlpEndpoint || !this.apiKey) {
      throw new Error('External NLP service not configured');
    }

    try {
      // Call external NLP API with batch input
      const response = await fetch(`${this.nlpEndpoint}/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ texts }),
      });

      if (!response.ok) {
        throw new Error(`NLP batch service error: ${response.status} ${response.statusText}`);
      }

      const dataArray = (await response.json()) as NlpServiceResponse[];

      // Map each response to our internal format
      return dataArray.map((data) => this.mapServiceResponseToClassification(data));
    } catch (error) {
      this.logger.error(
        `External NLP batch service error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      // Fall back to local processing
      return Promise.all(texts.map((text) => this.classifyLocally(text)));
    }
  }

  /**
   * Map external service response to our internal ContentClassification format
   */
  private mapServiceResponseToClassification(data: NlpServiceResponse): ContentClassification {
    // This mapping would be specific to your chosen NLP service
    return {
      categories: data.categories || [],
      sentiment: {
        score: data.sentiment?.score || 0,
        label: this.mapSentimentLabel(data.sentiment?.label ?? ''),
        confidence: data.sentiment?.confidence || 0.5,
      },
      toxicity: data.toxicity || 0,
      subjectivity: data.subjectivity || 0.5,
      language: data.language || 'en',
      topics: data.topics || [],
      entities: (data.entities || []).map((entity) => ({
        text: entity.text || '',
        type: entity.type || 'unknown',
        confidence: entity.confidence || 0.5,
      })),
    };
  }

  /**
   * Map external sentiment labels to our internal format
   */
  private mapSentimentLabel(externalLabel: string): 'positive' | 'negative' | 'neutral' {
    if (!externalLabel) return 'neutral';

    const label = externalLabel.toLowerCase();
    if (label.includes('positive')) return 'positive';
    if (label.includes('negative')) return 'negative';
    return 'neutral';
  }

  /**
   * Classify content locally using simplified NLP techniques
   * This is a fallback when external services are unavailable
   */
  private classifyLocally(text: string): ContentClassification {
    const normalizedText = text.toLowerCase();

    return {
      categories: this.detectCategories(normalizedText),
      sentiment: this.analyzeSentiment(normalizedText),
      toxicity: this.calculateToxicity(normalizedText),
      subjectivity: this.calculateSubjectivity(normalizedText),
      language: this.detectLanguage(normalizedText),
      topics: this.extractTopics(normalizedText),
      entities: this.extractEntities(normalizedText),
    };
  }

  /**
   * Detect content categories based on keyword analysis
   */
  private detectCategories(text: string): string[] {
    const categories = new Set<string>();

    // Common category keywords (simplified implementation)
    const categoryKeywords: Record<string, string[]> = {
      politics: ['government', 'election', 'vote', 'political', 'policy', 'president', 'congress'],
      technology: ['tech', 'software', 'digital', 'ai', 'computer', 'app', 'innovation'],
      business: ['company', 'market', 'industry', 'economic', 'finance', 'investment', 'startup'],
      health: ['medical', 'healthcare', 'disease', 'treatment', 'doctor', 'patient', 'wellness'],
      science: ['research', 'discovery', 'scientist', 'study', 'experiment', 'physics', 'biology'],
      entertainment: ['movie', 'music', 'celebrity', 'film', 'actor', 'game', 'TV', 'show'],
      sports: ['team', 'player', 'game', 'championship', 'tournament', 'league', 'win'],
      environment: ['climate', 'sustainable', 'green', 'eco', 'environmental', 'planet', 'carbon'],
    };

    // Check for category keywords in the text
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some((keyword) => text.includes(keyword))) {
        categories.add(category);
      }
    }

    return Array.from(categories);
  }

  /**
   * Analyze sentiment using the AFINN-165 lexicon (3382 words scored -5 to +5)
   */
  /**
   * Batch sentiment analysis using Gemini Flash.
   * Sends all texts in a single prompt, gets back JSON array of sentiments.
   */
  private async batchSentimentWithGemini(
    texts: string[],
  ): Promise<Array<ContentClassification['sentiment'] | null>> {
    if (!this.geminiModel || texts.length === 0) return texts.map(() => null);

    // Batch in groups of 30 to stay within token limits
    const BATCH_SIZE = 30;
    const allResults: Array<ContentClassification['sentiment'] | null> = [];

    const totalBatches = Math.ceil(texts.length / BATCH_SIZE);
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const batch = texts.slice(i, i + BATCH_SIZE);
      this.logger.log(
        `[Gemini] Processing batch ${batchNum}/${totalBatches} (${batch.length} texts)`,
      );
      const numberedTexts = batch.map((t, idx) => `[${idx}] ${t.slice(0, 300)}`).join('\n\n');

      const prompt = `Analyze the sentiment of each numbered social media post below. For each post, determine:
- score: a number from -1.0 (very negative) to 1.0 (very positive), 0 = neutral
- label: "positive", "negative", or "neutral"
- confidence: 0.0 to 1.0

Context: These posts are about a project/community. Look for frustration, criticism, disappointment, praise, support, excitement. Phrases like "went dark", "disappeared", "gave up", "dead project", "no leadership" are negative. Phrases like "believe in", "support", "building", "real ones" are positive.

Respond ONLY with a JSON array of objects, one per post, in order. No other text.
Example: [{"score": -0.7, "label": "negative", "confidence": 0.85}, {"score": 0.3, "label": "positive", "confidence": 0.7}]

Posts:
${numberedTexts}`;

      try {
        const result = await this.geminiModel.generateContent(prompt);
        const responseText = result.response.text();

        // Extract JSON from response (might have markdown code fences)
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as Array<{
            score: number;
            label: string;
            confidence: number;
          }>;

          for (let j = 0; j < batch.length; j++) {
            const item = parsed[j];
            if (item && typeof item.score === 'number') {
              allResults.push({
                score: Math.max(-1, Math.min(1, item.score)),
                label:
                  item.label === 'positive'
                    ? 'positive'
                    : item.label === 'negative'
                      ? 'negative'
                      : 'neutral',
                confidence: Math.max(0, Math.min(1, item.confidence ?? 0.5)),
              });
            } else {
              allResults.push(null);
            }
          }
        } else {
          // Couldn't parse — fill with nulls
          for (let j = 0; j < batch.length; j++) allResults.push(null);
        }
      } catch (err) {
        this.logger.warn(
          `Gemini batch ${i / BATCH_SIZE} failed: ${err instanceof Error ? err.message : err}`,
        );
        for (let j = 0; j < batch.length; j++) allResults.push(null);
      }
    }

    return allResults;
  }

  private analyzeSentiment(text: string): ContentClassification['sentiment'] {
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    const wordCount = Math.max(words.length, 1);

    let totalScore = 0;
    let matchedCount = 0;

    for (const word of words) {
      // Strip punctuation from edges for better matching
      const cleaned = word.replace(/^[^a-z]+|[^a-z]+$/g, '');
      if (cleaned && cleaned in afinn165) {
        totalScore += afinn165[cleaned] ?? 0;
        matchedCount++;
      }
    }

    // Normalize score to -1..1 range
    const rawScore = totalScore / wordCount;
    const score = Math.max(-1, Math.min(1, rawScore));

    // Determine label
    let label: 'positive' | 'negative' | 'neutral' = 'neutral';
    if (score > 0.1) {
      label = 'positive';
    } else if (score < -0.1) {
      label = 'negative';
    }

    // Confidence: proportion of words found in lexicon * strength of signal
    const lexiconCoverage = matchedCount / wordCount;
    const confidence = Math.min(0.95, lexiconCoverage * Math.abs(score) + lexiconCoverage * 0.3);

    return {
      score,
      label,
      confidence,
    };
  }

  /**
   * Calculate toxicity score based on presence of toxic language
   */
  private calculateToxicity(text: string): number {
    // Common toxic language patterns (simplified implementation)
    const toxicPatterns = [
      /\b(hate|despise|detest)\b/i,
      /\b(idiot|stupid|dumb)\b/i,
      /\b(kill|murder|attack)\b/i,
      // Add more patterns as needed
    ];

    // Count matches of toxic patterns
    const toxicMatches = toxicPatterns.reduce((count, pattern) => {
      return count + (text.match(pattern) ? 1 : 0);
    }, 0);

    // Normalize to 0-1 scale
    return Math.min(1.0, toxicMatches / toxicPatterns.length);
  }

  /**
   * Calculate subjectivity based on presence of subjective language
   */
  private calculateSubjectivity(text: string): number {
    // Common subjective language patterns (simplified implementation)
    const subjectivePatterns = [
      /\b(I|we|my|our)\b/i,
      /\b(think|believe|feel|opinion)\b/i,
      /\b(should|must|need to|have to)\b/i,
      /\b(good|bad|great|terrible)\b/i,
      // Add more patterns as needed
    ];

    // Count matches of subjective patterns
    const subjectiveMatches = subjectivePatterns.reduce((count, pattern) => {
      return count + (text.match(pattern) ? 1 : 0);
    }, 0);

    // Normalize to 0-1 scale
    return Math.min(1.0, subjectiveMatches / subjectivePatterns.length);
  }

  /**
   * Detect language based on character n-gram frequency profiles
   * Uses franc-min library for accurate language detection
   */
  private detectLanguage(text: string): string {
    try {
      // Text needs to be at least a few characters for reliable detection
      if (text.length < 10) {
        this.logger.debug('Text too short for language detection, defaulting to English');
        return 'en';
      }

      // Detect language using franc-min (returns ISO 639-3 codes)
      const detectedLang = francMin.franc(text);

      // Map ISO 639-3 codes to ISO 639-1 codes for common languages
      const langMap: Record<string, string> = {
        eng: 'en', // English
        spa: 'es', // Spanish
        fra: 'fr', // French
        deu: 'de', // German
        ita: 'it', // Italian
        por: 'pt', // Portuguese
        rus: 'ru', // Russian
        jpn: 'ja', // Japanese
        zho: 'zh', // Chinese
        ara: 'ar', // Arabic
        hin: 'hi', // Hindi
        kor: 'ko', // Korean
        nld: 'nl', // Dutch
        und: 'en', // Undefined (default to English)
      };

      // Return the mapped language code or the original code if not in the map
      const mappedLang = langMap[detectedLang] || detectedLang;
      this.logger.debug(`Detected language: ${mappedLang} (from ${detectedLang})`);

      return mappedLang;
    } catch (error) {
      this.logger.warn(
        `Language detection error: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Default to English on error
      return 'en';
    }
  }

  /** Comprehensive stopword list for topic extraction */
  private static readonly STOP_WORDS = new Set([
    'a',
    'about',
    'above',
    'after',
    'again',
    'against',
    'ago',
    'ahead',
    'all',
    'almost',
    'along',
    'already',
    'also',
    'although',
    'always',
    'am',
    'among',
    'an',
    'and',
    'another',
    'any',
    'anybody',
    'anyone',
    'anything',
    'anywhere',
    'are',
    'area',
    'areas',
    'around',
    'as',
    'ask',
    'asked',
    'asking',
    'at',
    'available',
    'away',
    'back',
    'backed',
    'be',
    'became',
    'because',
    'become',
    'becomes',
    'been',
    'before',
    'began',
    'begin',
    'behind',
    'being',
    'below',
    'best',
    'better',
    'between',
    'big',
    'bit',
    'both',
    'but',
    'by',
    'came',
    'can',
    'cannot',
    'case',
    'cases',
    'certain',
    'clearly',
    'come',
    'could',
    'course',
    'currently',
    'day',
    'days',
    'did',
    'differ',
    'different',
    'do',
    'does',
    'doing',
    'done',
    'down',
    'during',
    'each',
    'early',
    'either',
    'end',
    'enough',
    'even',
    'every',
    'everybody',
    'everyone',
    'everything',
    'everywhere',
    'fact',
    'far',
    'feel',
    'few',
    'find',
    'first',
    'for',
    'found',
    'from',
    'full',
    'further',
    'gave',
    'general',
    'get',
    'gets',
    'give',
    'given',
    'go',
    'going',
    'gone',
    'good',
    'got',
    'great',
    'group',
    'had',
    'has',
    'have',
    'having',
    'he',
    'help',
    'her',
    'here',
    'herself',
    'high',
    'him',
    'himself',
    'his',
    'how',
    'however',
    'http',
    'https',
    'if',
    'important',
    'in',
    'include',
    'including',
    'interest',
    'into',
    'is',
    'it',
    'its',
    'itself',
    'just',
    'keep',
    'kind',
    'knew',
    'know',
    'known',
    'large',
    'last',
    'later',
    'latest',
    'least',
    'less',
    'let',
    'lets',
    'like',
    'likely',
    'line',
    'little',
    'long',
    'look',
    'looking',
    'lot',
    'made',
    'make',
    'making',
    'man',
    'many',
    'may',
    'maybe',
    'me',
    'men',
    'might',
    'more',
    'most',
    'mostly',
    'mr',
    'mrs',
    'much',
    'must',
    'my',
    'myself',
    'name',
    'need',
    'needed',
    'never',
    'new',
    'next',
    'no',
    'non',
    'nor',
    'not',
    'nothing',
    'now',
    'number',
    'of',
    'off',
    'often',
    'old',
    'on',
    'once',
    'one',
    'only',
    'open',
    'or',
    'order',
    'other',
    'others',
    'our',
    'out',
    'over',
    'own',
    'part',
    'per',
    'perhaps',
    'place',
    'point',
    'possible',
    'present',
    'problem',
    'put',
    'quite',
    'rather',
    'read',
    'real',
    'really',
    'right',
    'room',
    'run',
    'said',
    'same',
    'saw',
    'say',
    'says',
    'second',
    'see',
    'seem',
    'seemed',
    'set',
    'several',
    'shall',
    'she',
    'should',
    'show',
    'showed',
    'side',
    'since',
    'small',
    'so',
    'some',
    'somebody',
    'someone',
    'something',
    'sometimes',
    'somewhere',
    'state',
    'still',
    'such',
    'sure',
    'take',
    'taken',
    'tell',
    'than',
    'that',
    'the',
    'their',
    'them',
    'then',
    'there',
    'therefore',
    'these',
    'they',
    'thing',
    'things',
    'think',
    'this',
    'those',
    'though',
    'thought',
    'three',
    'through',
    'time',
    'to',
    'today',
    'together',
    'too',
    'took',
    'top',
    'toward',
    'turn',
    'two',
    'under',
    'until',
    'up',
    'upon',
    'us',
    'use',
    'used',
    'using',
    'very',
    'want',
    'was',
    'way',
    'we',
    'well',
    'went',
    'were',
    'what',
    'when',
    'where',
    'whether',
    'which',
    'while',
    'who',
    'whole',
    'whom',
    'whose',
    'why',
    'will',
    'with',
    'within',
    'without',
    'won',
    'word',
    'words',
    'work',
    'world',
    'would',
    'www',
    'year',
    'years',
    'yes',
    'yet',
    'you',
    'your',
    'yours',
    'yourself',
  ]);

  /**
   * Check if a word is a valid topic candidate
   */
  private isValidTopicWord(word: string): boolean {
    if (word.length < 3) return false;
    if (ContentClassificationService.STOP_WORDS.has(word)) return false;
    // Reject words that are just numbers or contain special characters
    if (/^\d+$/.test(word)) return false;
    if (/[^a-z'-]/.test(word)) return false;
    return true;
  }

  /**
   * Extract main topics from text using frequency analysis of words and bigrams
   */
  private extractTopics(text: string): string[] {
    // Clean and tokenize: split on non-alpha characters, lowercase
    const rawWords = text
      .toLowerCase()
      .split(/[^a-z'-]+/)
      .filter(Boolean);

    // Filter to valid candidate words
    const validWords = rawWords.filter((w) => this.isValidTopicWord(w));

    // Count single-word frequencies
    const wordCounts = new Map<string, number>();
    for (const word of validWords) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }

    // Extract bigrams (adjacent valid-word pairs) for phrase detection
    const bigramCounts = new Map<string, number>();
    for (let i = 0; i < validWords.length - 1; i++) {
      const bigram = `${validWords[i]} ${validWords[i + 1]}`;
      bigramCounts.set(bigram, (bigramCounts.get(bigram) || 0) + 1);
    }

    // Collect candidate topics: bigrams that appear 2+ times, then top single words
    const topics: string[] = [];
    const usedWords = new Set<string>();

    // Add meaningful bigrams first (phrases are more informative)
    const sortedBigrams = Array.from(bigramCounts.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1]);

    for (const [bigram] of sortedBigrams) {
      if (topics.length >= 4) break;
      topics.push(bigram);
      // Mark component words as used so we don't duplicate them as singles
      for (const w of bigram.split(' ')) {
        usedWords.add(w);
      }
    }

    // Fill remaining slots with top single words (not already covered by bigrams)
    const sortedWords = Array.from(wordCounts.entries())
      .filter(([word, count]) => count >= 2 && !usedWords.has(word))
      .sort((a, b) => b[1] - a[1]);

    for (const [word] of sortedWords) {
      if (topics.length >= 8) break;
      topics.push(word);
    }

    // If we still have very few topics, include single-occurrence words by frequency
    if (topics.length < 5) {
      const remaining = Array.from(wordCounts.entries())
        .filter(([word]) => !usedWords.has(word) && !topics.includes(word))
        .sort((a, b) => b[1] - a[1]);

      for (const [word] of remaining) {
        if (topics.length >= 6) break;
        topics.push(word);
      }
    }

    return topics;
  }

  /**
   * Extract named entities from text
   */
  private extractEntities(text: string): ContentClassification['entities'] {
    const entities: ContentClassification['entities'] = [];

    // Extract simple entity patterns (simplified implementation)
    // People: capitalized names
    const namePattern = /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)\b/g;
    const nameMatches = text.match(namePattern) || [];

    for (const name of nameMatches) {
      entities.push({
        text: name,
        type: 'person',
        confidence: 0.7,
      });
    }

    // Organizations: capitalized multi-word phrases ending in Inc, Corp, etc.
    const orgPattern =
      /\b([A-Z][a-z]*(?:\s[A-Z][a-z]*)+(?:\s(?:Inc|Corp|LLC|Company|Organization|Association)))\b/g;
    const orgMatches = text.match(orgPattern) || [];

    for (const org of orgMatches) {
      entities.push({
        text: org,
        type: 'organization',
        confidence: 0.8,
      });
    }

    // Locations: known place names
    const locationKeywords = [
      'New York',
      'London',
      'Paris',
      'Tokyo',
      'California',
      'Texas',
      'Europe',
      'Asia',
    ];
    for (const location of locationKeywords) {
      if (text.includes(location)) {
        entities.push({
          text: location,
          type: 'location',
          confidence: 0.8,
        });
      }
    }

    // Hashtags and mentions for social media
    const socialPattern = /(?:#|@)([a-zA-Z0-9_]+)/g;
    const socialMatches = text.match(socialPattern) || [];

    for (const social of socialMatches) {
      entities.push({
        text: social,
        type: social.startsWith('#') ? 'hashtag' : 'mention',
        confidence: 0.9,
      });
    }

    return entities;
  }

  /**
   * Merge entity lists, removing duplicates and keeping highest confidence
   */
  private mergeEntities(
    existing: ContentClassification['entities'],
    newEntities: ContentClassification['entities'],
  ): ContentClassification['entities'] {
    const entityMap = new Map<string, ContentClassification['entities'][0]>();

    // Add existing entities to map
    for (const entity of existing) {
      entityMap.set(`${entity.text}:${entity.type}`, entity);
    }

    // Add or update with new entities
    for (const entity of newEntities) {
      const key = `${entity.text}:${entity.type}`;
      const existingEntity = entityMap.get(key);

      if (!existingEntity || entity.confidence > existingEntity.confidence) {
        entityMap.set(key, entity);
      }
    }

    return Array.from(entityMap.values());
  }

  /**
   * Determine if content has changed enough to warrant full recomputation
   */
  private shouldRecompute(existingClassification: ContentClassification, newText: string): boolean {
    // If we have categories and topics, we can compare with new text
    const existingKeywords = [
      ...existingClassification.categories,
      ...existingClassification.topics,
    ];

    // Check if key terms are still present in new text
    const textLower = newText.toLowerCase();
    const missingKeywords = existingKeywords.filter(
      (keyword) => !textLower.includes(keyword.toLowerCase()),
    );

    // If many keywords are missing, text has changed substantially
    return missingKeywords.length > existingKeywords.length / 2;
  }

  /**
   * Get fallback classification when processing fails
   */
  private getFallbackClassification(): ContentClassification {
    return {
      categories: [],
      sentiment: {
        score: 0,
        label: 'neutral',
        confidence: 0.5,
      },
      toxicity: 0,
      subjectivity: 0.5,
      language: 'en',
      topics: [],
      entities: [],
    };
  }
}
