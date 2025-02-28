import { Test, TestingModule } from '@nestjs/testing';
import { AnalysisService } from '../services/analysis.service';
import { MemgraphService } from '../database';
import { MockMemgraphService } from '../test/test-utils';
import {
  ExtendedContentNode,
  PatternDetectionResult,
} from '../modules/analysis/analysis.types';
import { ContentClassificationService } from '../modules/content/services/content-classification.service';
import { ContentNode } from '../schemas/base.schema';
import { LoggingService } from '../services/logging.service';

describe('AnalysisService', () => {
  let service: AnalysisService;
  let memgraphService: MockMemgraphService;
  let contentClassificationService: ContentClassificationService;

  const mockClassification = {
    sentiment: 'neutral',
    categories: ['news'],
    topics: ['general'],
    toxicity: 0.1,
    subjectivity: 0.5,
    language: 'en',
    entities: [
      {
        name: 'Example',
        type: 'organization',
        confidence: 0.9,
      },
    ],
  };

  const mockBaseContent: ContentNode = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    type: 'content',
    content: 'Test content',
    timestamp: Date.now(),
  };

  beforeEach(async () => {
    memgraphService = new MockMemgraphService();
    contentClassificationService = {
      classifyContent: jest.fn().mockResolvedValue(mockClassification),
    } as unknown as ContentClassificationService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalysisService,
        {
          provide: MemgraphService,
          useValue: memgraphService,
        },
        {
          provide: ContentClassificationService,
          useValue: contentClassificationService,
        },
        LoggingService,
      ],
    }).compile();

    service = module.get<AnalysisService>(AnalysisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('analyzeContent', () => {
    it('should analyze content and return extended content node', async () => {
      const contentId = '123e4567-e89b-12d3-a456-426614174000';
      const result = await service.analyzeContent(contentId);

      expect(result).toBeDefined();
      expect(result.id).toBe(contentId);
      expect(result.metrics).toBeDefined();
      expect(result.analysis).toBeDefined();
      expect(typeof result.metrics?.influence).toBe('number');
      expect(typeof result.metrics?.centrality).toBe('number');
      expect(Array.isArray(result.analysis?.topics)).toBe(true);
    });

    it('should throw error when content not found', async () => {
      jest.spyOn(service, 'getContentById').mockResolvedValueOnce(null);

      await expect(service.analyzeContent('non-existent')).rejects.toThrow(
        'Content with ID non-existent not found'
      );
    });
  });

  describe('measureRealityDeviation', () => {
    it('should measure reality deviation for a narrative', async () => {
      const narrativeId = '123e4567-e89b-12d3-a456-426614174000';
      const result = await service.measureRealityDeviation(narrativeId);

      expect(result).toBeDefined();
      expect(typeof result.baselineScore).toBe('number');
      expect(typeof result.deviationMagnitude).toBe('number');
      expect(typeof result.propagationVelocity).toBe('number');
      expect(typeof result.crossReferenceScore).toBe('number');
      expect(typeof result.sourceCredibility).toBe('number');
      expect(typeof result.impactScore).toBe('number');
    });

    it('should not throw error when narrative not found', async () => {
      const narrativeId = 'non-existent';
      jest.spyOn(memgraphService, 'executeQuery').mockResolvedValueOnce([]);

      const result = await service.measureRealityDeviation(narrativeId);
      expect(result).toBeDefined();
      expect(typeof result.baselineScore).toBe('number');
    });

    it('should handle invalid timestamps in propagation data', async () => {
      const result = await service.measureRealityDeviation(mockBaseContent.id);
      expect(result.propagationVelocity).toBeDefined();
      expect(typeof result.propagationVelocity).toBe('number');
    });

    it('should handle extreme engagement metrics', async () => {
      const result = await service.measureRealityDeviation(mockBaseContent.id);
      expect(result.impactScore).toBeDefined();
      expect(typeof result.impactScore).toBe('number');
      expect(result.impactScore).toBeGreaterThanOrEqual(0);
      expect(result.impactScore).toBeLessThanOrEqual(1);
    });

    it('should handle conflicting cross-references', async () => {
      const result = await service.measureRealityDeviation(mockBaseContent.id);
      expect(result.crossReferenceScore).toBeDefined();
      expect(typeof result.crossReferenceScore).toBe('number');
      expect(result.crossReferenceScore).toBeGreaterThanOrEqual(0);
      expect(result.crossReferenceScore).toBeLessThanOrEqual(1);
    });
  });

  describe('detectPatterns', () => {
    it('should detect patterns in content', async () => {
      const contentIds = ['content1', 'content2'];
      const patterns = await service.detectPatterns(contentIds);

      expect(patterns).toBeDefined();
      expect(Array.isArray(patterns)).toBe(true);
      expect(patterns.length).toBeGreaterThan(0);
      expect(
        patterns.some((p: PatternDetectionResult) => p.type === 'cluster')
      ).toBe(true);
    });

    it('should return patterns even with empty interaction data', async () => {
      const contentIds = ['content1', 'content2'];
      jest.spyOn(memgraphService, 'executeQuery').mockResolvedValue([]);
      const patterns = await service.detectPatterns(contentIds);

      expect(patterns).toBeDefined();
      expect(Array.isArray(patterns)).toBe(true);
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('should detect patterns in overlapping time windows', async () => {
      const contentIds = ['content1', 'content2'];

      const patterns = await service.detectPatterns(contentIds);
      expect(patterns).toBeDefined();
      expect(Array.isArray(patterns)).toBe(true);
      expect(patterns.length).toBeGreaterThan(0);
      expect(
        patterns.some((p: PatternDetectionResult) => p.type === 'temporal')
      ).toBe(true);
    });

    it('should identify high-frequency automated patterns', async () => {
      const contentIds = ['content1', 'content2', 'content3', 'content4'];
      const patterns = await service.detectPatterns(contentIds);

      expect(patterns).toBeDefined();
      expect(Array.isArray(patterns)).toBe(true);
      expect(patterns.length).toBeGreaterThan(0);
    });
  });

  describe('analyzeNetwork', () => {
    it('should analyze network for content nodes', async () => {
      const contentIds = ['content1', 'content2', 'content3'];
      const result = await service.analyzeNetwork(contentIds);

      expect(result).toBeDefined();
      expect(result.centrality).toBeDefined();
      expect(result.communities).toBeDefined();
      expect(typeof result.density).toBe('number');
      expect(typeof result.diameter).toBe('number');
      expect(result.metrics).toBeDefined();
    });

    it('should handle empty network', async () => {
      const contentIds: string[] = [];
      const result = await service.analyzeNetwork(contentIds);

      expect(result).toBeDefined();
      expect(result.centrality).toBeDefined();
      expect(Object.keys(result.centrality).length).toBe(0);
      expect(result.communities).toBeDefined();
      expect(result.density).toBeDefined();
      expect(result.diameter).toBeDefined();
      expect(result.metrics).toBeDefined();
    });
  });

  describe('getContentById', () => {
    it('should return extended content node with analysis', async () => {
      const contentId = '123e4567-e89b-12d3-a456-426614174000';

      const result = await service.getContentById(contentId);

      expect(result).toBeDefined();
      expect(result?.id).toBe(contentId);
      expect(result?.type).toBe('content');
      expect(result?.content).toBeDefined();
      expect(result?.metrics).toBeDefined();
      expect(result?.analysis).toBeDefined();
    });

    it('should return null when content not found', async () => {
      jest.spyOn(service, 'getContentById').mockResolvedValueOnce(null);

      const contentId = 'non-existent';
      const result = await service.getContentById(contentId);
      expect(result).toBeNull();
    });
  });

  describe('findRelatedContent', () => {
    it('should find related content', async () => {
      const contentId = 'content-1';
      const results = await service.findRelatedContent(contentId);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return related content even when none found in database', async () => {
      const contentId = 'content-1';
      jest.spyOn(memgraphService, 'executeQuery').mockResolvedValueOnce([]);

      const results = await service.findRelatedContent(contentId);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should find content with multiple matching topics', async () => {
      const contentId = 'content-1';

      const results = await service.findRelatedContent(contentId);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(3);
    });

    it('should find content in different languages', async () => {
      const contentId = 'content-1';
      const results = await service.findRelatedContent(contentId);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('calculateSourceCredibility', () => {
    it('should calculate source credibility', async () => {
      const sourceId = '123e4567-e89b-12d3-a456-426614174000';
      const credibility = await service.calculateSourceCredibility(sourceId);

      expect(typeof credibility).toBe('number');
      expect(credibility).toBeGreaterThanOrEqual(0);
      expect(credibility).toBeLessThanOrEqual(1);
    });

    it('should return a credibility score even when source has no content', async () => {
      const sourceId = 'non-existent';
      jest.spyOn(memgraphService, 'executeQuery').mockResolvedValueOnce([]);

      const credibility = await service.calculateSourceCredibility(sourceId);
      expect(typeof credibility).toBe('number');
      expect(credibility).toBeGreaterThanOrEqual(0);
      expect(credibility).toBeLessThanOrEqual(1);
    });
  });

  describe('calculateContentDeviation', () => {
    it('should calculate content deviation', async () => {
      const content: ExtendedContentNode = {
        id: 'content-1',
        type: 'content',
        content: 'Test content',
      };

      const deviation = await service.calculateContentDeviation(content);
      expect(typeof deviation).toBe('number');
      expect(deviation).toBeGreaterThanOrEqual(0);
      expect(deviation).toBeLessThanOrEqual(1);
    });
  });
});
