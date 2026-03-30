import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  ContentClassificationService,
  ContentClassification,
  EmbeddingsService,
} from '@veritas/content-classification';
import { TransformOnIngestService } from './transform-on-ingest.service';
import { NarrativeRepository } from '../../repositories/narrative-insight.repository';
import { SocialMediaPost } from '../../../types/social-media.types';
import { NarrativeInsight } from '../../../types/narrative-insight.interface';

describe('TransformOnIngestService', () => {
  let service: TransformOnIngestService;
  let configService: ConfigService;
  let narrativeRepository: NarrativeRepository;
  let contentClassificationService: ContentClassificationService;
  let embeddingsService: EmbeddingsService;

  // Prepare mock data
  const mockSocialMediaPost: SocialMediaPost = {
    id: 'post123',
    authorId: 'author456',
    platform: 'twitter',
    text: 'This is a test post about climate change and technology',
    timestamp: new Date('2023-06-01T12:00:00Z'),
    engagementMetrics: {
      likes: 100,
      shares: 50,
      comments: 25,
      reach: 1000,
      viralityScore: 0.75,
    },
    url: 'https://twitter.com/user/status/123456',
  };

  const mockClassification: ContentClassification = {
    categories: ['technology', 'environment'],
    sentiment: {
      score: 0.75,
      label: 'positive',
      confidence: 0.85,
    },
    toxicity: 0.05,
    subjectivity: 0.3,
    language: 'en',
    topics: ['climate change', 'technology', 'sustainability'],
    entities: [
      { text: 'climate change', type: 'topic', confidence: 0.9 },
      { text: 'technology', type: 'topic', confidence: 0.85 },
    ],
  };

  const mockEmbedding = new Array(384).fill(0).map(() => Math.random() * 2 - 1);

  // Mock the narrative repository
  const mockNarrativeRepository = {
    save: jest.fn().mockImplementation(async (insight) => Promise.resolve()),
    saveMany: jest
      .fn()
      .mockImplementation(async (insights) => Promise.resolve()),
    findByContentHash: jest
      .fn()
      .mockImplementation(async (hash) => Promise.resolve(null)),
  };

  // Mock the content classification service
  const mockContentClassificationService = {
    classifyContent: jest
      .fn()
      .mockImplementation(async (text) => Promise.resolve(mockClassification)),
    batchClassify: jest
      .fn()
      .mockImplementation(async (texts) =>
        Promise.resolve(Array(texts.length).fill(mockClassification))
      ),
  };

  // Mock the embeddings service
  const mockEmbeddingsService = {
    generateEmbedding: jest
      .fn()
      .mockImplementation(async (text) => Promise.resolve(mockEmbedding)),
    batchGenerateEmbeddings: jest
      .fn()
      .mockImplementation(async (texts) =>
        Promise.resolve(Array(texts.length).fill(mockEmbedding))
      ),
  };

  // Mock the config service
  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'HASH_SALT') return 'test-salt';
      if (key === 'RETENTION_PERIOD_DAYS') return 90;
      return null;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransformOnIngestService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: NarrativeRepository,
          useValue: mockNarrativeRepository,
        },
        {
          provide: ContentClassificationService,
          useValue: mockContentClassificationService,
        },
        {
          provide: EmbeddingsService,
          useValue: mockEmbeddingsService,
        },
      ],
    }).compile();

    service = module.get<TransformOnIngestService>(TransformOnIngestService);
    configService = module.get<ConfigService>(ConfigService);
    narrativeRepository = module.get<NarrativeRepository>(NarrativeRepository);
    contentClassificationService = module.get<ContentClassificationService>(
      ContentClassificationService
    );
    embeddingsService = module.get<EmbeddingsService>(EmbeddingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('transform', () => {
    it('should transform a social media post into a narrative insight', async () => {
      const result = await service.transform(mockSocialMediaPost);

      // Verify the result is a NarrativeInsight
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.contentHash).toBeDefined();
      expect(result.sourceHash).toBeDefined();
      expect(result.platform).toBe(mockSocialMediaPost.platform);
      expect(result.timestamp).toEqual(mockSocialMediaPost.timestamp);
      expect(result.themes).toEqual(mockClassification.topics);
      expect(result.entities).toBeDefined();
      expect(result.sentiment).toBeDefined();
      expect(result.engagement).toBeDefined();
      expect(result.narrativeScore).toBeDefined();
      expect(result.processedAt).toBeDefined();
      expect(result.expiresAt).toBeDefined();
      expect(result.embedding).toEqual(mockEmbedding);

      // Verify service calls
      expect(contentClassificationService.classifyContent).toHaveBeenCalledWith(
        mockSocialMediaPost.text
      );
      expect(embeddingsService.generateEmbedding).toHaveBeenCalledWith(
        mockSocialMediaPost.text
      );
      expect(narrativeRepository.findByContentHash).toHaveBeenCalled();
      expect(narrativeRepository.save).toHaveBeenCalled();
    });

    it('should handle missing embeddings service gracefully', async () => {
      // Create a new module without the embeddings service
      const moduleWithoutEmbeddings: TestingModule =
        await Test.createTestingModule({
          providers: [
            TransformOnIngestService,
            {
              provide: ConfigService,
              useValue: mockConfigService,
            },
            {
              provide: NarrativeRepository,
              useValue: mockNarrativeRepository,
            },
            {
              provide: ContentClassificationService,
              useValue: mockContentClassificationService,
            },
          ],
        }).compile();

      const serviceWithoutEmbeddings =
        moduleWithoutEmbeddings.get<TransformOnIngestService>(
          TransformOnIngestService
        );

      const result = await serviceWithoutEmbeddings.transform(
        mockSocialMediaPost
      );

      // Verify the result is a NarrativeInsight without embeddings
      expect(result).toBeDefined();
      expect(result.embedding).toBeUndefined();

      // Verify service calls
      expect(contentClassificationService.classifyContent).toHaveBeenCalledWith(
        mockSocialMediaPost.text
      );
      expect(narrativeRepository.findByContentHash).toHaveBeenCalled();
      expect(narrativeRepository.save).toHaveBeenCalled();
    });

    it('should handle embeddings service errors gracefully', async () => {
      // Mock embeddings service to throw an error
      mockEmbeddingsService.generateEmbedding.mockRejectedValueOnce(
        new Error('Embeddings service error')
      );

      const result = await service.transform(mockSocialMediaPost);

      // Verify the result is a NarrativeInsight without embeddings
      expect(result).toBeDefined();
      expect(result.embedding).toBeUndefined();

      // Verify service calls
      expect(contentClassificationService.classifyContent).toHaveBeenCalledWith(
        mockSocialMediaPost.text
      );
      expect(embeddingsService.generateEmbedding).toHaveBeenCalledWith(
        mockSocialMediaPost.text
      );
      expect(narrativeRepository.findByContentHash).toHaveBeenCalled();
      expect(narrativeRepository.save).toHaveBeenCalled();
    });

    it('should skip saving duplicate content', async () => {
      // Mock repository to return an existing insight
      const existingInsight: NarrativeInsight = {
        id: 'existing-insight',
        contentHash: 'existing-hash',
        sourceHash: 'source-hash',
        platform: 'twitter',
        timestamp: new Date(),
        themes: ['climate'],
        entities: [{ name: 'climate', type: 'topic', relevance: 0.9 }],
        sentiment: {
          score: 0.5,
          label: 'positive',
          confidence: 0.7,
        },
        engagement: {
          total: 100,
          breakdown: { likes: 0.5, shares: 0.3, comments: 0.2 },
        },
        narrativeScore: 0.8,
        processedAt: new Date(),
        expiresAt: new Date(),
      };

      mockNarrativeRepository.findByContentHash.mockResolvedValueOnce(
        existingInsight
      );

      const result = await service.transform(mockSocialMediaPost);

      // Verify the result is the existing insight
      expect(result).toBeDefined();
      expect(result.id).toBe(existingInsight.id);

      // Verify repository calls
      expect(narrativeRepository.findByContentHash).toHaveBeenCalled();
      expect(narrativeRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('transformBatch', () => {
    it('should transform a batch of social media posts', async () => {
      const posts = [
        mockSocialMediaPost,
        mockSocialMediaPost,
        mockSocialMediaPost,
      ];

      const result = await service.transformBatch(posts);

      // Verify the result
      expect(result).toHaveLength(posts.length);
      expect(result[0]!.embedding).toEqual(mockEmbedding);

      // Verify service calls
      expect(contentClassificationService.batchClassify).toHaveBeenCalledWith(
        posts.map((post) => post.text)
      );
      expect(narrativeRepository.saveMany).toHaveBeenCalled();
    });

    it('should handle empty batch', async () => {
      const result = await service.transformBatch([]);

      // Verify the result
      expect(result).toHaveLength(0);

      // Verify service calls
      expect(contentClassificationService.batchClassify).not.toHaveBeenCalled();
      expect(narrativeRepository.saveMany).not.toHaveBeenCalled();
    });

    it('should handle errors in batch processing', async () => {
      // Mock content classification service to throw an error
      mockContentClassificationService.batchClassify.mockRejectedValueOnce(
        new Error('Classification error')
      );

      const posts = [mockSocialMediaPost, mockSocialMediaPost];

      await expect(service.transformBatch(posts)).rejects.toThrow(
        'Classification error'
      );
    });
  });

  describe('private methods', () => {
    // Test hash methods through the transform method since they're private
    it('should generate deterministic content hash', async () => {
      const result1 = await service.transform(mockSocialMediaPost);
      const result2 = await service.transform({
        ...mockSocialMediaPost,
        id: 'different-id', // This shouldn't affect the hash
      });

      // The content hash should be the same for the same content
      expect(result1.contentHash).toBe(result2.contentHash);
    });

    it('should generate different hashes for different content', async () => {
      const result1 = await service.transform(mockSocialMediaPost);
      const result2 = await service.transform({
        ...mockSocialMediaPost,
        text: 'Different content text', // This should affect the hash
      });

      // The content hash should be different for different content
      expect(result1.contentHash).not.toBe(result2.contentHash);
    });

    it('should generate deterministic source hash', async () => {
      const result1 = await service.transform(mockSocialMediaPost);
      const result2 = await service.transform({
        ...mockSocialMediaPost,
        id: 'different-id', // This shouldn't affect the source hash
        text: 'Different content', // This shouldn't affect the source hash
      });

      // The source hash should be the same for the same author and platform
      expect(result1.sourceHash).toBe(result2.sourceHash);
    });

    it('should generate different source hashes for different authors', async () => {
      const result1 = await service.transform(mockSocialMediaPost);
      const result2 = await service.transform({
        ...mockSocialMediaPost,
        authorId: 'different-author', // This should affect the source hash
      });

      // The source hash should be different for different authors
      expect(result1.sourceHash).not.toBe(result2.sourceHash);
    });
  });

  describe('cleanup expired data', () => {
    it('should call cleanupExpiredData on interval', async () => {
      // We need to spy on the method since it's called via setInterval
      jest.useFakeTimers();
      const cleanupSpy = jest.spyOn(service as any, 'cleanupExpiredData');

      // Create a new instance to trigger the interval
      const newModule: TestingModule = await Test.createTestingModule({
        providers: [
          TransformOnIngestService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
          {
            provide: NarrativeRepository,
            useValue: {
              ...mockNarrativeRepository,
              deleteOlderThan: jest.fn().mockResolvedValue(5),
            },
          },
          {
            provide: ContentClassificationService,
            useValue: mockContentClassificationService,
          },
          {
            provide: EmbeddingsService,
            useValue: mockEmbeddingsService,
          },
        ],
      }).compile();

      const newService = newModule.get<TransformOnIngestService>(
        TransformOnIngestService
      );

      // Fast-forward time to trigger the interval
      jest.advanceTimersByTime(24 * 60 * 60 * 1000 + 1000); // 24 hours + buffer

      expect(cleanupSpy).toHaveBeenCalled();

      // Cleanup
      jest.useRealTimers();
      jest.restoreAllMocks();
    });
  });
});
