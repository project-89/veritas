/**
 * Mock test utilities for ingestion library tests
 */

import { ContentNode, SourceNode } from '../src/lib/schemas/base.schema';

/**
 * Mock ContentNode for testing
 */
export const mockContentNode: ContentNode = {
  id: 'content-123',
  text: 'This is a test content',
  timestamp: new Date('2023-01-01T12:00:00Z'),
  platform: 'twitter',
  toxicity: 0.1,
  sentiment: {
    score: 0.2,
    magnitude: 0.5,
  },
  categories: ['news', 'technology'],
  topics: ['software', 'ai'],
  engagementMetrics: {
    likes: 100,
    shares: 50,
    comments: 25,
    reach: 1000,
    viralityScore: 0.7,
  },
  metadata: {
    source: 'api',
    language: 'en',
  },
};

/**
 * Mock SourceNode for testing
 */
export const mockSourceNode: SourceNode = {
  id: 'source-123',
  name: 'Test Source',
  platform: 'twitter',
  url: 'https://example.com/profile',
  description: 'This is a test source',
  verificationStatus: 'verified',
  credibilityScore: 0.85,
  metadata: {
    followers: 10000,
    location: 'New York',
  },
};

/**
 * Mock implementation of MemgraphService
 */
export class MockMemgraphService {
  createNode = jest
    .fn()
    .mockImplementation(
      (label: string, properties: any): Promise<{ id: string }> => {
        return Promise.resolve({ id: `mock-${label.toLowerCase()}-id` });
      }
    );

  createRelationship = jest
    .fn()
    .mockImplementation(
      (
        sourceId: string,
        targetId: string,
        relationshipType: string,
        properties: any
      ): Promise<{ id: string }> => {
        return Promise.resolve({ id: `mock-relationship-id` });
      }
    );

  executeQuery = jest
    .fn()
    .mockImplementation((query: string, params: any): Promise<any[]> => {
      if (query.includes('MATCH (c:Content)')) {
        return Promise.resolve([{ c: mockContentNode }]);
      } else if (query.includes('MATCH (s:Source)')) {
        return Promise.resolve([{ s: mockSourceNode }]);
      }
      return Promise.resolve([]);
    });
}

/**
 * Mock implementation of RedisService
 */
export class MockRedisService {
  private cache: Map<string, any> = new Map();

  setHash = jest
    .fn()
    .mockImplementation(
      (key: string, hash: Record<string, any>): Promise<void> => {
        this.cache.set(key, hash);
        return Promise.resolve();
      }
    );

  getHash = jest
    .fn()
    .mockImplementation((key: string): Promise<Record<string, any> | null> => {
      return Promise.resolve(
        this.cache.get(key) || { data: JSON.stringify(mockContentNode) }
      );
    });

  del = jest.fn().mockImplementation((key: string): Promise<void> => {
    this.cache.delete(key);
    return Promise.resolve();
  });
}
