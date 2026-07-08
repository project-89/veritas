import { Injectable } from '@nestjs/common';
import { filter, Observable, Subject } from 'rxjs';

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
export class ScanEventsService {
  private readonly events$ = new Subject<ScanProgressEvent>();

  /** Publish a progress event to any connected streams. */
  emit(event: ScanProgressEvent): void {
    this.events$.next(event);
  }

  /** Observable of progress events scoped to a single scan. */
  streamFor(scanId: string): Observable<ScanProgressEvent> {
    return this.events$.pipe(filter((event) => event.scanId === scanId));
  }
}
