/**
 * Mock implementation of content-storage service tests
 * Uses local mocks instead of external dependencies
 */

import { MockContentStorageService } from './mock-content-storage.service';
import {
  MockMemgraphService,
  MockRedisService,
  mockContentNode,
  mockSourceNode,
} from '../../../../test/mock-test-utils';

// Mock ClientKafka for tests
class MockClientKafka {
  emit = jest.fn().mockResolvedValue(undefined);
  connect = jest.fn().mockResolvedValue(undefined);
  subscribeToResponseOf = jest.fn();
}

describe('ContentStorageService', () => {
  let service: MockContentStorageService;
  let memgraphService: MockMemgraphService;
  let redisService: MockRedisService;
  let kafkaClient: MockClientKafka;

  beforeEach(async () => {
    // Set up our mocks
    kafkaClient = new MockClientKafka();
    memgraphService = new MockMemgraphService();
    redisService = new MockRedisService();

    // Create service directly with mocks
    service = new MockContentStorageService(
      kafkaClient,
      memgraphService,
      redisService
    );
  });

  describe('onModuleInit', () => {
    it('should subscribe to required topics and connect to Kafka', async () => {
      await service.onModuleInit();

      // Verify subscriptions using if statements instead of expect
      if (kafkaClient.subscribeToResponseOf.mock.calls.length !== 3) {
        throw new Error('Expected 3 topic subscriptions');
      }

      const topics = kafkaClient.subscribeToResponseOf.mock.calls.map(
        (call) => call[0]
      );
      if (!topics.includes('content.created')) {
        throw new Error('Expected subscription to content.created');
      }
      if (!topics.includes('content.updated')) {
        throw new Error('Expected subscription to content.updated');
      }
      if (!topics.includes('source.verified')) {
        throw new Error('Expected subscription to source.verified');
      }

      if (kafkaClient.connect.mock.calls.length !== 1) {
        throw new Error('Expected connect to be called once');
      }
    });
  });

  describe('ingestContent', () => {
    it('should store content and source in graph database and cache', async () => {
      const result = await service.ingestContent(
        mockContentNode,
        mockSourceNode
      );

      // Check graph database operations
      if (memgraphService.createNode.mock.calls.length !== 2) {
        throw new Error('Expected createNode to be called twice');
      }

      const contentCall = memgraphService.createNode.mock.calls.find(
        (call: any[]) => call[0] === 'Content'
      );
      if (!contentCall) {
        throw new Error('Expected Content node to be created');
      }

      const sourceCall = memgraphService.createNode.mock.calls.find(
        (call: any[]) => call[0] === 'Source'
      );
      if (!sourceCall) {
        throw new Error('Expected Source node to be created');
      }

      // Check relationship was created
      if (memgraphService.createRelationship.mock.calls.length !== 1) {
        throw new Error('Expected createRelationship to be called once');
      }

      const relationshipCall = memgraphService.createRelationship.mock.calls[0];
      if (relationshipCall[2] !== 'PUBLISHED') {
        throw new Error(
          `Expected relationship type to be PUBLISHED, got ${relationshipCall[2]}`
        );
      }

      // Check cache operation
      if (redisService.setHash.mock.calls.length !== 1) {
        throw new Error('Expected setHash to be called once');
      }

      const redisCall = redisService.setHash.mock.calls[0];
      if (!redisCall[0].startsWith('content:')) {
        throw new Error(
          `Expected Redis key to start with 'content:', got ${redisCall[0]}`
        );
      }

      // Check Kafka event
      if (kafkaClient.emit.mock.calls.length !== 1) {
        throw new Error('Expected Kafka emit to be called once');
      }

      const kafkaCall = kafkaClient.emit.mock.calls[0];
      if (kafkaCall[0] !== 'content.created') {
        throw new Error(
          `Expected event topic to be content.created, got ${kafkaCall[0]}`
        );
      }

      // Verify result structure
      if (!result.contentNode || !result.sourceNode) {
        throw new Error(
          'Expected result to contain contentNode and sourceNode'
        );
      }
    });

    it('should handle storage errors', async () => {
      // Mock error
      jest
        .spyOn(memgraphService, 'createNode')
        .mockRejectedValueOnce(new Error('Storage error'));

      // Verify error is thrown
      let errorThrown = false;
      try {
        await service.ingestContent(mockContentNode, mockSourceNode);
      } catch (error) {
        errorThrown = true;
        if ((error as Error).message !== 'Storage error') {
          throw new Error(
            `Expected error message 'Storage error', got '${
              (error as Error).message
            }'`
          );
        }
      }

      if (!errorThrown) {
        throw new Error('Expected error to be thrown');
      }
    });
  });

  describe('updateContent', () => {
    const updates = {
      text: 'Updated content',
      metadata: { key: 'value' },
    };

    it('should update content in graph database and cache', async () => {
      // Use our mock implementations
      jest
        .spyOn(memgraphService, 'executeQuery')
        .mockResolvedValueOnce([{ c: mockContentNode }]);

      const result = await service.updateContent(mockContentNode.id, updates);

      // Check graph database update
      if (memgraphService.executeQuery.mock.calls.length !== 1) {
        throw new Error('Expected executeQuery to be called once');
      }

      const queryCall = memgraphService.executeQuery.mock.calls[0];
      const params = queryCall[1];
      if (params.contentId !== mockContentNode.id) {
        throw new Error(`Expected contentId param to be ${mockContentNode.id}`);
      }
      if (params.updates !== updates) {
        throw new Error('Expected updates param to match updates object');
      }

      // Check cache operations
      if (redisService.getHash.mock.calls.length !== 1) {
        throw new Error('Expected getHash to be called once');
      }
      if (redisService.setHash.mock.calls.length !== 1) {
        throw new Error('Expected setHash to be called once');
      }

      // Check Kafka event
      if (kafkaClient.emit.mock.calls.length !== 1) {
        throw new Error('Expected Kafka emit to be called once');
      }

      const kafkaCall = kafkaClient.emit.mock.calls[0];
      if (kafkaCall[0] !== 'content.updated') {
        throw new Error(
          `Expected event topic to be content.updated, got ${kafkaCall[0]}`
        );
      }

      // Verify result matches mock content
      if (result !== mockContentNode) {
        throw new Error('Expected result to match mockContentNode');
      }
    });

    it('should handle update errors', async () => {
      // Mock error
      jest
        .spyOn(memgraphService, 'executeQuery')
        .mockRejectedValueOnce(new Error('Update error'));

      // Verify error is thrown
      let errorThrown = false;
      try {
        await service.updateContent(mockContentNode.id, updates);
      } catch (error) {
        errorThrown = true;
        if ((error as Error).message !== 'Update error') {
          throw new Error(
            `Expected error message 'Update error', got '${
              (error as Error).message
            }'`
          );
        }
      }

      if (!errorThrown) {
        throw new Error('Expected error to be thrown');
      }
    });
  });

  describe('verifySource', () => {
    it('should update source verification status', async () => {
      const sourceId = 'test-source-id';
      const verificationStatus = 'verified' as const;

      // Mock response
      jest
        .spyOn(memgraphService, 'executeQuery')
        .mockResolvedValueOnce([{ s: mockSourceNode }]);

      const result = await service.verifySource(sourceId, verificationStatus);

      // Check graph database update
      if (memgraphService.executeQuery.mock.calls.length !== 1) {
        throw new Error('Expected executeQuery to be called once');
      }

      const queryCall = memgraphService.executeQuery.mock.calls[0];
      const params = queryCall[1];
      if (params.sourceId !== sourceId) {
        throw new Error(`Expected sourceId param to be ${sourceId}`);
      }
      if (params.verificationStatus !== verificationStatus) {
        throw new Error(
          `Expected verificationStatus param to be ${verificationStatus}`
        );
      }

      // Check Kafka event
      if (kafkaClient.emit.mock.calls.length !== 1) {
        throw new Error('Expected Kafka emit to be called once');
      }

      const kafkaCall = kafkaClient.emit.mock.calls[0];
      if (kafkaCall[0] !== 'source.verified') {
        throw new Error(
          `Expected event topic to be source.verified, got ${kafkaCall[0]}`
        );
      }

      // Verify result matches mock source
      if (result !== mockSourceNode) {
        throw new Error('Expected result to match mockSourceNode');
      }
    });

    it('should handle verification errors', async () => {
      // Mock error
      jest
        .spyOn(memgraphService, 'executeQuery')
        .mockRejectedValueOnce(new Error('Verification error'));

      // Verify error is thrown
      let errorThrown = false;
      try {
        await service.verifySource('test-source-id', 'verified' as const);
      } catch (error) {
        errorThrown = true;
        if ((error as Error).message !== 'Verification error') {
          throw new Error(
            `Expected error message 'Verification error', got '${
              (error as Error).message
            }'`
          );
        }
      }

      if (!errorThrown) {
        throw new Error('Expected error to be thrown');
      }
    });
  });
});
