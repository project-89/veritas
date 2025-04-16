import { Test, TestingModule } from '@nestjs/testing';
import { ContentResolver } from './content.resolver';
import { ContentService } from '../services/content.service';
import {
  SemanticSearchParamsType,
  SimilarContentResultType,
} from '../types/content.types';

describe('ContentResolver', () => {
  let resolver: ContentResolver;
  let contentService: ContentService;

  const mockContentService = {
    getContentById: jest.fn(),
    searchContent: jest.fn(),
    getRelatedContent: jest.fn(),
    createContent: jest.fn(),
    updateContent: jest.fn(),
    deleteContent: jest.fn(),
    semanticSearchContent: jest.fn(),
    findSimilarContent: jest.fn(),
    generateEmbedding: jest.fn(),
    generateAllEmbeddings: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentResolver,
        {
          provide: ContentService,
          useValue: mockContentService,
        },
      ],
    }).compile();

    resolver = module.get<ContentResolver>(ContentResolver);
    contentService = module.get<ContentService>(ContentService);
  });

  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });

  describe('semanticSearch', () => {
    it('should perform semantic search with provided parameters', async () => {
      const params: SemanticSearchParamsType = {
        semanticQuery: 'artificial intelligence',
        query: 'ai',
        platform: 'twitter',
        limit: 10,
        minScore: 0.7,
      };

      mockContentService.semanticSearchContent.mockResolvedValue([
        { id: 'result-1', text: 'Result 1' },
        { id: 'result-2', text: 'Result 2' },
      ]);

      const result = await resolver.semanticSearch(params);

      expect(mockContentService.semanticSearchContent).toHaveBeenCalledWith(
        {
          query: params.query,
          platform: params.platform,
          startDate: params.startDate,
          endDate: params.endDate,
          sourceId: params.sourceId,
          limit: params.limit,
          offset: params.offset,
          semanticQuery: params.semanticQuery,
          minScore: params.minScore,
        },
        true
      );
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('result-1');
    });

    it('should throw an error when service is not available', async () => {
      // Create resolver without service
      const moduleWithoutService: TestingModule =
        await Test.createTestingModule({
          providers: [ContentResolver],
        }).compile();

      const resolverWithoutService =
        moduleWithoutService.get<ContentResolver>(ContentResolver);

      await expect(
        resolverWithoutService.semanticSearch({ semanticQuery: 'test' })
      ).rejects.toThrow();
    });
  });

  describe('similarContent', () => {
    it('should find similar content with provided parameters', async () => {
      const id = 'content-123';
      const limit = 5;
      const minScore = 0.8;
      const useExistingEmbedding = true;

      const similarContent = [
        { content: { id: 'similar-1', text: 'Similar 1' }, score: 0.9 },
        { content: { id: 'similar-2', text: 'Similar 2' }, score: 0.85 },
      ];

      mockContentService.findSimilarContent.mockResolvedValue(similarContent);

      const result = await resolver.similarContent(
        id,
        limit,
        minScore,
        useExistingEmbedding
      );

      expect(mockContentService.findSimilarContent).toHaveBeenCalledWith(id, {
        limit,
        minScore,
        useExistingEmbedding,
      });
      expect(result).toEqual(similarContent);
      expect(result[0].content.id).toBe('similar-1');
      expect(result[0].score).toBe(0.9);
    });

    it('should use default parameters when not provided', async () => {
      const id = 'content-123';
      mockContentService.findSimilarContent.mockResolvedValue([]);

      await resolver.similarContent(id);

      expect(mockContentService.findSimilarContent).toHaveBeenCalledWith(id, {
        limit: undefined,
        minScore: undefined,
        useExistingEmbedding: undefined,
      });
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

      const result = await resolver.generateEmbedding(id);

      expect(mockContentService.generateEmbedding).toHaveBeenCalledWith(id);
      expect(result).toEqual(contentWithEmbedding);
    });

    it('should throw an error when content is not found', async () => {
      const id = 'non-existent-id';
      mockContentService.generateEmbedding.mockResolvedValue(null);

      await expect(resolver.generateEmbedding(id)).rejects.toThrow();
    });
  });

  describe('generateAllEmbeddings', () => {
    it('should generate embeddings for all content', async () => {
      const batchSize = 50;
      mockContentService.generateAllEmbeddings.mockResolvedValue(42); // 42 embeddings generated

      const result = await resolver.generateAllEmbeddings(batchSize);

      expect(mockContentService.generateAllEmbeddings).toHaveBeenCalledWith(
        batchSize
      );
      expect(result).toBe(42);
    });

    it('should use default batch size when not provided', async () => {
      mockContentService.generateAllEmbeddings.mockResolvedValue(10);

      await resolver.generateAllEmbeddings();

      expect(mockContentService.generateAllEmbeddings).toHaveBeenCalledWith(
        undefined
      );
    });
  });
});
