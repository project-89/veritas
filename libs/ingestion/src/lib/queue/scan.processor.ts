import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Optional } from '@nestjs/common';
import { Job } from 'bullmq';
import { NarrativeInsight } from '../../types/narrative-insight.interface';
import { SocialMediaPost } from '../../types/social-media.types';
import { ConnectorSearchOptions } from '../interfaces/data-connector.interface';
import { ConnectorFetchCacheRepository } from '../repositories/connector-fetch-cache.repository';
import { ScanJobRepository } from '../repositories/scan-job.repository';
import { getEngagementProvenance } from '../utils/engagement-provenance';
import { IngestionService } from '../services/ingestion.service';
import { ScanEventsService, ScanStatusEvent } from '../services/scan-events.service';
import { buildPostDedupKey } from '../utils/post-dedup.util';

export interface ScanJobData {
  scanId: string;
  connector: string;
  query: string;
  options: {
    limit?: number;
    timeRange?: string;
    searchMode?: 'topic' | 'claim' | 'person';
  };
  startedAt?: string;
}

function serializePostTimestamp(timestamp: string | Date | undefined): string {
  if (timestamp instanceof Date) {
    return Number.isFinite(timestamp.getTime())
      ? timestamp.toISOString()
      : new Date().toISOString();
  }

  if (typeof timestamp === 'string' && timestamp.trim().length > 0) {
    const parsed = new Date(timestamp);
    if (Number.isFinite(parsed.getTime())) {
      return parsed.toISOString();
    }
    return timestamp;
  }

  return new Date().toISOString();
}

// Each job fetches from one connector; the cap bounds simultaneous outbound
// fetches across ALL queued scans so external sources are never hammered.
@Processor('scan', { concurrency: 3 })
export class ScanProcessor extends WorkerHost {
  private readonly logger = new Logger(ScanProcessor.name);

  constructor(
    private readonly ingestionService: IngestionService,
    private readonly scanJobRepository: ScanJobRepository,
    @Optional() private readonly fetchCache?: ConnectorFetchCacheRepository,
    @Optional() private readonly scanEvents?: ScanEventsService,
  ) {
    super();
  }

  /** Broadcast a connector status transition to any SSE listeners (best-effort). */
  private emitStatus(
    scanId: string,
    connector: string,
    patch: Omit<ScanStatusEvent, 'kind' | 'scanId' | 'connector' | 'timestamp'>,
  ): void {
    this.scanEvents?.emit({
      kind: 'scan-status',
      scanId,
      connector,
      timestamp: new Date().toISOString(),
      ...patch,
    });
  }

