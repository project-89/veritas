import { GraphDatabaseService } from './graph-database.service';
import { SocialGraphIntelligenceService } from './social-graph-intelligence.service';

/**
 * Unit tests for SocialGraphIntelligenceService.
 *
 * Tests cover tier classification, weight calculation, mention extraction,
 * co-timing detection, and enrichRelationships orchestration — all with a
 * mocked GraphDatabaseService so no Memgraph connection is needed.
 */
describe('SocialGraphIntelligenceService', () => {
  let service: SocialGraphIntelligenceService;
  let mockGraph: jest.Mocked<GraphDatabaseService>;

  beforeEach(() => {
    mockGraph = {
      isAvailable: false,
      runQuery: jest.fn().mockResolvedValue([]),
      upsertInteraction: jest.fn().mockResolvedValue(undefined),
      findShortestPath: jest.fn().mockResolvedValue(null),
      getNeighborsByTier: jest.fn().mockResolvedValue([]),
      detectCommunities: jest.fn().mockResolvedValue(new Map()),
      upsertUser: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<GraphDatabaseService>;

    service = new SocialGraphIntelligenceService(mockGraph);
  });

  // --------------------------------------------------------------------------
  // Mention extraction
  // --------------------------------------------------------------------------

  describe('extractMentions', () => {
    it('should extract single mention', () => {
      expect(service.extractMentions('Hello @alice how are you')).toEqual(['alice']);
    });

    it('should extract multiple mentions', () => {
      const result = service.extractMentions('@alice and @bob discussed @charlie');
      expect(result).toEqual(expect.arrayContaining(['alice', 'bob', 'charlie']));
      expect(result).toHaveLength(3);
    });

    it('should deduplicate mentions', () => {
      const result = service.extractMentions('@alice said hi to @alice again');
      expect(result).toEqual(['alice']);
    });

    it('should return empty array for no mentions', () => {
      expect(service.extractMentions('No mentions here')).toEqual([]);
    });

    it('should handle mentions with underscores and numbers', () => {
      const result = service.extractMentions('cc @user_123 and @test99');
      expect(result).toEqual(expect.arrayContaining(['user_123', 'test99']));
    });

    it('should handle mention at start of text', () => {
      expect(service.extractMentions('@alice this is a reply')).toEqual(['alice']);
    });
  });

  // --------------------------------------------------------------------------
  // Tier classification
  // --------------------------------------------------------------------------

  describe('classifyTier', () => {
    it('should return tier 1 for reply interactions', () => {
      expect(service.classifyTier(['reply'], 1, false)).toBe(1);
    });

    it('should return tier 1 for mention interactions', () => {
      expect(service.classifyTier(['mention'], 1, false)).toBe(1);
    });

    it('should return tier 1 for repost interactions', () => {
      expect(service.classifyTier(['repost'], 1, false)).toBe(1);
    });

    it('should return tier 1 for reciprocal relationships', () => {
      expect(service.classifyTier(['co_timing'], 1, true)).toBe(1);
    });

    it('should return tier 1 for high interaction count (>= 3)', () => {
      expect(service.classifyTier(['co_timing'], 3, false)).toBe(1);
    });

    it('should return tier 2 for co_timing without direct interactions', () => {
      expect(service.classifyTier(['co_timing'], 1, false)).toBe(2);
    });

    it('should return tier 2 for co_narrative without direct interactions', () => {
      expect(service.classifyTier(['co_narrative'], 2, false)).toBe(2);
    });

    it('should return tier 3 for no matching interaction types', () => {
      expect(service.classifyTier([], 1, false)).toBe(3);
    });

    it('should return tier 3 for unknown interaction types with low count', () => {
      expect(service.classifyTier(['bridge'], 1, false)).toBe(3);
    });

    it('should prefer tier 1 when both direct and indirect types present', () => {
      expect(service.classifyTier(['co_timing', 'reply'], 1, false)).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Weight calculation
  // --------------------------------------------------------------------------

  describe('calculateWeight', () => {
    it('should return max weight for ideal conditions', () => {
      // 20 interactions, 0 days since last seen, reciprocal, sentiment 1.0
      const weight = service.calculateWeight(20, 0, true, 1.0);
      // 0.4*1 + 0.3*1 + 0.2*1 + 0.1*1 = 1.0
      expect(weight).toBeCloseTo(1.0, 5);
    });

    it('should return lower weight for fewer interactions', () => {
      const weight = service.calculateWeight(5, 0, true, 1.0);
      // 0.4*(5/20) + 0.3*1 + 0.2*1 + 0.1*1 = 0.1 + 0.3 + 0.2 + 0.1 = 0.7
      expect(weight).toBeCloseTo(0.7, 5);
    });

    it('should cap interaction count component at 1', () => {
      const weight20 = service.calculateWeight(20, 0, true, 1.0);
      const weight100 = service.calculateWeight(100, 0, true, 1.0);
      expect(weight20).toBeCloseTo(weight100, 5);
    });

    it('should decay weight based on days since last seen', () => {
      const recent = service.calculateWeight(10, 0, false, 0);
      const old = service.calculateWeight(10, 90, false, 0);
      // recent: 0.4*0.5 + 0.3*1 = 0.5
      // old: 0.4*0.5 + 0.3*exp(-1) ≈ 0.2 + 0.110 = 0.310
      expect(recent).toBeGreaterThan(old);
    });

    it('should add 0.2 for reciprocal relationships', () => {
      const noRecip = service.calculateWeight(10, 30, false, 0);
      const recip = service.calculateWeight(10, 30, true, 0);
      expect(recip - noRecip).toBeCloseTo(0.2, 5);
    });

    it('should use absolute value of sentiment', () => {
      const positive = service.calculateWeight(10, 0, false, 0.8);
      const negative = service.calculateWeight(10, 0, false, -0.8);
      expect(positive).toBeCloseTo(negative, 5);
    });

    it('should return near-zero for worst conditions', () => {
      // 0 interactions, 365 days ago, not reciprocal, no sentiment
      const weight = service.calculateWeight(0, 365, false, 0);
      // 0.4*0 + 0.3*exp(-365/90) + 0.2*0 + 0.1*0 ≈ 0.005
      expect(weight).toBeLessThan(0.01);
    });
  });

  // --------------------------------------------------------------------------
  // enrichRelationships
  // --------------------------------------------------------------------------

  describe('enrichRelationships', () => {
    it('should extract mentions and upsert interactions when graph available', async () => {
      Object.defineProperty(mockGraph, 'isAvailable', { get: () => true });

      const users = [
        {
          handle: 'alice',
          platform: 'twitter',
          posts: [{ text: 'Hey @bob check this out', timestamp: '2025-01-01T10:00:00Z' }],
        },
        {
          handle: 'bob',
          platform: 'twitter',
          posts: [{ text: '@alice thanks!', timestamp: '2025-01-01T10:01:00Z' }],
        },
      ];

      const result = await service.enrichRelationships(users, 'inv-1');

      // alice->bob (mention), bob->alice (reply), alice<->bob (co_timing)
      expect(result.edgesCreated).toBeGreaterThanOrEqual(3);
      expect(mockGraph.upsertInteraction).toHaveBeenCalled();
    });

    it('should return in-memory edge count when graph unavailable', async () => {
      Object.defineProperty(mockGraph, 'isAvailable', { get: () => false });

      const users = [
        {
          handle: 'alice',
          platform: 'twitter',
          posts: [{ text: 'Hey @bob', timestamp: '2025-01-01T10:00:00Z' }],
        },
        {
          handle: 'bob',
          platform: 'twitter',
          posts: [{ text: 'Hello world', timestamp: '2025-01-01T10:01:00Z' }],
        },
      ];

      const result = await service.enrichRelationships(users, 'inv-1');

      // alice->bob (mention) + co_timing
      expect(result.edgesCreated).toBeGreaterThanOrEqual(1);
      expect(mockGraph.upsertInteraction).not.toHaveBeenCalled();
    });

    it('should detect reply patterns (text starting with @handle)', async () => {
      Object.defineProperty(mockGraph, 'isAvailable', { get: () => true });

      const users = [
        {
          handle: 'charlie',
          platform: 'twitter',
          posts: [{ text: '@dave I disagree', timestamp: '2025-01-01T10:00:00Z' }],
        },
      ];

      await service.enrichRelationships(users, 'inv-1');

      expect(mockGraph.upsertInteraction).toHaveBeenCalledWith(
        'charlie',
        'twitter',
        'dave',
        'twitter',
        'reply',
        expect.objectContaining({ investigationId: 'inv-1' }),
      );
    });

    it('should not create self-mention edges', async () => {
      Object.defineProperty(mockGraph, 'isAvailable', { get: () => true });

      const users = [
        {
          handle: 'alice',
          platform: 'twitter',
          posts: [{ text: 'I am @alice and I know it', timestamp: '2025-01-01T10:00:00Z' }],
        },
      ];

      await service.enrichRelationships(users, 'inv-1');

      expect(mockGraph.upsertInteraction).not.toHaveBeenCalled();
    });

    it('should detect co-timing between users posting within 5 minutes', async () => {
      Object.defineProperty(mockGraph, 'isAvailable', { get: () => true });

      const users = [
        {
          handle: 'alice',
          platform: 'twitter',
          posts: [{ text: 'Post about topic X', timestamp: '2025-01-01T10:00:00Z' }],
        },
        {
          handle: 'bob',
          platform: 'twitter',
          posts: [{ text: 'Also about topic X', timestamp: '2025-01-01T10:04:00Z' }],
        },
      ];

      await service.enrichRelationships(users, 'inv-1');

      // Should have a co_timing interaction
      const coTimingCalls = mockGraph.upsertInteraction.mock.calls.filter(
        (call) => call[4] === 'co_timing',
      );
      expect(coTimingCalls).toHaveLength(1);
    });

    it('should NOT detect co-timing when posts are > 5 minutes apart', async () => {
      Object.defineProperty(mockGraph, 'isAvailable', { get: () => true });

      const users = [
        {
          handle: 'alice',
          platform: 'twitter',
          posts: [{ text: 'Post about topic X', timestamp: '2025-01-01T10:00:00Z' }],
        },
        {
          handle: 'bob',
          platform: 'twitter',
          posts: [{ text: 'Also about topic X', timestamp: '2025-01-01T10:10:00Z' }],
        },
      ];

      await service.enrichRelationships(users, 'inv-1');

      const coTimingCalls = mockGraph.upsertInteraction.mock.calls.filter(
        (call) => call[4] === 'co_timing',
      );
      expect(coTimingCalls).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // getClosestAssociates / findConnection / getDegreesOfSeparation
  // --------------------------------------------------------------------------

  describe('getClosestAssociates', () => {
    it('should return empty array when graph unavailable', async () => {
      const result = await service.getClosestAssociates('alice', 'twitter');
      expect(result).toEqual([]);
    });

    it('should query graph when available', async () => {
      Object.defineProperty(mockGraph, 'isAvailable', { get: () => true });
      mockGraph.runQuery.mockResolvedValueOnce([
        { handle: 'bob', platform: 'twitter', weight: 0.8, tier: 1, interactionCount: 5 },
      ]);

      const result = await service.getClosestAssociates('alice', 'twitter');
      expect(result).toHaveLength(1);
      expect(result[0]?.handle).toBe('bob');
    });
  });

  describe('findConnection', () => {
    it('should return null when graph unavailable', async () => {
      const result = await service.findConnection('alice', 'twitter', 'bob', 'twitter');
      expect(result).toBeNull();
    });

    it('should return null when no path exists', async () => {
      Object.defineProperty(mockGraph, 'isAvailable', { get: () => true });
      const result = await service.findConnection('alice', 'twitter', 'bob', 'twitter');
      expect(result).toBeNull();
    });
  });

  describe('getDegreesOfSeparation', () => {
    it('should return null when graph unavailable', async () => {
      const result = await service.getDegreesOfSeparation('alice', 'twitter', 'bob', 'twitter');
      expect(result).toBeNull();
    });

    it('should return hop count when path exists', async () => {
      Object.defineProperty(mockGraph, 'isAvailable', { get: () => true });
      mockGraph.findShortestPath.mockResolvedValueOnce({
        path: ['alice', 'charlie', 'bob'],
        hops: 2,
      });

      const result = await service.getDegreesOfSeparation('alice', 'twitter', 'bob', 'twitter');
      expect(result).toBe(2);
    });
  });
});
