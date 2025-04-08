import { Module, DynamicModule, Provider, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ContentClassificationService } from './services/content-classification.service';
import { ContentValidationService } from './services/content-validation.service';
import { ContentService } from './services/content.service';
import { ContentController } from './controllers/content.controller';
import { ContentResolver } from './resolvers/content.resolver';
import { DatabaseService, DatabaseModule } from '@veritas/database';

export interface ContentClassificationModuleOptions {
  /**
   * Optional database provider configuration
   * If not provided, the database operations in ContentService won't work
   */
  database?: {
    /**
     * Type of database provider to use
     */
    providerType: 'mongodb' | 'memgraph' | 'redis';

    /**
     * Connection options for the database
     */
    providerOptions: {
      uri: string;
      databaseName: string;
      username?: string;
      password?: string;
      options?: Record<string, any>;
    };
  };

  /**
   * Set module as global
   */
  isGlobal?: boolean;
}

/**
 * Module providing content classification and management capabilities
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [ContentController],
  providers: [
    ContentClassificationService,
    ContentValidationService,
    ContentResolver,
  ],
  exports: [
    ContentClassificationService,
    ContentValidationService,
    ContentResolver,
  ],
})
export class ContentClassificationModule {
  /**
   * Register the module with options
   * @param options Configuration options
   */
  static forRoot(options?: ContentClassificationModuleOptions): DynamicModule {
    const providers: Provider[] = [
      ContentClassificationService,
      ContentValidationService,
      ContentResolver,
    ];

    const imports = [
      ConfigModule.forRoot({
        isGlobal: true,
      }),
    ];

    // Add database module and service if options are provided
    if (options?.database) {
      imports.push(
        DatabaseModule.register({
          providerType: options.database.providerType,
          providerOptions: options.database.providerOptions,
        })
      );

      // Add database service provider
      providers.push({
        provide: 'DATABASE_SERVICE',
        useExisting: DatabaseService,
      });

      // Register ContentService only when database is configured
      providers.push(ContentService);
    }

    const module: DynamicModule = {
      module: ContentClassificationModule,
      imports,
      controllers: [ContentController],
      providers,
      exports: providers,
    };

    // Set module as global if specified
    if (options?.isGlobal) {
      module.global = true;
    }

    return module;
  }

  /**
   * Register the content classification module with default configuration
   * Note: This will not enable database operations
   */
  static register(): DynamicModule {
    return {
      module: ContentClassificationModule,
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
        }),
      ],
      controllers: [ContentController],
      providers: [
        ContentClassificationService,
        ContentValidationService,
        ContentResolver,
      ],
      exports: [
        ContentClassificationService,
        ContentValidationService,
        ContentResolver,
      ],
    };
  }
}
