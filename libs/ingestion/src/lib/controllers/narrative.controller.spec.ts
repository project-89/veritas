import { Test, TestingModule } from '@nestjs/testing';
import { NarrativeController } from './narrative.controller';
import { NarrativeRepository } from '../repositories/narrative-insight.repository';
import { TransformOnIngestService } from '../services/transform/transform-on-ingest.service';
import { NarrativeInsight } from '../../types/narrative-insight.interface';
import { NarrativeTrend } from '../../types/narrative-trend.interface';

interface NarrativeControllerInterface {
  getInsight(contentHash: string): Promise<NarrativeInsight | null>;
  getInsightsByTimeframe(
    timeframe: string,
    limit?: number,
    skip?: number
  ): Promise<NarrativeInsight[]>;
  getTrendsByTimeframe(timeframe: string): Promise<NarrativeTrend[]>;
  findSimilarContent(params: {
    embedding?: number[];
    limit?: number;
    minScore?: number;
  }): Promise<Array<{ insight: NarrativeInsight; score: number }>>;
  cleanupExpiredData(): Promise<{ deletedCount: number }>;
}

describe('NarrativeController', () => {
  let controller: NarrativeController & NarrativeControllerInterface;
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
      ],
    }).compile();

    controller = module.get<NarrativeController>(
      NarrativeController
    ) as NarrativeController & NarrativeControllerInterface;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getInsight', () => {
    it('should return a narrative insight by content hash', async () => {
      const result = await controller.getInsight('hash-123');
      expect(result).toEqual(mockInsight);
      expect(mockNarrativeRepository.findByContentHash).toHaveBeenCalledWith(
        'hash-123'
      );
    });

    it('should return null when insight not found', async () => {
      mockNarrativeRepository.findByContentHash.mockResolvedValueOnce(null);
      const result = await controller.getInsight('non-existent-hash');
      expect(result).toBeNull();
    });
  });

  describe('getInsightsByTimeframe', () => {
    it('should return insights for a timeframe', async () => {
      const result = await controller.getInsightsByTimeframe('2023-Q1');
      expect(result).toEqual([mockInsight, mockInsight2]);
      expect(mockNarrativeRepository.findByTimeframe).toHaveBeenCalledWith(
        '2023-Q1',
        undefined
      );
    });

    it('should apply pagination options', async () => {
      await controller.getInsightsByTimeframe('2023-Q1', 10, 20);
      expect(mockNarrativeRepository.findByTimeframe).toHaveBeenCalledWith(
        '2023-Q1',
        { limit: 10, skip: 20 }
      );
    });
  });

  describe('getTrendsByTimeframe', () => {
    it('should return trends for a timeframe', async () => {
      const result = await controller.getTrendsByTimeframe('2023-Q1');
      expect(result).toEqual([mockTrend]);
      expect(mockNarrativeRepository.getTrendsByTimeframe).toHaveBeenCalledWith(
        '2023-Q1'
      );
    });
  });

  describe('findSimilarContent', () => {
    it('should return similar content when embedding is provided', async () => {
      const result = await controller.findSimilarContent({
        embedding: mockEmbedding,
      });

      expect(result).toHaveLength(2);
      expect(result[0]!.insight).toEqual(mockInsight);
      expect(result[0]!.score).toEqual(0.92);
      expect(mockNarrativeRepository.findSimilarContent).toHaveBeenCalledWith(
        mockEmbedding,
        { limit: 10, minScore: 0.7 }
      );
    });

    it('should apply custom limit and minScore', async () => {
      await controller.findSimilarContent({
        embedding: mockEmbedding,
        limit: 5,
        minScore: 0.8,
      });

      expect(mockNarrativeRepository.findSimilarContent).toHaveBeenCalledWith(
        mockEmbedding,
        { limit: 5, minScore: 0.8 }
      );
    });

    it('should return empty array when no embedding is provided', async () => {
      const result = await controller.findSimilarContent({});
      expect(result).toEqual([]);
      expect(mockNarrativeRepository.findSimilarContent).not.toHaveBeenCalled();
    });
  });

  describe('cleanupExpiredData', () => {
    it('should delete expired insights', async () => {
      const result = await controller.cleanupExpiredData();
      expect(result).toEqual({ deletedCount: 1 });
      expect(mockNarrativeRepository.deleteOlderThan).toHaveBeenCalledWith(
        expect.any(Date)
      );
    });
  });
});
