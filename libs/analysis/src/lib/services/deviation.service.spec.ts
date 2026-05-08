import { DeviationService } from './deviation.service';
import type { AnalyzedNarrative } from './narrative-analysis.service';

function makeNarrative(overrides: Partial<AnalyzedNarrative> & { id: string }): AnalyzedNarrative {
  return {
    summary: overrides.summary ?? `Summary for ${overrides.id}`,
    postIndices: overrides.postIndices ?? [0, 1],
    avgSentiment: overrides.avgSentiment ?? 0,
    sentimentTrajectory: overrides.sentimentTrajectory ?? [],
    platforms: overrides.platforms ?? { twitter: 2 },
    authors: overrides.authors ?? [
      { name: 'Alice', handle: 'alice', postCount: 1 },
      { name: 'Bob', handle: 'bob', postCount: 1 },
    ],
    firstSeen: overrides.firstSeen ?? '2025-01-01T00:00:00Z',
    lastSeen: overrides.lastSeen ?? '2025-01-02T00:00:00Z',
    totalEngagement: overrides.totalEngagement ?? 100,
    velocity: overrides.velocity ?? {
      postsPerHour: 1,
      acceleration: 0,
      trend: 'steady',
    },
    centroidEmbedding: overrides.centroidEmbedding ?? [1, 0, 0],
    ...overrides,
  };
}

function makePosts(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `post-${i}`,
    text: `Post text ${i}`,
    platform: i % 2 === 0 ? 'twitter' : 'reddit',
    authorName: `Author ${i}`,
    authorHandle: `author${i}`,
    timestamp: new Date(Date.now() - (count - i) * 3600000).toISOString(),
    engagement: { likes: 10 + i, shares: 2, comments: 3 },
  }));
}

