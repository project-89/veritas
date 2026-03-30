/* eslint-disable @typescript-eslint/no-explicit-any */

interface TestEntity {
  _id: string;
  name: string;
  value: number;
  embedding?: number[];
}

// Create chainable query mock helper
function createQueryMock(resolvedValue: any = null) {
  const queryMock: any = {
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(resolvedValue),
  };
  return queryMock;
}

// Mock model constructor (for `new this.model(data)`)
function createMockModel() {
  const mockModelInstance = {
    save: jest.fn(),
  };

  // The model is both a constructor and has static methods
  const MockModel: any = jest.fn().mockImplementation((data: any) => {
    Object.assign(mockModelInstance, data);
    return mockModelInstance;
  });

  MockModel.find = jest.fn();
  MockModel.findById = jest.fn();
  MockModel.findOne = jest.fn();
  MockModel.countDocuments = jest.fn();
  MockModel.insertMany = jest.fn();
  MockModel.findByIdAndUpdate = jest.fn();
  MockModel.updateMany = jest.fn();
  MockModel.findByIdAndDelete = jest.fn();
  MockModel.deleteMany = jest.fn();
  MockModel.db = {
    command: jest.fn(),
    collection: jest.fn().mockReturnValue({ find: jest.fn() }),
  };

  // Store instance reference for test access
  MockModel.__instance = mockModelInstance;

  return MockModel;
}

import { MongoDBRepository } from './mongodb-repository';

