import { DynamicModule, Module, Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ContentService } from './services/content.service';
import { ContentClassificationService } from './services/content-classification.service';
import { ContentController } from './controllers/content.controller';
import { ContentResolver } from './resolvers/content.resolver';
import { getContentModel } from './models';
import { EmbeddingsService } from './services/embeddings.service';

/**
 * Database provider options
 */
export interface DatabaseOptions {
  providerType: 'mongodb' | 'memgraph' | 'redis';
  providerOptions?: any;
}

/**
 * Embeddings service configuration options
 */
export interface EmbeddingsOptions {
  serviceEndpoint?: string;
  apiKey?: string;
  dimension?: number;
}

// Define provider interfaces without direct imports
interface RepositoryInterface {
  find: (query?: any, options?: any) => Promise<any[]>;
  findById: (id: string, options?: any) => Promise<any>;
  findOne: (query: any, options?: any) => Promise<any>;
  count: (query?: any) => Promise<number>;
  create: (data: any) => Promise<any>;
  createMany: (data: any[]) => Promise<any[]>;
  updateById: (id: string, data: any) => Promise<any>;
  updateMany: (query: any, data: any) => Promise<number>;
  deleteById: (id: string) => Promise<any>;
  deleteMany: (query: any) => Promise<number>;
  vectorSearch?: (embedding: number[], options?: any) => Promise<any[]>;
}

interface DatabaseProviderInterface {
  connect: () => Promise<any>;
  disconnect: () => Promise<void>;
  isConnected: () => boolean;
  registerModel: (name: string, schema: any) => any;
  getRepository: (name: string) => RepositoryInterface;
}

// Factory function type to create a provider
type ProviderFactory = (options: any) => Promise<DatabaseProviderInterface>;

// Database provider implementation types
type MongoDBProvider = DatabaseProviderInterface;
type MemgraphProvider = DatabaseProviderInterface;
type RedisProvider = DatabaseProviderInterface;

/**
 * Provides options for configuring the ContentClassificationModule
 */
export interface ContentClassificationModuleOptions {
  /**
   * Type of database provider to use
   * @default 'mongodb'
   */
  providerType?: 'mongodb' | 'memgraph' | 'redis';

  /**
   * Provider specific options
   */
  providerOptions?: any;

  /**
   * Provider factories to use for creating database providers
   * This allows injecting the actual provider implementations without direct imports
   */
  providerFactories?: Record<string, ProviderFactory>;

  /**
   * Whether to enable embeddings service
   * @default false
   */
  enableEmbeddings?: boolean;

  /**
   * Embeddings service options
   */
  embeddingsOptions?: {
    /**
     * Endpoint for embeddings service
     */
    endpointUrl?: string;

    /**
     * API key for embeddings service
     */
    apiKey?: string;

    /**
     * Dimension of embeddings
     * @default 384
     */
    embeddingDim?: number;
  };

  /**
   * Whether the module should be global
   * @default false
   */
  isGlobal?: boolean;
}

/**
 * ContentClassification module
 * Provides services for content classification and analysis
 */
@Module({
  controllers: [ContentController],
  providers: [ContentClassificationService, ContentService, ContentResolver],
  exports: [ContentClassificationService, ContentService],
})
export class ContentClassificationModule {
  /**
   * Create database provider using dependency injection to avoid direct imports
   * @param providerType Type of database provider
   * @param providerOptions Provider options
   * @param providerFactories Map of provider factories
   * @returns Promise that resolves to a database provider
   */
  static async createDatabaseProvider(
    providerType: 'mongodb' | 'memgraph' | 'redis',
    providerOptions: any,
    providerFactories: Record<string, ProviderFactory>
  ): Promise<DatabaseProviderInterface> {
    try {
      if (!providerFactories[providerType]) {
        throw new Error(`Provider factory for ${providerType} not found`);
      }

      const provider = await providerFactories[providerType](providerOptions);

      // Register the Content model if this is MongoDB
      if (providerType === 'mongodb') {
        provider.registerModel('Content', getContentModel());
      }

      return provider;
    } catch (error) {
      console.error(`Error creating database provider ${providerType}:`, error);
      // Return a mock provider for testing scenarios
      return {
        connect: async () => Promise.resolve(),
        disconnect: async () => Promise.resolve(),
        isConnected: () => true,
        registerModel: () => ({}),
        getRepository: () => ({
          find: async () => [],
          findById: async () => null,
          findOne: async () => null,
          count: async () => 0,
          create: async (data: any) => data,
          createMany: async (data: any) => data,
          updateById: async () => null,
          updateMany: async () => 0,
          deleteById: async () => null,
          deleteMany: async () => 0,
          vectorSearch: async () => [],
        }),
      };
    }
  }

  /**
   * Configure the module synchronously
   * @param options Module options
   * @returns Module configuration
   */
  static forRoot(
    options: ContentClassificationModuleOptions = {}
  ): DynamicModule {
    const providers: Provider[] = [
      {
        provide: 'ContentClassificationService',
        useClass: ContentClassificationService,
      },
      ContentService,
      ContentResolver,
    ];

    // If database is specified, add database provider
    if (options?.providerType && options.providerOptions) {
      const { providerType, providerOptions, providerFactories = {} } = options;

      providers.push({
        provide: 'DATABASE_PROVIDER',
        useFactory: async () => {
          return ContentClassificationModule.createDatabaseProvider(
            providerType,
            providerOptions,
            providerFactories
          );
        },
      });
    }

    // Conditionally add EmbeddingsService if enabled
    if (options.enableEmbeddings) {
      providers.push({
        provide: EmbeddingsService,
        useFactory: (config: ConfigService, dbProvider: any) => {
          // Set environment variables for the embeddings service if provided
          if (options.embeddingsOptions?.endpointUrl) {
            process.env.EMBEDDING_SERVICE_ENDPOINT =
              options.embeddingsOptions.endpointUrl;
          }
          if (options.embeddingsOptions?.apiKey) {
            process.env.EMBEDDING_SERVICE_API_KEY =
              options.embeddingsOptions.apiKey;
          }
          if (options.embeddingsOptions?.embeddingDim) {
            process.env.EMBEDDING_DIMENSION = String(
              options.embeddingsOptions.embeddingDim
            );
          }

          return new EmbeddingsService(config, dbProvider);
        },
        inject: [ConfigService, 'DATABASE_PROVIDER'],
      });
    }

    return {
      module: ContentClassificationModule,
      imports: [ConfigModule],
      controllers: [ContentController],
      providers,
      exports: [
        'ContentClassificationService',
        ContentService,
        ...(options.enableEmbeddings ? [EmbeddingsService] : []),
      ],
      global: options.isGlobal,
    };
  }
}
