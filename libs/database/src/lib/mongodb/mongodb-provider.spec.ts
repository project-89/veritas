/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from '@nestjs/testing';
import { MongoDBProvider } from './mongodb-provider';
import { DatabaseProviderOptions } from '../interfaces/database-provider.interface';
import { MongoDBRepository } from './mongodb-repository';
import { Logger } from '@nestjs/common';

// Mock mongoose module using factories
jest.mock('mongoose', () => {
  // Mock model functions
  const mockModelFunctions = {
    find: jest.fn().mockReturnThis(),
    findOne: jest.fn().mockReturnThis(),
    findById: jest.fn().mockReturnThis(),
    countDocuments: jest.fn().mockReturnThis(),
    create: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findByIdAndDelete: jest.fn(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  };

  // Mock connection object
  const mockConnectionObject = {
    readyState: 1,
    close: jest.fn().mockResolvedValue(undefined),
    model: jest.fn().mockReturnValue(mockModelFunctions),
  };

  return {
    createConnection: jest.fn().mockReturnValue(mockConnectionObject),
    Schema: jest.fn().mockImplementation(() => ({
      pre: jest.fn().mockReturnThis(),
      index: jest.fn().mockReturnThis(),
    })),
    model: jest.fn().mockReturnValue(mockModelFunctions),
    // Export the mocks so tests can access them
    __modelFunctions: mockModelFunctions,
    __connectionObject: mockConnectionObject,
  };
});

// Access the mocks through the mocked module
const mongoose = jest.requireMock('mongoose');
const mockModel = mongoose.__modelFunctions;
const mockConnection = mongoose.__connectionObject;

describe('MongoDBProvider', () => {
  let provider: MongoDBProvider;
  const mockOptions: DatabaseProviderOptions = {
    uri: 'mongodb://localhost:27017/test',
    databaseName: 'test',
    username: 'user',
    password: 'pass',
    options: {},
  };

  beforeEach(async () => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Reset connection state
    mockConnection.readyState = 1;

    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: MongoDBProvider,
          useValue: new MongoDBProvider(mockOptions),
        },
        { provide: Logger, useValue: { log: jest.fn(), error: jest.fn() } },
      ],
    }).compile();

    provider = moduleRef.get<MongoDBProvider>(MongoDBProvider);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  describe('connect', () => {
    it('should connect to the MongoDB database', async () => {
      await provider.connect();
      expect(mongoose.createConnection).toHaveBeenCalledWith(
        mockOptions.uri,
        expect.any(Object)
      );
    });

    it('should establish a valid connection', async () => {
      // Call connect and check if the connection is properly set
      await provider.connect();

      // The connection should be established
      expect(provider.isConnected()).toBe(true);

      // Check that the connection object was set (testing the internal state)
      expect((provider as any).connection).toBe(mockConnection);
    });
  });

  describe('disconnect', () => {
    it('should disconnect from the MongoDB database', async () => {
      // Set up connection
      (provider as any).connection = mockConnection;
      await provider.disconnect();
      expect(mockConnection.close).toHaveBeenCalled();
    });

    it('should not attempt to disconnect if not connected', async () => {
      // Ensure no connection
      (provider as any).connection = null;
      await provider.disconnect();
      expect(mockConnection.close).not.toHaveBeenCalled();
    });
  });

  describe('isConnected', () => {
    it('should return true if connected', async () => {
      // Set up connection
      (provider as any).connection = mockConnection;
      expect(provider.isConnected()).toBe(true);
    });

    it('should return false if not connected', () => {
      // Ensure no connection
      (provider as any).connection = null;
      expect(provider.isConnected()).toBe(false);
    });
  });

  describe('registerModel', () => {
    it('should register a model', async () => {
      // Set up connection
      (provider as any).connection = mockConnection;
      const schema = new mongoose.Schema({});
      provider.registerModel('TestModel', schema);
      expect(mockConnection.model).toHaveBeenCalledWith('TestModel', schema);
    });

    it('should throw error if not connected', () => {
      // Ensure no connection
      (provider as any).connection = null;
      const schema = new mongoose.Schema({});
      expect(() => provider.registerModel('TestModel', schema)).toThrow();
    });
  });

  describe('getRepository', () => {
    it('should return a repository for a model', async () => {
      // Set up connection
      (provider as any).connection = mockConnection;
      // Mock models map
      (provider as any).models = new Map();
      (provider as any).models.set('TestModel', mockModel);

      const repository = provider.getRepository('TestModel');
      expect(repository).toBeInstanceOf(MongoDBRepository);
    });

    it('should throw error if model is not registered', async () => {
      // Set up connection
      (provider as any).connection = mockConnection;
      // Empty models map
      (provider as any).models = new Map();
      expect(() => provider.getRepository('UnregisteredModel')).toThrow();
    });
  });
});