  async process(job: Job<ScanJobData>): Promise<{ postCount: number }> {
    const { scanId, connector, query, options } = job.data;
    const startTime = Date.now();

    this.logger.log(`[scan:${scanId}] Processing connector "${connector}" for query "${query}"`);

    // Update status to running
    await this.scanJobRepository.updateConnectorStatus(scanId, connector, {
      status: 'running',
      startedAt: new Date().toISOString(),
    });
    this.emitStatus(scanId, connector, { status: 'running' });

    try {
      // Cross-scan dedup: identical fetch within the TTL window is served
      // from cache instead of re-hitting the source.
      const cacheKey = ConnectorFetchCacheRepository.buildQueryKey(query, options);
      const cached = await this.fetchCache?.getFresh(connector, cacheKey);
      if (cached) {
        this.logger.log(
          `[scan:${scanId}] ${connector}: cache hit (${cached.length} posts) — skipping source fetch`,
        );
        await this.scanJobRepository.addConnectorResults(scanId, connector, cached);
        await this.scanJobRepository.updateConnectorStatus(scanId, connector, {
          status: 'done',
          postCount: cached.length,
          insightCount: cached.length,
          completedAt: new Date().toISOString(),
          duration: Date.now() - startTime,
        });
        this.emitStatus(scanId, connector, {
          status: 'done',
          postCount: cached.length,
          insightCount: cached.length,
          duration: Date.now() - startTime,
        });
        return { postCount: cached.length };
      }

      // Get the connector instance
      const connectorInstance = this.ingestionService.getConnector(connector);
      if (!connectorInstance) {
        throw new Error(`Connector "${connector}" not found or not registered`);
      }

      // Fetch posts from the connector
      let result: { posts: SocialMediaPost[]; insights: NarrativeInsight[] };

      // Convert timeRange string (e.g., '7d') to actual start/end dates
      const searchOptions: ConnectorSearchOptions = {
        limit: options.limit,
        searchMode: options.searchMode ?? 'topic',
      };
      if (options.timeRange) {
        // Support relative ranges (7d, 24h, 30m) and absolute ranges (2026-03-15_2026-03-22)
        const relMatch = options.timeRange.match(/^(\d+)([dhm])$/);
        const absMatch = options.timeRange.match(/^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/);
        if (relMatch) {
          const [, valueText, unit] = relMatch;
          if (!valueText || !unit) {
            this.logger.warn(`Invalid relative time range: ${options.timeRange}`);
          } else {
            const value = Number.parseInt(valueText, 10);
            const ms =
              unit === 'd' ? value * 86400000 : unit === 'h' ? value * 3600000 : value * 60000;
            searchOptions.endDate = new Date();
            searchOptions.startDate = new Date(Date.now() - ms);
          }
        } else if (absMatch) {
          const [, startDate, endDate] = absMatch;
          searchOptions.startDate = new Date(`${startDate}T00:00:00Z`);
          searchOptions.endDate = new Date(`${endDate}T23:59:59Z`);
        }
      }

      const connRec = connectorInstance as unknown as Record<string, unknown>;

      if (options.searchMode === 'person') {
        const handle = query.replace(/^@+/, '').trim();
        const timelineResult = await (
          connectorInstance as {
            getUserTimelineWithRawData?: (
              h: string,
              o?: { limit?: number; startDate?: Date; endDate?: Date },
            ) => Promise<{ posts: SocialMediaPost[]; insights: NarrativeInsight[] } | null>;
          }
        ).getUserTimelineWithRawData?.(handle, {
          limit: searchOptions.limit,
          startDate: searchOptions.startDate,
          endDate: searchOptions.endDate,
        });
        if (!timelineResult) {
          this.logger.warn(
            `[scan:${scanId}] ${connector}: no per-user timeline support — skipping`,
          );
          await this.scanJobRepository.updateConnectorStatus(scanId, connector, {
            status: 'done',
            postCount: 0,
            insightCount: 0,
            completedAt: new Date().toISOString(),
            duration: Date.now() - startTime,
          });
          this.emitStatus(scanId, connector, {
            status: 'done',
            postCount: 0,
            insightCount: 0,
            duration: Date.now() - startTime,
          });
          return { postCount: 0 };
        }
        result = timelineResult;
      } else if (
        'searchWithRawData' in connectorInstance &&
        typeof connRec['searchWithRawData'] === 'function'
      ) {
        result = await (
          connectorInstance as {
            searchWithRawData: (
              q: string,
              o?: ConnectorSearchOptions,
            ) => Promise<{ posts: SocialMediaPost[]; insights: NarrativeInsight[] }>;
          }
        ).searchWithRawData(query, searchOptions);
      } else {
        const insights = await connectorInstance.searchAndTransform(query, searchOptions);
        result = { posts: [], insights };
      }

      this.logger.log(
        `[scan:${scanId}] ${connector}: fetched ${result.posts.length} posts, ${result.insights.length} insights`,
      );

      // Deduplicate only within the current connector run.
      // Historical rescans must preserve already-seen posts so wider windows
      // can be re-analyzed faithfully; otherwise a fresh 30d scan would only
      // contain "new since last scan" material.
      const seenTexts = new Set<string>();
      const dedupedPosts: SocialMediaPost[] = [];
      const dedupedInsights: NarrativeInsight[] = [];
      for (let i = 0; i < result.posts.length; i++) {
        const post = result.posts[i];
        if (!post) {
          continue;
        }
        const textKey = buildPostDedupKey(post);
        if (!seenTexts.has(textKey)) {
          seenTexts.add(textKey);
          dedupedPosts.push(post);
          const insight = result.insights[i];
          if (insight) {
            dedupedInsights.push(insight);
          }
        }
      }

      // Provenance is per-platform, so compute it once for this connector run.
      const engagementProvenance = getEngagementProvenance(connector);

      // Serialize posts for storage (same format as narrative.controller.ts)
      const serializedPosts = dedupedPosts.map((post: SocialMediaPost, idx: number) => {
        const insight = dedupedInsights[idx];
        return {
          id: post.id,
          text: post.text,
          platform: post.platform,
          authorName: post.authorName ?? 'Unknown',
          authorHandle: post.authorHandle ?? 'unknown',
          url: post.url ?? '',
          timestamp: serializePostTimestamp(post.timestamp),
          sentiment: insight?.sentiment ?? { score: 0, label: 'neutral', confidence: 0 },
          themes: insight?.themes ?? [],
          entities: insight?.entities ?? [],
          engagement: {
            likes: post.engagementMetrics?.likes ?? 0,
            shares: post.engagementMetrics?.shares ?? 0,
            comments: post.engagementMetrics?.comments ?? 0,
            reach: post.engagementMetrics?.reach ?? 0,
            viralityScore: post.engagementMetrics?.viralityScore ?? 0,
          },
          // Which of the above numbers are real vs inferred vs placeholder 0s,
          // so the UI never presents an unavailable metric as a real count.
          engagementProvenance,
        };
      });

      // Save results to MongoDB
      await this.scanJobRepository.addConnectorResults(scanId, connector, serializedPosts);

      // Populate the cross-scan cache (best-effort)
      await this.fetchCache?.save(connector, cacheKey, serializedPosts);

      const duration = Date.now() - startTime;

      // Update status to done
      await this.scanJobRepository.updateConnectorStatus(scanId, connector, {
        status: 'done',
        postCount: serializedPosts.length,
        insightCount: dedupedInsights.length,
        completedAt: new Date().toISOString(),
        duration,
      });
      this.emitStatus(scanId, connector, {
        status: 'done',
        postCount: serializedPosts.length,
        insightCount: dedupedInsights.length,
        duration,
      });

      this.logger.log(
        `[scan:${scanId}] ${connector}: completed with ${serializedPosts.length} posts in ${(duration / 1000).toFixed(1)}s`,
      );

      return { postCount: serializedPosts.length };
    } catch (error) {
      const err = error as Error;
      const duration = Date.now() - startTime;

      this.logger.error(`[scan:${scanId}] ${connector} failed: ${err.message}`, err.stack);

      await this.scanJobRepository.updateConnectorStatus(scanId, connector, {
        status: 'failed',
        error: err.message,
        completedAt: new Date().toISOString(),
        duration,
      });
      this.emitStatus(scanId, connector, {
        status: 'failed',
        error: err.message,
        duration,
      });

      throw error; // Let BullMQ handle retry
    }
  }
}
