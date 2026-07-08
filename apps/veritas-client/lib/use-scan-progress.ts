import { useEffect, useRef, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
// EventSource cannot send headers — the backend ApiKeyGuard accepts ?apiKey=
// as a query parameter specifically for SSE streams.
const API_KEY = process.env.NEXT_PUBLIC_VERITAS_API_KEY;

/** Per-connector scan status transition streamed from /scan/:id/stream. */
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

/** Analysis job status transition streamed from /scan/:id/stream. */
export interface AnalysisJobEvent {
  kind: 'analysis-job';
  scanId: string;
  jobId: string;
  jobType: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  error?: string | null;
  timestamp: string;
}

export type ScanStreamStatus = 'idle' | 'connecting' | 'open' | 'error';

export interface UseScanProgressHandlers {
  onScanStatus?: (event: ScanStatusEvent) => void;
  onAnalysisJob?: (event: AnalysisJobEvent) => void;
}

/**
 * Subscribes to the scan progress SSE channel for a scan.
 *
 * Replaces the old 2-second polling loops: the server pushes a scan-status
 * event on every connector transition and an analysis-job event on every job
 * transition. Consumers typically respond with a single event-driven refetch.
 *
 * Passing a null scanId keeps the stream closed. The EventSource reconnects
 * automatically after transient errors; `status` reflects the connection so
 * callers can run a slow fallback poll while the stream is down ('error').
 */
export function useScanProgress(
  scanId: string | null,
  handlers: UseScanProgressHandlers,
): { status: ScanStreamStatus } {
  const [status, setStatus] = useState<ScanStreamStatus>('idle');

  // Keep the latest handlers in a ref so changing callbacks doesn't tear
  // down and reopen the EventSource connection.
  const handlersRef = useRef<UseScanProgressHandlers>(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (!scanId) {
      setStatus('idle');
      return undefined;
    }

    setStatus('connecting');

    const params = new URLSearchParams();
    if (API_KEY) params.set('apiKey', API_KEY);
    const qs = params.toString();
    const url = `${API_BASE}/scan/${encodeURIComponent(scanId)}/stream${qs ? `?${qs}` : ''}`;
    const es = new EventSource(url);

    es.addEventListener('scan-status', (e) => {
      try {
        const event = JSON.parse(e.data) as ScanStatusEvent;
        handlersRef.current.onScanStatus?.(event);
      } catch {
        // Ignore malformed events
      }
    });

    es.addEventListener('analysis-job', (e) => {
      try {
        const event = JSON.parse(e.data) as AnalysisJobEvent;
        handlersRef.current.onAnalysisJob?.(event);
      } catch {
        // Ignore malformed events
      }
    });

    es.onopen = () => setStatus('open');
    // EventSource retries automatically — surface the degraded state so the
    // caller can fall back to slow polling until the stream recovers.
    es.onerror = () => setStatus('error');

    return () => {
      es.close();
      setStatus('idle');
    };
  }, [scanId]);

  return { status };
}
