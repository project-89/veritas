import { Module, DynamicModule, Provider, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ContentClassificationService } from './services/content-classification.service';
import { ContentValidationService } from './services/content-validation.service';
import { ContentService } from './services/content.service';
import { ContentController } from './controllers/content.controller';
import { ContentResolver } from './resolvers/content.resolver';
import { CONTENT_MODEL_NAME } from './models/content.model';
import { DATABASE_PROVIDER_TOKEN } from './constants';
import { EmbeddingsService } from './services/embeddings.service';

/**
 * Module options for ContentClassificationModule
 */
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

  /**
   * Enable embeddings and vector search
   */
  enableEmbeddings?: boolean;

  /**
   * Configuration for embeddings service
   */
  embeddings?: {
    /**
     * External embedding service endpoint
     */
    serviceEndpoint?: string;

    /**
     * API key for external embedding service
     */
    apiKey?: string;

    /**
     * Embedding vector dimension
     */
    dimension?: number;
  };
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
    const databaseProvider = options?.database
      ? {
          provide: DATABASE_PROVIDER_TOKEN,
          useFactory: () => {
            // Dynamically import the required database provider
            if (options.database.providerType === 'mongodb') {
              const { MongoDBProvider } = require('@veritas/database');
              return new MongoDBProvider(options.database.providerOptions);
            } else if (options.database.providerType === 'memgraph') {
              const { MemgraphProvider } = require('@veritas/database');
              return new MemgraphProvider(options.database.providerOptions);
            } else if (options.database.providerType === 'redis') {
              const { RedisProvider } = require('@veritas/database');
              return new RedisProvider(options.database.providerOptions);
            }

            throw new Error(
              `Unsupported database provider type: ${options.database.providerType}`
            );
          },
        }
      : { provide: DATABASE_PROVIDER_TOKEN, useValue: null };

    const providers = [
      ContentClassificationService,
      ContentValidationService,
      ContentService,
      databaseProvider,
      // Add EmbeddingsService conditionally
      ...(options?.enableEmbeddings !== false
        ? [
            {
              provide: EmbeddingsService,
              useFactory: (configService: ConfigService) => {
                const embeddingsService = new EmbeddingsService(configService);

                // Override config from options if provided
                if (options?.embeddings?.serviceEndpoint) {
                  process.env.EMBEDDING_SERVICE_ENDPOINT =
                    options.embeddings.serviceEndpoint;
                }

                if (options?.embeddings?.apiKey) {
                  process.env.EMBEDDING_SERVICE_API_KEY =
                    options.embeddings.apiKey;
                }

                if (options?.embeddings?.dimension) {
                  process.env.EMBEDDING_DIMENSION = String(
                    options.embeddings.dimension
                  );
                }

                return embeddingsService;
              },
              inject: [ConfigService],
            },
          ]
        : []),
    ];

    // Create the imports array
    const imports = [
      ConfigModule.forRoot({
        isGlobal: true,
      }),
    ];

    // Add database module and service if options are provided
    if (options?.database) {
      // Add ContentService only when database is configured
      providers.push(ContentService);

      // Import the DatabaseModule dynamically to avoid import issues
      // This will load the module from node_modules at runtime
      const DatabaseModule = require('@veritas/database').DatabaseModule;

      // Add the DatabaseService provider using token
      providers.push({
        provide: DATABASE_PROVIDER_TOKEN,
        useFactory: async (databaseService) => databaseService,
        inject: ['DATABASE_PROVIDER'], // Use DatabaseModule's token
      });

      // Create a module with the database module included
      return {
        module: ContentClassificationModule,
        imports: [
          ...imports,
          DatabaseModule.register({
            providerType: options.database.providerType,
            providerOptions: options.database.providerOptions,
            isGlobal: false, // Keep the database module scoped to this module
          }),
        ],
        controllers: [ContentController],
        providers,
        exports: providers,
        global: options.isGlobal ?? false,
      };
    }

    // Return a module without database if no database options
    return {
      module: ContentClassificationModule,
      imports,
      controllers: [ContentController],
      providers,
      exports: providers,
      global: options.isGlobal ?? false,
    };
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
