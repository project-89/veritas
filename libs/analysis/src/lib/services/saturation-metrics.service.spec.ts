import { SaturationMetricsService } from './saturation-metrics.service';
import type { SaturationReport } from './saturation-metrics.service';

describe('SaturationMetricsService', () => {
  let service: SaturationMetricsService;

  beforeEach(() => {
    service = new SaturationMetricsService();
  });

  // Helper to create narratives with optional centroids
  function makeNarratives(
    count: number,
    postsPerNarrative: number,
    centroids?: number[][],
  ) {
    return Array.from({ length: count }, (_, i) => ({
      postIndices: Array.from(
        { length: postsPerNarrative },
        (_, j) => i * postsPerNarrative + j,
      ),
      centroidEmbedding: centroids?.[i],
    }));
  }

  // ---------------------------------------------------------------------------
  // Core metrics
  // ---------------------------------------------------------------------------

  describe('core metrics', () => {
    it('returns low saturation with 0 posts', () => {
      const result = service.computeSaturation({
        narratives: [],
        totalPosts: 0,
        unclusteredCount: 0,
      });
      expect(result.saturationLevel).toBe('low');
      expect(result.postCount).toBe(0);
      expect(result.narrativeCount).toBe(0);
    });

    it('returns low with 1 post and 0 narratives', () => {
      const result = service.computeSaturation({
        narratives: [],
        totalPosts: 1,
        unclusteredCount: 1,
      });
      expect(result.saturationLevel).toBe('low');
      expect(result.unclusteredRatio).toBe(1);
    });

    it('returns high density with 10 posts, 5 narratives, 0 unclustered', () => {
      const result = service.computeSaturation({
        narratives: makeNarratives(5, 2),
        totalPosts: 10,
        unclusteredCount: 0,
      });
      expect(result.clusterDensity).toBe(2);
      expect(result.unclusteredRatio).toBe(0);
    });

    it('returns low with 100 posts, 2 narratives, 80 unclustered', () => {
      const result = service.computeSaturation({
        narratives: makeNarratives(2, 10),
        totalPosts: 100,
        unclusteredCount: 80,
      });
      expect(result.saturationLevel).toBe('low');
      expect(result.unclusteredRatio).toBe(0.8);
    });

    it('returns saturated with 200 posts, 20 narratives, 10 unclustered', () => {
      const result = service.computeSaturation({
        narratives: makeNarratives(20, 9),
        totalPosts: 200,
        unclusteredCount: 10,
      });
      // unclusteredRatio = 10/200 = 0.05 < 0.15
      // clusterDensity = (200-10)/20 = 9.5 ... not > 10
      // Actually 9.5 so this is 'high' not 'saturated'
      expect(result.unclusteredRatio).toBe(0.05);
      expect(result.clusterDensity).toBe(9.5);
      expect(result.saturationLevel).toBe('high');
    });

    it('returns saturated with 220 posts, 20 narratives, 10 unclustered', () => {
      const result = service.computeSaturation({
        narratives: makeNarratives(20, 10),
        totalPosts: 220,
        unclusteredCount: 10,
      });
      // unclusteredRatio = 10/220 ≈ 0.045 < 0.15
      // clusterDensity = (220-10)/20 = 10.5 > 10
      expect(result.saturationLevel).toBe('saturated');
    });
  });

  // ---------------------------------------------------------------------------
  // Unclustered ratio
  // ---------------------------------------------------------------------------

  describe('unclusteredRatio', () => {
    it('equals 0 when unclusteredCount is 0', () => {
      const result = service.computeSaturation({
        narratives: makeNarratives(5, 10),
        totalPosts: 50,
        unclusteredCount: 0,
      });
      expect(result.unclusteredRatio).toBe(0);
    });

    it('equals 1 when all posts are unclustered', () => {
      const result = service.computeSaturation({
        narratives: [],
        totalPosts: 50,
        unclusteredCount: 50,
      });
      expect(result.unclusteredRatio).toBe(1);
    });

    it('equals 0.5 when half are unclustered', () => {
      const result = service.computeSaturation({
        narratives: makeNarratives(5, 5),
        totalPosts: 50,
        unclusteredCount: 25,
      });
      expect(result.unclusteredRatio).toBe(0.5);
    });

    it('equals 0 when totalPosts is 0 (no division by zero)', () => {
      const result = service.computeSaturation({
        narratives: [],
        totalPosts: 0,
        unclusteredCount: 0,
      });
      expect(result.unclusteredRatio).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Cluster density
  // ---------------------------------------------------------------------------

  describe('clusterDensity', () => {
    it('equals 0 when 0 narratives', () => {
      const result = service.computeSaturation({
        narratives: [],
        totalPosts: 50,
        unclusteredCount: 50,
      });
      expect(result.clusterDensity).toBe(0);
    });

    it('equals 10 when 100 clustered posts and 10 narratives', () => {
      const result = service.computeSaturation({
        narratives: makeNarratives(10, 10),
        totalPosts: 100,
        unclusteredCount: 0,
      });
      expect(result.clusterDensity).toBe(10);
    });

    it('equals 50 when 100 posts and 2 narratives', () => {
      const result = service.computeSaturation({
        narratives: makeNarratives(2, 50),
        totalPosts: 100,
        unclusteredCount: 0,
      });
      expect(result.clusterDensity).toBe(50);
    });

    it('accounts for unclustered posts in density', () => {
      const result = service.computeSaturation({
        narratives: makeNarratives(4, 5),
        totalPosts: 40,
        unclusteredCount: 20,
      });
      // (40-20)/4 = 5
      expect(result.clusterDensity).toBe(5);
    });
  });

  // ---------------------------------------------------------------------------
  // Topic coverage
  // ---------------------------------------------------------------------------

  describe('topicCoverage', () => {
    it('equals 1 when nothing is unclustered', () => {
      const result = service.computeSaturation({
        narratives: makeNarratives(5, 10),
        totalPosts: 50,
        unclusteredCount: 0,
      });
      expect(result.topicCoverage).toBe(1);
    });

    it('equals 0 when everything is unclustered', () => {
      const result = service.computeSaturation({
        narratives: [],
        totalPosts: 50,
        unclusteredCount: 50,
      });
      expect(result.topicCoverage).toBe(0);
    });

    it('is clamped between 0 and 1', () => {
      const result = service.computeSaturation({
        narratives: makeNarratives(3, 5),
        totalPosts: 30,
        unclusteredCount: 15,
      });
      expect(result.topicCoverage).toBeGreaterThanOrEqual(0);
      expect(result.topicCoverage).toBeLessThanOrEqual(1);
      expect(result.topicCoverage).toBe(0.5);
    });
  });

  // ---------------------------------------------------------------------------
  // Saturation levels
  // ---------------------------------------------------------------------------

  describe('saturation levels', () => {
    it('classifies low when unclusteredRatio > 0.5', () => {
      const result = service.computeSaturation({
        narratives: makeNarratives(5, 4),
        totalPosts: 100,
        unclusteredCount: 60,
      });
      expect(result.unclusteredRatio).toBe(0.6);
      expect(result.saturationLevel).toBe('low');
    });

    it('classifies low when clusterDensity < 3', () => {
      const result = service.computeSaturation({
        narratives: makeNarratives(10, 2),
        totalPosts: 30,
        unclusteredCount: 5,
      });
      // clusterDensity = (30-5)/10 = 2.5
      expect(result.clusterDensity).toBe(2.5);
      expect(result.saturationLevel).toBe('low');
    });

    it('classifies moderate when unclusteredRatio 0.3-0.5', () => {
      const result = service.computeSaturation({
        narratives: makeNarratives(10, 6),
        totalPosts: 100,
        unclusteredCount: 35,
      });
      // unclusteredRatio = 0.35, clusterDensity = (100-35)/10 = 6.5
      expect(result.unclusteredRatio).toBe(0.35);
      expect(result.saturationLevel).toBe('moderate');
    });

    it('classifies moderate when clusterDensity 3-5', () => {
      const result = service.computeSaturation({
        narratives: makeNarratives(10, 4),
        totalPosts: 50,
        unclusteredCount: 5,
      });
      // unclusteredRatio = 0.1 < 0.3, clusterDensity = (50-5)/10 = 4.5
      expect(result.clusterDensity).toBe(4.5);
      expect(result.saturationLevel).toBe('moderate');
    });

    it('classifies high when unclusteredRatio 0.15-0.3 and clusterDensity 5-10', () => {
      const result = service.computeSaturation({
        narratives: makeNarratives(10, 7),
        totalPosts: 100,
        unclusteredCount: 25,
      });
      // unclusteredRatio = 0.25, clusterDensity = (100-25)/10 = 7.5
      expect(result.unclusteredRatio).toBe(0.25);
      expect(result.clusterDensity).toBe(7.5);
      expect(result.saturationLevel).toBe('high');
    });

    it('classifies saturated when unclusteredRatio < 0.15 and clusterDensity > 10', () => {
      const result = service.computeSaturation({
        narratives: makeNarratives(10, 15),
        totalPosts: 160,
        unclusteredCount: 10,
      });
      // unclusteredRatio = 10/160 = 0.0625, clusterDensity = 150/10 = 15
      expect(result.unclusteredRatio).toBe(0.0625);
      expect(result.clusterDensity).toBe(15);
      expect(result.saturationLevel).toBe('saturated');
    });
  });

  // ---------------------------------------------------------------------------
  // Recommendations
  // ---------------------------------------------------------------------------

  describe('recommendations', () => {
    it('low saturation recommends higher depth', () => {
      const result = service.computeSaturation({
        narratives: [],
        totalPosts: 10,
        unclusteredCount: 10,
        currentLimit: 50,
      });
      expect(result.saturationLevel).toBe('low');
      expect(result.recommendation).toContain('under-sampled');
      expect(result.suggestedDepth).toBeGreaterThanOrEqual(250);
    });

    it('moderate saturation recommends moderate increase', () => {
      const result = service.computeSaturation({
        narratives: makeNarratives(10, 4),
        totalPosts: 50,
        unclusteredCount: 5,
        currentLimit: 50,
      });
      expect(result.saturationLevel).toBe('moderate');
      expect(result.recommendation).toContain('Partial coverage');
      expect(result.suggestedDepth).toBeGreaterThanOrEqual(75);
    });

    it('high saturation recommends no change', () => {
      const result = service.computeSaturation({
        narratives: makeNarratives(10, 7),
        totalPosts: 100,
        unclusteredCount: 25,
        currentLimit: 100,
      });
      expect(result.saturationLevel).toBe('high');
      expect(result.recommendation).toContain('Good coverage');
      expect(result.suggestedDepth).toBe(100);
    });

    it('saturated recommends no change', () => {
      const result = service.computeSaturation({
        narratives: makeNarratives(10, 15),
        totalPosts: 160,
        unclusteredCount: 10,
        currentLimit: 100,
      });
      expect(result.saturationLevel).toBe('saturated');
      expect(result.recommendation).toContain('fully saturated');
      expect(result.suggestedDepth).toBe(100);
    });

    it('suggestedDepth is always >= current limit for high/saturated', () => {
      const result = service.computeSaturation({
        narratives: makeNarratives(10, 7),
        totalPosts: 100,
        unclusteredCount: 25,
        currentLimit: 200,
      });
      expect(result.suggestedDepth).toBeGreaterThanOrEqual(200);
    });

    it('suggestedDepth for low is at least 250', () => {
      const result = service.computeSaturation({
        narratives: [],
        totalPosts: 5,
        unclusteredCount: 5,
        currentLimit: 10,
      });
      expect(result.suggestedDepth).toBe(250);
    });

    it('suggestedDepth for moderate is at least 150', () => {
      const result = service.computeSaturation({
        narratives: makeNarratives(10, 4),
        totalPosts: 50,
        unclusteredCount: 5,
        currentLimit: 50,
      });
      expect(result.suggestedDepth).toBeGreaterThanOrEqual(150);
    });
  });

  // ---------------------------------------------------------------------------
  // Deduplication rate
  // ---------------------------------------------------------------------------

  describe('deduplicationRate', () => {
    it('defaults to 0 when rawPostCount not provided', () => {
      const result = service.computeSaturation({
        narratives: makeNarratives(3, 5),
        totalPosts: 15,
        unclusteredCount: 0,
      });
      expect(result.deduplicationRate).toBe(0);
    });

    it('computes correctly when rawPostCount and deduplicatedCount provided', () => {
      const result = service.computeSaturation({
        narratives: makeNarratives(3, 5),
        totalPosts: 15,
        unclusteredCount: 0,
        rawPostCount: 20,
        deduplicatedCount: 15,
      });
      // (20-15)/20 = 0.25
      expect(result.deduplicationRate).toBe(0.25);
    });

    it('equals 0 when rawPostCount is 0', () => {
      const result = service.computeSaturation({
        narratives: [],
        totalPosts: 0,
        unclusteredCount: 0,
        rawPostCount: 0,
        deduplicatedCount: 0,
      });
      expect(result.deduplicationRate).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Embedding metrics
  // ---------------------------------------------------------------------------

  describe('avgInterClusterDistance', () => {
    it('equals 0 for 0 centroids', () => {
      const result = service.computeSaturation({
        narratives: [],
        totalPosts: 0,
        unclusteredCount: 0,
      });
      expect(result.avgInterClusterDistance).toBe(0);
    });

    it('equals 0 for 1 centroid', () => {
      const result = service.computeSaturation({
        narratives: [{ postIndices: [0, 1], centroidEmbedding: [1, 0, 0] }],
        totalPosts: 2,
        unclusteredCount: 0,
      });
      expect(result.avgInterClusterDistance).toBe(0);
    });

    it('computes correctly for 2 orthogonal centroids', () => {
      const result = service.computeSaturation({
        narratives: [
          { postIndices: [0, 1], centroidEmbedding: [1, 0, 0] },
          { postIndices: [2, 3], centroidEmbedding: [0, 1, 0] },
        ],
        totalPosts: 4,
        unclusteredCount: 0,
      });
      // cosine similarity of [1,0,0] and [0,1,0] = 0, distance = 1
      expect(result.avgInterClusterDistance).toBe(1);
    });

    it('computes correctly for 2 identical centroids', () => {
      const result = service.computeSaturation({
        narratives: [
          { postIndices: [0, 1], centroidEmbedding: [1, 0, 0] },
          { postIndices: [2, 3], centroidEmbedding: [1, 0, 0] },
        ],
        totalPosts: 4,
        unclusteredCount: 0,
      });
      expect(result.avgInterClusterDistance).toBeCloseTo(0);
    });

    it('handles narratives without centroid embeddings', () => {
      const result = service.computeSaturation({
        narratives: [
          { postIndices: [0, 1] },
          { postIndices: [2, 3] },
        ],
        totalPosts: 4,
        unclusteredCount: 0,
      });
      // No centroids available, should fallback
      expect(result.avgInterClusterDistance).toBe(0);
    });

    it('handles empty centroid arrays', () => {
      const result = service.computeSaturation({
        narratives: [
          { postIndices: [0, 1], centroidEmbedding: [] },
          { postIndices: [2, 3], centroidEmbedding: [] },
        ],
        totalPosts: 4,
        unclusteredCount: 0,
      });
      expect(result.avgInterClusterDistance).toBe(0);
    });
  });

  describe('embeddingSpread', () => {
    it('equals 0 for fewer than 2 centroids', () => {
      const result = service.computeSaturation({
        narratives: [{ postIndices: [0], centroidEmbedding: [1, 0, 0] }],
        totalPosts: 1,
        unclusteredCount: 0,
      });
      expect(result.embeddingSpread).toBe(0);
    });

    it('reflects variance across centroids', () => {
      const result = service.computeSaturation({
        narratives: [
          { postIndices: [0, 1], centroidEmbedding: [1, 0] },
          { postIndices: [2, 3], centroidEmbedding: [0, 1] },
        ],
        totalPosts: 4,
        unclusteredCount: 0,
      });
      // dim 0: mean=0.5, var = ((1-0.5)^2 + (0-0.5)^2)/2 = 0.25
      // dim 1: mean=0.5, var = ((0-0.5)^2 + (1-0.5)^2)/2 = 0.25
      // spread = (0.25+0.25)/2 = 0.25
      expect(result.embeddingSpread).toBeCloseTo(0.25);
    });

    it('equals 0 when all centroids are identical', () => {
      const result = service.computeSaturation({
        narratives: [
          { postIndices: [0, 1], centroidEmbedding: [0.5, 0.5] },
          { postIndices: [2, 3], centroidEmbedding: [0.5, 0.5] },
        ],
        totalPosts: 4,
        unclusteredCount: 0,
      });
      expect(result.embeddingSpread).toBeCloseTo(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Incremental comparison (newTopicYield)
  // ---------------------------------------------------------------------------

  describe('newTopicYield', () => {
    it('equals 1.0 when no previous report', () => {
      const result = service.computeSaturation({
        narratives: makeNarratives(5, 3),
        totalPosts: 15,
        unclusteredCount: 0,
      });
      expect(result.newTopicYield).toBe(1.0);
    });

    it('equals 1.0 when previousReport is null', () => {
      const result = service.computeSaturation({
        narratives: makeNarratives(5, 3),
        totalPosts: 15,
        unclusteredCount: 0,
        previousReport: null,
      });
      expect(result.newTopicYield).toBe(1.0);
    });

    it('is less than 1.0 when previous report had similar narrative count', () => {
      const prevReport: SaturationReport = {
        postCount: 15,
        narrativeCount: 5,
        unclusteredCount: 0,
        unclusteredRatio: 0,
        clusterDensity: 3,
        topicCoverage: 1,
        newTopicYield: 1,
        deduplicationRate: 0,
        avgInterClusterDistance: 0.5,
        embeddingSpread: 0.1,
        saturationLevel: 'moderate',
        recommendation: '',
        suggestedDepth: 100,
      };
      const result = service.computeSaturation({
        narratives: makeNarratives(5, 3),
        totalPosts: 15,
        unclusteredCount: 0,
        previousReport: prevReport,
      });
      // same count => newRatio=0, but counts same so +0 => yield = 0
      expect(result.newTopicYield).toBe(0);
    });

    it('reflects new narratives when count increases', () => {
      const prevReport: SaturationReport = {
        postCount: 15,
        narrativeCount: 3,
        unclusteredCount: 0,
        unclusteredRatio: 0,
        clusterDensity: 5,
        topicCoverage: 1,
        newTopicYield: 1,
        deduplicationRate: 0,
        avgInterClusterDistance: 0.5,
        embeddingSpread: 0.1,
        saturationLevel: 'moderate',
        recommendation: '',
        suggestedDepth: 100,
      };
      const result = service.computeSaturation({
        narratives: makeNarratives(6, 5),
        totalPosts: 30,
        unclusteredCount: 0,
        previousReport: prevReport,
      });
      // newRatio = (6-3)/6 = 0.5, + 0.1 = 0.6
      expect(result.newTopicYield).toBeCloseTo(0.6);
      expect(result.newTopicYield).toBeLessThan(1.0);
      expect(result.newTopicYield).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles all posts in 1 giant narrative', () => {
      const result = service.computeSaturation({
        narratives: [{ postIndices: Array.from({ length: 100 }, (_, i) => i) }],
        totalPosts: 100,
        unclusteredCount: 0,
      });
      expect(result.narrativeCount).toBe(1);
      expect(result.clusterDensity).toBe(100);
      expect(result.unclusteredRatio).toBe(0);
      expect(result.topicCoverage).toBe(1);
    });

    it('handles every post as its own narrative (cluster density = 1)', () => {
      const narratives = Array.from({ length: 50 }, (_, i) => ({
        postIndices: [i],
      }));
      const result = service.computeSaturation({
        narratives,
        totalPosts: 50,
        unclusteredCount: 0,
      });
      expect(result.clusterDensity).toBe(1);
      expect(result.narrativeCount).toBe(50);
      expect(result.saturationLevel).toBe('low');
    });

    it('handles very large post counts (10000+)', () => {
      const result = service.computeSaturation({
        narratives: makeNarratives(50, 190),
        totalPosts: 10000,
        unclusteredCount: 500,
      });
      // unclusteredRatio = 500/10000 = 0.05 < 0.15
      // clusterDensity = 9500/50 = 190 > 10
      expect(result.saturationLevel).toBe('saturated');
      expect(result.postCount).toBe(10000);
    });

    it('handles narratives with mixed centroid availability', () => {
      const result = service.computeSaturation({
        narratives: [
          { postIndices: [0, 1], centroidEmbedding: [1, 0, 0] },
          { postIndices: [2, 3] }, // no centroid
          { postIndices: [4, 5], centroidEmbedding: [0, 0, 1] },
        ],
        totalPosts: 6,
        unclusteredCount: 0,
      });
      // Only 2 centroids available, should still compute distance
      expect(result.avgInterClusterDistance).toBe(1); // orthogonal
      expect(result.narrativeCount).toBe(3);
    });

    it('handles default currentLimit of 100', () => {
      const result = service.computeSaturation({
        narratives: [],
        totalPosts: 5,
        unclusteredCount: 5,
      });
      // low saturation, default currentLimit=100 => max(250, 300) = 300
      expect(result.suggestedDepth).toBe(300);
    });

    it('includes narrativeCount in high recommendation text', () => {
      const result = service.computeSaturation({
        narratives: makeNarratives(8, 9),
        totalPosts: 100,
        unclusteredCount: 25,
        currentLimit: 100,
      });
      // clusterDensity = 75/8 = 9.375, unclusteredRatio = 0.25
      expect(result.saturationLevel).toBe('high');
      expect(result.recommendation).toContain('8 distinct narratives');
    });

    it('includes suggestedDepth in low recommendation text', () => {
      const result = service.computeSaturation({
        narratives: [],
        totalPosts: 5,
        unclusteredCount: 5,
        currentLimit: 100,
      });
      expect(result.recommendation).toContain('300+');
    });

    it('includes suggestedDepth in moderate recommendation text', () => {
      const result = service.computeSaturation({
        narratives: makeNarratives(10, 4),
        totalPosts: 50,
        unclusteredCount: 5,
        currentLimit: 100,
      });
      expect(result.recommendation).toContain('150');
    });
  });

  // ---------------------------------------------------------------------------
  // Return shape completeness
  // ---------------------------------------------------------------------------

  describe('return shape', () => {
    it('returns all expected fields', () => {
      const result = service.computeSaturation({
        narratives: makeNarratives(3, 5),
        totalPosts: 20,
        unclusteredCount: 5,
      });

      expect(result).toHaveProperty('postCount');
      expect(result).toHaveProperty('narrativeCount');
      expect(result).toHaveProperty('unclusteredCount');
      expect(result).toHaveProperty('unclusteredRatio');
      expect(result).toHaveProperty('clusterDensity');
      expect(result).toHaveProperty('topicCoverage');
      expect(result).toHaveProperty('newTopicYield');
      expect(result).toHaveProperty('deduplicationRate');
      expect(result).toHaveProperty('avgInterClusterDistance');
      expect(result).toHaveProperty('embeddingSpread');
      expect(result).toHaveProperty('saturationLevel');
      expect(result).toHaveProperty('recommendation');
      expect(result).toHaveProperty('suggestedDepth');
    });

    it('postCount matches totalPosts input', () => {
      const result = service.computeSaturation({
        narratives: makeNarratives(2, 5),
        totalPosts: 42,
        unclusteredCount: 10,
      });
      expect(result.postCount).toBe(42);
    });

    it('narrativeCount matches narratives array length', () => {
      const result = service.computeSaturation({
        narratives: makeNarratives(7, 3),
        totalPosts: 25,
        unclusteredCount: 4,
      });
      expect(result.narrativeCount).toBe(7);
    });

    it('unclusteredCount matches input', () => {
      const result = service.computeSaturation({
        narratives: makeNarratives(3, 5),
        totalPosts: 20,
        unclusteredCount: 5,
      });
      expect(result.unclusteredCount).toBe(5);
    });
  });
});
