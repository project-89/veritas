import { Injectable, Logger } from '@nestjs/common';
import { RedisClientType } from 'redis';
import { v4 as uuidv4 } from 'uuid';
import {
  FindOptions,
  Repository,
  VectorSearchOptions,
  VectorSearchResult,
} from '../interfaces/repository.interface';

/**
 * Redis implementation of the Repository interface
 */
@Injectable()
export class RedisRepository<T extends { id: string }>
  implements Repository<T>
{
  private readonly logger = new Logger(RedisRepository.name);
  private readonly prefix: string;

  constructor(
    private readonly client: RedisClientType,
    private readonly entityName: string
  ) {
    // Create a namespace prefix for keys
    this.prefix = `${entityName.toLowerCase()}:`;
  }

  /**
   * Get the full Redis key for an entity
   * @param id The entity ID
   */
  private getKey(id: string): string {
    return `${this.prefix}${id}`;
  }

  /**
   * Find all entities matching the given filter
   * Note: Redis doesn't have native filtering capabilities, so this
   * performs a scan + client-side filtering
   */
  async find(
    filter: Record<string, any> = {},
    options?: FindOptions
  ): Promise<T[]> {
    try {
      // Get all keys with our prefix
      const keys = await this.client.keys(`${this.prefix}*`);

      if (keys.length === 0) {
        return [];
      }

      // Get all values (need to use pipeline for efficiency)
      const pipeline = this.client.multi();
      for (const key of keys) {
        pipeline.get(key);
      }

      const results = await pipeline.exec();

      // Parse the JSON values and filter
      const entities: T[] = [];
      for (const result of results as unknown as (string | null)[]) {
        if (result) {
          try {
            const entity = JSON.parse(result) as T;

            // Apply filter (simple client-side filtering)
            const matches = Object.entries(filter).every(
              ([key, value]) => entity[key as keyof T] === value
            );

            if (matches) {
              entities.push(entity);
            }
          } catch (e) {
            this.logger.warn(`Failed to parse Redis value: ${e}`);
          }
        }
      }

      // Apply pagination options
      let filteredEntities = entities;

      if (options?.sort) {
        const [sortKey, sortOrder] = Object.entries(options.sort)[0];
        filteredEntities = filteredEntities.sort((a, b) => {
          if (sortOrder === 1) {
            return a[sortKey as keyof T] > b[sortKey as keyof T] ? 1 : -1;
          } else {
            return a[sortKey as keyof T] < b[sortKey as keyof T] ? 1 : -1;
          }
        });
      }

      if (options?.skip) {
        filteredEntities = filteredEntities.slice(options.skip);
      }

      if (options?.limit) {
        filteredEntities = filteredEntities.slice(0, options.limit);
      }

      return filteredEntities;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error finding entities: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Find a single entity by its ID
   */
  async findById(id: string): Promise<T | null> {
    try {
      const key = this.getKey(id);
      const data = await this.client.get(key);

      if (!data) {
        return null;
      }

      return JSON.parse(data) as T;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Error finding entity by ID: ${err.message}`,
        err.stack
      );
      throw error;
    }
  }

  /**
   * Find a single entity matching the given filter
   */
  async findOne(filter: Record<string, any>): Promise<T | null> {
    const entities = await this.find(filter, { limit: 1 });
    return entities.length > 0 ? entities[0] : null;
  }

  /**
   * Count entities matching the given filter
   */
  async count(filter: Record<string, any> = {}): Promise<number> {
    try {
      const entities = await this.find(filter);
      return entities.length;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error counting entities: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Create a new entity
   */
  async create(data: Partial<T>): Promise<T> {
    try {
      // Generate ID if not provided
      const entity = {
        ...data,
        id: data.id || uuidv4(),
      } as T;

      const key = this.getKey(entity.id);
      await this.client.set(key, JSON.stringify(entity));

      return entity;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error creating entity: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Create multiple entities
   */
  async createMany(data: Partial<T>[]): Promise<T[]> {
    try {
      // Use a pipeline for better performance
      const pipeline = this.client.multi();
      const entities: T[] = [];

      for (const item of data) {
        const entity = {
          ...item,
          id: item.id || uuidv4(),
        } as T;

        const key = this.getKey(entity.id);
        pipeline.set(key, JSON.stringify(entity));
        entities.push(entity);
      }

      await pipeline.exec();
      return entities;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error creating entities: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Update an entity by ID
   */
  async updateById(id: string, data: Partial<T>): Promise<T | null> {
    try {
      const existing = await this.findById(id);

      if (!existing) {
        return null;
      }

      // Merge the existing entity with the update data
      const updated = { ...existing, ...data } as T;

      const key = this.getKey(id);
      await this.client.set(key, JSON.stringify(updated));

      return updated;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Error updating entity by ID: ${err.message}`,
        err.stack
      );
      throw error;
    }
  }

  /**
   * Update entities matching the given filter
   */
  async updateMany(
    filter: Record<string, any>,
    data: Partial<T>
  ): Promise<number> {
    try {
      // Find all matching entities
      const entities = await this.find(filter);

      if (entities.length === 0) {
        return 0;
      }

      // Use a pipeline for better performance
      const pipeline = this.client.multi();

      for (const entity of entities) {
        const updated = { ...entity, ...data };
        const key = this.getKey(entity.id);
        pipeline.set(key, JSON.stringify(updated));
      }

      await pipeline.exec();
      return entities.length;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error updating entities: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Delete an entity by ID
   */
  async deleteById(id: string): Promise<T | null> {
    try {
      const existing = await this.findById(id);

      if (!existing) {
        return null;
      }

      const key = this.getKey(id);
      await this.client.del(key);

      return existing;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Error deleting entity by ID: ${err.message}`,
        err.stack
      );
      throw error;
    }
  }

  /**
   * Delete entities matching the given filter
   */
  async deleteMany(filter: Record<string, any>): Promise<number> {
    try {
      // Find all matching entities
      const entities = await this.find(filter);

      if (entities.length === 0) {
        return 0;
      }

      // Use a pipeline for better performance
      const pipeline = this.client.multi();

      for (const entity of entities) {
        const key = this.getKey(entity.id);
        pipeline.del(key);
      }

      await pipeline.exec();
      return entities.length;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error deleting entities: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Perform vector similarity search on Redis
   * @param field Field containing the vector to search against
   * @param vector The query vector
   * @param options Search options
   * @returns Matching items with similarity scores
   */
  async vectorSearch<R = T>(
    field: string,
    vector: number[],
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult<R>[]> {
    const { limit = 10, minScore = 0.7 } = options;

    this.logger.debug(
      `Performing vector search on ${this.entityName} with field ${field}, limit ${limit}, minScore ${minScore}`
    );

    try {
      // Check if Redis has vector search capability
      const hasVectorSearch = await this.hasVectorSearchCapability();

      if (hasVectorSearch) {
        // Try to create index if it doesn't exist
        await this.tryCreateVectorIndex(field);

        // Use Redis Vector Search if available
        return this.performRedisVectorSearch<R>(field, vector, limit, minScore);
      } else {
        this.logger.warn(
          `Redis Vector Search not available, falling back to in-memory search for ${this.entityName}`
        );
        return this.performInMemoryVectorSearch<R>(
          field,
          vector,
          limit,
          minScore
        );
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(
        `Error during vector search on ${this.entityName}: ${errorMessage}`,
        errorStack
      );
      // Fall back to in-memory search on error
      return this.performInMemoryVectorSearch<R>(
        field,
        vector,
        limit,
        minScore
      );
    }
  }

  /**
   * Check if Redis has Vector Search capability
   */
  private async hasVectorSearchCapability(): Promise<boolean> {
    try {
      // Try to get info about a dummy index to see if FT module is loaded
      await this.client.sendCommand(['FT.INFO', '_dummy_index_']);
      return true;
    } catch (error: unknown) {
      // If error includes "unknown command" or "unknown index", FT module is not available
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (
        errorMessage.includes('unknown command') ||
        errorMessage.includes('unknown index name')
      ) {
        return errorMessage.includes('unknown index name'); // If it's just unknown index, FT is available
      }
      throw error; // Rethrow other errors
    }
  }

  /**
   * Try to create a vector index for the entity type if it doesn't exist
   */
  private async tryCreateVectorIndex(field: string): Promise<void> {
    try {
      const indexName = `idx:${this.entityName.toLowerCase()}:${field}`;

      // Check if index already exists
      try {
        await this.client.sendCommand(['FT.INFO', indexName]);
        return; // Index exists, nothing to do
      } catch (error: unknown) {
        // If error is not "unknown index", rethrow it
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        if (!errorMessage.includes('unknown index name')) {
          throw error;
        }
      }

      // Create index if it doesn't exist
      const createIndexCmd = [
        'FT.CREATE',
        indexName,
        'ON',
        'HASH',
        'PREFIX',
        '1',
        this.prefix,
        'SCHEMA',
        field,
        'VECTOR',
        'FLAT',
        '6',
        'TYPE',
        'FLOAT32',
        'DIM',
        '384',
        'DISTANCE_METRIC',
        'COSINE',
      ];

      await this.client.sendCommand(createIndexCmd);
      this.logger.debug(
        `Created vector index ${indexName} for ${this.entityName}`
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(
        `Failed to create vector index for ${this.entityName}: ${errorMessage}`,
        errorStack
      );
      // Non-blocking error - we'll fall back to in-memory search
    }
  }

  /**
   * Perform vector search using Redis
   */
  private async performRedisVectorSearch<R>(
    field: string,
    vector: number[],
    limit: number,
    minScore: number
  ): Promise<VectorSearchResult<R>[]> {
    const indexName = `idx:${this.entityName.toLowerCase()}:${field}`;
    const query = `*=>[KNN ${limit} @${field} $vector AS score]`;

    // Convert vector to string format for Redis
    const vectorStr = vector.join(',');

    // Execute search command
    const results = (await this.client.sendCommand([
      'FT.SEARCH',
      indexName,
      query,
      'PARAMS',
      '2',
      'vector',
      vectorStr,
      'RETURN',
      '2',
      'score',
      '$',
    ])) as any[];

    if (!results || !Array.isArray(results) || results.length === 0) {
      return [];
    }

    // Parse results - Redis returns in format: [totalCount, key1, [field1, value1, ...], key2, ...]
    const totalCount = results[0] as number;
    if (totalCount === 0) {
      return [];
    }

    const items: VectorSearchResult<R>[] = [];

    // Process each result pair (key and values)
    for (let i = 1; i < results.length; i += 2) {
      const key = results[i] as string;
      const values = results[i + 1] as string[];

      // Find score in values array
      let score = 0;
      let itemJson = '';

      for (let j = 0; j < values.length; j += 2) {
        if (values[j] === 'score') {
          score = 1 - parseFloat(values[j + 1]); // Convert cosine distance to similarity
        } else if (values[j] === '$') {
          itemJson = values[j + 1];
        }
      }

      // Skip items below minimum score
      if (score < minScore) {
        continue;
      }

      // Parse the item and add to results
      try {
        const item = JSON.parse(itemJson) as R;
        items.push({ item, score });
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        this.logger.error(`Failed to parse item from Redis: ${errorMessage}`);
      }
    }

    return items;
  }

  /**
   * Perform vector search in memory as fallback
   */
  private async performInMemoryVectorSearch<R>(
    field: string,
    vector: number[],
    limit: number,
    minScore: number
  ): Promise<VectorSearchResult<R>[]> {
    // Retrieve all entities
    const allEntities = await this.find();

    const results: VectorSearchResult<R>[] = [];

    // Compare each entity's vector with the query vector
    for (const entity of allEntities) {
      const entityVector = this.getNestedProperty(entity, field);

      // Skip entities without the vector field
      if (!entityVector || !Array.isArray(entityVector)) {
        continue;
      }

      // Calculate similarity
      const score = this.calculateCosineSimilarity(vector, entityVector);

      // Add to results if above minimum score
      if (score >= minScore) {
        results.push({ item: entity as unknown as R, score });
      }
    }

    // Sort by score descending and limit results
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
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

    // Handle zero vectors
    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Get a nested property from an object using dot notation
   */
  private getNestedProperty(obj: any, path: string): any {
    if (!obj || !path) {
      return undefined;
    }

    const pathParts = path.split('.');
    let current = obj;

    for (const part of pathParts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }
}
