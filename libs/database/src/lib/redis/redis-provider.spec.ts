import { RedisProvider } from './redis-provider';
import { DatabaseProviderOptions } from '../interfaces/database-provider.interface';

// Mock the redis module
jest.mock('redis', () => {
  const mockRedisClient = {
    isOpen: true,
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
    multi: jest.fn().mockReturnValue({
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      exec: jest.fn().mockResolvedValue([]),
    }),
  };

  return {
    createClient: jest.fn().mockReturnValue(mockRedisClient),
  };
});

describe('RedisProvider', () => {
  let provider: RedisProvider;
  const mockOptions: DatabaseProviderOptions = {
    uri: 'redis://localhost:6379',
    databaseName: '0',
  };

  beforeEach(async () => {
    provider = new RedisProvider(mockOptions);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  describe('connect', () => {
    it('should connect to Redis with the provided options', async () => {
      await provider.connect();

      // Check if createClient was called with the correct parameters
      expect(require('redis').createClient).toHaveBeenCalledWith({
        url: mockOptions.uri,
      });

      // Verify that the client's connect method was called
      const mockClient = require('redis').createClient();
      expect(mockClient.connect).toHaveBeenCalled();
    });

    it('should set up an error handler', async () => {
      await provider.connect();

      const mockClient = require('redis').createClient();
      expect(mockClient.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('disconnect', () => {
    it('should disconnect from Redis', async () => {
      // First connect to set up the connection
      await provider.connect();

      // Then disconnect
      await provider.disconnect();

      // Verify that quit was called on the client
      const mockClient = require('redis').createClient();
      expect(mockClient.quit).toHaveBeenCalled();
    });
  });

  describe('isConnected', () => {
    it('should return true when connected', async () => {
      await provider.connect();
      expect(provider.isConnected()).toBe(true);
    });
  });

  describe('registerModel', () => {
    it('should log a message and return null (no-op)', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = provider.registerModel('TestModel');

      expect(result).toBeNull();
      logSpy.mockRestore();
    });
  });

  describe('getRepository', () => {
    it('should return a repository for the given entity name', async () => {
      await provider.connect();

      const repository = provider.getRepository('TestEntity');

      expect(repository).toBeDefined();
    });

    it('should throw an error if not connected', () => {
      expect(() => provider.getRepository('TestEntity')).toThrow(
        'Cannot get repository: Redis is not connected'
      );
    });
  });

  describe('getClient', () => {
    it('should return the Redis client', async () => {
      await provider.connect();

      const client = provider.getClient();

      expect(client).toBeDefined();
      expect(client).toBe(require('redis').createClient());
    });
  });
});
