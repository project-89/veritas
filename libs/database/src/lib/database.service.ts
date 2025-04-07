import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DATABASE_PROVIDER } from './database.constants';
import { DatabaseProvider } from './interfaces/database-provider.interface';
import { Repository } from './interfaces/repository.interface';

/**
 * Service for interacting with the database
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private initialized = false;

  constructor(
    @Inject(DATABASE_PROVIDER) private readonly provider: DatabaseProvider
  ) {}

  /**
   * Initialize the database connection when the module is loaded
   */
  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing database service...');
    await this.connect();
    this.initialized = true;
    this.logger.log('Database service initialized');
  }

  /**
   * Clean up the database connection when the module is destroyed
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log('Destroying database service...');
    await this.disconnect();
    this.logger.log('Database service destroyed');
  }

  /**
   * Connect to the database
   */
  async connect(): Promise<void> {
    if (!this.provider.isConnected()) {
      await this.provider.connect();
    }
  }

  /**
   * Disconnect from the database
   */
  async disconnect(): Promise<void> {
    if (this.provider.isConnected()) {
      await this.provider.disconnect();
    }
  }

  /**
   * Check if the database is connected
   */
  isConnected(): boolean {
    return this.provider.isConnected();
  }

  /**
   * Get a repository for a specific entity
   * @param entityName The name of the entity
   */
  getRepository<T>(entityName: string): Repository<T> {
    if (!this.initialized) {
      throw new Error('Database service is not initialized');
    }

    return this.provider.getRepository<T>(entityName);
  }

  /**
   * Register a model/schema with the database provider
   * @param name The name of the model
   * @param schema The schema for the model
   */
  registerModel(name: string, schema: unknown): unknown {
    if (!this.initialized) {
      throw new Error('Database service is not initialized');
    }

    return this.provider.registerModel(name, schema);
  }
}
