import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { InvestigationController } from '../../src/app/controllers/investigation.controller';
import { IngestionService, IdentityRecordRepository } from '@veritas/ingestion';
import { DeepInvestigationService, CrossPlatformIdentityService, SourceCredibilityService, GraphBotDetectionService, SocialGraphIntelligenceService } from '@veritas/analysis';

describe('InvestigationController', () => {
  let controller: InvestigationController;
  let ingestionService: IngestionService;
  let deepInvestigationService: DeepInvestigationService;

  const mockConnectorWithTimeline = {
    platform: 'twitter',
    getUserTimeline: jest.fn().mockResolvedValue([
      {
        id: 'tw-1',
        text: 'Historical tweet from this user',
        timestamp: new Date('2025-05-01T10:00:00Z'),
        platform: 'twitter',
        url: 'https://x.com/testuser/status/1',
        engagementMetrics: { likes: 10, shares: 2, comments: 1 },
      },
    ]),
  };

  const mockConnectorWithoutTimeline = {
    platform: 'youtube',
  };

  const mockInvestigationResult = {
    topic: 'test topic',
    users: [],
    originAnalysis: {
      firstMover: 'unknown',
      firstPlatform: 'unknown',
      firstTimestamp: '',
      propagationChain: [],
    },
    cuiBono: { beneficiaries: [], agendas: [], summary: 'N/A' },
    coordination: { clusters: [], summary: 'No coordination detected' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvestigationController],
      providers: [
        {
          provide: IngestionService,
          useValue: {
            getConnector: jest.fn().mockImplementation((platform: string) => {
              if (platform === 'twitter') return mockConnectorWithTimeline;
              if (platform === 'youtube') return mockConnectorWithoutTimeline;
              return undefined;
            }),
            getAllConnectors: jest.fn().mockReturnValue([
              mockConnectorWithTimeline,
              mockConnectorWithoutTimeline,
            ]),
          },
        },
        {
          provide: DeepInvestigationService,
          useValue: {
            investigate: jest.fn().mockResolvedValue(mockInvestigationResult),
          },
        },
        {
          provide: CrossPlatformIdentityService,
          useValue: {
            resolveIdentity: jest.fn().mockResolvedValue({
              queriedUsername: 'testuser',
              accounts: [],
              relevantAccounts: [],
              totalFound: 0,
              searchDuration: 0,
            }),
            batchResolve: jest.fn().mockResolvedValue(new Map()),
          },
        },
        {
          provide: SourceCredibilityService,
          useValue: {
            scoreMultipleSources: jest.fn().mockResolvedValue([]),
            buildRelationshipGraph: jest.fn().mockResolvedValue(undefined),
            detectBridgeNodes: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: GraphBotDetectionService,
          useValue: {
            detectBots: jest.fn().mockResolvedValue({
              scores: [],
              structuralPatterns: [],
              summary: 'No bots detected',
              graphEnhanced: false,
            }),
          },
        },
        {
          provide: SocialGraphIntelligenceService,
          useValue: {
            enrichRelationships: jest.fn().mockResolvedValue({ edgesCreated: 0, communitiesDetected: 0 }),
          },
        },
        {
          provide: IdentityRecordRepository,
          useValue: {
            upsertFromInvestigation: jest.fn().mockResolvedValue({}),
            findByHandle: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    controller = module.get<InvestigationController>(InvestigationController);
    ingestionService = module.get<IngestionService>(IngestionService);
    deepInvestigationService = module.get<DeepInvestigationService>(DeepInvestigationService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /investigate', () => {
    it('should reject empty query', async () => {
      await expect(
        controller.investigate({ query: '', userHandles: ['user1'] }),
      ).rejects.toThrow(HttpException);
    });

    it('should reject empty userHandles', async () => {
      await expect(
        controller.investigate({ query: 'test', userHandles: [] }),
      ).rejects.toThrow(HttpException);
    });

    it('should call deepInvestigationService.investigate', async () => {
      const result = await controller.investigate({
        query: 'test topic',
        userHandles: ['testuser'],
        topicPosts: [
          {
            id: '1',
            text: 'Test post about test topic',
            platform: 'twitter',
            authorName: 'Test User',
            authorHandle: 'testuser',
            url: 'https://x.com/testuser/status/1',
            timestamp: '2025-06-01T10:00:00Z',
            sentiment: { score: 0.5, label: 'positive' },
            engagement: { likes: 10, shares: 2, comments: 1 },
          },
        ],
      });

      expect(deepInvestigationService.investigate).toHaveBeenCalledWith(
        'test topic',
        expect.any(Map),
      );
      expect(result).toEqual(mockInvestigationResult);
    });

    it('should fetch user timelines from connectors', async () => {
      await controller.investigate({
        query: 'test',
        userHandles: ['testuser'],
        topicPosts: [
          {
            id: '1',
            text: 'topic post',
            platform: 'twitter',
            authorName: 'Test',
            authorHandle: 'testuser',
            url: '',
            timestamp: '2025-06-01T10:00:00Z',
            sentiment: { score: 0, label: 'neutral' },
            engagement: { likes: 0, shares: 0, comments: 0 },
          },
        ],
      });

      expect(mockConnectorWithTimeline.getUserTimeline).toHaveBeenCalledWith(
        'testuser',
        { limit: 50 },
      );
    });

    it('should handle connectors without getUserTimeline gracefully', async () => {
      const result = await controller.investigate({
        query: 'test',
        userHandles: ['youtuber'],
        topicPosts: [
          {
            id: '1',
            text: 'youtube post',
            platform: 'youtube',
            authorName: 'YouTuber',
            authorHandle: 'youtuber',
            url: '',
            timestamp: '2025-06-01T10:00:00Z',
            sentiment: { score: 0, label: 'neutral' },
            engagement: { likes: 0, shares: 0, comments: 0 },
          },
        ],
      });

      // Should not throw, just proceed with topic posts only
      expect(result).toEqual(mockInvestigationResult);
    });

    it('should handle multiple users in parallel batches', async () => {
      const handles = Array.from({ length: 8 }, (_, i) => `user${i}`);

      await controller.investigate({
        query: 'test',
        userHandles: handles,
      });

      const investigateCall = (deepInvestigationService.investigate as jest.Mock).mock.calls[0];
      const userTimelines = investigateCall[1] as Map<string, unknown>;
      expect(userTimelines.size).toBe(8);
    });

    it('should strip @ prefix from handles', async () => {
      await controller.investigate({
        query: 'test',
        userHandles: ['@testuser'],
        topicPosts: [],
      });

      // The map key should be lowercase without @
      const investigateCall = (deepInvestigationService.investigate as jest.Mock).mock.calls[0];
      const userTimelines = investigateCall[1] as Map<string, unknown>;
      expect(userTimelines.has('testuser')).toBe(true);
    });
  });
});
