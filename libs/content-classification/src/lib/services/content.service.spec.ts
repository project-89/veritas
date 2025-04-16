import { Test, TestingModule } from '@nestjs/testing';
import { ContentService, ExtendedContentNode } from './content.service';
import { Logger } from '@nestjs/common';
import { DATABASE_PROVIDER_TOKEN } from '../constants';
import { EmbeddingsService } from './embeddings.service';

// Define interface instead of importing actual service
interface ContentClassification {
  categories: string[];
  sentiment: {
    score: number;
    label: 'positive' | 'negative' | 'neutral';
    confidence: number;
  };
  toxicity: number;
  subjectivity: number;
  language: string;
  topics: string[];
  entities: Array<{
    text: string;
    type: string;
    confidence: number;
  }>;
}

// Mock data
const mockContentClassification: ContentClassification = {
  categories: ['technology', 'science'],
  sentiment: {
    score: 0.5,
    label: 'positive',
    confidence: 0.8,
  },
  toxicity: 0.1,
  subjectivity: 0.4,
  language: 'en',
  topics: ['ai', 'machine learning'],
  entities: [
    { text: 'OpenAI', type: 'organization', confidence: 0.9 },
    { text: 'GPT-4', type: 'product', confidence: 0.95 },
  ],
};

const mockContent: Partial<ExtendedContentNode> = {
  id: 'test-id',
  text: 'Test content about artificial intelligence',
  timestamp: new Date(),
  platform: 'twitter',
  engagementMetrics: {
    likes: 10,
    shares: 5,
    comments: 3,
    reach: 100,
  },
  classification: {
    categories: mockContentClassification.categories,
    sentiment: mockContentClassification.sentiment.label,
    toxicity: mockContentClassification.toxicity,
    subjectivity: mockContentClassification.subjectivity,
    language: mockContentClassification.language,
    topics: mockContentClassification.topics,
    entities: mockContentClassification.entities,
  },
  metadata: { source: 'test' },
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Create a mock for ContentClassificationService to avoid the franc-min import
const mockContentClassificationService = {
  classifyContent: jest.fn().mockResolvedValue({
    categories: ['news', 'politics'],
    sentiment: {
      score: 0.5,
      label: 'neutral',
      confidence: 0.8,
    },
    toxicity: 0.1,
    subjectivity: 0.3,
    language: 'en',
    topics: ['test', 'example'],
    entities: [],
  }),
  updateClassification: jest.fn(),
};

// Create a mock for the database service
const mockDatabaseService = {
  getRepository: jest.fn().mockReturnValue({
    find: jest.fn().mockImplementation((filter, options) => {
      if (filter && (filter.$or || filter.embedding)) {
        // Return mock content without embeddings for the generateAllEmbeddings test
        return Promise.resolve([
          { ...mockContent, id: 'no-embedding-1' },
          { ...mockContent, id: 'no-embedding-2' },
        ]);
      }
      return Promise.resolve([mockContent]);
    }),
    findById: jest.fn().mockImplementation((id) => {
      if (id === 'test-id') {
        return Promise.resolve(mockContent);
      }
      return Promise.resolve(null);
    }),
    findOne: jest.fn().mockResolvedValue(mockContent),
    create: jest.fn().mockImplementation((data) => ({
      id: 'test-id',
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    updateById: jest.fn().mockImplementation((id, data) => {
      return Promise.resolve({
        ...mockContent,
        ...data,
        updatedAt: new Date(),
      });
    }),
    deleteById: jest.fn().mockResolvedValue(mockContent),
    count: jest.fn().mockResolvedValue(2),
    vectorSearch: jest.fn().mockImplementation((field, vector, options) => {
      return Promise.resolve([
        { item: { ...mockContent, id: 'similar-1' }, score: 0.9 },
        { item: { ...mockContent, id: 'similar-2' }, score: 0.8 },
      ]);
    }),
  }),
  isConnected: jest.fn().mockReturnValue(true),
  registerModel: jest.fn().mockReturnValue({}),
};

// Create a mock for EmbeddingsService
const mockEmbeddingsService = {
  generateEmbedding: jest.fn().mockImplementation((text) => {
    // Return standard mock embedding
    return Promise.resolve([0.1, 0.2, 0.3, 0.4]);
  }) as jest.Mock,

  batchGenerateEmbeddings: jest.fn().mockImplementation((texts) => {
    // For each text, generate a mock embedding
    return Promise.resolve(texts.map(() => [0.1, 0.2, 0.3, 0.4]));
  }) as jest.Mock,

  searchSimilarContent: jest
    .fn()
    .mockImplementation((textOrVector, options) => {
      return Promise.resolve([
        { item: { id: 'similar-1', text: 'Similar content 1' }, score: 0.9 },
        { item: { id: 'similar-2', text: 'Similar content 2' }, score: 0.8 },
      ]);
    }) as jest.Mock,

  calculateSimilarity: jest.fn().mockReturnValue(0.75) as jest.Mock,
};

describe('ContentService', () => {
  let service: ContentService;
  let classificationService: any; // Use any type to avoid importing
  let embeddingsService: EmbeddingsService;
  let mockRepository: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRepository = mockDatabaseService.getRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentService,
        {
          provide: 'ContentClassificationService', // Use string token instead of actual class
          useValue: mockContentClassificationService,
        },
        {
          provide: DATABASE_PROVIDER_TOKEN,
          useValue: mockDatabaseService,
        },
        {
          provide: EmbeddingsService,
          useValue: mockEmbeddingsService,
        },
        {
          provide: Logger,
          useValue: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ContentService>(ContentService);
    classificationService = module.get('ContentClassificationService');
    embeddingsService = module.get<EmbeddingsService>(EmbeddingsService);
    // Initialize service
    await service.onModuleInit();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should initialize correctly', () => {
    expect(mockDatabaseService.isConnected).toHaveBeenCalled();
    expect(mockDatabaseService.registerModel).toHaveBeenCalled();
    expect(mockDatabaseService.getRepository).toHaveBeenCalledWith('Content');
  });

  describe('createContent', () => {
    it('should create content with classification', async () => {
      const input = {
        text: 'Test content',
        timestamp: new Date(),
        platform: 'twitter',
        sourceId: 'source123',
        metadata: { test: true },
      };

      const result = await service.createContent(input);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.text).toBe(input.text);
      expect(result.platform).toBe(input.platform);
      expect(classificationService.classifyContent).toHaveBeenCalledWith(
        input.text
      );
      expect(result.classification).toBeDefined();
      expect(result.classification.language).toBe('en');
    });

    it('should handle errors during creation', async () => {
      const createInput = {
        text: 'Test content',
        timestamp: new Date(),
        platform: 'twitter',
        sourceId: 'source-1',
      };

      mockRepository.create.mockRejectedValue(new Error('Database error'));

      await expect(service.createContent(createInput)).rejects.toThrow();
    });
  });

  describe('getContentById', () => {
    it('should return null when content not found', async () => {
      mockRepository.findById.mockResolvedValue(null);
      const result = await service.getContentById('not-found');
      expect(result).toBeNull();
    });

    it('should return content by id', async () => {
      const mockContent = {
        id: 'test-id',
        text: 'Test content',
        timestamp: new Date(),
        platform: 'twitter',
        engagementMetrics: { likes: 10, shares: 5, comments: 3, reach: 100 },
        classification: {
          categories: ['test'],
          sentiment: 'neutral',
          toxicity: 0.1,
          subjectivity: 0.3,
          language: 'en',
          topics: ['test'],
          entities: [],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.findById.mockResolvedValue(mockContent);
      const result = await service.getContentById('test-id');
      expect(result).toEqual(mockContent);
    });

    it('should handle errors during retrieval', async () => {
      mockRepository.findById.mockRejectedValue(new Error('Database error'));

      await expect(service.getContentById('test-id')).rejects.toThrow();
    });
  });

  describe('searchContent', () => {
    it('should search content and return results', async () => {
      // Mock the find method to return mock data
      mockRepository.find.mockResolvedValue([mockContent]);

      const result = await service.searchContent({
        query: 'test',
        limit: 10,
        offset: 0,
      });

      expect(result).toEqual([mockContent]);
      expect(mockRepository.find).toHaveBeenCalled();
    });

    it('should return empty result if no content found', async () => {
      // Mock the find method to return an empty array
      mockRepository.find.mockResolvedValue([]);

      const result = await service.searchContent({
        query: 'nonexistent',
        limit: 10,
        offset: 0,
      });

      expect(result).toEqual([]);
      expect(mockRepository.find).toHaveBeenCalled();
    });

    it('should handle database error', async () => {
      // Mock the find method to throw an error
      mockRepository.find.mockRejectedValue(new Error('Database error'));

      await expect(
        service.searchContent({
          query: 'test',
          limit: 10,
          offset: 0,
        })
      ).rejects.toThrow('Database error');

      expect(mockRepository.find).toHaveBeenCalled();
    });
  });

  describe('updateContent', () => {
    it('should update content successfully', async () => {
      const updateInput = {
        text: 'Updated content',
        metadata: { updated: true },
      };

      mockRepository.findById.mockResolvedValue(mockContent);
      mockRepository.updateById.mockResolvedValue({
        ...mockContent,
        text: 'Updated content',
        metadata: { ...mockContent.metadata, updated: true },
      });

      const result = await service.updateContent('test-id', updateInput);

      expect(mockRepository.findById).toHaveBeenCalledWith('test-id');
      expect(
        mockContentClassificationService.classifyContent
      ).toHaveBeenCalledWith(updateInput.text);
      expect(mockRepository.updateById).toHaveBeenCalled();
      expect(result!.text).toBe('Updated content');
      expect(result!.metadata?.updated).toBe(true);
    });

    it('should return null when content not found', async () => {
      mockRepository.findById.mockResolvedValue(null);

      const result = await service.updateContent('non-existent-id', {
        text: 'Updated',
      });

      expect(result).toBeNull();
      expect(mockRepository.updateById).not.toHaveBeenCalled();
    });

    it('should update engagement metrics correctly', async () => {
      const updateInput = {
        engagementMetrics: {
          likes: 20,
          shares: 10,
        },
      };

      mockRepository.findById.mockResolvedValue({
        ...mockContent,
        engagementMetrics: {
          likes: 10,
          shares: 5,
          comments: 3,
          reach: 100,
        },
      });

      const updatedContent = {
        ...mockContent,
        engagementMetrics: {
          likes: 20,
          shares: 10,
          comments: 3,
          reach: 100,
        },
      };
      mockRepository.updateById.mockResolvedValue(updatedContent);

      const result = await service.updateContent('test-id', updateInput);

      expect(mockRepository.updateById).toHaveBeenCalled();
      expect(result!.engagementMetrics!.likes).toBe(20);
      expect(result!.engagementMetrics!.shares).toBe(10);
      // Should preserve original values for metrics not in update
      expect(result!.engagementMetrics!.comments).toBe(3);
      expect(result!.engagementMetrics!.reach).toBe(100);
    });

    it('should handle errors during update', async () => {
      mockRepository.findById.mockResolvedValue(mockContent);
      mockRepository.updateById.mockRejectedValue(new Error('Database error'));

      await expect(
        service.updateContent('test-id', { text: 'Updated' })
      ).rejects.toThrow();
    });
  });

  describe('deleteContent', () => {
    it('should delete content successfully', async () => {
      mockRepository.deleteById.mockResolvedValue(mockContent);

      const result = await service.deleteContent('test-id');

      expect(mockRepository.deleteById).toHaveBeenCalledWith('test-id');
      expect(result).toBe(true);
    });

    it('should return false when content not found', async () => {
      mockRepository.deleteById.mockResolvedValue(null);

      const result = await service.deleteContent('non-existent-id');

      expect(mockRepository.deleteById).toHaveBeenCalledWith('non-existent-id');
      expect(result).toBe(false);
    });

    it('should handle errors during deletion', async () => {
      mockRepository.deleteById.mockRejectedValue(new Error('Database error'));

      await expect(service.deleteContent('test-id')).rejects.toThrow();
    });
  });

  describe('getRelatedContent', () => {
    it('should return related content', async () => {
      mockRepository.findById.mockResolvedValue(mockContent);
      mockRepository.find.mockResolvedValue([
        { ...mockContent, id: 'related-1' },
        { ...mockContent, id: 'related-2' },
      ]);

      const result = await service.getRelatedContent('test-id', 2);

      expect(mockRepository.findById).toHaveBeenCalledWith('test-id');
      expect(mockRepository.find).toHaveBeenCalled();
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('related-1');
    });

    it('should return empty array when source content not found', async () => {
      mockRepository.findById.mockResolvedValue(null);

      const result = await service.getRelatedContent('non-existent-id');

      expect(result).toEqual([]);
      expect(mockRepository.find).not.toHaveBeenCalled();
    });

    it('should use default limit when not provided', async () => {
      mockRepository.findById.mockResolvedValue(mockContent);
      mockRepository.find.mockResolvedValue([]);

      await service.getRelatedContent('test-id');

      const options = mockRepository.find.mock.calls[0][1];
      expect(options.limit).toBe(5);
    });

    it('should handle errors during retrieval', async () => {
      mockRepository.findById.mockRejectedValue(new Error('Database error'));

      await expect(service.getRelatedContent('test-id')).rejects.toThrow();
    });
  });

  describe('generateEmbedding', () => {
    it('should generate embedding for content', async () => {
      // Mock findById to return mockContent
      mockRepository.findById.mockResolvedValue(mockContent);

      // Mock embeddings service
      mockEmbeddingsService.generateEmbedding.mockResolvedValue([
        0.1, 0.2, 0.3,
      ]);

      // Mock updateById to return the updated content
      const updatedContent = { ...mockContent, embedding: [0.1, 0.2, 0.3] };
      mockRepository.updateById.mockResolvedValue(updatedContent);

      const result = await service.generateEmbedding('test-id');

      expect(result).toEqual(updatedContent);
      expect(mockRepository.findById).toHaveBeenCalledWith('test-id');
      expect(mockEmbeddingsService.generateEmbedding).toHaveBeenCalledWith(
        mockContent.text
      );
      expect(mockRepository.updateById).toHaveBeenCalledWith('test-id', {
        embedding: [0.1, 0.2, 0.3],
      });
    });

    it('should return null if content is not found', async () => {
      // Mock findById to return null
      mockRepository.findById.mockResolvedValue(null);

      const result = await service.generateEmbedding('nonexistent-id');

      expect(result).toBeNull();
      expect(mockRepository.findById).toHaveBeenCalledWith('nonexistent-id');
      expect(mockEmbeddingsService.generateEmbedding).not.toHaveBeenCalled();
      expect(mockRepository.updateById).not.toHaveBeenCalled();
    });

    it('should return null if embedding generation fails', async () => {
      // Mock findById to return mockContent
      mockRepository.findById.mockResolvedValue(mockContent);

      // Mock embeddings service to throw an error
      mockEmbeddingsService.generateEmbedding.mockRejectedValue(
        new Error('Embedding generation failed')
      );

      const result = await service.generateEmbedding('test-id');

      expect(result).toBeNull();
      expect(mockRepository.findById).toHaveBeenCalledWith('test-id');
      expect(mockEmbeddingsService.generateEmbedding).toHaveBeenCalledWith(
        mockContent.text
      );
      expect(mockRepository.updateById).not.toHaveBeenCalled();
    });

    it('should return null if database update fails', async () => {
      // Mock findById to return mockContent
      mockRepository.findById.mockResolvedValue(mockContent);

      // Mock embeddings service
      mockEmbeddingsService.generateEmbedding.mockResolvedValue([
        0.1, 0.2, 0.3,
      ]);

      // Mock updateById to throw an error
      mockRepository.updateById.mockRejectedValue(new Error('Database error'));

      const result = await service.generateEmbedding('test-id');

      expect(result).toBeNull();
      expect(mockRepository.findById).toHaveBeenCalledWith('test-id');
      expect(mockEmbeddingsService.generateEmbedding).toHaveBeenCalledWith(
        mockContent.text
      );
      expect(mockRepository.updateById).toHaveBeenCalledWith('test-id', {
        embedding: [0.1, 0.2, 0.3],
      });
    });
  });

  describe('findSimilarContent', () => {
    it('should find similar content using existing embedding', async () => {
      // Mock content with existing embedding
      const contentWithEmbedding = {
        ...mockContent,
        embedding: [0.1, 0.2, 0.3, 0.4],
      };
      mockRepository.findById.mockResolvedValue(contentWithEmbedding);

      // Mock repository.vectorSearch to return similar content
      mockRepository.vectorSearch = jest.fn().mockResolvedValue([
        { item: { id: 'similar-1', text: 'Similar content 1' }, score: 0.9 },
        { item: { id: 'similar-2', text: 'Similar content 2' }, score: 0.8 },
      ]);

      const result = await service.findSimilarContent('test-id', {
        limit: 2,
        minScore: 0.7,
        useExistingEmbedding: true,
      });

      expect(mockRepository.findById).toHaveBeenCalledWith('test-id');
      expect(mockRepository.vectorSearch).toHaveBeenCalledWith(
        'embedding',
        [0.1, 0.2, 0.3, 0.4],
        { limit: 2, minScore: 0.7, collection: 'content' }
      );
      expect(embeddingsService.generateEmbedding).not.toHaveBeenCalled();
      expect(result).toHaveLength(2);
      expect(result[0].content.id).toBe('similar-1');
      expect(result[0].score).toBe(0.9);
    });

    it('should generate embedding when content has no existing embedding', async () => {
      // Mock content without embedding
      mockRepository.findById.mockResolvedValue(mockContent);

      // Mock embeddings service
      mockEmbeddingsService.generateEmbedding.mockResolvedValue([
        0.1, 0.2, 0.3,
      ]);

      // Mock repository.vectorSearch to return similar content
      mockRepository.vectorSearch = jest
        .fn()
        .mockResolvedValue([
          { item: { id: 'similar-1', text: 'Similar content 1' }, score: 0.9 },
        ]);

      const result = await service.findSimilarContent('test-id', { limit: 1 });

      expect(mockRepository.findById).toHaveBeenCalledWith('test-id');
      expect(embeddingsService.generateEmbedding).toHaveBeenCalledWith(
        mockContent.text
      );
      expect(mockRepository.vectorSearch).toHaveBeenCalledWith(
        'embedding',
        [0.1, 0.2, 0.3],
        { limit: 1, minScore: 0.7, collection: 'content' }
      );
      expect(result).toHaveLength(1);
    });

    it('should return empty array if content not found', async () => {
      // Mock findById to return null for non-existent content
      mockRepository.findById.mockResolvedValue(null);

      // Set expectation for the test - expect empty array rather than throwing
      const result = await service.findSimilarContent('non-existent-id');

      expect(result).toEqual([]);
      expect(mockRepository.findById).toHaveBeenCalledWith('non-existent-id');
      expect(embeddingsService.generateEmbedding).not.toHaveBeenCalled();
      expect(mockRepository.vectorSearch).not.toHaveBeenCalled();
    });

    it('should handle repository without vectorSearch capability', async () => {
      // Mock content without embedding
      mockRepository.findById.mockResolvedValue(mockContent);

      // Remove vectorSearch capability
      const originalVectorSearch = mockRepository.vectorSearch;
      delete mockRepository.vectorSearch;

      // Mock find to return content items for manual similarity calculation
      mockRepository.find.mockResolvedValue([
        { ...mockContent, id: 'content-1', embedding: [0.1, 0.2, 0.3] },
        { ...mockContent, id: 'content-2', embedding: [0.3, 0.2, 0.1] },
      ]);

      // Mock calculateSimilarity
      mockEmbeddingsService.calculateSimilarity.mockReturnValue(0.85);

      const result = await service.findSimilarContent('test-id');

      expect(mockRepository.findById).toHaveBeenCalledWith('test-id');
      expect(mockEmbeddingsService.generateEmbedding).toHaveBeenCalledWith(
        mockContent.text
      );
      expect(mockRepository.find).toHaveBeenCalled();
      expect(mockEmbeddingsService.calculateSimilarity).toHaveBeenCalled();
      expect(result.length).toBeGreaterThan(0);

      // Restore original mock
      mockRepository.vectorSearch = originalVectorSearch;
    });
  });

  describe('semanticSearchContent', () => {
    it('should perform semantic search with embeddings', async () => {
      // Setup params with semanticQuery
      const searchParams = {
        semanticQuery: 'artificial intelligence research',
        platform: 'twitter',
        limit: 5,
        minScore: 0.6,
      };

      // Setup temporary mocks
      const originalGenerateEmbedding = embeddingsService.generateEmbedding;
      embeddingsService.generateEmbedding = jest
        .fn()
        .mockResolvedValue([0.1, 0.2, 0.3, 0.4]);

      // Mock repository.vectorSearch
      mockRepository.vectorSearch = jest.fn().mockResolvedValue([
        { item: { id: 'result-1', text: 'Result 1' }, score: 0.9 },
        { item: { id: 'result-2', text: 'Result 2' }, score: 0.8 },
      ]);

      const result = await service.semanticSearchContent(searchParams, true);

      expect(embeddingsService.generateEmbedding).toHaveBeenCalledWith(
        'artificial intelligence research'
      );
      expect(mockRepository.vectorSearch).toHaveBeenCalledWith(
        'embedding',
        [0.1, 0.2, 0.3, 0.4],
        { limit: 5, minScore: 0.6, collection: 'content' }
      );
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('result-1');

      // Restore original mock
      embeddingsService.generateEmbedding = originalGenerateEmbedding;
    });

    it('should fall back to regular search when useEmbeddings is false', async () => {
      const searchParams = {
        semanticQuery: 'artificial intelligence',
        query: 'ai',
        platform: 'twitter',
      };

      mockRepository.find.mockResolvedValue([mockContent]);

      const result = await service.semanticSearchContent(searchParams, false);

      expect(embeddingsService.generateEmbedding).not.toHaveBeenCalled();
      expect(mockRepository.vectorSearch).not.toHaveBeenCalled();
      expect(mockRepository.find).toHaveBeenCalled();
      expect(result).toEqual([mockContent]);
    });

    it('should handle repository without vectorSearch capability', async () => {
      const searchParams = {
        semanticQuery: 'artificial intelligence',
      };

      // Remove vectorSearch capability
      const originalVectorSearch = mockRepository.vectorSearch;
      delete mockRepository.vectorSearch;

      // For this test, we need to mock the fallback path
      // First mock the regular search to return some content
      mockRepository.find.mockResolvedValue([
        { ...mockContent, id: 'result-1', embedding: [0.1, 0.2, 0.3] },
        { ...mockContent, id: 'result-2', embedding: [0.3, 0.2, 0.1] },
      ]);

      // Setup mocks for embeddings service
      mockEmbeddingsService.generateEmbedding.mockResolvedValue([
        0.1, 0.2, 0.3,
      ]);
      mockEmbeddingsService.calculateSimilarity.mockReturnValue(0.85);

      const result = await service.semanticSearchContent(searchParams, true);

      expect(mockRepository.find).toHaveBeenCalled();
      expect(mockEmbeddingsService.generateEmbedding).toHaveBeenCalled();
      expect(mockEmbeddingsService.calculateSimilarity).toHaveBeenCalled();
      expect(result.length).toBeGreaterThan(0);

      // Restore original mocks
      mockRepository.vectorSearch = originalVectorSearch;
    });
  });

  describe('generateAllEmbeddings', () => {
    it('should generate embeddings for all content', async () => {
      // Mock find to return multiple content items
      const mockContentList = [
        { id: 'test-id-1', text: 'test content 1' },
        { id: 'test-id-2', text: 'test content 2' },
      ];
      mockRepository.find.mockResolvedValue(mockContentList);

      // Mock batch generate embeddings
      const mockEmbeddings = [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ];
      mockEmbeddingsService.batchGenerateEmbeddings.mockResolvedValue(
        mockEmbeddings
      );

      // Mock update calls
      mockRepository.updateById.mockResolvedValue({
        id: 'test-id-1',
        embedding: mockEmbeddings[0],
      });

      const result = await service.generateAllEmbeddings();

      expect(result).toBe(2);
      expect(mockRepository.find).toHaveBeenCalledWith(
        { embedding: { $exists: false } },
        { limit: 50, skip: 0 }
      );
      expect(
        mockEmbeddingsService.batchGenerateEmbeddings
      ).toHaveBeenCalledWith(['test content 1', 'test content 2']);
      expect(mockRepository.updateById).toHaveBeenCalledTimes(2);
    });

    it('should return 0 if no content needs embeddings', async () => {
      // Mock find to return empty array
      mockRepository.find.mockResolvedValue([]);

      const result = await service.generateAllEmbeddings();

      expect(result).toBe(0);
      expect(mockRepository.find).toHaveBeenCalledWith(
        { embedding: { $exists: false } },
        { limit: 50, skip: 0 }
      );
      expect(
        mockEmbeddingsService.batchGenerateEmbeddings
      ).not.toHaveBeenCalled();
      expect(mockRepository.updateById).not.toHaveBeenCalled();
    });

    it('should return 0 if database query fails', async () => {
      // Mock find to throw an error
      mockRepository.find.mockRejectedValue(new Error('Database error'));

      const result = await service.generateAllEmbeddings();

      expect(result).toBe(0);
      expect(mockRepository.find).toHaveBeenCalledWith(
        { embedding: { $exists: false } },
        { limit: 50, skip: 0 }
      );
      expect(
        mockEmbeddingsService.batchGenerateEmbeddings
      ).not.toHaveBeenCalled();
      expect(mockRepository.updateById).not.toHaveBeenCalled();
    });

    it('should return 0 if batch embedding generation fails', async () => {
      // Mock find to return content items
      const mockContentList = [
        { id: 'test-id-1', text: 'test content 1' },
        { id: 'test-id-2', text: 'test content 2' },
      ];
      mockRepository.find.mockResolvedValue(mockContentList);

      // Mock batch generate embeddings to throw an error
      mockEmbeddingsService.batchGenerateEmbeddings.mockRejectedValue(
        new Error('Batch processing failed')
      );

      const result = await service.generateAllEmbeddings();

      expect(result).toBe(0);
      expect(mockRepository.find).toHaveBeenCalledWith(
        { embedding: { $exists: false } },
        { limit: 50, skip: 0 }
      );
      expect(
        mockEmbeddingsService.batchGenerateEmbeddings
      ).toHaveBeenCalledWith(['test content 1', 'test content 2']);
      expect(mockRepository.updateById).not.toHaveBeenCalled();
    });
  });
});
