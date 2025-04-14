import { Test } from '@nestjs/testing';
import { ContentClassificationModule } from './content-classification.module';
import { ContentClassificationService } from './services/content-classification.service';
import { ContentValidationService } from './services/content-validation.service';
import { ContentService } from './services/content.service';
import { ContentResolver } from './resolvers/content.resolver';
import { DATABASE_PROVIDER_TOKEN } from './constants';

// Mock the database module to avoid actual database connections
jest.mock('@veritas/database', () => ({
  DatabaseModule: {
    register: jest.fn().mockReturnValue({
      module: class MockDatabaseModule {},
      providers: [
        {
          provide: 'DATABASE_PROVIDER',
          useValue: {
            getRepository: jest.fn(),
            isConnected: jest.fn().mockReturnValue(true),
            registerModel: jest.fn(),
          },
        },
      ],
    }),
  },
}));

describe('ContentClassificationModule', () => {
  describe('register', () => {
    it('should create a module with core providers but no database', async () => {
      const module = await Test.createTestingModule({
        imports: [ContentClassificationModule.register()],
      }).compile();

      // Services should be available
      expect(module.get(ContentClassificationService)).toBeDefined();
      expect(module.get(ContentValidationService)).toBeDefined();
      expect(module.get(ContentResolver)).toBeDefined();

      // ContentService should not be available
      expect(() => module.get(ContentService)).toThrow();

      // DATABASE_PROVIDER_TOKEN should not be available
      expect(() => module.get(DATABASE_PROVIDER_TOKEN)).toThrow();
    });
  });

  describe('forRoot', () => {
    it('should create a module with core providers but no database when database is not provided', async () => {
      const module = await Test.createTestingModule({
        imports: [ContentClassificationModule.forRoot({})],
      }).compile();

      // Services should be available
      expect(module.get(ContentClassificationService)).toBeDefined();
      expect(module.get(ContentValidationService)).toBeDefined();
      expect(module.get(ContentResolver)).toBeDefined();

      // ContentService should not be available
      expect(() => module.get(ContentService)).toThrow();

      // DATABASE_PROVIDER_TOKEN should not be available
      expect(() => module.get(DATABASE_PROVIDER_TOKEN)).toThrow();
    });

    it('should create a module with database integration when database options are provided', async () => {
      const module = await Test.createTestingModule({
        imports: [
          ContentClassificationModule.forRoot({
            database: {
              providerType: 'mongodb',
              providerOptions: {
                uri: 'mongodb://localhost:27017',
                databaseName: 'test',
              },
            },
          }),
        ],
      }).compile();

      // Core services should be available
      expect(module.get(ContentClassificationService)).toBeDefined();
      expect(module.get(ContentValidationService)).toBeDefined();
      expect(module.get(ContentResolver)).toBeDefined();

      // Database-dependent services should be available
      expect(module.get(ContentService)).toBeDefined();

      // Database provider should be available through token
      expect(module.get(DATABASE_PROVIDER_TOKEN)).toBeDefined();
    });

    it('should set the module as global when isGlobal is true', async () => {
      const dynamicModule = ContentClassificationModule.forRoot({
        isGlobal: true,
      });

      expect(dynamicModule.global).toBe(true);
    });
  });
});
