import { Test, TestingModule } from '@nestjs/testing';
import { NarrativeController } from '../../src/lib/controllers/narrative.controller';
import { InvestigationRepository } from '../../src/lib/repositories/investigation.repository';
import { NarrativeRepository } from '../../src/lib/repositories/narrative-insight.repository';
import { IngestionService } from '../../src/lib/services/ingestion.service';
import { TransformOnIngestService } from '../../src/lib/services/transform/transform-on-ingest.service';
import { NarrativeInsight } from '../../src/types/narrative-insight.interface';
import { NarrativeTrend } from '../../src/types/narrative-trend.interface';

describe('NarrativeController', () => {
  let controller: NarrativeController;
  let mockNarrativeRepository: jest.Mocked<NarrativeRepository>;
  let mockTransformService: jest.Mocked<TransformOnIngestService>;

  // Test data
  const mockEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5];

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
    embedding: mockEmbedding,
  };

  const mockInsight2: NarrativeInsight = {
    ...mockInsight,
    id: 'test-insight-2',
    contentHash: 'hash-456',
    themes: ['economy', 'inflation'],
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

  beforeEach(async () => {
    // Create mocks
    mockNarrativeRepository = {
      save: jest.fn(),
      saveMany: jest.fn(),
      findByContentHash: jest.fn().mockResolvedValue(mockInsight),
      findByTimeframe: jest.fn().mockResolvedValue([mockInsight, mockInsight2]),
      getTrendsByTimeframe: jest.fn().mockResolvedValue([mockTrend]),
      deleteOlderThan: jest.fn().mockResolvedValue(1),
      findSimilarContent: jest.fn().mockResolvedValue([
        { insight: mockInsight, score: 0.92 },
        { insight: mockInsight2, score: 0.85 },
      ]),
    } as unknown as jest.Mocked<NarrativeRepository>;

    mockTransformService = {
      transform: jest.fn().mockResolvedValue(mockInsight),
      transformBatch: jest.fn().mockResolvedValue([mockInsight, mockInsight2]),
    } as unknown as jest.Mocked<TransformOnIngestService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NarrativeController],
      providers: [
        {
          provide: NarrativeRepository,
          useValue: mockNarrativeRepository,
        },
        {
          provide: TransformOnIngestService,
          useValue: mockTransformService,
        },
        {
          provide: IngestionService,
          useValue: {
            searchWithRawDataAll: jest.fn().mockResolvedValue({ posts: [], insights: [] }),
          },
        },
        {
          provide: InvestigationRepository,
          useValue: {
            findOrCreateByQuery: jest.fn().mockResolvedValue({ _id: 'inv-1', id: 'inv-1' }),
            addSnapshot: jest.fn().mockResolvedValue({}),
          },
        },
      ],
    }).compile();

    controller = module.get<NarrativeController>(NarrativeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getInsightByHash', () => {
    it('should return a narrative insight by content hash', async () => {
      const result = await controller.getInsightByHash('hash-123');
      expect(result).toEqual(mockInsight);
      expect(mockNarrativeRepository.findByContentHash).toHaveBeenCalledWith('hash-123');
    });

    it('should return error object when insight not found', async () => {
      mockNarrativeRepository.findByContentHash.mockResolvedValueOnce(null);
      const result = await controller.getInsightByHash('non-existent-hash');
      expect(result).toEqual({ error: 'Insight not found' });
    });
  });

  describe('getInsightsByTimeframe', () => {
    it('should return insights for a timeframe', async () => {
      const result = await controller.getInsightsByTimeframe('2023-Q1');
      expect(result).toEqual([mockInsight, mockInsight2]);
      expect(mockNarrativeRepository.findByTimeframe).toHaveBeenCalledWith('2023-Q1', {
        limit: undefined,
        skip: undefined,
      });
    });

    it('should apply pagination options', async () => {
      await controller.getInsightsByTimeframe('2023-Q1', 10, 20);
      expect(mockNarrativeRepository.findByTimeframe).toHaveBeenCalledWith('2023-Q1', {
        limit: 10,
        skip: 20,
      });
    });
  });

  describe('getTrendsByTimeframe', () => {
    it('should return trends for a timeframe', async () => {
      const result = await controller.getTrendsByTimeframe('2023-Q1');
      expect(result).toEqual([mockTrend]);
      expect(mockNarrativeRepository.getTrendsByTimeframe).toHaveBeenCalledWith('2023-Q1');
    });
  });

  describe('deleteOldInsights', () => {
    it('should delete old insights', async () => {
      const result = await controller.deleteOldInsights('2023-01-01');
      expect(result).toEqual({ deletedCount: 1 });
      expect(mockNarrativeRepository.deleteOlderThan).toHaveBeenCalledWith(expect.any(Date));
    });

    it('should handle invalid date', async () => {
      const result = await controller.deleteOldInsights('invalid-date');
      expect(result).toEqual({ deletedCount: 0 });
    });
  });
});
