import { Injectable, Logger } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';
import {
  DatabaseProvider,
  DatabaseProviderOptions,
} from '../interfaces/database-provider.interface';
import { RedisRepository } from './redis-repository';
import { Repository } from '../interfaces/repository.interface';

/**
 * Redis implementation of the DatabaseProvider interface
 */
@Injectable()
export class RedisProvider implements DatabaseProvider {
  private client: RedisClientType | null = null;
  private repositories: Map<string, Repository<unknown>> = new Map();
  private readonly logger = new Logger(RedisProvider.name);

  constructor(private readonly options: DatabaseProviderOptions) {}

  /**
   * Connect to the Redis database
   */
  async connect(): Promise<void> {
    try {
      this.logger.log(`Connecting to Redis at ${this.options.uri}...`);

      const url = this.options.uri;
      this.client = createClient({
        url,
        ...this.options.options,
      });

      // Set up error handling
      this.client.on('error', (err: Error) => {
        this.logger.error(`Redis client error: ${err.message}`, err.stack);
      });

      await this.client.connect();

      this.logger.log('Successfully connected to Redis');
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Failed to connect to Redis: ${err.message}`,
        err.stack
      );
      throw error;
    }
  }

  /**
   * Disconnect from the Redis database
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
        this.client = null;
        this.logger.log('Disconnected from Redis');
      } catch (error: unknown) {
        const err = error as Error;
        this.logger.error(
          `Failed to disconnect from Redis: ${err.message}`,
          err.stack
        );
        throw error;
      }
    }
  }

  /**
   * Check if the Redis connection is active
   */
  isConnected(): boolean {
    return this.client !== null && this.client.isOpen;
  }

  /**
   * Register a model with the Redis provider
   * This is primarily for interface compatibility - Redis doesn't use schemas
   */
  registerModel(name: string): string | null {
    this.logger.log(`Registering model ${name} for Redis (no-op)`);
    return null;
  }

  /**
   * Get a repository for a specific entity type
   * @param entityName The name of the entity to get a repository for
   */
  getRepository<T>(entityName: string): Repository<T> {
    if (!this.client) {
      throw new Error('Cannot get repository: Redis is not connected');
    }

    if (!this.repositories.has(entityName)) {
      // Type assertion here is necessary because Redis repositories
      // require entities with 'id' property, but we need to maintain
      // compatibility with the DatabaseProvider interface
      const repository = new RedisRepository(
        this.client,
        entityName
      ) as unknown as Repository<T>;
      this.repositories.set(entityName, repository);
    }

    return this.repositories.get(entityName) as Repository<T>;
  }

  /**
   * Get the Redis client instance for direct access
   */
  getClient(): RedisClientType | null {
    return this.client;
  }
}
