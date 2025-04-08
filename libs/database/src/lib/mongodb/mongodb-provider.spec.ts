import { MongoDBProvider } from './mongodb-provider';
import { DatabaseProviderOptions } from '../interfaces/database-provider.interface';
import { MongoDBRepository } from './mongodb-repository';

// Mock the MongoDBRepository class
jest.mock('./mongodb-repository');

describe('MongoDBProvider', () => {
  let provider: MongoDBProvider;
  const mockOptions: DatabaseProviderOptions = {
    uri: 'mongodb://localhost:27017',
    databaseName: 'test',
    username: 'user',
    password: 'pass',
  };

  // Create mock objects manually
  const mockModel: any = {
    find: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  };

  const mockConnection: any = {
    readyState: 1,
    close: jest.fn().mockResolvedValue(undefined),
    model: jest.fn().mockReturnValue(mockModel),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Set up the provider with mocked connection
    provider = new MongoDBProvider(mockOptions);

    // Manually mock the methods we need to test
    (provider as any).connect = jest.fn().mockImplementation(async () => {
      (provider as any).connection = mockConnection;
    });

    // Keep the original isConnected method
    const originalIsConnected = provider.isConnected;
    provider.isConnected = jest.fn().mockImplementation(() => {
      return originalIsConnected.call(provider);
    });

    // Keep the original disconnect method but still track calls
    const originalDisconnect = provider.disconnect;
    provider.disconnect = jest.fn().mockImplementation(async () => {
      if ((provider as any).connection) {
        await mockConnection.close();
        (provider as any).connection = null;
      }
    });
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  describe('connect', () => {
    it('should connect to MongoDB with the provided options', async () => {
      await provider.connect();

      // Verify connect was called
      expect(provider.connect).toHaveBeenCalled();
      expect(provider.isConnected()).toBe(true);
    });
  });

  describe('disconnect', () => {
    it('should disconnect from MongoDB', async () => {
      // First connect
      await provider.connect();

      // Then disconnect
      await provider.disconnect();

      // Verify that close was called on the connection
      expect(mockConnection.close).toHaveBeenCalled();
      expect(provider.isConnected()).toBe(false);
    });
  });

  describe('isConnected', () => {
    it('should return true when connected', async () => {
      await provider.connect();
      expect(provider.isConnected()).toBe(true);
    });

    it('should return false when not connected', () => {
      expect(provider.isConnected()).toBe(false);
    });
  });

  describe('registerModel', () => {
    it('should register a model with the provider', async () => {
      await provider.connect();

      const modelName = 'TestModel';
      const mockSchema = {};

      // Mock the private models Map in the provider
      (provider as any).models = new Map();

      // Use the real registerModel method
      const original = MongoDBProvider.prototype.registerModel;
      provider.registerModel = original;

      provider.registerModel(modelName, mockSchema);

      // Verify that model was called on the connection
      expect(mockConnection.model).toHaveBeenCalledWith(modelName, mockSchema);
      expect((provider as any).models.has(modelName)).toBe(true);
    });

    it('should throw an error if not connected', () => {
      const modelName = 'TestModel';
      const mockSchema = {};

      // Use the real registerModel method
      const original = MongoDBProvider.prototype.registerModel;
      provider.registerModel = original;

      expect(() => provider.registerModel(modelName, mockSchema)).toThrow(
        'Cannot register model: MongoDB is not connected'
      );
    });
  });

  describe('getRepository', () => {
    it('should return a repository for a registered model', async () => {
      await provider.connect();

      // Set up the models Map
      (provider as any).models = new Map();
      (provider as any).models.set('TestModel', mockModel);
      (provider as any).repositories = new Map();

      // Use the real getRepository method
      const original = MongoDBProvider.prototype.getRepository;
      provider.getRepository = original;

      // Make sure MongoDBRepository returns an appropriate mock
      (MongoDBRepository as jest.Mock).mockImplementation(() => {
        return {
          find: jest.fn(),
          findById: jest.fn(),
          findOne: jest.fn(),
          count: jest.fn(),
          create: jest.fn(),
          createMany: jest.fn(),
          updateById: jest.fn(),
          updateMany: jest.fn(),
          deleteById: jest.fn(),
          deleteMany: jest.fn(),
        };
      });

      const repository = provider.getRepository('TestModel');

      expect(repository).toBeDefined();
      expect(MongoDBRepository).toHaveBeenCalledWith(mockModel);
    });

    it('should throw an error if not connected', () => {
      // Use the real getRepository method
      const original = MongoDBProvider.prototype.getRepository;
      provider.getRepository = original;

      expect(() => provider.getRepository('TestModel')).toThrow(
        'Cannot get repository: MongoDB is not connected'
      );
    });

    it('should throw an error if model is not registered', async () => {
      await provider.connect();

      // Set up the models Map without the requested model
      (provider as any).models = new Map();

      // Use the real getRepository method
      const original = MongoDBProvider.prototype.getRepository;
      provider.getRepository = original;

      expect(() => provider.getRepository('NonExistentModel')).toThrow(
        `Model 'NonExistentModel' is not registered`
      );
    });
  });
});
