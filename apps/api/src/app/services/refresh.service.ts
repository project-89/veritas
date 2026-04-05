import { Injectable, Logger } from '@nestjs/common';
import { MonitorService, NarrativeAnalysisService } from '@veritas/analysis';
import {
  Alert,
  AlertRepository,
  IngestionService,
  InvestigationRepository,
} from '@veritas/ingestion';

/**
 * Shared service that encapsulates the investigation refresh pipeline.
 *
 * Used by both MonitorController (manual refresh via HTTP) and
 * SchedulerService (automatic scheduled refresh).
 *
 * Pipeline:
 *   1. Get investigation
 *   2. Get previous snapshot for comparison
 *   3. Re-run search
 *   4. Re-run analysis
 *   5. Save new snapshot
 *   6. Compare snapshots and generate alerts
 *   7. Update monitor config timestamps
 */
@Injectable()
export class RefreshService {
  private readonly logger = new Logger(RefreshService.name);

  constructor(
    private readonly alertRepository: AlertRepository,
    private readonly investigationRepository: InvestigationRepository,
    private readonly ingestionService: IngestionService,
    private readonly narrativeAnalysisService: NarrativeAnalysisService,
    private readonly monitorService: MonitorService,
  ) {}

  /**
   * Run a full refresh for an investigation.
   * Returns the generated alerts and the new snapshot ID.
   *
   * @throws Error if the investigation does not exist.
   */
  async refresh(investigationId: string): Promise<{ alerts: Alert[]; snapshotId: string }> {
    const investigation = await this.investigationRepository.findById(investigationId);
    if (!investigation) {
      throw new Error(`Investigation not found: ${investigationId}`);
    }

    // Get previous snapshot for comparison
    const previousSnapshot = await this.investigationRepository.getLatestSnapshot(investigationId);

    // Step 1: Re-run search
    this.logger.log(
      `Searching: "${investigation.query}" (platforms: ${investigation.settings.platforms.join(', ') || 'all'})`,
    );
    const { posts, insights } = await this.ingestionService.searchWithRawDataAll(
      investigation.query,
      {
        platforms:
          investigation.settings.platforms.length > 0
            ? investigation.settings.platforms
            : undefined,
        limit: investigation.settings.limit,
      },
    );

    // Step 2: Run analysis
    const analysisPosts = posts.map((p) => ({
      text: p.text,
      platform: p.platform,
      authorName: p.authorName ?? 'Unknown',
      authorHandle: p.authorHandle ?? '',
      timestamp: p.timestamp instanceof Date ? p.timestamp.toISOString() : String(p.timestamp),
      engagement: p.engagementMetrics
        ? {
            likes: p.engagementMetrics.likes,
            comments: p.engagementMetrics.comments,
            shares: p.engagementMetrics.shares,
          }
        : undefined,
    }));

    const { narratives } = await this.narrativeAnalysisService.analyze(analysisPosts);

    // Step 3: Build and save snapshot summary
    const summary = {
      total: posts.length,
      positive: insights.filter((i) => i.sentiment && i.sentiment.score > 0.2).length,
      negative: insights.filter((i) => i.sentiment && i.sentiment.score < -0.2).length,
      neutral: insights.filter(
        (i) => !i.sentiment || (i.sentiment.score >= -0.2 && i.sentiment.score <= 0.2),
      ).length,
      byPlatform: posts.reduce(
        (acc, p) => {
          acc[p.platform] = (acc[p.platform] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    };

    const snapshot = await this.investigationRepository.addSnapshot(investigationId, {
      posts,
      narratives,
      summary,
    });

    const snapshotId =
      snapshot._id?.toString() ?? ((snapshot as unknown as Record<string, unknown>).id as string);

    // Step 4 + 5: Compare snapshots and generate alerts
    let savedAlerts: Alert[] = [];

    if (previousSnapshot) {
      const config = await this.alertRepository.getConfig(investigationId);
      const thresholds = config?.alertThresholds ?? {
        velocityMultiplier: 2.0,
        sentimentShift: 0.3,
        minNewNarrativePosts: 3,
      };

      const generatedAlerts = this.monitorService.compareSnapshots(
        {
          postCount: previousSnapshot.postCount,
          narrativeCount: previousSnapshot.narrativeCount,
          summary: previousSnapshot.summary,
          narratives: (previousSnapshot.narratives ?? []) as Array<{
            summary?: string;
            postIndices?: number[];
            avgSentiment?: number;
            platforms?: Record<string, number>;
            velocity?: { postsPerHour: number };
          }>,
        },
        {
          postCount: posts.length,
          narrativeCount: narratives.length,
          summary,
          narratives: narratives as Array<{
            summary?: string;
            postIndices?: number[];
            avgSentiment?: number;
            platforms?: Record<string, number>;
            velocity?: { postsPerHour: number };
          }>,
        },
        investigationId,
        thresholds,
      );

      if (generatedAlerts.length > 0) {
        savedAlerts = await this.alertRepository.saveAlerts(generatedAlerts);
      }
    }

    // Update monitor config last run time
    const config = await this.alertRepository.getConfig(investigationId);
    if (config) {
      const nextRunAt = config.enabled
        ? new Date(Date.now() + config.intervalMinutes * 60 * 1000)
        : config.nextRunAt;
      await this.alertRepository.upsertConfig(investigationId, {
        lastRunAt: new Date(),
        nextRunAt,
      });
    }

    this.logger.log(
      `Refresh complete: ${posts.length} posts, ${narratives.length} narratives, ${savedAlerts.length} alerts`,
    );

    return { alerts: savedAlerts, snapshotId };
  }
}
