import { Injectable, Logger } from '@nestjs/common';

/**
 * Minimal snapshot shape used for comparison.
 * Matches the Snapshot interface from ingestion schemas.
 */
interface SnapshotForComparison {
  postCount: number;
  narrativeCount: number;
  summary: {
    total: number;
    positive: number;
    negative: number;
    neutral: number;
    byPlatform: Record<string, number>;
  };
  narratives: Array<{
    id?: string;
    summary?: string;
    postIndices?: number[];
    avgSentiment?: number;
    platforms?: Record<string, number>;
    velocity?: {
      postsPerHour: number;
      acceleration?: number;
      trend?: string;
    };
  }>;
}

interface AlertThresholds {
  velocityMultiplier: number;
  sentimentShift: number;
  minNewNarrativePosts: number;
}

interface MonitorConfigForScheduling {
  enabled: boolean;
  nextRunAt: Date | null;
}

interface GeneratedAlert {
  investigationId: string;
  type: 'new_narrative' | 'velocity_spike' | 'sentiment_reversal' | 'new_platform' | 'volume_surge';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  metadata: Record<string, unknown>;
  read: boolean;
}

/**
 * Service responsible for comparing snapshots and detecting significant changes.
 * Pure logic — no database access. Used by the MonitorController.
 */
@Injectable()
export class MonitorService {
  private readonly logger = new Logger(MonitorService.name);

  /**
   * Compare two snapshots and generate alerts for significant changes.
   */
  compareSnapshots(
    previous: SnapshotForComparison,
    current: SnapshotForComparison,
    investigationId: string,
    thresholds: AlertThresholds,
  ): GeneratedAlert[] {
    const alerts: GeneratedAlert[] = [];

    // 1. New narratives: narratives in current not in previous
    alerts.push(...this.detectNewNarratives(previous, current, investigationId, thresholds));

    // 2. Velocity spikes
    alerts.push(...this.detectVelocitySpikes(previous, current, investigationId, thresholds));

    // 3. Sentiment reversals
    alerts.push(...this.detectSentimentReversals(previous, current, investigationId, thresholds));

    // 4. New platforms
    alerts.push(...this.detectNewPlatforms(previous, current, investigationId));

    // 5. Volume surge
    alerts.push(...this.detectVolumeSurge(previous, current, investigationId));

    this.logger.log(`Generated ${alerts.length} alerts for investigation ${investigationId}`);

    return alerts;
  }

  /**
   * Check which monitor configs are due for a re-scan.
   */
  getDueConfigs<T extends MonitorConfigForScheduling>(configs: T[]): T[] {
    const now = new Date();
    return configs.filter((c) => c.enabled && c.nextRunAt && new Date(c.nextRunAt) <= now);
  }

  // ---------------------------------------------------------------------------
  // Detection helpers
  // ---------------------------------------------------------------------------

  private detectNewNarratives(
    previous: SnapshotForComparison,
    current: SnapshotForComparison,
    investigationId: string,
    thresholds: AlertThresholds,
  ): GeneratedAlert[] {
    const alerts: GeneratedAlert[] = [];

    const prevSummaries = new Set(
      (previous.narratives ?? []).map((n) => n.summary?.toLowerCase().trim()).filter(Boolean),
    );

    for (const narrative of current.narratives ?? []) {
      const summary = narrative.summary?.toLowerCase().trim();
      if (!summary) continue;

      const postCount = narrative.postIndices?.length ?? 0;
      if (postCount < thresholds.minNewNarrativePosts) continue;

      // Check if this is genuinely new (not matching any previous summary)
      const isNew = !prevSummaries.has(summary);
      if (!isNew) continue;

      const severity = postCount >= thresholds.minNewNarrativePosts * 3 ? 'warning' : 'info';

      alerts.push({
        investigationId,
        type: 'new_narrative',
        severity,
        title: 'New narrative detected',
        description: `"${narrative.summary}" (${postCount} posts)`,
        metadata: {
          narrativeSummary: narrative.summary,
          postCount,
          platforms: narrative.platforms,
        },
        read: false,
      });
    }

    return alerts;
  }

