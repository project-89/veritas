import { Injectable, Logger } from '@nestjs/common';
import { Connection, createConnection, Model } from 'mongoose';
import {
  DatabaseProvider,
  DatabaseProviderOptions,
} from '../interfaces/database-provider.interface';
import { MongoDBRepository } from './mongodb-repository';
import { Repository } from '../interfaces/repository.interface';

/**
 * MongoDB implementation of the DatabaseProvider interface
 */
@Injectable()
export class MongoDBProvider implements DatabaseProvider {
  private connection: Connection | null = null;
  private models: Map<string, Model<any>> = new Map();
  private repositories: Map<string, Repository<any>> = new Map();
  private readonly logger = new Logger(MongoDBProvider.name);

  constructor(private readonly options: DatabaseProviderOptions) {}

  /**
   * Connect to the MongoDB database
   */
  async connect(): Promise<void> {
    try {
      this.logger.log(`Connecting to MongoDB at ${this.options.uri}...`);

      this.connection = await createConnection(this.options.uri, {
        dbName: this.options.databaseName,
        user: this.options.username,
        pass: this.options.password,
        ...this.options.options,
      });

      this.logger.log('Successfully connected to MongoDB');
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Failed to connect to MongoDB: ${err.message}`,
        err.stack
      );
      throw error;
    }
  }

  /**
   * Disconnect from the MongoDB database
   */
  async disconnect(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.close();
        this.connection = null;
        this.logger.log('Disconnected from MongoDB');
      } catch (error: unknown) {
        const err = error as Error;
        this.logger.error(
          `Failed to disconnect from MongoDB: ${err.message}`,
          err.stack
        );
        throw error;
      }
    }
  }

  /**
   * Check if the MongoDB connection is active
   */
  isConnected(): boolean {
    return this.connection?.readyState === 1;
  }

  /**
   * Register a model with the MongoDB provider
   * @param name The name of the model
   * @param schema The Mongoose schema for the model
   */
  registerModel(name: string, schema: any): Model<any> {
    if (!this.connection) {
      throw new Error('Cannot register model: MongoDB is not connected');
    }

    if (!this.models.has(name)) {
      this.logger.log(`Registering model: ${name}`);
      const model = this.connection.model(name, schema);
      this.models.set(name, model);
    }

    return this.models.get(name)!;
  }

  /**
   * Get a repository for a specific entity type
   * @param entityName The name of the entity to get a repository for
   */
  getRepository<T>(entityName: string): Repository<T> {
    if (!this.connection) {
      throw new Error('Cannot get repository: MongoDB is not connected');
    }

    if (!this.models.has(entityName)) {
      throw new Error(`Model '${entityName}' is not registered`);
    }

    if (!this.repositories.has(entityName)) {
      const model = this.models.get(entityName)!;
      const repository = new MongoDBRepository<T>(model);
      this.repositories.set(entityName, repository);
    }

    return this.repositories.get(entityName) as Repository<T>;
  }
}
