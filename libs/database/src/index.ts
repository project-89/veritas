export * from './lib/database.module';
export * from './lib/database.service';
export * from './lib/database.constants';
export * from './lib/interfaces';
export * from './lib/mongodb';
export * from './lib/memgraph';
export * from './lib/redis';

// Re-export the core classes and interfaces for convenience
export { DatabaseModule } from './lib/database.module';
export { DatabaseService } from './lib/database.service';
export {
  DatabaseProvider,
  DatabaseProviderOptions,
} from './lib/interfaces/database-provider.interface';
export { Repository, FindOptions } from './lib/interfaces/repository.interface';
export { MongoDBProvider } from './lib/mongodb/mongodb-provider';
export { MemgraphProvider } from './lib/memgraph/memgraph-provider';
export { RedisProvider } from './lib/redis/redis-provider';