describe('MongoDBRepository', () => {
  let repository: MongoDBRepository<TestEntity>;
  let mockModel: any;

  const testEntity: TestEntity = {
    _id: '507f1f77bcf86cd799439011',
    name: 'Test Entity',
    value: 42,
  };

  const testEntities: TestEntity[] = [
    { _id: '507f1f77bcf86cd799439011', name: 'Entity 1', value: 1 },
    { _id: '507f1f77bcf86cd799439012', name: 'Entity 2', value: 2 },
    { _id: '507f1f77bcf86cd799439013', name: 'Entity 3', value: 3 },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockModel = createMockModel();
    repository = new MongoDBRepository<TestEntity>(mockModel);
  });

  describe('find', () => {
    it('should return all entities when called with no filter', async () => {
      const queryMock = createQueryMock(testEntities);
      mockModel.find.mockReturnValue(queryMock);

      const result = await repository.find();

      expect(mockModel.find).toHaveBeenCalledWith({});
      expect(queryMock.exec).toHaveBeenCalled();
      expect(result).toEqual(testEntities);
    });

    it('should apply filter when provided', async () => {
      const filter = { name: 'Entity 1' };
      const queryMock = createQueryMock([testEntities[0]]);
      mockModel.find.mockReturnValue(queryMock);

      const result = await repository.find(filter);

      expect(mockModel.find).toHaveBeenCalledWith(filter);
      expect(result).toEqual([testEntities[0]]);
    });

    it('should apply skip option', async () => {
      const queryMock = createQueryMock(testEntities.slice(1));
      mockModel.find.mockReturnValue(queryMock);

      await repository.find({}, { skip: 1 });

      expect(queryMock.skip).toHaveBeenCalledWith(1);
    });

    it('should apply limit option', async () => {
      const queryMock = createQueryMock(testEntities.slice(0, 2));
      mockModel.find.mockReturnValue(queryMock);

      await repository.find({}, { limit: 2 });

      expect(queryMock.limit).toHaveBeenCalledWith(2);
    });

    it('should apply sort option', async () => {
      const queryMock = createQueryMock(testEntities);
      mockModel.find.mockReturnValue(queryMock);

      await repository.find({}, { sort: { name: 1 } });

      expect(queryMock.sort).toHaveBeenCalledWith({ name: 1 });
    });

    it('should apply skip, limit, and sort together', async () => {
      const queryMock = createQueryMock(testEntities);
      mockModel.find.mockReturnValue(queryMock);

      await repository.find({}, { skip: 1, limit: 2, sort: { value: -1 } });

      expect(queryMock.skip).toHaveBeenCalledWith(1);
      expect(queryMock.limit).toHaveBeenCalledWith(2);
      expect(queryMock.sort).toHaveBeenCalledWith({ value: -1 });
    });

    it('should throw and log error on failure', async () => {
      const error = new Error('Find failed');
      const queryMock = createQueryMock();
      queryMock.exec.mockRejectedValue(error);
      mockModel.find.mockReturnValue(queryMock);

      await expect(repository.find()).rejects.toThrow('Find failed');
    });
  });

  describe('findById', () => {
    it('should return the entity when found', async () => {
      const queryMock = createQueryMock(testEntity);
      mockModel.findById.mockReturnValue(queryMock);

      const result = await repository.findById(testEntity._id);

      expect(mockModel.findById).toHaveBeenCalledWith(testEntity._id);
      expect(result).toEqual(testEntity);
    });

    it('should return null when entity is not found', async () => {
      const queryMock = createQueryMock(null);
      mockModel.findById.mockReturnValue(queryMock);

      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
    });

    it('should throw and log error on failure', async () => {
      const error = new Error('FindById failed');
      const queryMock = createQueryMock();
      queryMock.exec.mockRejectedValue(error);
      mockModel.findById.mockReturnValue(queryMock);

      await expect(repository.findById('some-id')).rejects.toThrow(
        'FindById failed'
      );
    });
  });

  describe('findOne', () => {
    it('should return the first matching entity', async () => {
      const filter = { name: 'Test Entity' };
      const queryMock = createQueryMock(testEntity);
      mockModel.findOne.mockReturnValue(queryMock);

      const result = await repository.findOne(filter);

      expect(mockModel.findOne).toHaveBeenCalledWith(filter);
      expect(result).toEqual(testEntity);
    });

    it('should return null when no entity matches', async () => {
      const queryMock = createQueryMock(null);
      mockModel.findOne.mockReturnValue(queryMock);

      const result = await repository.findOne({ name: 'Nonexistent' });

      expect(result).toBeNull();
    });

    it('should throw and log error on failure', async () => {
      const error = new Error('FindOne failed');
      const queryMock = createQueryMock();
      queryMock.exec.mockRejectedValue(error);
      mockModel.findOne.mockReturnValue(queryMock);

      await expect(repository.findOne({ name: 'any' })).rejects.toThrow(
        'FindOne failed'
      );
    });
  });

  describe('count', () => {
    it('should return count of all documents with no filter', async () => {
      const queryMock = createQueryMock(5);
      mockModel.countDocuments.mockReturnValue(queryMock);

      const result = await repository.count();

      expect(mockModel.countDocuments).toHaveBeenCalledWith({});
      expect(result).toBe(5);
    });

    it('should return count of filtered documents', async () => {
      const filter = { value: 1 };
      const queryMock = createQueryMock(1);
      mockModel.countDocuments.mockReturnValue(queryMock);

      const result = await repository.count(filter);

      expect(mockModel.countDocuments).toHaveBeenCalledWith(filter);
      expect(result).toBe(1);
    });

    it('should throw and log error on failure', async () => {
      const error = new Error('Count failed');
      const queryMock = createQueryMock();
      queryMock.exec.mockRejectedValue(error);
      mockModel.countDocuments.mockReturnValue(queryMock);

      await expect(repository.count()).rejects.toThrow('Count failed');
    });
  });

  describe('create', () => {
    it('should create and return a new entity', async () => {
      const data = { name: 'New Entity', value: 100 };
      mockModel.__instance.save.mockResolvedValue({
        ...data,
        _id: 'new-id',
      });

      const result = await repository.create(data);

      expect(mockModel).toHaveBeenCalledWith(data);
      expect(mockModel.__instance.save).toHaveBeenCalled();
      expect(result).toEqual({ ...data, _id: 'new-id' });
    });

    it('should throw and log error on failure', async () => {
      const error = new Error('Create failed');
      mockModel.__instance.save.mockRejectedValue(error);

      await expect(
        repository.create({ name: 'Fail', value: 0 })
      ).rejects.toThrow('Create failed');
    });
  });

  describe('createMany', () => {
    it('should insert multiple entities', async () => {
      const data = [
        { name: 'Entity A', value: 10 },
        { name: 'Entity B', value: 20 },
      ];
      const inserted = data.map((d, i) => ({ ...d, _id: `id-${i}` }));
      mockModel.insertMany.mockResolvedValue(inserted);

      const result = await repository.createMany(data);

      expect(mockModel.insertMany).toHaveBeenCalledWith(data);
      expect(result).toEqual(inserted);
    });

    it('should throw and log error on failure', async () => {
      const error = new Error('InsertMany failed');
      mockModel.insertMany.mockRejectedValue(error);

      await expect(repository.createMany([{ name: 'Fail', value: 0 }])).rejects.toThrow(
        'InsertMany failed'
      );
    });
  });

  describe('updateById', () => {
    it('should update and return the entity', async () => {
      const updated = { ...testEntity, name: 'Updated' };
      const queryMock = createQueryMock(updated);
      mockModel.findByIdAndUpdate.mockReturnValue(queryMock);

      const result = await repository.updateById(testEntity._id, {
        name: 'Updated',
      });

      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        testEntity._id,
        { name: 'Updated' },
        { new: true }
      );
      expect(result).toEqual(updated);
    });

    it('should return null when entity not found', async () => {
      const queryMock = createQueryMock(null);
      mockModel.findByIdAndUpdate.mockReturnValue(queryMock);

      const result = await repository.updateById('nonexistent', {
        name: 'Updated',
      });

      expect(result).toBeNull();
    });

    it('should throw and log error on failure', async () => {
      const error = new Error('Update failed');
      const queryMock = createQueryMock();
      queryMock.exec.mockRejectedValue(error);
      mockModel.findByIdAndUpdate.mockReturnValue(queryMock);

      await expect(
        repository.updateById('some-id', { name: 'Fail' })
      ).rejects.toThrow('Update failed');
    });
  });

  describe('updateMany', () => {
    it('should update matching entities and return modified count', async () => {
      const queryMock = createQueryMock({ modifiedCount: 3 });
      mockModel.updateMany.mockReturnValue(queryMock);

      const result = await repository.updateMany(
        { value: 1 },
        { name: 'Bulk Updated' }
      );

      expect(mockModel.updateMany).toHaveBeenCalledWith(
        { value: 1 },
        { name: 'Bulk Updated' }
      );
      expect(result).toBe(3);
    });

    it('should return 0 when no entities match', async () => {
      const queryMock = createQueryMock({ modifiedCount: 0 });
      mockModel.updateMany.mockReturnValue(queryMock);

      const result = await repository.updateMany(
        { value: 999 },
        { name: 'None' }
      );

      expect(result).toBe(0);
    });

    it('should throw and log error on failure', async () => {
      const error = new Error('UpdateMany failed');
      const queryMock = createQueryMock();
      queryMock.exec.mockRejectedValue(error);
      mockModel.updateMany.mockReturnValue(queryMock);

      await expect(
        repository.updateMany({ value: 1 }, { name: 'Fail' })
      ).rejects.toThrow('UpdateMany failed');
    });
  });

  describe('deleteById', () => {
    it('should delete and return the entity', async () => {
      const queryMock = createQueryMock(testEntity);
      mockModel.findByIdAndDelete.mockReturnValue(queryMock);

      const result = await repository.deleteById(testEntity._id);

      expect(mockModel.findByIdAndDelete).toHaveBeenCalledWith(testEntity._id);
      expect(result).toEqual(testEntity);
    });

    it('should return null when entity not found', async () => {
      const queryMock = createQueryMock(null);
      mockModel.findByIdAndDelete.mockReturnValue(queryMock);

      const result = await repository.deleteById('nonexistent');

      expect(result).toBeNull();
    });

    it('should throw and log error on failure', async () => {
      const error = new Error('Delete failed');
      const queryMock = createQueryMock();
      queryMock.exec.mockRejectedValue(error);
      mockModel.findByIdAndDelete.mockReturnValue(queryMock);

      await expect(repository.deleteById('some-id')).rejects.toThrow(
        'Delete failed'
      );
    });
  });

  describe('deleteMany', () => {
    it('should delete matching entities and return deleted count', async () => {
      const queryMock = createQueryMock({ deletedCount: 2 });
      mockModel.deleteMany.mockReturnValue(queryMock);

      const result = await repository.deleteMany({ value: 1 });

      expect(mockModel.deleteMany).toHaveBeenCalledWith({ value: 1 });
      expect(result).toBe(2);
    });

    it('should return 0 when no entities match', async () => {
      const queryMock = createQueryMock({ deletedCount: 0 });
      mockModel.deleteMany.mockReturnValue(queryMock);

      const result = await repository.deleteMany({ value: 999 });

      expect(result).toBe(0);
    });

    it('should throw and log error on failure', async () => {
      const error = new Error('DeleteMany failed');
      const queryMock = createQueryMock();
      queryMock.exec.mockRejectedValue(error);
      mockModel.deleteMany.mockReturnValue(queryMock);

      await expect(repository.deleteMany({ value: 1 })).rejects.toThrow(
        'DeleteMany failed'
      );
    });
  });

  describe('vectorSearch', () => {
    const queryVector = [0.1, 0.2, 0.3];

    it('should fall back to in-memory search when vector search is not available', async () => {
      // Make hasVectorSearchCapability return false by making db.command undefined
      mockModel.db = {};

      const entitiesWithVectors = [
        { _id: '1', name: 'A', value: 1, embedding: [0.1, 0.2, 0.3] },
        { _id: '2', name: 'B', value: 2, embedding: [0.9, 0.8, 0.7] },
      ];

      const queryMock = createQueryMock(entitiesWithVectors);
      mockModel.find.mockReturnValue(queryMock);

      const results = await repository.vectorSearch('embedding', queryVector, {
        limit: 10,
        minScore: 0.0,
      });

      expect(results.length).toBeGreaterThan(0);
      // First result should be the most similar (identical vector)
      expect(results[0]!.score).toBeCloseTo(1.0, 1);
    });

    it('should return empty array when no documents have the vector field', async () => {
      mockModel.db = {};

      const queryMock = createQueryMock([]);
      mockModel.find.mockReturnValue(queryMock);

      const results = await repository.vectorSearch(
        'embedding',
        queryVector
      );

      expect(results).toEqual([]);
    });

    it('should filter results below minScore', async () => {
      mockModel.db = {};

      const entitiesWithVectors = [
        { _id: '1', name: 'A', value: 1, embedding: [0.1, 0.2, 0.3] },
        { _id: '2', name: 'B', value: 2, embedding: [-0.9, -0.8, -0.7] },
      ];

      const queryMock = createQueryMock(entitiesWithVectors);
      mockModel.find.mockReturnValue(queryMock);

      const results = await repository.vectorSearch('embedding', queryVector, {
        minScore: 0.9,
      });

      // Only the first entity should match (identical direction)
      expect(results.length).toBe(1);
      expect(results[0]!.item).toEqual(entitiesWithVectors[0]);
    });

    it('should respect limit option', async () => {
      mockModel.db = {};

      const entitiesWithVectors = [
        { _id: '1', name: 'A', value: 1, embedding: [0.1, 0.2, 0.3] },
        { _id: '2', name: 'B', value: 2, embedding: [0.15, 0.25, 0.35] },
        { _id: '3', name: 'C', value: 3, embedding: [0.2, 0.3, 0.4] },
      ];

      const queryMock = createQueryMock(entitiesWithVectors);
      mockModel.find.mockReturnValue(queryMock);

      const results = await repository.vectorSearch('embedding', queryVector, {
        limit: 1,
        minScore: 0.0,
      });

      expect(results.length).toBe(1);
    });

    it('should use default options when none provided', async () => {
      mockModel.db = {};

      const queryMock = createQueryMock([]);
      mockModel.find.mockReturnValue(queryMock);

      const results = await repository.vectorSearch(
        'embedding',
        queryVector
      );

      expect(results).toEqual([]);
    });
  });
});
