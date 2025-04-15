import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DATABASE_PROVIDER_TOKEN } from '../constants';
import { Inject } from '@nestjs/common';

/**
 * Vector embedding dimensions
 */
export type EmbeddingVector = number[];

/**
 * Results from a vector similarity search
 */
export interface VectorSearchResult<T> {
  /**
   * The matched item
   */
  item: T;

  /**
   * Similarity score between 0 and 1, where 1 is exact match
   */
  score: number;
}

/**
 * Options for vector search
 */
export interface VectorSearchOptions {
  /**
   * Number of results to return (default: 10)
   */
  limit?: number;

  /**
   * Minimum similarity threshold between 0 and 1 (default: 0.7)
   */
  minScore?: number;
}

/**
 * Service responsible for text embeddings and vector search
 * This service provides:
 * 1. Generation of text embeddings using external API or local models
 * 2. Vector similarity search for finding semantically similar content
 * 3. Caching of embeddings to improve performance
 */
@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private readonly embeddingEndpoint: string | null = null;
  private readonly apiKey: string | null = null;
  private readonly embeddingDimension = 384; // Default for many models like MiniLM
  private readonly cacheTTL = 86400000; // 24 hours in milliseconds
  private embeddingsCache: Map<
    string,
    { vector: EmbeddingVector; timestamp: number }
  > = new Map();

  constructor(
    private readonly configService: ConfigService,
    @Optional()
    @Inject(DATABASE_PROVIDER_TOKEN)
    private readonly databaseService?: any
  ) {
    // Initialize embeddings service configuration
    this.embeddingEndpoint =
      this.configService.get<string>('EMBEDDING_SERVICE_ENDPOINT') || null;
    this.apiKey =
      this.configService.get<string>('EMBEDDING_SERVICE_API_KEY') || null;

    const configuredDimension = this.configService.get<number>(
      'EMBEDDING_DIMENSION'
    );
    if (configuredDimension) {
      this.embeddingDimension = configuredDimension;
    }

    // Validate configuration
    if (!this.embeddingEndpoint) {
      this.logger.warn(
        'EMBEDDING_SERVICE_ENDPOINT not configured, falling back to local processing'
      );
    }

    this.logger.log('Embeddings service initialized');
  }

  /**
   * Generate embedding vector for the provided text
   * Uses external service if configured, otherwise falls back to local implementation
   *
   * @param text Text to generate embedding for
   * @returns Promise resolving to embedding vector
   */
  async generateEmbedding(text: string): Promise<EmbeddingVector> {
    // Check cache first
    const cacheKey = this.createCacheKey(text);
    const cachedItem = this.embeddingsCache.get(cacheKey);

    if (cachedItem && Date.now() - cachedItem.timestamp < this.cacheTTL) {
      this.logger.debug('Using cached embedding');
      return cachedItem.vector;
    }

    try {
      let embedding: EmbeddingVector;

      // If external embedding service is configured, use it
      if (this.embeddingEndpoint && this.apiKey) {
        embedding = await this.generateEmbeddingWithExternalService(text);
      } else {
        // Otherwise use local processing
        embedding = this.generateEmbeddingLocally(text);
      }

      // Cache the result
      this.embeddingsCache.set(cacheKey, {
        vector: embedding,
        timestamp: Date.now(),
      });

      return embedding;
    } catch (error) {
      this.logger.error(
        `Embedding generation error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      // Return zero vector as fallback
      return Array(this.embeddingDimension).fill(0);
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   *
   * @param texts Array of texts to generate embeddings for
   * @returns Promise resolving to array of embedding vectors
   */
  async batchGenerateEmbeddings(texts: string[]): Promise<EmbeddingVector[]> {
    if (!texts.length) return [];

    try {
      // If external embedding service is configured, use batch API
      if (this.embeddingEndpoint && this.apiKey) {
        return await this.batchGenerateWithExternalService(texts);
      }

      // Otherwise process sequentially with local implementation
      return Promise.all(texts.map((text) => this.generateEmbedding(text)));
    } catch (error) {
      this.logger.error(
        `Batch embedding generation error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      // Return zero vectors as fallback
      return texts.map(() => Array(this.embeddingDimension).fill(0));
    }
  }

  /**
   * Perform vector similarity search against stored content
   *
   * @param textOrVector Text or vector to search similar content for
   * @param options Search options
   * @returns Promise resolving to array of search results
   */
  async searchSimilarContent<T>(
    textOrVector: string | EmbeddingVector,
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult<T>[]> {
    try {
      const queryVector = Array.isArray(textOrVector)
        ? textOrVector
        : await this.generateEmbedding(textOrVector);

      // Set default options
      const limit = options.limit || 10;
      const minScore = options.minScore || 0.7;

      // Use vector search from database if available
      if (this.databaseService) {
        const contentRepository = this.databaseService.getRepository('Content');
        if (
          contentRepository &&
          typeof contentRepository.vectorSearch === 'function'
        ) {
          return await contentRepository.vectorSearch<T>(
            'embedding', // Field name containing the vector
            queryVector,
            { limit, minScore }
          );
        }
      }

      // Fallback to local vector search implementation
      return this.performLocalVectorSearch<T>(queryVector, limit, minScore);
    } catch (error) {
      this.logger.error(
        `Vector similarity search error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return [];
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   *
   * @param vecA First vector
   * @param vecB Second vector
   * @returns Similarity score between 0 and 1
   */
  calculateSimilarity(vecA: EmbeddingVector, vecB: EmbeddingVector): number {
    if (vecA.length !== vecB.length) {
      throw new Error('Vectors must have the same dimensions');
    }

    // Calculate dot product
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    // Handle zero vectors
    if (normA === 0 || normB === 0) {
      return 0;
    }

    // Calculate cosine similarity
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Generate embedding using external service
   *
   * @param text Text to generate embedding for
   * @returns Promise resolving to embedding vector
   */
  private async generateEmbeddingWithExternalService(
    text: string
  ): Promise<EmbeddingVector> {
    if (!this.embeddingEndpoint || !this.apiKey) {
      throw new Error('External embedding service not configured');
    }

    try {
      // Call external embedding API
      const response = await fetch(this.embeddingEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ text, model: 'text-embedding' }),
      });

      if (!response.ok) {
        throw new Error(
          `Embedding service error: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      // Extract the embedding vector from the response based on service format
      // This is based on common embedding API response formats and may need adjustment
      const embedding =
        data.data?.[0]?.embedding || data.embedding || data.vector;

      if (!Array.isArray(embedding)) {
        throw new Error('Invalid embedding response format');
      }

      return embedding;
    } catch (error) {
      this.logger.error(
        `External embedding service error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      // Fall back to local processing
      return this.generateEmbeddingLocally(text);
    }
  }

  /**
   * Generate embeddings for multiple texts using external service
   *
   * @param texts Array of texts to generate embeddings for
   * @returns Promise resolving to array of embedding vectors
   */
  private async batchGenerateWithExternalService(
    texts: string[]
  ): Promise<EmbeddingVector[]> {
    if (!this.embeddingEndpoint || !this.apiKey) {
      throw new Error('External embedding service not configured');
    }

    try {
      // Call external embedding API with batch input
      const response = await fetch(`${this.embeddingEndpoint}/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ texts, model: 'text-embedding' }),
      });

      if (!response.ok) {
        throw new Error(
          `Embedding batch service error: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      // Extract embeddings from the response based on service format
      let embeddings: EmbeddingVector[];

      if (Array.isArray(data.data)) {
        // Handle OpenAI-like format
        embeddings = data.data.map((item: any) => item.embedding);
      } else if (Array.isArray(data.embeddings)) {
        // Handle format with direct embeddings array
        embeddings = data.embeddings;
      } else {
        throw new Error('Invalid embedding batch response format');
      }

      return embeddings;
    } catch (error) {
      this.logger.error(
        `External embedding batch service error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      // Fall back to local processing
      return Promise.all(
        texts.map((text) => this.generateEmbeddingLocally(text))
      );
    }
  }

  /**
   * Generate embedding locally (simplified implementation)
   * This is a fallback method when external service is not available
   *
   * @param text Text to generate embedding for
   * @returns Embedding vector
   */
  private generateEmbeddingLocally(text: string): EmbeddingVector {
    // This is a very simplistic embedding approach for fallback purposes only
    // In production, you should use a proper embedding model or library

    // Normalize and tokenize text
    const normalized = text.toLowerCase().trim();
    const words = normalized.split(/\s+/).slice(0, 100); // Limit to 100 words

    // Initialize empty vector with zeros
    const vector = Array(this.embeddingDimension).fill(0);

    // Only proceed if we have words
    if (words.length === 0) {
      return vector;
    }

    // Simple character-level approach for generating pseudo-embeddings
    // This does NOT produce meaningful semantic vectors but serves as a fallback
    for (let i = 0; i < words.length; i++) {
      const word = words[i];

      for (let j = 0; j < word.length && j < this.embeddingDimension; j++) {
        // Use character code as a simple feature
        const charCode = word.charCodeAt(j) / 255; // Normalize to 0-1 range

        // Distribute this word's influence across the vector
        const position = (i * word.length + j) % this.embeddingDimension;
        vector[position] += charCode / words.length; // Normalize by word count
      }
    }

    // Normalize the vector to unit length
    const magnitude = Math.sqrt(
      vector.reduce((sum, val) => sum + val * val, 0)
    );

    return magnitude === 0 ? vector : vector.map((v) => v / magnitude);
  }

  /**
   * Create a cache key for the provided text
   *
   * @param text Text to create cache key for
   * @returns Cache key string
   */
  private createCacheKey(text: string): string {
    // Use a simple hashing approach for cache keys
    // In production, consider using a proper hashing algorithm
    return `emb_${Buffer.from(text.substring(0, 100)).toString('base64')}`;
  }

  /**
   * Perform vector search locally against provided content
   * This is a fallback when database vector search is not available
   *
   * @param queryVector Vector to search similar content for
   * @param limit Maximum number of results to return
   * @param minScore Minimum similarity threshold
   * @returns Array of search results
   */
  private async performLocalVectorSearch<T>(
    queryVector: EmbeddingVector,
    limit: number,
    minScore: number
  ): Promise<VectorSearchResult<T>[]> {
    // For local implementation, we need content with embeddings
    // This is a very inefficient approach and should only be used as fallback
    if (!this.databaseService) {
      return [];
    }

    try {
      const contentRepository = this.databaseService.getRepository('Content');
      const allContent = await contentRepository.find();

      // Filter content that has embeddings
      const contentWithEmbeddings = allContent.filter(
        (item: any) => item.embedding && Array.isArray(item.embedding)
      );

      // Calculate similarity for each item
      const results = contentWithEmbeddings.map((item: any) => ({
        item: item as unknown as T,
        score: this.calculateSimilarity(queryVector, item.embedding),
      }));

      // Filter by minimum score and sort by similarity (descending)
      return results
        .filter((result) => result.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    } catch (error) {
      this.logger.error(
        `Local vector search error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return [];
    }
  }
}
