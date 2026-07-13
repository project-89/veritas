import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';
import { filter, Observable, Subject } from 'rxjs';

/**
 * Redis channel that mirrors every scan/analysis progress event. The in-process
 * RxJS bus below drives the browser SSE (same process as the workers); this
 * channel makes the SAME events available to OTHER processes (e.g. the MCP
 * server), so an external agent can subscribe and know when to query results.
 */
export const SCAN_EVENTS_CHANNEL = 'veritas:scan-events';

/**
 * Per-connector scan status transition (running / done / failed / cancelled).
 * Carries enough payload for the client to update connector progress without
 * refetching the whole scan job.
 */
export interface ScanStatusEvent {
  kind: 'scan-status';
  scanId: string;
  connector: string;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  postCount?: number;
  insightCount?: number;
  error?: string | null;
  duration?: number | null;
  timestamp: string;
}

/** Analysis job status transition (running / completed / failed). */
export interface AnalysisJobEvent {
  kind: 'analysis-job';
  scanId: string;
  jobId: string;
  jobType: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  error?: string | null;
  timestamp: string;
}

export type ScanProgressEvent = ScanStatusEvent | AnalysisJobEvent;

/**
 * In-process progress bus for scan + analysis-job status transitions.
 *
 * Queue processors emit into this bus and the /scan/:id/stream SSE endpoint
 * fans events out to connected clients, replacing the old 2s polling loops.
 * Events are transient — clients that reconnect should refetch current state
 * once (the SSE channel is a change-notification signal, not a store).
 */
@Injectable()
export class ScanEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScanEventsService.name);
  private readonly events$ = new Subject<ScanProgressEvent>();
  private redis: RedisClientType | null = null;

  async onModuleInit(): Promise<void> {
    // Best-effort Redis publisher for cross-process consumers (MCP/agents).
    // If Redis is unavailable the in-process SSE bus still works.
    try {
      const host = process.env['REDIS_HOST'] || 'localhost';
      const port = process.env['REDIS_PORT'] || '6379';
      const client: RedisClientType = createClient({ url: `redis://${host}:${port}` });
      client.on('error', (err: Error) => this.logger.debug(`Scan-events Redis error: ${err.message}`));
      await client.connect();
      this.redis = client;
      this.logger.log(`Publishing scan events to Redis channel "${SCAN_EVENTS_CHANNEL}"`);
    } catch (err) {
      this.logger.warn(
        `Scan-events Redis publisher disabled: ${(err as Error).message} — in-process SSE still active`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch {
        // ignore
      }
    }
  }

  /** Publish a progress event to any connected streams (in-process + Redis). */
  emit(event: ScanProgressEvent): void {
    this.events$.next(event);
    // Fire-and-forget cross-process publish.
    this.redis?.publish(SCAN_EVENTS_CHANNEL, JSON.stringify(event)).catch(() => {
      /* transient — never block the scan on event delivery */
    });
  }

  /** Observable of progress events scoped to a single scan. */
  streamFor(scanId: string): Observable<ScanProgressEvent> {
    return this.events$.pipe(filter((event) => event.scanId === scanId));
  }
}
