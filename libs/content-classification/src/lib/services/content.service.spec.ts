import { Test, TestingModule } from '@nestjs/testing';
import { ContentService, ExtendedContentNode } from './content.service';
import { Logger } from '@nestjs/common';
import { DATABASE_PROVIDER_TOKEN } from '../constants';

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
    find: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation((data) => ({
      id: 'test-id',
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    updateById: jest.fn().mockResolvedValue(null),
    deleteById: jest.fn().mockResolvedValue(true),
    count: jest.fn().mockResolvedValue(0),
  }),
  isConnected: jest.fn().mockReturnValue(true),
  registerModel: jest.fn().mockReturnValue({}),
};

describe('ContentService', () => {
  let service: ContentService;
  let classificationService: any; // Use any type to avoid importing
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
    it('should search content with provided parameters', async () => {
      const params = {
        query: 'test',
        platform: 'twitter',
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-12-31'),
        limit: 10,
      };

      const result = await service.searchContent(params);

      expect(result).toEqual([]);
      expect(mockRepository.find).toHaveBeenCalled();
    });

    it('should search content with given parameters', async () => {
      const searchParams = {
        query: 'ai',
        platform: 'twitter',
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-12-31'),
        limit: 10,
        offset: 0,
      };

      mockRepository.find.mockResolvedValue([mockContent]);

      const result = await service.searchContent(searchParams);

      expect(mockRepository.find).toHaveBeenCalled();
      expect(result).toEqual([mockContent]);

      // Verify filter construction
      const findCall = mockRepository.find.mock.calls[0][0];
      expect(findCall.platform).toBe('twitter');
      expect(findCall.timestamp.$gte).toEqual(searchParams.startDate);
      expect(findCall.timestamp.$lte).toEqual(searchParams.endDate);
      expect(findCall.$text.$search).toBe('ai');
    });

    it('should use default pagination when not provided', async () => {
      const searchParams = {
        query: 'ai',
      };

      mockRepository.find.mockResolvedValue([mockContent]);

      await service.searchContent(searchParams);

      // Verify options
      const options = mockRepository.find.mock.calls[0][1];
      expect(options.skip).toBe(0);
      expect(options.limit).toBe(20);
      expect(options.sort).toEqual({ timestamp: -1 });
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
});