  private detectVelocitySpikes(
    previous: SnapshotForComparison,
    current: SnapshotForComparison,
    investigationId: string,
    thresholds: AlertThresholds,
  ): GeneratedAlert[] {
    const alerts: GeneratedAlert[] = [];

    // Build a map of previous narrative velocities by summary
    const prevVelocityMap = new Map<string, number>();
    for (const n of previous.narratives ?? []) {
      const key = n.summary?.toLowerCase().trim();
      if (key && n.velocity) {
        prevVelocityMap.set(key, n.velocity.postsPerHour);
      }
    }

    for (const narrative of current.narratives ?? []) {
      const key = narrative.summary?.toLowerCase().trim();
      if (!key || !narrative.velocity) continue;

      const prevVelocity = prevVelocityMap.get(key);
      if (prevVelocity === undefined || prevVelocity === 0) continue;

      const multiplier = narrative.velocity.postsPerHour / prevVelocity;
      if (multiplier < thresholds.velocityMultiplier) continue;

      const severity = multiplier >= thresholds.velocityMultiplier * 2 ? 'critical' : 'warning';

      alerts.push({
        investigationId,
        type: 'velocity_spike',
        severity,
        title: 'Velocity spike detected',
        description: `"${narrative.summary}" velocity increased ${multiplier.toFixed(1)}x (${prevVelocity.toFixed(1)} -> ${narrative.velocity.postsPerHour.toFixed(1)} posts/hr)`,
        metadata: {
          narrativeSummary: narrative.summary,
          previousVelocity: prevVelocity,
          currentVelocity: narrative.velocity.postsPerHour,
          multiplier,
        },
        read: false,
      });
    }

    return alerts;
  }

  private detectSentimentReversals(
    previous: SnapshotForComparison,
    current: SnapshotForComparison,
    investigationId: string,
    thresholds: AlertThresholds,
  ): GeneratedAlert[] {
    const alerts: GeneratedAlert[] = [];

    const prevSentimentMap = new Map<string, number>();
    for (const n of previous.narratives ?? []) {
      const key = n.summary?.toLowerCase().trim();
      if (key && n.avgSentiment !== undefined) {
        prevSentimentMap.set(key, n.avgSentiment);
      }
    }

    for (const narrative of current.narratives ?? []) {
      const key = narrative.summary?.toLowerCase().trim();
      if (!key || narrative.avgSentiment === undefined) continue;

      const prevSentiment = prevSentimentMap.get(key);
      if (prevSentiment === undefined) continue;

      const shift = Math.abs(narrative.avgSentiment - prevSentiment);
      if (shift < thresholds.sentimentShift) continue;

      // True reversal: sign change
      const reversed =
        (prevSentiment > 0 && narrative.avgSentiment < 0) ||
        (prevSentiment < 0 && narrative.avgSentiment > 0);

      if (!reversed && shift < thresholds.sentimentShift * 2) continue;

      const severity = reversed ? 'warning' : 'info';

      alerts.push({
        investigationId,
        type: 'sentiment_reversal',
        severity,
        title: reversed ? 'Sentiment reversal detected' : 'Major sentiment shift detected',
        description: `"${narrative.summary}" sentiment shifted from ${prevSentiment.toFixed(2)} to ${narrative.avgSentiment.toFixed(2)}`,
        metadata: {
          narrativeSummary: narrative.summary,
          previousSentiment: prevSentiment,
          currentSentiment: narrative.avgSentiment,
          shift,
          reversed,
        },
        read: false,
      });
    }

    return alerts;
  }

  private detectNewPlatforms(
    previous: SnapshotForComparison,
    current: SnapshotForComparison,
    investigationId: string,
  ): GeneratedAlert[] {
    const alerts: GeneratedAlert[] = [];

    // Build map of previous platforms per narrative
    const prevPlatformsMap = new Map<string, Set<string>>();
    for (const n of previous.narratives ?? []) {
      const key = n.summary?.toLowerCase().trim();
      if (key && n.platforms) {
        prevPlatformsMap.set(key, new Set(Object.keys(n.platforms)));
      }
    }

    for (const narrative of current.narratives ?? []) {
      const key = narrative.summary?.toLowerCase().trim();
      if (!key || !narrative.platforms) continue;

      const prevPlatforms = prevPlatformsMap.get(key);
      if (!prevPlatforms) continue;

      const newPlatforms = Object.keys(narrative.platforms).filter((p) => !prevPlatforms.has(p));

      if (newPlatforms.length === 0) continue;

      alerts.push({
        investigationId,
        type: 'new_platform',
        severity: 'info',
        title: 'Narrative spread to new platform',
        description: `"${narrative.summary}" appeared on ${newPlatforms.join(', ')}`,
        metadata: {
          narrativeSummary: narrative.summary,
          newPlatforms,
          allPlatforms: Object.keys(narrative.platforms),
        },
        read: false,
      });
    }

    return alerts;
  }

  private detectVolumeSurge(
    previous: SnapshotForComparison,
    current: SnapshotForComparison,
    investigationId: string,
  ): GeneratedAlert[] {
    if (previous.postCount === 0) return [];

    const ratio = current.postCount / previous.postCount;
    if (ratio <= 1.5) return [];

    const severity = ratio >= 3 ? 'critical' : ratio >= 2 ? 'warning' : 'info';

    return [
      {
        investigationId,
        type: 'volume_surge',
        severity,
        title: 'Post volume surge',
        description: `Total posts increased from ${previous.postCount} to ${current.postCount} (${ratio.toFixed(1)}x)`,
        metadata: {
          previousCount: previous.postCount,
          currentCount: current.postCount,
          ratio,
        },
        read: false,
      },
    ];
  }
}
