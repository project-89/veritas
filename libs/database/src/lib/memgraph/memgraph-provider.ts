import { Injectable, Logger } from '@nestjs/common';
import neo4j, { Driver, Session, Result } from 'neo4j-driver';
import {
  DatabaseProvider,
  DatabaseProviderOptions,
} from '../interfaces/database-provider.interface';
import { MemgraphRepository } from './memgraph-repository';
import { Repository } from '../interfaces/repository.interface';

/**
 * Memgraph implementation of the DatabaseProvider interface
 * Using Neo4j driver for compatibility with Memgraph
 */
@Injectable()
export class MemgraphProvider implements DatabaseProvider {
  private driver: Driver | null = null;
  private repositories: Map<string, Repository<any>> = new Map();
  private readonly logger = new Logger(MemgraphProvider.name);

  constructor(private readonly options: DatabaseProviderOptions) {}

  /**
   * Connect to the Memgraph database
   */
  async connect(): Promise<void> {
    try {
      this.logger.log(`Connecting to Memgraph at ${this.options.uri}...`);

      const auth =
        this.options.username && this.options.password
          ? neo4j.auth.basic(this.options.username, this.options.password)
          : undefined;

      this.driver = neo4j.driver(this.options.uri, auth, {
        ...this.options.options,
      });

      // Verify the connection
      await this.driver.verifyConnectivity();

      this.logger.log('Successfully connected to Memgraph');
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Failed to connect to Memgraph: ${err.message}`,
        err.stack
      );
      throw error;
    }
  }

  /**
   * Disconnect from the Memgraph database
   */
  async disconnect(): Promise<void> {
    if (this.driver) {
      try {
        await this.driver.close();
        this.driver = null;
        this.logger.log('Disconnected from Memgraph');
      } catch (error: unknown) {
        const err = error as Error;
        this.logger.error(
          `Failed to disconnect from Memgraph: ${err.message}`,
          err.stack
        );
        throw error;
      }
    }
  }

  /**
   * Check if the Memgraph connection is active
   */
  isConnected(): boolean {
    return this.driver !== null;
  }

  /**
   * Register a model with the Memgraph provider
   * This is a no-op for Memgraph as it doesn't use schemas
   */
  registerModel(name: string, schema?: any): any {
    this.logger.log(`Registering model ${name} for Memgraph (no-op)`);
    return null;
  }

  /**
   * Get a repository for a specific entity type
   * @param entityName The name of the entity to get a repository for
   */
  getRepository<T>(entityName: string): Repository<T> {
    if (!this.driver) {
      throw new Error('Cannot get repository: Memgraph is not connected');
    }

    if (!this.repositories.has(entityName)) {
      const repository = new MemgraphRepository<T>(this.driver, entityName);
      this.repositories.set(entityName, repository);
    }

    return this.repositories.get(entityName) as Repository<T>;
  }

  /**
   * Execute a Cypher query directly
   * @param query The Cypher query to execute
   * @param params Parameters for the query
   */
  async query(query: string, params?: Record<string, any>): Promise<Result> {
    if (!this.driver) {
      throw new Error('Cannot execute query: Memgraph is not connected');
    }

    let session: Session | null = null;
    try {
      session = this.driver.session({
        database: this.options.databaseName,
      });
      return await session.run(query, params);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error executing query: ${err.message}`, err.stack);
      throw error;
    } finally {
      await session?.close();
    }
  }
}
