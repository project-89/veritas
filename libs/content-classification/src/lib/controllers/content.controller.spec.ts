import { Test, TestingModule } from '@nestjs/testing';
import { ContentController } from './content.controller';
import { ContentService } from '../services/content.service';
import { HttpException } from '@nestjs/common';

describe('ContentController', () => {
  let controller: ContentController;
  let contentService: ContentService;

  const mockContentService = {
    createContent: jest.fn(),
    getContentById: jest.fn(),
    searchContent: jest.fn(),
    updateContent: jest.fn(),
    deleteContent: jest.fn(),
    getRelatedContent: jest.fn(),
    semanticSearchContent: jest.fn(),
    findSimilarContent: jest.fn(),
    generateEmbedding: jest.fn(),
    generateAllEmbeddings: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContentController],
      providers: [
        {
          provide: ContentService,
          useValue: mockContentService,
        },
      ],
    }).compile();

    controller = module.get<ContentController>(ContentController);
    contentService = module.get<ContentService>(ContentService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('semanticSearchContent', () => {
    it('should perform semantic search with query params', async () => {
      const semanticQuery = 'artificial intelligence';
      const minScore = '0.7';
      const limit = '10';
      const params = { platform: 'twitter' };

      mockContentService.semanticSearchContent.mockResolvedValue([
        { id: 'result-1', text: 'Result 1' },
        { id: 'result-2', text: 'Result 2' },
      ]);

      const result = await controller.semanticSearchContent(
        semanticQuery,
        minScore as any,
        limit as any,
        params
      );

      expect(mockContentService.semanticSearchContent).toHaveBeenCalledWith(
        {
          ...params,
          semanticQuery,
          minScore: 0.7,
          limit: 10,
        },
        true
      );
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('result-1');
    });

    it('should handle undefined optional parameters', async () => {
      const semanticQuery = 'neural networks';

      mockContentService.semanticSearchContent.mockResolvedValue([
        { id: 'result-1', text: 'Result 1' },
      ]);

      await controller.semanticSearchContent(semanticQuery);

      expect(mockContentService.semanticSearchContent).toHaveBeenCalledWith(
        {
          semanticQuery,
          minScore: undefined,
          limit: undefined,
        },
        true
      );
    });

    it('should throw an exception when service is not available', async () => {
      // Create controller without service
      const moduleWithoutService: TestingModule =
        await Test.createTestingModule({
          controllers: [ContentController],
          providers: [],
        }).compile();

      const controllerWithoutService =
        moduleWithoutService.get<ContentController>(ContentController);

      await expect(
        controllerWithoutService.semanticSearchContent('test query')
      ).rejects.toThrow(HttpException);
    });
  });

  describe('getSimilarContent', () => {
    it('should find similar content for a given ID', async () => {
      const id = 'content-123';
      const limit = '5';
      const minScore = '0.8';
      const useExistingEmbedding = 'true';

      mockContentService.findSimilarContent.mockResolvedValue([
        { content: { id: 'similar-1', text: 'Similar 1' }, score: 0.9 },
        { content: { id: 'similar-2', text: 'Similar 2' }, score: 0.85 },
      ]);

      const result = await controller.getSimilarContent(
        id,
        limit as any,
        minScore as any,
        useExistingEmbedding
      );

      expect(mockContentService.findSimilarContent).toHaveBeenCalledWith(id, {
        limit: 5,
        minScore: 0.8,
        useExistingEmbedding: true,
      });
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('similar-1');
    });

    it('should return content objects without scores', async () => {
      mockContentService.findSimilarContent.mockResolvedValue([
        { content: { id: 'similar-1', text: 'Similar 1' }, score: 0.9 },
      ]);

      const result = await controller.getSimilarContent('content-123');

      // Ensure we get just the content objects
      expect(result[0]).not.toHaveProperty('score');
      expect(result[0].id).toBe('similar-1');
    });
  });

  describe('generateEmbedding', () => {
    it('should generate an embedding for content ID', async () => {
      const id = 'content-123';
      const contentWithEmbedding = {
        id,
        text: 'Sample content',
        embedding: [0.1, 0.2, 0.3, 0.4],
      };

      mockContentService.generateEmbedding.mockResolvedValue(
        contentWithEmbedding
      );

      const result = await controller.generateEmbedding(id);

      expect(mockContentService.generateEmbedding).toHaveBeenCalledWith(id);
      expect(result).toEqual(contentWithEmbedding);
    });

    it('should throw an exception when content is not found', async () => {
      const id = 'non-existent-id';
      mockContentService.generateEmbedding.mockResolvedValue(null);

      await expect(controller.generateEmbedding(id)).rejects.toThrow(
        HttpException
      );
    });
  });

  describe('generateAllEmbeddings', () => {
    it('should generate embeddings for all content', async () => {
      const batchSize = '50';
      mockContentService.generateAllEmbeddings.mockResolvedValue(42); // 42 embeddings generated

      const result = await controller.generateAllEmbeddings(batchSize as any);

      expect(mockContentService.generateAllEmbeddings).toHaveBeenCalledWith(50);
      expect(result).toEqual({ processedCount: 42 });
    });

    it('should use default batch size when not provided', async () => {
      mockContentService.generateAllEmbeddings.mockResolvedValue(10);

      await controller.generateAllEmbeddings();

      expect(mockContentService.generateAllEmbeddings).toHaveBeenCalledWith(
        undefined
      );
    });
  });
});
