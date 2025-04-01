import { Module, DynamicModule, Provider } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ContentClassificationService } from './services/content-classification.service';
import { ContentValidationService } from './services/content-validation.service';
import { ContentService } from './services/content.service';
import { ContentController } from './controllers/content.controller';
import { ContentResolver } from './resolvers/content.resolver';

export interface ContentClassificationModuleOptions {
  /**
   * Optional database service provider
   * If not provided, the database operations in ContentService won't work
   */
  databaseProvider?: any;
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

    // Only register ContentService if database provider is supplied
    if (options?.databaseProvider) {
      providers.push({
        provide: 'DATABASE_SERVICE',
        useClass: options.databaseProvider,
      } as Provider);
      providers.push(ContentService);
    }

    return {
      module: ContentClassificationModule,
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
        }),
      ],
      controllers: [ContentController],
      providers,
      exports: providers,
    };
  }
}
