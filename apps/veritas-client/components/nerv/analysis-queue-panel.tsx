'use client';

import { useMemo, useState } from 'react';
import type { AnalysisJob, AnalysisJobType } from '../../lib/api';

interface AnalysisQueuePanelProps {
  jobs: AnalysisJob[];
  onCancel?: (jobId: string) => void;
  onRetry?: (jobId: string) => void;
}

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  investigation: { label: 'Investigate', color: '#FF6B2B' },
  propaganda: { label: 'Propaganda', color: '#e94560' },
  claims: { label: 'Claims', color: '#0ea5e9' },
  downstream: { label: 'Effects', color: '#00FF41' },
};

function getTypeConfig(type: string) {
  return TYPE_CONFIG[type] ?? { label: type, color: '#888' };
}

// ---------------------------------------------------------------------------
// Aggregated type row — one bar per analysis type
// ---------------------------------------------------------------------------

interface TypeGroup {
  type: AnalysisJobType;
  jobs: AnalysisJob[];
  completed: number;
  failed: number;
  running: number;
  pending: number;
  total: number;
}

function TypeProgressRow({
  group,
  expanded,
  onToggle,
  onCancel,
  onRetry,
}: {
  group: TypeGroup;
  expanded: boolean;
  onToggle: () => void;
  onCancel?: (jobId: string) => void;
  onRetry?: (jobId: string) => void;
}) {
  const config = getTypeConfig(group.type);
  const allDone = group.pending === 0 && group.running === 0;
  const pct = group.total > 0 ? Math.round((group.completed / group.total) * 100) : 0;
  const hasFailures = group.failed > 0;

  return (
    <div>
      {/* Aggregated row */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-nerv-bg-elevated/30 transition-colors"
      >
        {/* Type label */}
        <span
          className="text-[9px] font-mono font-bold uppercase tracking-wider w-20 shrink-0 text-left"
          style={{ color: config.color }}
        >
          {config.label}
        </span>

        {/* Progress bar */}
        <div className="h-1.5 flex-1 bg-nerv-border rounded-full overflow-hidden">
          <div
            className={[
              'h-full rounded-full transition-all duration-700 ease-out',
              group.running > 0 ? 'animate-pulse' : '',
            ].join(' ')}
            style={{
              width: `${pct}%`,
              backgroundColor: hasFailures && allDone ? '#e94560' : config.color,
            }}
          />
        </div>

        {/* Count */}
        <span className="text-[9px] font-mono text-nerv-text-secondary w-10 text-right shrink-0 tabular-nums">
          {group.completed}/{group.total}
        </span>

        {/* Status indicator */}
        {group.running > 0 && (
          <span className="text-[8px] font-mono text-nerv-orange animate-pulse w-16 text-right shrink-0">
            RUNNING
          </span>
        )}
        {allDone && !hasFailures && (
          <span className="text-[8px] font-mono text-nerv-green w-16 text-right shrink-0">
            DONE
          </span>
        )}
        {allDone && hasFailures && (
          <span className="text-[8px] font-mono text-nerv-red w-16 text-right shrink-0">
            {group.failed} FAILED
          </span>
        )}
        {!allDone && group.running === 0 && (
          <span className="text-[8px] font-mono text-nerv-text-muted w-16 text-right shrink-0">
            QUEUED
          </span>
        )}

        {/* Expand indicator */}
        {group.total > 1 && (
          <span className="text-[8px] text-nerv-text-muted shrink-0">
            {expanded ? '\u25B4' : '\u25BE'}
          </span>
        )}
      </button>

      {/* Expanded job details — only when clicked and > 1 job */}
      {expanded && group.total > 1 && (
        <div className="bg-nerv-bg-panel/50 border-t border-nerv-border/30">
          {group.jobs.map((job) => {
            const jId = job._id ?? job.id;
            const duration = job.duration != null ? `${(job.duration / 1000).toFixed(1)}s` : '';
            const label =
              job.input.narrativeSummaries?.[0]?.slice(0, 50) ||
              job.narrativeIds[0]?.slice(0, 20) ||
              'batch';

            return (
              <div
                key={jId}
                className="flex items-center gap-2 px-3 py-1 pl-8 text-[9px] font-mono"
              >
                <span className="text-nerv-text-muted truncate flex-1">{label}</span>
                <StatusDot status={job.status} />
                <span className="text-nerv-text-muted w-10 text-right tabular-nums">
                  {duration}
                </span>
                {job.status === 'failed' && onRetry && (
                  <button
                    type="button"
                    onClick={() => onRetry(jId)}
                    className="text-[8px] px-1 py-0.5 border border-nerv-orange/50 text-nerv-orange hover:bg-nerv-orange/10 rounded-sm"
                  >
                    RETRY
                  </button>
                )}
                {(job.status === 'pending' || job.status === 'running') && onCancel && (
                  <button
                    type="button"
                    onClick={() => onCancel(jId)}
                    className="text-nerv-text-muted hover:text-nerv-red"
                  >
                    {'\u2715'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: 'bg-nerv-text-muted',
    running: 'bg-nerv-orange animate-pulse',
    completed: 'bg-nerv-green',
    failed: 'bg-nerv-red',
    cancelled: 'bg-yellow-500',
  };
  return (
    <span
      className={`w-1.5 h-1.5 rounded-full shrink-0 ${colors[status] ?? 'bg-nerv-text-muted'}`}
    />
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AnalysisQueuePanel({ jobs, onCancel, onRetry }: AnalysisQueuePanelProps) {
  const [expandedType, setExpandedType] = useState<string | null>(null);

  const groups = useMemo(() => {
    const byType = new Map<AnalysisJobType, AnalysisJob[]>();
    for (const job of jobs) {
      const list = byType.get(job.type) ?? [];
      list.push(job);
      byType.set(job.type, list);
    }

    const result: TypeGroup[] = [];
    for (const [type, typeJobs] of byType) {
      result.push({
        type,
        jobs: typeJobs,
        completed: typeJobs.filter((j) => j.status === 'completed').length,
        failed: typeJobs.filter((j) => j.status === 'failed').length,
        running: typeJobs.filter((j) => j.status === 'running').length,
        pending: typeJobs.filter((j) => j.status === 'pending').length,
        total: typeJobs.length,
      });
    }

    // Sort: running first, then pending, then completed
    return result.sort((a, b) => {
      if (a.running > 0 && b.running === 0) return -1;
      if (b.running > 0 && a.running === 0) return 1;
      if (a.pending > 0 && b.pending === 0) return -1;
      if (b.pending > 0 && a.pending === 0) return 1;
      return 0;
    });
  }, [jobs]);

  if (jobs.length === 0) return null;

  const totalCompleted = jobs.filter((j) => j.status === 'completed').length;
  const totalActive = jobs.filter((j) => j.status === 'pending' || j.status === 'running').length;
  const allDone = totalActive === 0;

  return (
    <div
      className={`border border-nerv-border rounded-sm bg-nerv-bg overflow-hidden ${allDone ? 'opacity-80' : ''}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-nerv-border bg-nerv-bg-elevated/30">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted">
            ANALYSIS QUEUE
          </span>
          <span className="text-[9px] font-mono text-nerv-text-secondary tabular-nums">
            {totalCompleted}/{jobs.length}
          </span>
          {totalActive > 0 && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-nerv-orange animate-pulse" />
          )}
        </div>
        {allDone && (
          <span className="text-[8px] font-mono text-nerv-green uppercase tracking-wider">
            COMPLETE
          </span>
        )}
      </div>

      {/* Type rows */}
      <div className="divide-y divide-nerv-border/50">
        {groups.map((group) => (
          <TypeProgressRow
            key={group.type}
            group={group}
            expanded={expandedType === group.type}
            onToggle={() => setExpandedType(expandedType === group.type ? null : group.type)}
            onCancel={onCancel}
            onRetry={onRetry}
          />
        ))}
      </div>
    </div>
  );
}
