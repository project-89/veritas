import { Repository } from './repository.interface';

/**
 * Core database provider interface that all database adapters must implement
 */
export interface DatabaseProvider {
  /**
   * Connect to the database
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the database
   */
  disconnect(): Promise<void>;

  /**
   * Check if the database connection is active
   */
  isConnected(): boolean;

  /**
   * Register a model with the database provider
   * @param name The name of the model
   * @param schema The schema definition for the model
   */
  registerModel(name: string, schema: any): any;

  /**
   * Get a repository for a specific entity type
   * @param entityName The name of the entity to get a repository for
   */
  getRepository<T>(entityName: string): Repository<T>;
}

/**
 * Options for configuring a database provider
 */
export interface DatabaseProviderOptions {
  /**
   * Connection URI for the database
   */
  uri: string;

  /**
   * Database name
   */
  databaseName: string;

  /**
   * Optional username for authentication
   */
  username?: string;

  /**
   * Optional password for authentication
   */
  password?: string;

  /**
   * Optional additional connection options
   */
  options?: Record<string, any>;
}
