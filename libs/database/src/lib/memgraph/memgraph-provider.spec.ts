import { MemgraphProvider } from './memgraph-provider';
import { DatabaseProviderOptions } from '../interfaces/database-provider.interface';
import { MemgraphRepository } from './memgraph-repository';

// Mock the neo4j-driver module
jest.mock('neo4j-driver', () => {
  const mockDriver = {
    verifyConnectivity: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    session: jest.fn().mockReturnValue({
      run: jest.fn().mockResolvedValue({ records: [] }),
      close: jest.fn().mockResolvedValue(undefined),
    }),
  };

  return {
    driver: jest.fn().mockReturnValue(mockDriver),
    auth: {
      basic: jest.fn().mockReturnValue({ username: 'user', password: 'pass' }),
    },
  };
});

describe('MemgraphProvider', () => {
  let provider: MemgraphProvider;
  const mockOptions: DatabaseProviderOptions = {
    uri: 'bolt://localhost:7687',
    databaseName: 'veritas',
    username: 'user',
    password: 'pass',
  };

  beforeEach(async () => {
    provider = new MemgraphProvider(mockOptions);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  describe('connect', () => {
    it('should connect to Memgraph with the provided options', async () => {
      await provider.connect();

      const neo4j = require('neo4j-driver');

      // Check if driver was created with the correct parameters
      expect(neo4j.driver).toHaveBeenCalledWith(
        mockOptions.uri,
        neo4j.auth.basic(mockOptions.username, mockOptions.password),
        expect.any(Object)
      );

      // Verify connectivity
      const mockDriver = neo4j.driver();
      expect(mockDriver.verifyConnectivity).toHaveBeenCalled();
    });

    it('should connect without auth if credentials are not provided', async () => {
      const optionsWithoutAuth: DatabaseProviderOptions = {
        uri: 'bolt://localhost:7687',
        databaseName: 'veritas',
      };

      const providerWithoutAuth = new MemgraphProvider(optionsWithoutAuth);
      await providerWithoutAuth.connect();

      const neo4j = require('neo4j-driver');

      // Check if driver was created without auth
      expect(neo4j.driver).toHaveBeenCalledWith(
        optionsWithoutAuth.uri,
        undefined,
        expect.any(Object)
      );
    });
  });

  describe('disconnect', () => {
    it('should disconnect from Memgraph', async () => {
      // First connect to set up the connection
      await provider.connect();

      // Then disconnect
      await provider.disconnect();

      // Verify that close was called on the driver
      const neo4j = require('neo4j-driver');
      const mockDriver = neo4j.driver();
      expect(mockDriver.close).toHaveBeenCalled();
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
    it('should log a message and return null (no-op)', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = provider.registerModel('TestModel', {});

      expect(result).toBeNull();
      logSpy.mockRestore();
    });
  });

  describe('getRepository', () => {
    it('should return a repository for the given entity name', async () => {
      await provider.connect();

      const repository = provider.getRepository('TestEntity');

      expect(repository).toBeInstanceOf(MemgraphRepository);
    });

    it('should throw an error if not connected', () => {
      expect(() => provider.getRepository('TestEntity')).toThrow(
        'Cannot get repository: Memgraph is not connected'
      );
    });
  });

  describe('query', () => {
    it('should execute a Cypher query', async () => {
      await provider.connect();

      const query = 'MATCH (n) RETURN n LIMIT 10';
      const params = { param1: 'value1' };

      const result = await provider.query(query, params);
      console.log(result);

      // Verify that session was created and run was called
      const neo4j = require('neo4j-driver');
      const mockDriver = neo4j.driver();
      expect(mockDriver.session).toHaveBeenCalledWith({
        database: mockOptions.databaseName,
      });

      const mockSession = mockDriver.session();
      expect(mockSession.run).toHaveBeenCalledWith(query, params);
    });

    it('should throw an error if not connected', async () => {
      const query = 'MATCH (n) RETURN n';

      await expect(provider.query(query)).rejects.toThrow(
        'Cannot execute query: Memgraph is not connected'
      );
    });
  });
});
