import '@jest/globals';

import { IngestionResolver } from '../__mocks__/resolvers/mock-ingestion.resolver';
import { TransformOnIngestService } from '../services/transform/transform-on-ingest.service';
import { NarrativeRepository } from '../repositories/narrative-insight.repository';
import {
  ContentIngestionInput,
  SourceIngestionInput,
  VerificationStatus,
} from '../__mocks__/types/mock-ingestion.types';

// Mock ContentClassificationService
class ContentClassificationService {
  async classifyContent(text: string) {
    return {
      toxicity: 0.1,
      sentiment: {
        score: 0.2,
        magnitude: 0.5,
      },
      categories: ['news'],
      topics: ['technology'],
    };
  }
}

describe('IngestionResolver', () => {
  let resolver: IngestionResolver;
  let classificationService: ContentClassificationService;
  let transformService: TransformOnIngestService;
  let narrativeRepository: NarrativeRepository;
  let memgraphService: any;
  let kafkaClient: any;

  beforeEach(async () => {
    // Create mocks
    memgraphService = {
      executeQuery: jest.fn().mockResolvedValue([
        {
          s: {
            id: 'test-source-id',
            name: 'Test Source',
            platform: 'twitter',
            verificationStatus: 'verified',
          },
        },
      ]),
      createNode: jest.fn().mockResolvedValue({
        id: 'test-id',
        platform: 'twitter',
      }),
      createRelationship: jest.fn().mockResolvedValue({}),
    };

    kafkaClient = {
      emit: jest.fn().mockResolvedValue(undefined),
    };

    classificationService = new ContentClassificationService();

    transformService = {
      transform: jest.fn().mockResolvedValue({
        id: 'narrative-id',
        contentHash: 'content-hash',
        sourceHash: 'source-hash',
        platform: 'twitter',
        timestamp: new Date(),
        themes: ['test-theme'],
        entities: [],
        sentiment: { score: 0.5 },
        engagement: { total: 100 },
        narrativeScore: 0.8,
        processedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
      }),
    } as unknown as TransformOnIngestService;

    narrativeRepository = {
      findByTimeframe: jest.fn().mockResolvedValue([
        {
          id: 'narrative-id',
          contentHash: 'content-hash',
          sourceHash: 'source-hash',
          platform: 'twitter',
          timestamp: new Date(),
          themes: ['test-theme'],
          entities: [],
          sentiment: { score: 0.5 },
          engagement: { total: 100 },
          narrativeScore: 0.8,
          processedAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
        },
      ]),
      getTrendsByTimeframe: jest.fn().mockResolvedValue({
        topics: [{ name: 'test', count: 5 }],
        sentiment: { positive: 0.6, negative: 0.4 },
      }),
    } as unknown as NarrativeRepository;

    // Directly create the resolver with our mocks
    resolver = new IngestionResolver(
      classificationService,
      transformService,
      narrativeRepository
    );

    // Set up mocked memgraph and kafka services
    Object.defineProperty(resolver, 'memgraphService', {
      value: memgraphService,
      writable: true,
    });

    Object.defineProperty(resolver, 'kafkaClient', {
      value: kafkaClient,
      writable: true,
    });
  });

  it('should be defined', () => {
    if (resolver === null || resolver === undefined) {
      throw new Error('Resolver should be defined');
    }
  });

  describe('ingestSocialContent', () => {
    it('should successfully ingest social content', async () => {
      const contentInput = new ContentIngestionInput();
      contentInput.text = 'Test social post';
      contentInput.platform = 'twitter';

      const sourceInput = new SourceIngestionInput();
      sourceInput.name = 'Test Source';
      sourceInput.platform = 'twitter';
      sourceInput.credibilityScore = 0.8;
      sourceInput.verificationStatus = VerificationStatus.VERIFIED;

      const result = await resolver.ingestSocialContent(
        contentInput,
        sourceInput
      );

      if (result === null || result === undefined) {
        throw new Error('Result should be defined');
      }

      // Check if the mock was called
      const mockFn = transformService.transform as jest.Mock;
      if (mockFn.mock.calls.length === 0) {
        throw new Error('transform should have been called');
      }
    });
  });

  describe('getNarrativeInsights', () => {
    it('should retrieve narrative insights by timeframe', async () => {
      const result = await resolver.getNarrativeInsights('day');

      if (result === null || result === undefined) {
        throw new Error('Result should be defined');
      }

      // Check if the mock was called
      const mockFn = narrativeRepository.findByTimeframe as jest.Mock;
      if (mockFn.mock.calls.length === 0) {
        throw new Error('findByTimeframe should have been called');
      }

      if (mockFn.mock.calls[0][0] !== 'day') {
        throw new Error(
          `Expected timeframe 'day', got '${mockFn.mock.calls[0][0]}'`
        );
      }
    });
  });

  describe('getNarrativeTrends', () => {
    it('should retrieve narrative trends by timeframe', async () => {
      const result = await resolver.getNarrativeTrends('week');

      if (result === null || result === undefined) {
        throw new Error('Result should be defined');
      }

      // Check if the mock was called
      const mockFn = narrativeRepository.getTrendsByTimeframe as jest.Mock;
      if (mockFn.mock.calls.length === 0) {
        throw new Error('getTrendsByTimeframe should have been called');
      }

      if (mockFn.mock.calls[0][0] !== 'week') {
        throw new Error(
          `Expected timeframe 'week', got '${mockFn.mock.calls[0][0]}'`
        );
      }
    });
  });

  describe('verifySource', () => {
    it('should verify a source', async () => {
      const result = await resolver.verifySource(
        'test-source-id',
        VerificationStatus.VERIFIED
      );

      if (result === null || result === undefined) {
        throw new Error('Result should be defined');
      }

      // Check if the mocks were called
      const execQueryMock = memgraphService.executeQuery as jest.Mock;
      if (execQueryMock.mock.calls.length === 0) {
        throw new Error('executeQuery should have been called');
      }

      const emitMock = kafkaClient.emit as jest.Mock;
      if (emitMock.mock.calls.length === 0) {
        throw new Error('emit should have been called');
      }

      if (execQueryMock.mock.calls[0][1].sourceId !== 'test-source-id') {
        throw new Error(
          `Expected source ID 'test-source-id', got '${execQueryMock.mock.calls[0][1].sourceId}'`
        );
      }

      if (execQueryMock.mock.calls[0][1].verificationStatus !== 'verified') {
        throw new Error(
          `Expected verification status 'verified', got '${execQueryMock.mock.calls[0][1].verificationStatus}'`
        );
      }
    });
  });
});
