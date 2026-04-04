import { Injectable, Logger } from '@nestjs/common';
import { cosineSimilarity } from '../utils/math';

export interface SaturationReport {
  postCount: number;
  narrativeCount: number;
  unclusteredCount: number;
  unclusteredRatio: number;
  clusterDensity: number;
  topicCoverage: number;
  newTopicYield: number;
  deduplicationRate: number;
  avgInterClusterDistance: number;
  embeddingSpread: number;
  saturationLevel: 'low' | 'moderate' | 'high' | 'saturated';
  recommendation: string;
  suggestedDepth: number;
}

@Injectable()
export class SaturationMetricsService {
  private readonly logger = new Logger(SaturationMetricsService.name);

  computeSaturation(params: {
    narratives: Array<{ postIndices: number[]; centroidEmbedding?: number[] }>;
    totalPosts: number;
    unclusteredCount: number;
    deduplicatedCount?: number;
    rawPostCount?: number;
    previousReport?: SaturationReport | null;
    currentLimit?: number;
  }): SaturationReport {
    const {
      narratives,
      totalPosts,
      unclusteredCount,
      deduplicatedCount,
      rawPostCount,
      previousReport,
      currentLimit = 100,
    } = params;

    const narrativeCount = narratives.length;
    const postCount = totalPosts;

    // Core ratios
    const unclusteredRatio = totalPosts > 0 ? unclusteredCount / totalPosts : 0;
    const clusterDensity =
      narrativeCount > 0
        ? (totalPosts - unclusteredCount) / narrativeCount
        : 0;
    const topicCoverage = Math.max(0, Math.min(1, 1 - unclusteredRatio));

    // Deduplication rate
    const deduplicationRate =
      rawPostCount != null && rawPostCount > 0 && deduplicatedCount != null
        ? (rawPostCount - deduplicatedCount) / rawPostCount
        : 0;

    // Embedding-based metrics
    const centroids = narratives
      .map((n) => n.centroidEmbedding)
      .filter((c): c is number[] => c != null && c.length > 0);

    const avgInterClusterDistance = this.computeAvgInterClusterDistance(
      centroids,
      narrativeCount,
      totalPosts,
    );
    const embeddingSpread = this.computeEmbeddingSpread(centroids);

    // New topic yield
    const newTopicYield = this.computeNewTopicYield(
      narratives,
      previousReport,
    );

    // Classification
    const saturationLevel = this.classifySaturation(
      totalPosts,
      unclusteredRatio,
      clusterDensity,
    );

    // Suggested depth
    const suggestedDepth = this.computeSuggestedDepth(
      saturationLevel,
      currentLimit,
    );

    // Recommendation
    const recommendation = this.buildRecommendation(
      saturationLevel,
      suggestedDepth,
      narrativeCount,
    );

    return {
      postCount,
      narrativeCount,
      unclusteredCount,
      unclusteredRatio,
      clusterDensity,
      topicCoverage,
      newTopicYield,
      deduplicationRate,
      avgInterClusterDistance,
      embeddingSpread,
      saturationLevel,
      recommendation,
      suggestedDepth,
    };
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    return cosineSimilarity(a, b);
  }

  private computeAvgInterClusterDistance(
    centroids: number[][],
    narrativeCount: number,
    totalPosts: number,
  ): number {
    if (centroids.length < 2) return 0;

    let totalDistance = 0;
    let pairCount = 0;
    for (let i = 0; i < centroids.length; i++) {
      for (let j = i + 1; j < centroids.length; j++) {
        totalDistance += 1 - this.cosineSimilarity(centroids[i]!, centroids[j]!);
        pairCount++;
      }
    }
    return pairCount > 0 ? totalDistance / pairCount : 0;
  }

  private computeEmbeddingSpread(centroids: number[][]): number {
    if (centroids.length < 2) return 0;

    // Compute variance across all dimensions of centroid vectors
    const dim = centroids[0]!.length;
    if (dim === 0) return 0;

    let totalVariance = 0;
    for (let d = 0; d < dim; d++) {
      let sum = 0;
      for (const c of centroids) {
        sum += c[d]!;
      }
      const mean = sum / centroids.length;
      let variance = 0;
      for (const c of centroids) {
        const diff = c[d]! - mean;
        variance += diff * diff;
      }
      totalVariance += variance / centroids.length;
    }

    return totalVariance / dim;
  }

  private computeNewTopicYield(
    narratives: Array<{ postIndices: number[]; centroidEmbedding?: number[] }>,
    previousReport?: SaturationReport | null,
  ): number {
    if (!previousReport) return 1.0;

    // Without centroid comparison capability to previous narratives,
    // estimate based on narrative count change
    const prevCount = previousReport.narrativeCount;
    const currCount = narratives.length;

    if (prevCount === 0) return 1.0;
    if (currCount === 0) return 0;

    // Ratio of new narratives: if current has more, some are new
    // If same or fewer, diminishing returns
    const newRatio = Math.max(0, currCount - prevCount) / currCount;
    // Blend: at least some portion is "new" if counts differ at all
    return Math.max(0, Math.min(1, newRatio + (currCount !== prevCount ? 0.1 : 0)));
  }

  private classifySaturation(
    totalPosts: number,
    unclusteredRatio: number,
    clusterDensity: number,
  ): SaturationReport['saturationLevel'] {
    if (totalPosts === 0) return 'low';
    if (unclusteredRatio > 0.5 || clusterDensity < 3) return 'low';
    if (unclusteredRatio > 0.3 || clusterDensity < 5) return 'moderate';
    if (unclusteredRatio < 0.15 && clusterDensity > 10) return 'saturated';
    return 'high';
  }

  private computeSuggestedDepth(
    saturationLevel: SaturationReport['saturationLevel'],
    currentLimit: number,
  ): number {
    if (saturationLevel === 'low') {
      return Math.max(250, Math.ceil(currentLimit * 3));
    }
    if (saturationLevel === 'moderate') {
      return Math.max(150, Math.ceil(currentLimit * 1.5));
    }
    return currentLimit;
  }

  private buildRecommendation(
    saturationLevel: SaturationReport['saturationLevel'],
    suggestedDepth: number,
    narrativeCount: number,
  ): string {
    switch (saturationLevel) {
      case 'low':
        return `Topic under-sampled. ${suggestedDepth}+ posts per source recommended for meaningful coverage.`;
      case 'moderate':
        return `Partial coverage. Increasing to ${suggestedDepth} posts per source would improve narrative detection.`;
      case 'high':
        return `Good coverage. ${narrativeCount} distinct narratives identified with strong cluster density.`;
      case 'saturated':
        return `Topic fully saturated. Additional data unlikely to reveal new narratives.`;
    }
  }
}