describe('DeviationService', () => {
  let service: DeviationService;

  beforeEach(() => {
    service = new DeviationService();
  });

  // -------------------------------------------------------------------------
  // Consensus centroid computation
  // -------------------------------------------------------------------------

  describe('computeConsensusCentroid', () => {
    it('returns empty array for no narratives', () => {
      expect(service.computeConsensusCentroid([])).toEqual([]);
    });

    it('returns the single narrative centroid (normalized) for one narrative', () => {
      const narratives = [makeNarrative({ id: 'n-0', centroidEmbedding: [3, 4, 0] })];
      const centroid = service.computeConsensusCentroid(narratives);
      // [3, 4, 0] normalized = [0.6, 0.8, 0]
      expect(centroid.length).toBe(3);
      expect(centroid[0]).toBeCloseTo(0.6, 5);
      expect(centroid[1]).toBeCloseTo(0.8, 5);
      expect(centroid[2]).toBeCloseTo(0, 5);
    });

    it('weights by cluster size', () => {
      const narratives = [
        makeNarrative({
          id: 'n-0',
          centroidEmbedding: [1, 0, 0],
          postIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], // 10 posts
        }),
        makeNarrative({
          id: 'n-1',
          centroidEmbedding: [0, 1, 0],
          postIndices: [10], // 1 post
        }),
      ];
      const centroid = service.computeConsensusCentroid(narratives);
      // Weighted: [10/11, 1/11, 0] then normalized
      // The x component should be much larger than y
      expect(centroid[0]!).toBeGreaterThan(centroid[1]!);
    });
  });

  // -------------------------------------------------------------------------
  // Cosine similarity
  // -------------------------------------------------------------------------

  describe('cosineSimilarity', () => {
    it('returns 1 for identical vectors', () => {
      expect(service.cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5);
    });

    it('returns 0 for orthogonal vectors', () => {
      expect(service.cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 5);
    });

    it('returns 0 for empty vectors', () => {
      expect(service.cosineSimilarity([], [])).toBe(0);
    });

    it('returns negative for opposite vectors', () => {
      expect(service.cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 5);
    });
  });

  // -------------------------------------------------------------------------
  // computeDeviations
  // -------------------------------------------------------------------------

  describe('computeDeviations', () => {
    it('returns empty for no narratives', () => {
      expect(service.computeDeviations([])).toEqual([]);
    });

    it('marks the first (largest) narrative as consensus', () => {
      const narratives = [
        makeNarrative({ id: 'n-0', postIndices: [0, 1, 2], centroidEmbedding: [1, 0, 0] }),
        makeNarrative({ id: 'n-1', postIndices: [3], centroidEmbedding: [0, 1, 0] }),
      ];
      const deviations = service.computeDeviations(narratives);
      expect(deviations[0]!.isConsensus).toBe(true);
      expect(deviations[1]!.isConsensus).toBe(false);
    });

    it('consensus narrative has low deviation', () => {
      // Single narrative = consensus = deviation from self ~0
      const narratives = [
        makeNarrative({ id: 'n-0', postIndices: [0, 1, 2], centroidEmbedding: [1, 0, 0] }),
      ];
      const deviations = service.computeDeviations(narratives);
      expect(deviations[0]!.deviationMagnitude).toBeCloseTo(0, 2);
    });

    it('orthogonal narrative has high deviation', () => {
      const narratives = [
        makeNarrative({
          id: 'n-0',
          postIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
          centroidEmbedding: [1, 0, 0],
        }),
        makeNarrative({
          id: 'n-1',
          postIndices: [10],
          centroidEmbedding: [0, 1, 0],
        }),
      ];
      const deviations = service.computeDeviations(narratives);
      // n-1 is orthogonal to the consensus (which is ~[1, 0, 0])
      expect(deviations[1]!.deviationMagnitude).toBeGreaterThan(0.5);
    });

    it('cross-reference score reflects platform count', () => {
      const narratives = [
        makeNarrative({
          id: 'n-0',
          postIndices: [0, 1],
          centroidEmbedding: [1, 0, 0],
          platforms: { twitter: 5, reddit: 3, youtube: 2 },
        }),
      ];
      const deviations = service.computeDeviations(narratives);
      // 3 platforms / 5 known = 0.6
      expect(deviations[0]!.crossReferenceScore).toBeCloseTo(0.6, 2);
    });

    it('propagation velocity is capped at 1', () => {
      const narratives = [
        makeNarrative({
          id: 'n-0',
          postIndices: [0, 1],
          centroidEmbedding: [1, 0, 0],
          velocity: { postsPerHour: 100, acceleration: 0, trend: 'surging' },
        }),
      ];
      const deviations = service.computeDeviations(narratives);
      expect(deviations[0]!.propagationVelocity).toBe(1);
    });

    it('impact score is between 0 and 1', () => {
      const narratives = [
        makeNarrative({ id: 'n-0', postIndices: [0, 1, 2], centroidEmbedding: [1, 0, 0] }),
        makeNarrative({ id: 'n-1', postIndices: [3], centroidEmbedding: [0, 1, 0] }),
      ];
      const deviations = service.computeDeviations(narratives);
      for (const d of deviations) {
        expect(d.impactScore).toBeGreaterThanOrEqual(0);
        expect(d.impactScore).toBeLessThanOrEqual(1);
      }
    });
  });

  // -------------------------------------------------------------------------
  // toRealityTunnelData
  // -------------------------------------------------------------------------

  describe('toRealityTunnelData', () => {
    it('returns empty array for no narratives', () => {
      expect(service.toRealityTunnelData([], [])).toEqual([]);
    });

    it('creates a consensus tunnel for the largest narrative', () => {
      const posts = makePosts(5);
      const narratives = [
        makeNarrative({
          id: 'n-0',
          postIndices: [0, 1, 2, 3, 4],
          centroidEmbedding: [1, 0, 0],
        }),
      ];
      const tunnels = service.toRealityTunnelData(narratives, posts);
      expect(tunnels.length).toBe(1);
      expect(tunnels[0]!.isConsensus).toBe(true);
      expect(tunnels[0]!.nodes.length).toBe(5);
    });

    it('creates divergent tunnels with parentId linking to consensus', () => {
      const posts = makePosts(6);
      const narratives = [
        makeNarrative({
          id: 'n-0',
          postIndices: [0, 1, 2, 3],
          centroidEmbedding: [1, 0, 0],
        }),
        makeNarrative({
          id: 'n-1',
          postIndices: [4, 5],
          centroidEmbedding: [0, 1, 0],
        }),
      ];
      const tunnels = service.toRealityTunnelData(narratives, posts);
      expect(tunnels.length).toBe(2);
      expect(tunnels[0]!.isConsensus).toBe(true);
      expect(tunnels[1]!.isConsensus).toBe(false);
      // First node of divergent tunnel should have parentId
      expect(tunnels[1]!.nodes[0]!.parentId).toBe(tunnels[0]!.nodes[0]!.id);
    });

    it('nodes have valid deviationScore and strength', () => {
      const posts = makePosts(3);
      const narratives = [
        makeNarrative({
          id: 'n-0',
          postIndices: [0, 1, 2],
          centroidEmbedding: [1, 0, 0],
        }),
      ];
      const tunnels = service.toRealityTunnelData(narratives, posts);
      for (const node of tunnels[0]!.nodes) {
        expect(node.deviationScore).toBeGreaterThanOrEqual(0);
        expect(node.deviationScore).toBeLessThanOrEqual(1);
        expect(node.strength).toBeGreaterThanOrEqual(0.05);
        expect(node.strength).toBeLessThanOrEqual(1);
      }
    });
  });

  // -------------------------------------------------------------------------
  // toEnhancedTunnelData
  // -------------------------------------------------------------------------

  describe('toEnhancedTunnelData', () => {
    it('returns empty structure for no narratives', () => {
      const data = service.toEnhancedTunnelData([], []);
      expect(data.nodes).toEqual([]);
      expect(data.branches).toEqual([]);
      expect(data.narratives).toEqual([]);
    });

    it('produces nodes and branches for a single narrative', () => {
      const posts = makePosts(4);
      const narratives = [
        makeNarrative({
          id: 'n-0',
          postIndices: [0, 1, 2, 3],
          centroidEmbedding: [1, 0, 0],
        }),
      ];
      const data = service.toEnhancedTunnelData(narratives, posts);
      expect(data.nodes.length).toBe(4);
      // 3 branches connecting consecutive nodes
      expect(data.branches.length).toBe(3);
      expect(data.narratives.length).toBe(1);
      expect(data.narratives[0]!.id).toBe('n-0');
    });

    it('creates divergence branches from non-consensus to consensus', () => {
      const posts = makePosts(6);
      const narratives = [
        makeNarrative({
          id: 'n-0',
          postIndices: [0, 1, 2, 3],
          centroidEmbedding: [1, 0, 0],
        }),
        makeNarrative({
          id: 'n-1',
          postIndices: [4, 5],
          centroidEmbedding: [0, 1, 0],
        }),
      ];
      const data = service.toEnhancedTunnelData(narratives, posts);
      // Check for a diverge branch
      const divergeBranch = data.branches.find((b) => b.id === 'diverge-n-1');
      expect(divergeBranch).toBeDefined();
      // Source should be a consensus node
      const sourceNode = data.nodes.find((n) => n.id === divergeBranch!.sourceId);
      expect(sourceNode?.isConsensus).toBe(true);
    });

    it('consensus nodes have isConsensus = true', () => {
      const posts = makePosts(3);
      const narratives = [
        makeNarrative({
          id: 'n-0',
          postIndices: [0, 1, 2],
          centroidEmbedding: [1, 0, 0],
        }),
      ];
      const data = service.toEnhancedTunnelData(narratives, posts);
      for (const node of data.nodes) {
        expect(node.isConsensus).toBe(true);
      }
    });

    it('timeframe covers post range', () => {
      const posts = makePosts(5);
      const narratives = [
        makeNarrative({
          id: 'n-0',
          postIndices: [0, 1, 2, 3, 4],
          centroidEmbedding: [1, 0, 0],
        }),
      ];
      const data = service.toEnhancedTunnelData(narratives, posts);
      expect(data.timeframe.start.getTime()).toBeLessThanOrEqual(data.timeframe.end.getTime());
    });

    it('node positions have x increasing with time', () => {
      const posts = makePosts(4);
      const narratives = [
        makeNarrative({
          id: 'n-0',
          postIndices: [0, 1, 2, 3],
          centroidEmbedding: [1, 0, 0],
        }),
      ];
      const data = service.toEnhancedTunnelData(narratives, posts);
      const sortedNodes = [...data.nodes].sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
      );
      for (let i = 1; i < sortedNodes.length; i++) {
        expect(sortedNodes[i]!.position.x).toBeGreaterThanOrEqual(sortedNodes[i - 1]!.position.x);
      }
    });
  });
});
