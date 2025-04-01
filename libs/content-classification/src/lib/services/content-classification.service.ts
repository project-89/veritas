import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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

  constructor(private readonly configService: ConfigService) {
    // Initialize NLP service configuration
    this.nlpEndpoint =
      this.configService.get<string>('NLP_SERVICE_ENDPOINT') || null;
    this.apiKey = this.configService.get<string>('NLP_SERVICE_API_KEY') || null;

    // Validate configuration
    if (!this.nlpEndpoint) {
      this.logger.warn(
        'NLP_SERVICE_ENDPOINT not configured, falling back to local processing'
      );
    }

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
        `Classification error: ${
          error instanceof Error ? error.message : String(error)
        }`
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

      // Otherwise process sequentially with local implementation
      return Promise.all(texts.map((text) => this.classifyLocally(text)));
    } catch (error) {
      this.logger.error(
        `Batch classification error: ${
          error instanceof Error ? error.message : String(error)
        }`
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
    newText: string
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
          ...new Set([
            ...deltaClassification.categories,
            ...existingClassification.categories,
          ]),
        ],
        sentiment: deltaClassification.sentiment,
        toxicity: deltaClassification.toxicity,
        subjectivity: deltaClassification.subjectivity,
        language: deltaClassification.language,
        topics: [
          ...new Set([
            ...deltaClassification.topics,
            ...existingClassification.topics,
          ]),
        ],
        entities: this.mergeEntities(
          existingClassification.entities,
          deltaClassification.entities
        ),
      };
    } catch (error) {
      this.logger.error(
        `Update classification error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return existingClassification;
    }
  }

  /**
   * Classify content using external NLP service
   * This leverages advanced ML models for better accuracy
   */
  private async classifyWithExternalService(
    text: string
  ): Promise<ContentClassification> {
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
        throw new Error(
          `NLP service error: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      // Map external service response to our internal format
      return this.mapServiceResponseToClassification(data);
    } catch (error) {
      this.logger.error(
        `External NLP service error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      // Fall back to local processing
      return this.classifyLocally(text);
    }
  }

  /**
   * Batch classify content using external NLP service
   */
  private async batchClassifyWithExternalService(
    texts: string[]
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
        throw new Error(
          `NLP batch service error: ${response.status} ${response.statusText}`
        );
      }

      const dataArray = await response.json();

      // Map each response to our internal format
      return dataArray.map(this.mapServiceResponseToClassification);
    } catch (error) {
      this.logger.error(
        `External NLP batch service error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      // Fall back to local processing
      return Promise.all(texts.map((text) => this.classifyLocally(text)));
    }
  }

  /**
   * Map external service response to our internal ContentClassification format
   */
  private mapServiceResponseToClassification(data: any): ContentClassification {
    // This mapping would be specific to your chosen NLP service
    return {
      categories: data.categories || [],
      sentiment: {
        score: data.sentiment?.score || 0,
        label: this.mapSentimentLabel(data.sentiment?.label),
        confidence: data.sentiment?.confidence || 0.5,
      },
      toxicity: data.toxicity || 0,
      subjectivity: data.subjectivity || 0.5,
      language: data.language || 'en',
      topics: data.topics || [],
      entities: (data.entities || []).map((entity: any) => ({
        text: entity.text || '',
        type: entity.type || 'unknown',
        confidence: entity.confidence || 0.5,
      })),
    };
  }

  /**
   * Map external sentiment labels to our internal format
   */
  private mapSentimentLabel(
    externalLabel: string
  ): 'positive' | 'negative' | 'neutral' {
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
      politics: [
        'government',
        'election',
        'vote',
        'political',
        'policy',
        'president',
        'congress',
      ],
      technology: [
        'tech',
        'software',
        'digital',
        'ai',
        'computer',
        'app',
        'innovation',
      ],
      business: [
        'company',
        'market',
        'industry',
        'economic',
        'finance',
        'investment',
        'startup',
      ],
      health: [
        'medical',
        'healthcare',
        'disease',
        'treatment',
        'doctor',
        'patient',
        'wellness',
      ],
      science: [
        'research',
        'discovery',
        'scientist',
        'study',
        'experiment',
        'physics',
        'biology',
      ],
      entertainment: [
        'movie',
        'music',
        'celebrity',
        'film',
        'actor',
        'game',
        'TV',
        'show',
      ],
      sports: [
        'team',
        'player',
        'game',
        'championship',
        'tournament',
        'league',
        'win',
      ],
      environment: [
        'climate',
        'sustainable',
        'green',
        'eco',
        'environmental',
        'planet',
        'carbon',
      ],
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
   * Analyze sentiment based on lexicon approach
   */
  private analyzeSentiment(text: string): ContentClassification['sentiment'] {
    const words = text.split(/\s+/);

    // Common sentiment words (simplified implementation)
    const positiveWords = new Set([
      'good',
      'great',
      'excellent',
      'wonderful',
      'fantastic',
      'amazing',
      'love',
      'happy',
      'best',
      'positive',
      'beautiful',
      'perfect',
      'nice',
      'glad',
      'awesome',
      'thrilled',
      'delighted',
    ]);

    const negativeWords = new Set([
      'bad',
      'terrible',
      'awful',
      'horrible',
      'disappointing',
      'hate',
      'sad',
      'worst',
      'negative',
      'ugly',
      'poor',
      'wrong',
      'angry',
      'upset',
      'unfortunate',
      'dislike',
    ]);

    // Count positive and negative words
    const positiveCount = words.filter((word) =>
      positiveWords.has(word)
    ).length;
    const negativeCount = words.filter((word) =>
      negativeWords.has(word)
    ).length;
    const totalCount = words.length;

    // Calculate sentiment score (-1 to 1)
    let score = 0;
    if (positiveCount + negativeCount > 0) {
      score =
        (positiveCount - negativeCount) /
        Math.max(positiveCount + negativeCount, 1);
    }

    // Determine sentiment label
    let label: 'positive' | 'negative' | 'neutral' = 'neutral';
    if (score > 0.2) {
      label = 'positive';
    } else if (score < -0.2) {
      label = 'negative';
    }

    // Calculate confidence based on proportion of sentiment words
    const confidence = Math.min(
      0.9,
      Math.abs(score) + (positiveCount + negativeCount) / totalCount
    );

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
   * This is a simplified implementation - in production use a dedicated library
   */
  private detectLanguage(text: string): string {
    // Default to English for simplified implementation
    // In production, use a library like franc-min or langdetect
    return 'en';
  }

  /**
   * Extract main topics from text using TF-IDF approach
   */
  private extractTopics(text: string): string[] {
    const topics = new Set<string>();
    const words = text.split(/\s+/);

    // Get candidate keywords (remove common stop words)
    const stopWords = new Set([
      'the',
      'and',
      'a',
      'in',
      'to',
      'of',
      'is',
      'it',
      'that',
      'for',
      'with',
      'as',
      'be',
    ]);
    const keywords = words.filter(
      (word) => word.length > 3 && !stopWords.has(word.toLowerCase())
    );

    // Count word frequency
    const wordCounts = new Map<string, number>();
    for (const word of keywords) {
      const lowerWord = word.toLowerCase();
      wordCounts.set(lowerWord, (wordCounts.get(lowerWord) || 0) + 1);
    }

    // Get top keywords by frequency
    const topKeywords = Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map((entry) => entry[0]);

    return topKeywords;
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
    newEntities: ContentClassification['entities']
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
  private shouldRecompute(
    existingClassification: ContentClassification,
    newText: string
  ): boolean {
    // If we have categories and topics, we can compare with new text
    const existingKeywords = [
      ...existingClassification.categories,
      ...existingClassification.topics,
    ];

    // Check if key terms are still present in new text
    const textLower = newText.toLowerCase();
    const missingKeywords = existingKeywords.filter(
      (keyword) => !textLower.includes(keyword.toLowerCase())
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
