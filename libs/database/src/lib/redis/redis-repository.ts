import { Injectable, Logger } from '@nestjs/common';
import { RedisClientType } from 'redis';
import { v4 as uuidv4 } from 'uuid';
import { FindOptions, Repository } from '../interfaces/repository.interface';

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
    this.prefix = `${entityName}:`;
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
}
