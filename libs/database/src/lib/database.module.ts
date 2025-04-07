import { DynamicModule, Module, Provider } from '@nestjs/common';
import { DatabaseService } from './database.service';
import {
  DatabaseProvider,
  DatabaseProviderOptions,
} from './interfaces/database-provider.interface';
import { MongoDBProvider } from './mongodb/mongodb-provider';
import { MemgraphProvider } from './memgraph/memgraph-provider';
import { RedisProvider } from './redis/redis-provider';
import { DATABASE_PROVIDER } from './database.constants';

export interface DatabaseModuleOptions {
  /**
   * Database provider options
   */
  providerOptions: DatabaseProviderOptions;

  /**
   * Database provider type
   */
  providerType: 'mongodb' | 'memgraph' | 'redis';

  /**
   * Global module flag
   */
  isGlobal?: boolean;
}

@Module({})
export class DatabaseModule {
  /**
   * Register the database module with the given options
   * @param options Options for configuring the database module
   */
  static register(options: DatabaseModuleOptions): DynamicModule {
    const databaseProviderFactory: Provider = {
      provide: DATABASE_PROVIDER,
      useFactory: () => {
        let provider: DatabaseProvider;

        switch (options.providerType) {
          case 'mongodb':
            provider = new MongoDBProvider(options.providerOptions);
            break;
          case 'memgraph':
            provider = new MemgraphProvider(options.providerOptions);
            break;
          case 'redis':
            provider = new RedisProvider(options.providerOptions);
            break;
          default:
            throw new Error(`Unknown provider type: ${options.providerType}`);
        }

        return provider;
      },
    };

    return {
      module: DatabaseModule,
      global: options.isGlobal ?? false,
      providers: [databaseProviderFactory, DatabaseService],
      exports: [DatabaseService],
    };
  }
}
