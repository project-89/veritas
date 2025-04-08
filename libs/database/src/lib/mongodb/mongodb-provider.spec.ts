import { Test } from '@nestjs/testing';
import { MongoDBProvider } from './mongodb-provider';
import { DatabaseProviderOptions } from '../interfaces/database-provider.interface';
import { MongoDBRepository } from './mongodb-repository';
import { Connection, Model, createConnection } from 'mongoose';

// Mock the MongoDBRepository class
jest.mock('./mongodb-repository');

// Mock mongoose module
jest.mock('mongoose', () => {
  // Create mock model functions
  const mockModel = {
    find: jest.fn().mockReturnThis(),
    findById: jest.fn().mockReturnThis(),
    findOne: jest.fn().mockReturnThis(),
    create: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  };

  // Create mock connection
  const mockConnection = {
    readyState: 1,
    close: jest.fn().mockResolvedValue(undefined),
    model: jest.fn().mockReturnValue(mockModel),
  };

  return {
    createConnection: jest.fn().mockResolvedValue(mockConnection),
    Connection: jest.fn(),
    Model: jest.fn(),
  };
});

describe('MongoDBProvider', () => {
  let provider: MongoDBProvider;
  const mockOptions: DatabaseProviderOptions = {
    uri: 'mongodb://localhost:27017',
    databaseName: 'test',
    username: 'user',
    password: 'pass',
    options: {},
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    provider = new MongoDBProvider(mockOptions);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  describe('connect', () => {
    it('should connect to the database', async () => {
      await provider.connect();
      expect(createConnection).toHaveBeenCalledWith(mockOptions.uri, {
        dbName: mockOptions.databaseName,
        user: mockOptions.username,
        pass: mockOptions.password,
        ...mockOptions.options,
      });
    });

    it('should handle connection errors', async () => {
      const mockError = new Error('Connection failed');
      (createConnection as jest.Mock).mockRejectedValueOnce(mockError);

      await expect(provider.connect()).rejects.toThrow(mockError);
    });
  });

  describe('disconnect', () => {
    it('should disconnect from the database', async () => {
      await provider.connect();
      await provider.disconnect();

      const mockMongooseConnection = await (createConnection as jest.Mock).mock
        .results[0].value;
      expect(mockMongooseConnection.close).toHaveBeenCalled();
    });

    it('should do nothing if not connected', async () => {
      await provider.disconnect();
      expect(createConnection).not.toHaveBeenCalled();
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
    it('should register a model', async () => {
      await provider.connect();
      const schema = { name: String };
      const model = provider.registerModel('TestModel', schema);

      const mockMongooseConnection = await (createConnection as jest.Mock).mock
        .results[0].value;
      expect(mockMongooseConnection.model).toHaveBeenCalledWith(
        'TestModel',
        schema
      );
      expect(model).toBeDefined();
    });

    it('should throw an error if not connected', () => {
      expect(() => provider.registerModel('TestModel', {})).toThrow(
        'Cannot register model: MongoDB is not connected'
      );
    });

    it('should return an existing model if already registered', async () => {
      await provider.connect();
      const schema = { name: String };
      provider.registerModel('TestModel', schema);

      const mockMongooseConnection = await (createConnection as jest.Mock).mock
        .results[0].value;
      expect(mockMongooseConnection.model).toHaveBeenCalledTimes(1);

      provider.registerModel('TestModel', schema);
      expect(mockMongooseConnection.model).toHaveBeenCalledTimes(1);
    });
  });

  describe('getRepository', () => {
    it('should return a repository for a registered model', async () => {
      await provider.connect();
      const schema = { name: String };
      provider.registerModel('TestModel', schema);

      const repository = provider.getRepository('TestModel');
      expect(repository).toBeDefined();
      expect(MongoDBRepository).toHaveBeenCalled();
    });

    it('should throw an error if the model is not registered', async () => {
      await provider.connect();
      expect(() => provider.getRepository('UnregisteredModel')).toThrow(
        "Model 'UnregisteredModel' is not registered"
      );
    });

    it('should throw an error if not connected', () => {
      expect(() => provider.getRepository('TestModel')).toThrow(
        'Cannot get repository: MongoDB is not connected'
      );
    });

    it('should return the same repository instance for the same model', async () => {
      await provider.connect();
      provider.registerModel('TestModel', {});

      const repository1 = provider.getRepository('TestModel');
      const repository2 = provider.getRepository('TestModel');

      expect(repository1).toBe(repository2);
      expect(MongoDBRepository).toHaveBeenCalledTimes(1);
    });
  });
});
