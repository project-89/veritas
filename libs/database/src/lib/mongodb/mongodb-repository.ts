import { Injectable, Logger } from '@nestjs/common';
import {
  Document,
  FilterQuery,
  Model,
  UpdateQuery,
  UpdateWithAggregationPipeline,
} from 'mongoose';
import { FindOptions, Repository } from '../interfaces/repository.interface';

/**
 * Vector similarity search options
 */
export interface VectorSearchOptions {
  /**
   * Number of results to return
   */
  limit?: number;

  /**
   * Minimum similarity threshold between 0 and 1
   */
  minScore?: number;
}

/**
 * Vector search result
 */
export interface VectorSearchResult<T> {
  /**
   * The matched item
   */
  item: T;

  /**
   * Similarity score between 0 and 1
   */
  score: number;
}

/**
 * MongoDB implementation of the Repository interface
 */
@Injectable()
export class MongoDBRepository<T> implements Repository<T> {
  private readonly logger = new Logger(MongoDBRepository.name);

  constructor(private readonly model: Model<T & Document>) {}

  /**
   * Find all entities matching the given filter
   */
  async find(filter: FilterQuery<T> = {}, options?: FindOptions): Promise<T[]> {
    try {
      let query = this.model.find(filter);

      if (options?.skip) {
        query = query.skip(options.skip);
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      if (options?.sort) {
        query = query.sort(options.sort);
      }

      return await query.exec();
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error finding documents: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Find a single entity by its ID
   */
  async findById(id: string): Promise<T | null> {
    try {
      return await this.model.findById(id).exec();
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Error finding document by ID: ${err.message}`,
        err.stack
      );
      throw error;
    }
  }

  /**
   * Find a single entity matching the given filter
   */
  async findOne(filter: FilterQuery<T>): Promise<T | null> {
    try {
      return await this.model.findOne(filter).exec();
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error finding document: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Count entities matching the given filter
   */
  async count(filter: FilterQuery<T> = {}): Promise<number> {
    try {
      return await this.model.countDocuments(filter).exec();
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error counting documents: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Create a new entity
   */
  async create(data: Partial<T>): Promise<T> {
    try {
      const newEntity = new this.model(data);
      return (await newEntity.save()) as T;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error creating document: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Create multiple entities
   */
  async createMany(data: Partial<T>[]): Promise<T[]> {
    try {
      return (await this.model.insertMany(data)) as T[];
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Error creating multiple documents: ${err.message}`,
        err.stack
      );
      throw error;
    }
  }

  /**
   * Update an entity by ID
   */
  async updateById(id: string, data: UpdateQuery<T>): Promise<T | null> {
    try {
      return await this.model
        .findByIdAndUpdate(id, data as UpdateQuery<T & Document>, { new: true })
        .exec();
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Error updating document by ID: ${err.message}`,
        err.stack
      );
      throw error;
    }
  }

  /**
   * Update entities matching the given filter
   */
  async updateMany(
    filter: FilterQuery<T>,
    data: UpdateQuery<T>
  ): Promise<number> {
    try {
      const result = await this.model
        .updateMany(filter, data as UpdateWithAggregationPipeline)
        .exec();
      return result.modifiedCount;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error updating documents: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Delete an entity by ID
   */
  async deleteById(id: string): Promise<T | null> {
    try {
      return await this.model.findByIdAndDelete(id).exec();
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Error deleting document by ID: ${err.message}`,
        err.stack
      );
      throw error;
    }
  }

  /**
   * Delete entities matching the given filter
   */
  async deleteMany(filter: FilterQuery<T>): Promise<number> {
    try {
      const result = await this.model.deleteMany(filter).exec();
      return result.deletedCount;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error deleting documents: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Perform vector similarity search using MongoDB Atlas Vector Search
   * Falls back to in-memory search if vector search is not available
   *
   * @param field Field containing the vector data
   * @param vector Query vector to search against
   * @param options Search options
   * @returns Promise resolving to search results
   */
  async vectorSearch<R = T>(
    field: string,
    vector: number[],
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult<R>[]> {
    const limit = options.limit || 10;
    const minScore = options.minScore || 0.7;

    try {
      // Check if vector search is available (MongoDB Atlas Vector Search)
      if (this.hasVectorSearchCapability()) {
        return this.performAtlasVectorSearch<R>(field, vector, limit, minScore);
      }

      // Fall back to in-memory vector search if no vector search capability
      return this.performInMemoryVectorSearch<R>(
        field,
        vector,
        limit,
        minScore
      );
    } catch (error) {
      this.logger.error(
        `Vector search error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return [];
    }
  }

  /**
   * Check if the MongoDB instance supports vector search
   */
  private hasVectorSearchCapability(): boolean {
    try {
      // Attempt to access the vector search command to check if it's available
      // This is a basic check, may need to be refined based on exact MongoDB version
      const db = this.model.db;
      return (
        typeof db.command === 'function' &&
        typeof db.collection('system.indexes').find === 'function'
      );
    } catch (error) {
      this.logger.warn(
        'Vector search capability check failed, assuming not available'
      );
      return false;
    }
  }

  /**
   * Perform vector search using MongoDB Atlas Vector Search
   */
  private async performAtlasVectorSearch<R>(
    field: string,
    vector: number[],
    limit: number,
    minScore: number
  ): Promise<VectorSearchResult<R>[]> {
    try {
      const db = this.model.db;
      const result = await db.command({
        $search: {
          index: 'vector',
          knnVector: {
            vector,
            path: field,
            k: limit,
            filter: {
              range: {
                path: '_score',
                gte: minScore,
              },
            },
          },
        },
      });

      // Map results to our standard interface
      return (result.results || []).map((item: any) => ({
        item: item as unknown as R,
        score: item._score || 0,
      }));
    } catch (error) {
      this.logger.error(
        `Atlas vector search error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      // Fall back to in-memory search
      return this.performInMemoryVectorSearch<R>(
        field,
        vector,
        limit,
        minScore
      );
    }
  }

  /**
   * Perform vector search in memory when MongoDB Vector Search is not available
   * This is less efficient but works as a fallback
   */
  private async performInMemoryVectorSearch<R>(
    field: string,
    vector: number[],
    limit: number,
    minScore: number
  ): Promise<VectorSearchResult<R>[]> {
    // Get all documents that have the vector field
    const filter: FilterQuery<T & Document> = {};
    filter[field] = { $exists: true };

    const documents = await this.model.find(filter).lean().exec();

    // Calculate cosine similarity for each document
    const results = documents
      .map((doc) => {
        const docVector = this.getNestedProperty(doc, field);
        if (!Array.isArray(docVector) || docVector.length !== vector.length) {
          return null;
        }

        const similarity = this.calculateCosineSimilarity(vector, docVector);
        return {
          item: doc as unknown as R,
          score: similarity,
        };
      })
      .filter(
        (result): result is VectorSearchResult<R> =>
          result !== null && result.score >= minScore
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return results;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      throw new Error('Vectors must have the same dimensions');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Access nested property in an object using dot notation
   */
  private getNestedProperty(obj: any, path: string): any {
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }
}
