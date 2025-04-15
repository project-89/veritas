/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, Logger } from '@nestjs/common';
import {
  Driver,
  Record as Neo4jRecord,
  Session,
  int,
  isInt,
  Integer,
  Result,
} from 'neo4j-driver';
import {
  FindOptions,
  Repository,
  VectorSearchOptions,
  VectorSearchResult,
} from '../interfaces/repository.interface';

/**
 * Memgraph implementation of the Repository interface
 */
@Injectable()
export class MemgraphRepository<T> implements Repository<T> {
  private readonly logger = new Logger(MemgraphRepository.name);

  constructor(
    private readonly driver: Driver,
    private readonly entityName: string
  ) {}

  /**
   * Convert a Neo4j record to a domain entity
   */
  private recordToEntity(record: Neo4jRecord): T {
    const node = record.get('n');
    if (!node) {
      throw new Error('No node found in record');
    }

    const properties = { ...node.properties, id: node.identity.toString() };

    // Convert Neo4j integer values to JavaScript numbers
    Object.keys(properties).forEach((key) => {
      if (isInt(properties[key])) {
        properties[key] = (properties[key] as Integer).toNumber();
      }
    });

    return properties as unknown as T;
  }

  /**
   * Execute a Cypher query
   */
  private async executeQuery(
    query: string,
    params?: Record<string, any>
  ): Promise<Neo4jRecord[]> {
    let session: Session | null = null;
    try {
      session = this.driver.session();
      const result = await session.run(query, params);
      return result.records;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error executing query: ${err.message}`, err.stack);
      throw error;
    } finally {
      await session?.close();
    }
  }

  /**
   * Find all entities matching the given filter
   */
  async find(
    filter: Record<string, any> = {},
    options?: FindOptions
  ): Promise<T[]> {
    try {
      // Build WHERE clause from filter
      const whereConditions = Object.entries(filter).map(([key]) => {
        return `n.${key} = $${key}`;
      });

      const whereClause =
        whereConditions.length > 0
          ? `WHERE ${whereConditions.join(' AND ')}`
          : '';

      // Build ORDER BY clause for sorting
      const orderClause = options?.sort
        ? `ORDER BY ${Object.entries(options.sort)
            .map(
              ([field, direction]) =>
                `n.${field} ${direction === 1 ? 'ASC' : 'DESC'}`
            )
            .join(', ')}`
        : '';

      // Add pagination
      const limitClause = options?.limit ? `LIMIT ${options.limit}` : '';
      const skipClause = options?.skip ? `SKIP ${options.skip}` : '';

      const query = `
        MATCH (n:${this.entityName})
        ${whereClause}
        ${orderClause}
        ${skipClause}
        ${limitClause}
        RETURN n
      `;

      const records = await this.executeQuery(query, filter);
      return records.map((record) => this.recordToEntity(record));
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
      const query = `
        MATCH (n:${this.entityName})
        WHERE id(n) = $id
        RETURN n
      `;

      const records = await this.executeQuery(query, { id: int(id) });
      return records.length > 0 ? this.recordToEntity(records[0]) : null;
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
    try {
      // Build WHERE clause from filter
      const whereConditions = Object.entries(filter).map(([key]) => {
        return `n.${key} = $${key}`;
      });

      const whereClause =
        whereConditions.length > 0
          ? `WHERE ${whereConditions.join(' AND ')}`
          : '';

      const query = `
        MATCH (n:${this.entityName})
        ${whereClause}
        RETURN n
        LIMIT 1
      `;

      const records = await this.executeQuery(query, filter);
      return records.length > 0 ? this.recordToEntity(records[0]) : null;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error finding entity: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Count entities matching the given filter
   */
  async count(filter: Record<string, any> = {}): Promise<number> {
    try {
      // Build WHERE clause from filter
      const whereConditions = Object.entries(filter).map(([key]) => {
        return `n.${key} = $${key}`;
      });

      const whereClause =
        whereConditions.length > 0
          ? `WHERE ${whereConditions.join(' AND ')}`
          : '';

      const query = `
        MATCH (n:${this.entityName})
        ${whereClause}
        RETURN count(n) as count
      `;

      const records = await this.executeQuery(query, filter);
      const count = records[0].get('count');
      return isInt(count) ? (count as Integer).toNumber() : (count as number);
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
      const query = `
        CREATE (n:${this.entityName} $data)
        RETURN n
      `;

      const records = await this.executeQuery(query, { data });
      return this.recordToEntity(records[0]);
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
      // Using UNWIND for batch creation
      const query = `
        UNWIND $data AS item
        CREATE (n:${this.entityName})
        SET n = item
        RETURN n
      `;

      const records = await this.executeQuery(query, { data });
      return records.map((record) => this.recordToEntity(record));
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Error creating multiple entities: ${err.message}`,
        err.stack
      );
      throw error;
    }
  }

  /**
   * Update an entity by ID
   */
  async updateById(id: string, data: Partial<T>): Promise<T | null> {
    try {
      const query = `
        MATCH (n:${this.entityName})
        WHERE id(n) = $id
        SET n += $data
        RETURN n
      `;

      const records = await this.executeQuery(query, { id: int(id), data });
      return records.length > 0 ? this.recordToEntity(records[0]) : null;
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
    updateData: Partial<T>
  ): Promise<number> {
    try {
      // Build WHERE clause from filter
      const whereConditions = Object.entries(filter).map(([key]) => {
        return `n.${key} = $${key}`;
      });

      const whereClause =
        whereConditions.length > 0
          ? `WHERE ${whereConditions.join(' AND ')}`
          : '';

      const query = `
        MATCH (n:${this.entityName})
        ${whereClause}
        SET n += $data
        RETURN count(n) as count
      `;

      const params = { ...filter, data: updateData };
      const records = await this.executeQuery(query, params);
      const count = records[0].get('count');
      return isInt(count) ? (count as Integer).toNumber() : (count as number);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Error updating multiple entities: ${err.message}`,
        err.stack
      );
      throw error;
    }
  }

  /**
   * Delete an entity by ID
   */
  async deleteById(id: string): Promise<T | null> {
    try {
      const query = `
        MATCH (n:${this.entityName})
        WHERE id(n) = $id
        WITH n, properties(n) as props
        DELETE n
        RETURN props
      `;

      const records = await this.executeQuery(query, { id: int(id) });
      if (records.length === 0) {
        return null;
      }

      const props = records[0].get('props');
      return { ...props, id } as unknown as T;
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
      // Build WHERE clause from filter
      const whereConditions = Object.entries(filter).map(([key]) => {
        return `n.${key} = $${key}`;
      });

      const whereClause =
        whereConditions.length > 0
          ? `WHERE ${whereConditions.join(' AND ')}`
          : '';

      const query = `
        MATCH (n:${this.entityName})
        ${whereClause}
        WITH count(n) as count
        DELETE n
        RETURN count
      `;

      const records = await this.executeQuery(query, filter);
      const count = records[0].get('count');
      return isInt(count) ? (count as Integer).toNumber() : (count as number);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Error deleting multiple entities: ${err.message}`,
        err.stack
      );
      throw error;
    }
  }

  // Add vector search capability to MemgraphRepository
  /**
   * Perform vector similarity search
   * Uses Memgraph's vector search capabilities
   *
   * @param field The field containing the vector to search against
   * @param vector The query vector
   * @param options Options for the vector search
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
      // Convert vector to string representation for Cypher
      const vectorStr = JSON.stringify(vector);

      // Cypher query to find similar entities using cosine similarity
      // This uses a custom function that should be registered in Memgraph
      const query = `
        MATCH (n:${this.entityName})
        WHERE EXISTS(n.${field})
        WITH n, gds.similarity.cosine(n.${field}, $vector) AS similarity
        WHERE similarity >= $minScore
        RETURN n, similarity
        ORDER BY similarity DESC
        LIMIT $limit
      `;

      const params = {
        vector,
        minScore,
        limit,
      };

      const result = await this.executeQuery(query, params);

      return result.map((record) => ({
        item: this.recordToEntity(record.get('n')) as unknown as R,
        score: record.get('similarity'),
      }));
    } catch (error) {
      this.logger.error(
        `Vector search error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );

      // Fall back to in-memory vector search if the Memgraph query fails
      return this.inMemoryVectorSearch<R>(field, vector, limit, minScore);
    }
  }

  /**
   * In-memory vector search implementation
   * Used as fallback when Memgraph vector search is not available
   */
  private async inMemoryVectorSearch<R>(
    field: string,
    vector: number[],
    limit: number,
    minScore: number
  ): Promise<VectorSearchResult<R>[]> {
    try {
      // Get all entities with the specified field
      const query = `
        MATCH (n:${this.entityName})
        WHERE EXISTS(n.${field})
        RETURN n
      `;

      const records = await this.executeQuery(query);
      const entities = records.map((record) =>
        this.recordToEntity(record.get('n'))
      );

      // Calculate similarity for each entity
      const results = entities
        .map((entity) => {
          const entityVector = this.getNestedProperty(entity, field);
          if (
            !Array.isArray(entityVector) ||
            entityVector.length !== vector.length
          ) {
            return null;
          }

          const similarity = this.calculateCosineSimilarity(
            vector,
            entityVector
          );
          return {
            item: entity as unknown as R,
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
    } catch (error) {
      this.logger.error(
        `In-memory vector search error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return [];
    }
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
