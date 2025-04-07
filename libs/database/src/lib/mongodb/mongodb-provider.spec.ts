import { Test, TestingModule } from '@nestjs/testing';
import { MongoDBProvider } from './mongodb-provider';
import { DatabaseProviderOptions } from '../interfaces/database-provider.interface';
import { MongoDBRepository } from './mongodb-repository';
import { Connection } from 'mongoose';

// Mock the mongoose modules
jest.mock('mongoose', () => {
  const mockConnection = {
    readyState: 1,
    close: jest.fn().mockResolvedValue(undefined),
    model: jest.fn().mockReturnValue({
      // Mock methods that would be available on a model
    }),
  };

  return {
    createConnection: jest.fn().mockResolvedValue(mockConnection),
    Connection: jest.fn(),
  };
});

describe('MongoDBProvider', () => {
  let provider: MongoDBProvider;
  const mockOptions: DatabaseProviderOptions = {
    uri: 'mongodb://localhost:27017',
    databaseName: 'test',
    username: 'user',
    password: 'pass',
  };

  beforeEach(async () => {
    provider = new MongoDBProvider(mockOptions);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  describe('connect', () => {
    it('should connect to MongoDB with the provided options', async () => {
      await provider.connect();

      // Check if createConnection was called with the correct parameters
      expect(require('mongoose').createConnection).toHaveBeenCalledWith(
        mockOptions.uri,
        expect.objectContaining({
          dbName: mockOptions.databaseName,
          user: mockOptions.username,
          pass: mockOptions.password,
        })
      );
    });
  });

  describe('disconnect', () => {
    it('should disconnect from MongoDB', async () => {
      // First connect to set up the connection
      await provider.connect();

      // Then disconnect
      await provider.disconnect();

      // Verify that close was called on the connection
      const mockConnection = require('mongoose').createConnection();
      expect(mockConnection.close).toHaveBeenCalled();
    });
  });

  describe('isConnected', () => {
    it('should return true when connected', async () => {
      await provider.connect();
      expect(provider.isConnected()).toBe(true);
    });
  });

  describe('registerModel', () => {
    it('should register a model with the provider', async () => {
      await provider.connect();

      const modelName = 'TestModel';
      const mockSchema = {};

      provider.registerModel(modelName, mockSchema);

      // Verify that model was called on the connection
      const mockConnection = require('mongoose').createConnection();
      expect(mockConnection.model).toHaveBeenCalledWith(modelName, mockSchema);
    });

    it('should throw an error if not connected', () => {
      const modelName = 'TestModel';
      const mockSchema = {};

      expect(() => provider.registerModel(modelName, mockSchema)).toThrow(
        'Cannot register model: MongoDB is not connected'
      );
    });
  });

  describe('getRepository', () => {
    it('should return a repository for a registered model', async () => {
      await provider.connect();

      const modelName = 'TestModel';
      const mockSchema = {};

      provider.registerModel(modelName, mockSchema);
      const repository = provider.getRepository(modelName);

      expect(repository).toBeInstanceOf(MongoDBRepository);
    });

    it('should throw an error if not connected', () => {
      const modelName = 'TestModel';

      expect(() => provider.getRepository(modelName)).toThrow(
        'Cannot get repository: MongoDB is not connected'
      );
    });

    it('should throw an error if model is not registered', async () => {
      await provider.connect();

      const modelName = 'NonExistentModel';

      expect(() => provider.getRepository(modelName)).toThrow(
        `Model '${modelName}' is not registered`
      );
    });
  });
});
