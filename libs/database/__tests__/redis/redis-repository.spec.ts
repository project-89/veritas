/* eslint-disable @typescript-eslint/no-explicit-any */

import { RedisRepository } from '../../src/lib/redis/redis-repository';

// Mock randomUUID to return a predictable value
jest.mock('node:crypto', () => ({
  randomUUID: jest.fn().mockReturnValue('mock-uuid-1234'),
}));

interface TestEntity {
  id: string;
  name: string;
  value: number;
  embedding?: number[];
}

describe('RedisRepository', () => {
  let repository: RedisRepository<TestEntity>;
  let mockClient: any;
  let mockPipeline: any;

  const testEntity: TestEntity = {
    id: 'entity-1',
    name: 'Test Entity',
    value: 42,
  };

  const testEntities: TestEntity[] = [
    { id: 'entity-1', name: 'Entity 1', value: 1 },
    { id: 'entity-2', name: 'Entity 2', value: 2 },
    { id: 'entity-3', name: 'Entity 3', value: 3 },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    mockPipeline = {
      get: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      del: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };

    mockClient = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      keys: jest.fn().mockResolvedValue([]),
      multi: jest.fn().mockReturnValue(mockPipeline),
      sendCommand: jest.fn().mockRejectedValue(new Error('unknown command')),
    };

    repository = new RedisRepository<TestEntity>(mockClient, 'TestEntity');
  });

  describe('find', () => {
    it('should return empty array when no keys exist', async () => {
      mockClient.keys.mockResolvedValue([]);

      const result = await repository.find();

      expect(mockClient.keys).toHaveBeenCalledWith('testentity:*');
      expect(result).toEqual([]);
    });

    it('should return all entities when no filter is provided', async () => {
      const keys = testEntities.map((e) => `testentity:${e.id}`);
      mockClient.keys.mockResolvedValue(keys);
      mockPipeline.exec.mockResolvedValue(
        testEntities.map((e) => JSON.stringify(e))
      );

      const result = await repository.find();

      expect(mockClient.keys).toHaveBeenCalledWith('testentity:*');
      expect(result).toEqual(testEntities);
    });

    it('should filter entities client-side', async () => {
      const keys = testEntities.map((e) => `testentity:${e.id}`);
      mockClient.keys.mockResolvedValue(keys);
      mockPipeline.exec.mockResolvedValue(
        testEntities.map((e) => JSON.stringify(e))
      );

      const result = await repository.find({ name: 'Entity 1' } as any);

      expect(result).toEqual([testEntities[0]]);
    });

    it('should apply skip option', async () => {
      const keys = testEntities.map((e) => `testentity:${e.id}`);
      mockClient.keys.mockResolvedValue(keys);
      mockPipeline.exec.mockResolvedValue(
        testEntities.map((e) => JSON.stringify(e))
      );

      const result = await repository.find({}, { skip: 1 });

      expect(result.length).toBe(2);
      expect(result).toEqual(testEntities.slice(1));
    });

    it('should apply limit option', async () => {
      const keys = testEntities.map((e) => `testentity:${e.id}`);
      mockClient.keys.mockResolvedValue(keys);
      mockPipeline.exec.mockResolvedValue(
        testEntities.map((e) => JSON.stringify(e))
      );

      const result = await repository.find({}, { limit: 2 });

      expect(result.length).toBe(2);
      expect(result).toEqual(testEntities.slice(0, 2));
    });

    it('should apply sort option ascending', async () => {
      const keys = testEntities.map((e) => `testentity:${e.id}`);
      mockClient.keys.mockResolvedValue(keys);
      // Return in reverse order to verify sorting works
      mockPipeline.exec.mockResolvedValue(
        [...testEntities].reverse().map((e) => JSON.stringify(e))
      );

      const result = await repository.find({}, { sort: { value: 1 } });

      expect(result[0]!.value).toBeLessThanOrEqual(result[1]!.value);
    });

    it('should apply sort option descending', async () => {
      const keys = testEntities.map((e) => `testentity:${e.id}`);
      mockClient.keys.mockResolvedValue(keys);
      mockPipeline.exec.mockResolvedValue(
        testEntities.map((e) => JSON.stringify(e))
      );

      const result = await repository.find({}, { sort: { value: -1 } });

      expect(result[0]!.value).toBeGreaterThanOrEqual(result[1]!.value);
    });

    it('should skip null results from pipeline', async () => {
      const keys = ['testentity:entity-1', 'testentity:entity-2'];
      mockClient.keys.mockResolvedValue(keys);
      mockPipeline.exec.mockResolvedValue([
        JSON.stringify(testEntities[0]),
        null,
      ]);

      const result = await repository.find();

      expect(result.length).toBe(1);
      expect(result[0]).toEqual(testEntities[0]);
    });

    it('should handle invalid JSON gracefully', async () => {
      const keys = ['testentity:entity-1'];
      mockClient.keys.mockResolvedValue(keys);
      mockPipeline.exec.mockResolvedValue(['invalid-json']);

      const result = await repository.find();

      expect(result).toEqual([]);
    });

    it('should throw and log error on failure', async () => {
      const error = new Error('Keys failed');
      mockClient.keys.mockRejectedValue(error);

      await expect(repository.find()).rejects.toThrow('Keys failed');
    });
  });

  describe('findById', () => {
    it('should return the entity when found', async () => {
      mockClient.get.mockResolvedValue(JSON.stringify(testEntity));

      const result = await repository.findById('entity-1');

      expect(mockClient.get).toHaveBeenCalledWith('testentity:entity-1');
      expect(result).toEqual(testEntity);
    });

    it('should return null when entity not found', async () => {
      mockClient.get.mockResolvedValue(null);

      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
    });

    it('should throw and log error on failure', async () => {
      const error = new Error('Get failed');
      mockClient.get.mockRejectedValue(error);

      await expect(repository.findById('entity-1')).rejects.toThrow(
        'Get failed'
      );
    });
  });

  describe('findOne', () => {
    it('should return the first matching entity', async () => {
      const keys = testEntities.map((e) => `testentity:${e.id}`);
      mockClient.keys.mockResolvedValue(keys);
      mockPipeline.exec.mockResolvedValue(
        testEntities.map((e) => JSON.stringify(e))
      );

      const result = await repository.findOne({ name: 'Entity 2' } as any);

      expect(result).toEqual(testEntities[1]);
    });

    it('should return null when no entity matches', async () => {
      mockClient.keys.mockResolvedValue([]);

      const result = await repository.findOne({
        name: 'Nonexistent',
      } as any);

      expect(result).toBeNull();
    });
  });

  describe('count', () => {
    it('should return count of all entities with no filter', async () => {
      const keys = testEntities.map((e) => `testentity:${e.id}`);
      mockClient.keys.mockResolvedValue(keys);
      mockPipeline.exec.mockResolvedValue(
        testEntities.map((e) => JSON.stringify(e))
      );

      const result = await repository.count();

      expect(result).toBe(3);
    });

    it('should return count of filtered entities', async () => {
      const keys = testEntities.map((e) => `testentity:${e.id}`);
      mockClient.keys.mockResolvedValue(keys);
      mockPipeline.exec.mockResolvedValue(
        testEntities.map((e) => JSON.stringify(e))
      );

      const result = await repository.count({ value: 1 } as any);

      expect(result).toBe(1);
    });

    it('should return 0 when no entities exist', async () => {
      mockClient.keys.mockResolvedValue([]);

      const result = await repository.count();

      expect(result).toBe(0);
    });

    it('should throw and log error on failure', async () => {
      const error = new Error('Count failed');
      mockClient.keys.mockRejectedValue(error);

      await expect(repository.count()).rejects.toThrow('Count failed');
    });
  });

  describe('create', () => {
    it('should create an entity with provided id', async () => {
      const data: Partial<TestEntity> = {
        id: 'custom-id',
        name: 'New Entity',
        value: 100,
      };

      const result = await repository.create(data);

      expect(mockClient.set).toHaveBeenCalledWith(
        'testentity:custom-id',
        JSON.stringify({ ...data })
      );
      expect(result.id).toBe('custom-id');
      expect(result.name).toBe('New Entity');
    });

    it('should generate a UUID when id is not provided', async () => {
      const data: Partial<TestEntity> = {
        name: 'No ID Entity',
        value: 50,
      };

      const result = await repository.create(data);

      expect(result.id).toBe('mock-uuid-1234');
      expect(mockClient.set).toHaveBeenCalledWith(
        'testentity:mock-uuid-1234',
        expect.any(String)
      );
    });

    it('should throw and log error on failure', async () => {
      const error = new Error('Set failed');
      mockClient.set.mockRejectedValue(error);

      await expect(
        repository.create({ name: 'Fail', value: 0 })
      ).rejects.toThrow('Set failed');
    });
  });

  describe('createMany', () => {
    it('should create multiple entities using pipeline', async () => {
      const data: Partial<TestEntity>[] = [
        { id: 'batch-1', name: 'Batch 1', value: 10 },
        { id: 'batch-2', name: 'Batch 2', value: 20 },
      ];

      const result = await repository.createMany(data);

      expect(mockClient.multi).toHaveBeenCalled();
      expect(mockPipeline.set).toHaveBeenCalledTimes(2);
      expect(mockPipeline.exec).toHaveBeenCalled();
      expect(result.length).toBe(2);
      expect(result[0]!.id).toBe('batch-1');
      expect(result[1]!.id).toBe('batch-2');
    });

    it('should generate UUIDs for entities without ids', async () => {
      const data: Partial<TestEntity>[] = [
        { name: 'No ID 1', value: 10 },
        { name: 'No ID 2', value: 20 },
      ];

      const result = await repository.createMany(data);

      expect(result[0]!.id).toBe('mock-uuid-1234');
      expect(result[1]!.id).toBe('mock-uuid-1234');
    });

    it('should throw and log error on failure', async () => {
      const error = new Error('Pipeline exec failed');
      mockPipeline.exec.mockRejectedValue(error);

      await expect(
        repository.createMany([{ name: 'Fail', value: 0 }])
      ).rejects.toThrow('Pipeline exec failed');
    });
  });

  describe('updateById', () => {
    it('should update and return the entity', async () => {
      mockClient.get.mockResolvedValue(JSON.stringify(testEntity));

      const result = await repository.updateById('entity-1', {
        name: 'Updated',
      });

      expect(mockClient.get).toHaveBeenCalledWith('testentity:entity-1');
      expect(mockClient.set).toHaveBeenCalledWith(
        'testentity:entity-1',
        JSON.stringify({ ...testEntity, name: 'Updated' })
      );
      expect(result).toEqual({ ...testEntity, name: 'Updated' });
    });

    it('should return null when entity not found', async () => {
      mockClient.get.mockResolvedValue(null);

      const result = await repository.updateById('nonexistent', {
        name: 'Updated',
      });

      expect(result).toBeNull();
      expect(mockClient.set).not.toHaveBeenCalled();
    });

    it('should throw and log error on failure', async () => {
      const error = new Error('Get failed during update');
      mockClient.get.mockRejectedValue(error);

      await expect(
        repository.updateById('entity-1', { name: 'Fail' })
      ).rejects.toThrow('Get failed during update');
    });
  });

  describe('updateMany', () => {
    it('should update matching entities and return count', async () => {
      const keys = testEntities.map((e) => `testentity:${e.id}`);
      mockClient.keys.mockResolvedValue(keys);
      mockPipeline.exec.mockResolvedValue(
        testEntities.map((e) => JSON.stringify(e))
      );

      const result = await repository.updateMany(
        { value: 1 } as any,
        { name: 'Bulk Updated' }
      );

      // Only entity-1 has value: 1
      expect(result).toBe(1);
    });

    it('should return 0 when no entities match', async () => {
      mockClient.keys.mockResolvedValue([]);

      const result = await repository.updateMany(
        { value: 999 } as any,
        { name: 'None' }
      );

      expect(result).toBe(0);
    });

    it('should use pipeline for batch updates', async () => {
      const keys = testEntities.map((e) => `testentity:${e.id}`);
      mockClient.keys.mockResolvedValue(keys);
      // First call for find, second call for the update pipeline
      mockPipeline.exec
        .mockResolvedValueOnce(testEntities.map((e) => JSON.stringify(e)))
        .mockResolvedValueOnce([]);

      await repository.updateMany({}, { name: 'All Updated' });

      // multi() should be called at least for the find and the update
      expect(mockClient.multi).toHaveBeenCalled();
    });

    it('should throw and log error on failure', async () => {
      const error = new Error('UpdateMany failed');
      mockClient.keys.mockRejectedValue(error);

      await expect(
        repository.updateMany({ value: 1 } as any, { name: 'Fail' })
      ).rejects.toThrow('UpdateMany failed');
    });
  });

  describe('deleteById', () => {
    it('should delete and return the entity', async () => {
      mockClient.get.mockResolvedValue(JSON.stringify(testEntity));

      const result = await repository.deleteById('entity-1');

      expect(mockClient.get).toHaveBeenCalledWith('testentity:entity-1');
      expect(mockClient.del).toHaveBeenCalledWith('testentity:entity-1');
      expect(result).toEqual(testEntity);
    });

    it('should return null when entity not found', async () => {
      mockClient.get.mockResolvedValue(null);

      const result = await repository.deleteById('nonexistent');

      expect(result).toBeNull();
      expect(mockClient.del).not.toHaveBeenCalled();
    });

    it('should throw and log error on failure', async () => {
      const error = new Error('Delete failed');
      mockClient.get.mockRejectedValue(error);

      await expect(repository.deleteById('entity-1')).rejects.toThrow(
        'Delete failed'
      );
    });
  });

  describe('deleteMany', () => {
    it('should delete matching entities and return count', async () => {
      const keys = testEntities.map((e) => `testentity:${e.id}`);
      mockClient.keys.mockResolvedValue(keys);
      mockPipeline.exec
        .mockResolvedValueOnce(testEntities.map((e) => JSON.stringify(e)))
        .mockResolvedValueOnce([]);

      const result = await repository.deleteMany({});

      expect(result).toBe(3);
      expect(mockPipeline.del).toHaveBeenCalledTimes(3);
    });

    it('should return 0 when no entities match', async () => {
      mockClient.keys.mockResolvedValue([]);

      const result = await repository.deleteMany({ value: 999 } as any);

      expect(result).toBe(0);
    });

    it('should use pipeline for batch deletes', async () => {
      const keys = testEntities.map((e) => `testentity:${e.id}`);
      mockClient.keys.mockResolvedValue(keys);
      mockPipeline.exec
        .mockResolvedValueOnce(testEntities.map((e) => JSON.stringify(e)))
        .mockResolvedValueOnce([]);

      await repository.deleteMany({});

      expect(mockClient.multi).toHaveBeenCalled();
      expect(mockPipeline.del).toHaveBeenCalledTimes(3);
      expect(mockPipeline.exec).toHaveBeenCalled();
    });

    it('should throw and log error on failure', async () => {
      const error = new Error('DeleteMany failed');
      mockClient.keys.mockRejectedValue(error);

      await expect(
        repository.deleteMany({ value: 1 } as any)
      ).rejects.toThrow('DeleteMany failed');
    });
  });

  describe('vectorSearch', () => {
    const queryVector = [0.1, 0.2, 0.3];

    it('should fall back to in-memory search when vector search is not available', async () => {
      // sendCommand rejects with "unknown command" - no FT module
      mockClient.sendCommand.mockRejectedValue(
        new Error('unknown command')
      );

      const entitiesWithVectors: TestEntity[] = [
        { id: 'v1', name: 'A', value: 1, embedding: [0.1, 0.2, 0.3] },
        { id: 'v2', name: 'B', value: 2, embedding: [0.9, 0.8, 0.7] },
      ];

      const keys = entitiesWithVectors.map((e) => `testentity:${e.id}`);
      mockClient.keys.mockResolvedValue(keys);
      mockPipeline.exec.mockResolvedValue(
        entitiesWithVectors.map((e) => JSON.stringify(e))
      );

      const results = await repository.vectorSearch(
        'embedding',
        queryVector,
        { minScore: 0.0 }
      );

      expect(results.length).toBeGreaterThan(0);
      // First result should be the most similar
      expect(results[0]!.score).toBeCloseTo(1.0, 1);
    });

    it('should return empty array when no entities have vectors', async () => {
      mockClient.sendCommand.mockRejectedValue(
        new Error('unknown command')
      );
      mockClient.keys.mockResolvedValue([]);

      const results = await repository.vectorSearch(
        'embedding',
        queryVector
      );

      expect(results).toEqual([]);
    });

    it('should filter results below minScore', async () => {
      mockClient.sendCommand.mockRejectedValue(
        new Error('unknown command')
      );

      const entitiesWithVectors: TestEntity[] = [
        { id: 'v1', name: 'A', value: 1, embedding: [0.1, 0.2, 0.3] },
        { id: 'v2', name: 'B', value: 2, embedding: [-0.9, -0.8, -0.7] },
      ];

      const keys = entitiesWithVectors.map((e) => `testentity:${e.id}`);
      mockClient.keys.mockResolvedValue(keys);
      mockPipeline.exec.mockResolvedValue(
        entitiesWithVectors.map((e) => JSON.stringify(e))
      );

      const results = await repository.vectorSearch(
        'embedding',
        queryVector,
        { minScore: 0.9 }
      );

      expect(results.length).toBe(1);
      expect(results[0]!.item).toEqual(
        expect.objectContaining({ id: 'v1' })
      );
    });

    it('should respect limit option', async () => {
      mockClient.sendCommand.mockRejectedValue(
        new Error('unknown command')
      );

      const entitiesWithVectors: TestEntity[] = [
        { id: 'v1', name: 'A', value: 1, embedding: [0.1, 0.2, 0.3] },
        { id: 'v2', name: 'B', value: 2, embedding: [0.15, 0.25, 0.35] },
        { id: 'v3', name: 'C', value: 3, embedding: [0.2, 0.3, 0.4] },
      ];

      const keys = entitiesWithVectors.map((e) => `testentity:${e.id}`);
      mockClient.keys.mockResolvedValue(keys);
      mockPipeline.exec.mockResolvedValue(
        entitiesWithVectors.map((e) => JSON.stringify(e))
      );

      const results = await repository.vectorSearch(
        'embedding',
        queryVector,
        { limit: 1, minScore: 0.0 }
      );

      expect(results.length).toBe(1);
    });

    it('should skip entities without the vector field', async () => {
      mockClient.sendCommand.mockRejectedValue(
        new Error('unknown command')
      );

      const mixedEntities: TestEntity[] = [
        { id: 'v1', name: 'A', value: 1, embedding: [0.1, 0.2, 0.3] },
        { id: 'v2', name: 'B', value: 2 }, // no embedding
      ];

      const keys = mixedEntities.map((e) => `testentity:${e.id}`);
      mockClient.keys.mockResolvedValue(keys);
      mockPipeline.exec.mockResolvedValue(
        mixedEntities.map((e) => JSON.stringify(e))
      );

      const results = await repository.vectorSearch(
        'embedding',
        queryVector,
        { minScore: 0.0 }
      );

      expect(results.length).toBe(1);
      expect(results[0]!.item).toEqual(
        expect.objectContaining({ id: 'v1' })
      );
    });

    it('should return empty array when no entities have vectors', async () => {
      mockClient.sendCommand.mockImplementation(() =>
        Promise.reject(new Error('unknown command'))
      );

      mockClient.keys.mockResolvedValue([]);

      const results = await repository.vectorSearch(
        'embedding',
        queryVector,
        { minScore: 0.0 }
      );

      expect(results).toEqual([]);
    });
  });
});
