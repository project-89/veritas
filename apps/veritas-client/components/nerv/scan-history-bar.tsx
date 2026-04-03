'use client';

import { useMemo } from 'react';
import type { ScanJob } from '../../lib/api';

interface ScanHistoryBarProps {
  scans: ScanJob[];
  currentScanId?: string;
  onSelectScan?: (scanId: string) => void;
}

function parseTimeRange(tr: string): number {
  const match = tr.match(/^(\d+)([dhm])$/);
  if (!match) return 7 * 86400000;
  const val = parseInt(match[1]!, 10);
  const unit = match[2]!;
  return val * (unit === 'd' ? 86400000 : unit === 'h' ? 3600000 : 60000);
}

export function ScanHistoryBar({ scans, currentScanId, onSelectScan }: ScanHistoryBarProps) {
  const completedScans = useMemo(
    () => scans
      .filter((s) => s.status === 'completed' && s.totalPosts > 0)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [scans],
  );

  // Compute the full time range across all scans
  const { segments, totalStart, totalEnd } = useMemo(() => {
    if (completedScans.length === 0) return { segments: [], totalStart: 0, totalEnd: 0 };

    const segs = completedScans.map((scan) => {
      const created = new Date(scan.createdAt).getTime();
      const rangeMs = parseTimeRange(scan.settings?.timeRange ?? '7d');
      return {
        scanId: scan._id ?? scan.id,
        start: created - rangeMs,
        end: created,
        posts: scan.totalPosts,
        platforms: Object.keys(scan.connectors ?? {}),
        isCurrent: (scan._id ?? scan.id) === currentScanId,
        timeRange: scan.settings?.timeRange ?? '7d',
      };
    });

    const allStart = Math.min(...segs.map((s) => s.start));
    const allEnd = Math.max(...segs.map((s) => s.end));

    return { segments: segs, totalStart: allStart, totalEnd: allEnd };
  }, [completedScans, currentScanId]);

  if (segments.length < 2) return null; // Only show when there's history

  const totalRange = totalEnd - totalStart || 1;

  return (
    <div className="px-4 py-1.5 border-b border-nerv-border/50 bg-nerv-bg">
      <div className="flex items-center gap-2">
        <span className="text-[8px] font-mono uppercase tracking-widest text-nerv-text-muted shrink-0">
          Scan Coverage
        </span>

        {/* Timeline bar */}
        <div className="flex-1 relative h-3 bg-nerv-bg-elevated/30 rounded-sm overflow-hidden">
          {segments.map((seg) => {
            const left = ((seg.start - totalStart) / totalRange) * 100;
            const width = ((seg.end - seg.start) / totalRange) * 100;

            const date = new Date(seg.end).toLocaleDateString([], { month: 'short', day: 'numeric' });

            return (
              <button
                key={seg.scanId}
                onClick={() => onSelectScan?.(seg.scanId)}
                title={`${date} — ${seg.timeRange} scan — ${seg.posts} posts (${seg.platforms.join(', ')})\nClick to load this scan's data`}
                className={`absolute top-0 h-full transition-all group ${
                  seg.isCurrent ? 'z-10' : 'z-0 hover:z-20'
                }`}
                style={{
                  left: `${left}%`,
                  width: `${Math.max(width, 2)}%`,
                  backgroundColor: seg.isCurrent ? '#FF6B2B' : '#555570',
                  opacity: seg.isCurrent ? 1 : 0.4,
                  borderRight: '1px solid rgba(15,15,26,0.5)',
                }}
              >
                <span
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: seg.isCurrent ? '#FF8B4B' : '#00FF41' }}
                />
              </button>
            );
          })}
        </div>

        {/* Date labels */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[8px] font-mono text-nerv-text-muted tabular-nums">
            {new Date(totalStart).toLocaleDateString([], { month: 'short', day: 'numeric' })}
          </span>
          <span className="text-[7px] text-nerv-text-muted">{'\u2192'}</span>
          <span className="text-[8px] font-mono text-nerv-text-muted tabular-nums">
            {new Date(totalEnd).toLocaleDateString([], { month: 'short', day: 'numeric' })}
          </span>
        </div>

        <span className="text-[8px] font-mono text-nerv-text-muted shrink-0">
          {segments.length} scans
        </span>
      </div>
    </div>
  );
}
