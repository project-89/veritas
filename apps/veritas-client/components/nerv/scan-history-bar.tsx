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

function shortDate(ts: number): string {
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function ScanHistoryBar({ scans, currentScanId, onSelectScan }: ScanHistoryBarProps) {
  const completedScans = useMemo(
    () => scans
      .filter((s) => s.status === 'completed' && s.totalPosts > 0)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [scans],
  );

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

  if (segments.length < 2) return null;

  const totalRange = totalEnd - totalStart || 1;

  return (
    <div className="px-4 py-1.5 border-b border-nerv-border/50 bg-nerv-bg">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-[8px] font-mono uppercase tracking-widest text-nerv-text-muted">
          Scan Coverage
        </span>
        <span className="text-[8px] font-mono text-nerv-text-muted">
          {segments.length} scans &middot; {shortDate(totalStart)} {'\u2192'} {shortDate(totalEnd)}
        </span>
      </div>

      {/* Timeline bar with date labels */}
      <div className="relative" style={{ height: 28 }}>
        {/* Track background */}
        <div className="absolute top-0 left-0 right-0 h-3 bg-nerv-bg-elevated/30 rounded-sm" />

        {/* Segments */}
        {segments.map((seg) => {
          const left = ((seg.start - totalStart) / totalRange) * 100;
          const width = ((seg.end - seg.start) / totalRange) * 100;
          const startLabel = shortDate(seg.start);
          const endLabel = shortDate(seg.end);

          return (
            <div key={seg.scanId} className="absolute top-0" style={{ left: `${left}%`, width: `${Math.max(width, 3)}%` }}>
              {/* Bar segment */}
              <button
                onClick={() => onSelectScan?.(seg.scanId)}
                title={`${startLabel} \u2192 ${endLabel} (${seg.timeRange})\n${seg.posts} posts \u00B7 ${seg.platforms.join(', ')}\nClick to load`}
                className={`w-full h-3 rounded-sm transition-all group relative overflow-hidden ${
                  seg.isCurrent ? 'z-10' : 'z-0 hover:z-20'
                }`}
                style={{
                  backgroundColor: seg.isCurrent ? '#FF6B2B' : '#555570',
                  opacity: seg.isCurrent ? 1 : 0.5,
                }}
              >
                <span
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-sm"
                  style={{ backgroundColor: seg.isCurrent ? '#FF8B4B' : '#00FF41' }}
                />
              </button>

              {/* Date range label below the segment */}
              <div className="flex justify-between mt-0.5 px-px" style={{ minWidth: 0 }}>
                <span className={`text-[7px] font-mono tabular-nums truncate ${
                  seg.isCurrent ? 'text-nerv-orange' : 'text-nerv-text-muted'
                }`}>
                  {startLabel}
                </span>
                {width > 8 && (
                  <span className={`text-[7px] font-mono tabular-nums truncate ${
                    seg.isCurrent ? 'text-nerv-orange' : 'text-nerv-text-muted'
                  }`}>
                    {endLabel}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
