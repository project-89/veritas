import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MongoNarrativeRepository } from './mongo-narrative.repository';
import { NarrativeInsight } from '../interfaces/narrative-insight.interface';
import { NarrativeTrend } from '../interfaces/narrative-trend.interface';

describe('MongoNarrativeRepository', () => {
  let repository: MongoNarrativeRepository;
  let insightModel: Model<NarrativeInsight>;
  let trendModel: Model<NarrativeTrend>;

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
    // Create a testing module with our repository and mocked models
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MongoNarrativeRepository,
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

    // Get the repository and models from the testing module
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
      const insights = [
        mockInsight,
        { ...mockInsight, id: 'test-insight-2', contentHash: 'hash-456' },
      ];
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

    it('should apply pagination options', async () => {
      await repository.findByTimeframe('2023-Q1', { limit: 10, skip: 20 });

      const findMock = insightModel.find as jest.Mock;
      const skipMock = findMock.mock.results[0].value.skip as jest.Mock;
      const limitMock = skipMock.mock.results[0].value.limit as jest.Mock;

      expect(skipMock).toHaveBeenCalledWith(20);
      expect(limitMock).toHaveBeenCalledWith(10);
    });
  });

  describe('getTrendsByTimeframe', () => {
    it('should get trends from cache if they exist', async () => {
      const result = await repository.getTrendsByTimeframe('2023-Q1');
      expect(trendModel.find).toHaveBeenCalledWith({ timeframe: '2023-Q1' });
      expect(result).toEqual([mockTrend]);
    });

    it('should compute trends if none exist in cache', async () => {
      // Mock empty trend result to force computation
      (trendModel.find as jest.Mock).mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue([]),
      });

      const result = await repository.getTrendsByTimeframe('2023-Q1');

      // Should check for trends first
      expect(trendModel.find).toHaveBeenCalledWith({ timeframe: '2023-Q1' });

      // Then should fetch insights
      expect(insightModel.find).toHaveBeenCalled();

      // Result should still be defined (empty array in this test case)
      expect(result).toBeDefined();
    });
  });

  describe('deleteOlderThan', () => {
    it('should delete insights older than cutoff date', async () => {
      const cutoffDate = new Date('2023-01-01');
      const result = await repository.deleteOlderThan(cutoffDate);

      expect(insightModel.deleteMany).toHaveBeenCalledWith({
        timestamp: { $lt: cutoffDate },
      });

      expect(result).toBe(1); // Mocked to return 1 deleted document
    });
  });
});
