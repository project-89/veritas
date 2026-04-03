import { GraphDatabaseService } from './graph-database.service';

/**
 * Unit tests for GraphDatabaseService.
 *
 * These tests verify the graceful-degradation behavior — the service should
 * function correctly even when Memgraph is not available (which is the common
 * case in CI and development without Docker).
 */
describe('GraphDatabaseService', () => {
  let service: GraphDatabaseService;

  beforeEach(() => {
    service = new GraphDatabaseService();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  describe('without Memgraph running', () => {
    it('should initialize without throwing when Memgraph is unavailable', async () => {
      // Point to a port nothing is listening on
      process.env['MEMGRAPH_HOST'] = 'localhost';
      process.env['MEMGRAPH_PORT'] = '19999';

      await expect(service.onModuleInit()).resolves.not.toThrow();
      expect(service.isAvailable).toBe(false);

      // Clean up
      delete process.env['MEMGRAPH_HOST'];
      delete process.env['MEMGRAPH_PORT'];
    });

    it('should return empty array from runQuery when not connected', async () => {
      expect(service.isAvailable).toBe(false);
      const result = await service.runQuery('MATCH (n) RETURN n');
      expect(result).toEqual([]);
    });

    it('should no-op on upsertUser when not connected', async () => {
      await expect(
        service.upsertUser('testuser', 'twitter'),
      ).resolves.not.toThrow();
    });

    it('should no-op on upsertNarrative when not connected', async () => {
      await expect(
        service.upsertNarrative('narr-1', 'Test narrative'),
      ).resolves.not.toThrow();
    });

    it('should no-op on addEdge when not connected', async () => {
      await expect(
        service.addEdge('user1', 'twitter', 'user2', 'twitter', 'CO_TIMED'),
      ).resolves.not.toThrow();
    });

    it('should no-op on recordAmplification when not connected', async () => {
      await expect(
        service.recordAmplification('user1', 'twitter', 'narr-1', new Date().toISOString()),
      ).resolves.not.toThrow();
    });

    it('should return empty map from getPageRankForNarrative when not connected', async () => {
      const result = await service.getPageRankForNarrative('narr-1');
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });

    it('should return empty map from getBetweennessForNarrative when not connected', async () => {
      const result = await service.getBetweennessForNarrative('narr-1');
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });

    it('should return empty map from detectCommunities when not connected', async () => {
      const result = await service.detectCommunities('narr-1');
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });

    it('should return empty array from detectStarPatterns when not connected', async () => {
      const result = await service.detectStarPatterns();
      expect(result).toEqual([]);
    });

    it('should return empty array from detectChainPatterns when not connected', async () => {
      const result = await service.detectChainPatterns();
      expect(result).toEqual([]);
    });

    it('should return empty array from detectCliquePatterns when not connected', async () => {
      const result = await service.detectCliquePatterns();
      expect(result).toEqual([]);
    });
  });

  describe('sanitizeRelType', () => {
    it('should sanitize relationship type names', () => {
      // Access private method via bracket notation for testing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sanitize = (service as any)['sanitizeRelType'].bind(service) as (t: string) => string;

      expect(sanitize('CO_TIMED')).toBe('CO_TIMED');
      expect(sanitize('co-timed')).toBe('CO_TIMED');
      expect(sanitize('REPLIED TO')).toBe('REPLIED_TO');
      expect(sanitize('some.weird.type')).toBe('SOME_WEIRD_TYPE');
    });
  });

  describe('onModuleDestroy', () => {
    it('should handle destroy when never initialized', async () => {
      await expect(service.onModuleDestroy()).resolves.not.toThrow();
    });

    it('should handle double destroy', async () => {
      await service.onModuleDestroy();
      await expect(service.onModuleDestroy()).resolves.not.toThrow();
    });
  });
});
