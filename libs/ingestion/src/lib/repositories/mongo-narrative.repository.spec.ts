import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MongoNarrativeRepository } from './mongo-narrative.repository';
import { NarrativeInsight } from '../../types/narrative-insight.interface';
import { NarrativeTrend } from '../../types/narrative-trend.interface';
import { DatabaseService } from '@veritas/database';

describe('MongoNarrativeRepository', () => {
  let repository: MongoNarrativeRepository;
  let insightModel: Model<NarrativeInsight>;
  let trendModel: Model<NarrativeTrend>;
  let mockDatabaseService: any;
  let mockInsightRepo: any;

  // Sample data for testing
  const mockInsight: NarrativeInsight = {
    id: 'test-insight-1',
    contentHash: 'hash-123',
    sourceHash: 'source-456',
    platform: 'twitter',
    timestamp: new Date('2023-01-15'),
    themes: ['politics', 'economy'],
    entities: [
      { name: 'Economy', type: 'topic', relevance: 0.8 },
      { name: 'Politics', type: 'topic', relevance: 0.7 },
    ],
    sentiment: { score: 0.2, label: 'positive', confidence: 0.8 },
    engagement: {
      total: 150,
      breakdown: { likes: 100, shares: 30, comments: 20 },
    },
    narrativeScore: 0.75,
    processedAt: new Date('2023-01-15T10:30:00'),
    expiresAt: new Date('2023-04-15'),
    embedding: [0.1, 0.2, 0.3, 0.4],
  };

  const mockInsight2: NarrativeInsight = {
    ...mockInsight,
    id: 'test-insight-2',
    contentHash: 'hash-456',
    themes: ['economy', 'inflation'],
    embedding: [0.2, 0.3, 0.4, 0.5],
  };

  const mockInsight3: NarrativeInsight = {
    ...mockInsight,
    id: 'test-insight-3',
    contentHash: 'hash-789',
    themes: ['elections', 'politics'],
    embedding: [0.3, 0.4, 0.5, 0.6],
  };

  const mockTrend: NarrativeTrend = {
    id: 'trend-2023-Q1-politics',
    timeframe: '2023-Q1',
    primaryTheme: 'politics',
    relatedThemes: ['economy', 'inflation', 'elections'],
    insightCount: 45,
    uniqueSourcesCount: 30,
    sentimentTrend: 0.1,
    platformDistribution: { twitter: 0.6, facebook: 0.3, reddit: 0.1 },
    narrativeScore: 0.8,
    detectedAt: new Date('2023-01-20'),
  };

  // Mock implementations
  const mockInsightModelFactory = jest.fn(() => ({
    findOneAndUpdate: jest.fn().mockResolvedValue(mockInsight),
    findOne: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(mockInsight),
    }),
    find: jest.fn().mockReturnValue({
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([mockInsight]),
    }),
    bulkWrite: jest
      .fn()
      .mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
    deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
  }));

  const mockTrendModelFactory = jest.fn(() => ({
    find: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([mockTrend]),
    }),
    create: jest.fn().mockResolvedValue(mockTrend),
  }));

  beforeEach(async () => {
    jest.clearAllMocks();

    // Create mock repository with Jest function implementations
    mockInsightRepo = {
      find: jest
        .fn()
        .mockResolvedValue([mockInsight, mockInsight2, mockInsight3]),
      findById: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      updateById: jest.fn(),
      updateMany: jest.fn(),
      deleteById: jest.fn(),
      deleteMany: jest.fn(),
      vectorSearch: jest.fn().mockResolvedValue([
        { item: mockInsight, score: 0.92 },
        { item: mockInsight2, score: 0.85 },
      ]),
    };

    const mockTrendRepo = { ...mockInsightRepo };

    // Create mock database service
    mockDatabaseService = {
      getRepository: jest.fn((name) => {
        if (name === 'narrative-insights') return mockInsightRepo;
        if (name === 'narrative-trends') return mockTrendRepo;
        return mockInsightRepo;
      }),
      connect: jest.fn(),
      disconnect: jest.fn(),
      isConnected: jest.fn(),
      registerModel: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MongoNarrativeRepository,
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
        {
          provide: getModelToken('NarrativeInsight'),
          useFactory: mockInsightModelFactory,
        },
        {
          provide: getModelToken('NarrativeTrend'),
          useFactory: mockTrendModelFactory,
        },
      ],
    }).compile();

    repository = module.get<MongoNarrativeRepository>(MongoNarrativeRepository);
    insightModel = module.get<Model<NarrativeInsight>>(
      getModelToken('NarrativeInsight')
    );
    trendModel = module.get<Model<NarrativeTrend>>(
      getModelToken('NarrativeTrend')
    );
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('save', () => {
    it('should save a narrative insight', async () => {
      await repository.save(mockInsight);
      expect(insightModel.findOneAndUpdate).toHaveBeenCalledWith(
        { contentHash: mockInsight.contentHash },
        mockInsight,
        { upsert: true, new: true }
      );
    });
  });

  describe('saveMany', () => {
    it('should save multiple narrative insights', async () => {
      const insights = [mockInsight, mockInsight2];
      await repository.saveMany(insights);
      expect(insightModel.bulkWrite).toHaveBeenCalled();
    });

    it('should do nothing if insights array is empty', async () => {
      await repository.saveMany([]);
      expect(insightModel.bulkWrite).not.toHaveBeenCalled();
    });
  });

  describe('findByContentHash', () => {
    it('should find an insight by content hash', async () => {
      const result = await repository.findByContentHash('hash-123');
      expect(insightModel.findOne).toHaveBeenCalledWith({
        contentHash: 'hash-123',
      });
      expect(result).toEqual(mockInsight);
    });
  });

  describe('findByTimeframe', () => {
    it('should find insights by timeframe', async () => {
      const result = await repository.findByTimeframe('2023-Q1');
      expect(insightModel.find).toHaveBeenCalled();
      expect(result).toEqual([mockInsight]);
    });
  });

  describe('getTrendsByTimeframe', () => {
    it('should get trends from cache if they exist', async () => {
      const result = await repository.getTrendsByTimeframe('2023-Q1');
      expect(trendModel.find).toHaveBeenCalledWith({ timeframe: '2023-Q1' });
      expect(result).toEqual([mockTrend]);
    });
  });

  describe('deleteOlderThan', () => {
    it('should delete insights older than cutoff date', async () => {
      const cutoffDate = new Date('2023-01-01');
      const result = await repository.deleteOlderThan(cutoffDate);
      expect(insightModel.deleteMany).toHaveBeenCalledWith({
        timestamp: { $lt: cutoffDate },
      });
      expect(result).toBe(1);
    });
  });

  describe('findSimilarContent', () => {
    it('should use native database vector search when available', async () => {
      // Setup test data
      const queryEmbedding = [0.1, 0.2, 0.3, 0.4];

      // Execute the test
      const result = await repository.findSimilarContent(queryEmbedding, {
        limit: 10,
        minScore: 0.7,
      });

      // Verify results
      expect(result).toHaveLength(2);
      expect(result[0]!.score).toBe(0.92);
      expect(mockInsightRepo.vectorSearch).toHaveBeenCalledWith(
        'embedding',
        queryEmbedding,
        expect.objectContaining({
          limit: 10,
          minScore: 0.7,
        })
      );
    });

    it('should fall back to in-memory vector search when native search not available', async () => {
      // Setup the test with no vector search capability
      const queryEmbedding = [0.1, 0.2, 0.3, 0.4];

      // Store the original implementation
      const originalVectorSearch = mockInsightRepo.vectorSearch;

      // Remove vectorSearch to test fallback
      mockInsightRepo.vectorSearch = undefined;

      // Execute the test
      const result = await repository.findSimilarContent(queryEmbedding, {
        limit: 2,
        minScore: 0.7,
      });

      // Since we're not actually calculating similarity in this test, just verify the method was called
      expect(mockInsightRepo.find).toHaveBeenCalled();

      // Restore the original implementation for other tests
      mockInsightRepo.vectorSearch = originalVectorSearch;
    });
  });
});
