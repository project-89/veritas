'use client';

import { useCallback } from 'react';
import type { ScanJob, ConnectorStatus } from '../../lib/api';

// ---------------------------------------------------------------------------
// Platform display config
// ---------------------------------------------------------------------------

const PLATFORM_CONFIG: Record<string, { label: string; color: string }> = {
  reddit: { label: 'Reddit', color: '#FF4500' },
  twitter: { label: 'X (Twitter)', color: '#1DA1F2' },
  youtube: { label: 'YouTube', color: '#FF0000' },
  facebook: { label: 'Facebook', color: '#1877F2' },
  rss: { label: 'RSS', color: '#FFA500' },
  web: { label: 'Web', color: '#4CAF50' },
};

function getPlatformConfig(platform: string) {
  return PLATFORM_CONFIG[platform] ?? { label: platform, color: '#888' };
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: ConnectorStatus['status'] }) {
  const config: Record<string, { bg: string; text: string; label: string; animate?: boolean }> = {
    queued: { bg: 'bg-nerv-text-muted/20', text: 'text-nerv-text-muted', label: 'QUEUED' },
    running: { bg: 'bg-nerv-orange/20', text: 'text-nerv-orange', label: 'RUNNING', animate: true },
    done: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'DONE' },
    failed: { bg: 'bg-nerv-red/20', text: 'text-nerv-red', label: 'FAILED' },
    cancelled: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'CANCELLED' },
  };
  const c = config[status] ?? config.queued!;
  return (
    <span
      className={[
        'px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wider rounded-sm',
        c.bg,
        c.text,
        c.animate ? 'animate-nerv-pulse' : '',
      ].join(' ')}
    >
      {c.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

function ConnectorProgressBar({
  status,
  color,
}: {
  status: ConnectorStatus['status'];
  color: string;
}) {
  const widthMap: Record<string, string> = {
    queued: 'w-0',
    running: 'w-1/2',
    done: 'w-full',
    failed: 'w-full',
    cancelled: 'w-full',
  };

  const bgColor =
    status === 'failed'
      ? 'bg-nerv-red'
      : status === 'cancelled'
        ? 'bg-yellow-500'
        : undefined;

  return (
    <div className="h-1 flex-1 bg-nerv-border rounded-full overflow-hidden">
      <div
        className={[
          'h-full rounded-full transition-all duration-700 ease-out',
          widthMap[status] ?? 'w-0',
          status === 'running' ? 'animate-pulse' : '',
        ].join(' ')}
        style={{ backgroundColor: bgColor ?? color }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connector row
// ---------------------------------------------------------------------------

function ConnectorRow({
  platform,
  connector,
  onRetry,
}: {
  platform: string;
  connector: ConnectorStatus;
  onRetry: (platform: string) => void;
}) {
  const config = getPlatformConfig(platform);
  const durationStr =
    connector.duration != null ? `${(connector.duration / 1000).toFixed(1)}s` : null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      {/* Platform label */}
      <span
        className="text-[9px] font-mono font-bold uppercase tracking-wider w-16 shrink-0"
        style={{ color: config.color }}
      >
        {config.label}
      </span>

      {/* Progress bar */}
      <ConnectorProgressBar status={connector.status} color={config.color} />

      {/* Status badge */}
      <StatusBadge status={connector.status} />

      {/* Post count */}
      <span className="text-[9px] font-mono text-nerv-text-secondary w-14 text-right shrink-0 tabular-nums">
        {connector.postCount > 0 ? `${connector.postCount} posts` : ''}
      </span>

      {/* Duration */}
      <span className="text-[8px] font-mono text-nerv-text-muted w-10 text-right shrink-0 tabular-nums">
        {durationStr ?? ''}
      </span>

      {/* Retry button for failed connectors */}
      {connector.status === 'failed' && (
        <button
          onClick={() => onRetry(platform)}
          className="text-[8px] font-mono uppercase tracking-wider px-1.5 py-0.5 border border-nerv-orange/50 text-nerv-orange hover:bg-nerv-orange/10 rounded-sm transition-colors shrink-0"
        >
          RETRY
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface ScanProgressProps {
  scanJob: ScanJob | null;
  onCancel: () => void;
  onRetry: (connector: string) => void;
}

export function ScanProgress({ scanJob, onCancel, onRetry }: ScanProgressProps) {
  const handleRetry = useCallback(
    (platform: string) => {
      onRetry(platform);
    },
    [onRetry],
  );

  if (!scanJob) {
    return null;
  }

  const connectorEntries = Object.entries(scanJob.connectors);
  const doneCount = connectorEntries.filter(([, c]) => c.status === 'done').length;
  const totalCount = connectorEntries.length;
  const isActive = scanJob.status === 'pending' || scanJob.status === 'running';
  const hasFailures = connectorEntries.some(([, c]) => c.status === 'failed');

  return (
    <div className="border border-nerv-border rounded-sm bg-nerv-bg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-nerv-border bg-nerv-bg-elevated/30">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted">
            SCAN PROGRESS
          </span>
          <span className="text-[9px] font-mono text-nerv-text-secondary tabular-nums">
            {doneCount}/{totalCount}
          </span>
          {isActive && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-nerv-orange animate-pulse" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {scanJob.totalPosts > 0 && (
            <span className="text-[9px] font-mono text-nerv-orange tabular-nums">
              {scanJob.totalPosts} posts
            </span>
          )}
          {isActive && (
            <button
              onClick={onCancel}
              className="text-[8px] font-mono uppercase tracking-wider px-1.5 py-0.5 border border-nerv-red/50 text-nerv-red hover:bg-nerv-red/10 rounded-sm transition-colors"
            >
              CANCEL
            </button>
          )}
          {hasFailures && !isActive && (
            <span className="text-[8px] font-mono text-nerv-red uppercase tracking-wider">
              PARTIAL FAILURE
            </span>
          )}
          {scanJob.status === 'completed' && (
            <span className="text-[8px] font-mono text-green-400 uppercase tracking-wider">
              COMPLETE
            </span>
          )}
        </div>
      </div>

      {/* Connector rows */}
      <div className="divide-y divide-nerv-border/50">
        {connectorEntries.map(([platform, connector]) => (
          <ConnectorRow
            key={platform}
            platform={platform}
            connector={connector}
            onRetry={handleRetry}
          />
        ))}
      </div>

      {/* Error display for failed connectors */}
      {connectorEntries
        .filter(([, c]) => c.status === 'failed' && c.error)
        .map(([platform, c]) => (
          <div
            key={`error-${platform}`}
            className="px-3 py-1 bg-nerv-red/5 border-t border-nerv-red/20"
          >
            <span className="text-[8px] font-mono text-nerv-red">
              {getPlatformConfig(platform).label}: {c.error}
            </span>
          </div>
        ))}
    </div>
  );
}
