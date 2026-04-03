'use client';

import { useMemo, useState } from 'react';
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

function shortDateTime(ts: number): string {
  const d = new Date(ts);
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function ScanHistoryBar({ scans, currentScanId, onSelectScan }: ScanHistoryBarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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
  const hovered = segments.find((s) => s.scanId === hoveredId);

  return (
    <div className="px-4 py-1.5 border-b border-nerv-border/50 bg-nerv-bg">
      {/* Header + hover info */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted">
          Scan Coverage &middot; {segments.length} scans
        </span>
        {hovered ? (
          <span className={`text-[9px] font-mono tabular-nums ${hovered.isCurrent ? 'text-nerv-orange' : 'text-nerv-text-secondary'}`}>
            {shortDateTime(hovered.start)} {'\u2192'} {shortDateTime(hovered.end)} &middot; {hovered.posts} posts &middot; {hovered.timeRange}
          </span>
        ) : (
          <span className="text-[9px] font-mono text-nerv-text-muted tabular-nums">
            {shortDate(totalStart)} {'\u2192'} {shortDate(totalEnd)}
          </span>
        )}
      </div>

      {/* Timeline track */}
      <div className="relative h-4">
        {/* Background track line */}
        <div className="absolute top-[7px] left-0 right-0 h-[2px] bg-nerv-border/50 rounded-full" />

        {/* Segments as colored spans with node dots at start/end */}
        {segments.map((seg) => {
          const leftPct = ((seg.start - totalStart) / totalRange) * 100;
          const widthPct = ((seg.end - seg.start) / totalRange) * 100;
          const isHovered = hoveredId === seg.scanId;

          return (
            <button
              key={seg.scanId}
              onClick={() => onSelectScan?.(seg.scanId)}
              onMouseEnter={() => setHoveredId(seg.scanId)}
              onMouseLeave={() => setHoveredId(null)}
              className="absolute top-0 h-full group"
              style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 1.5)}%` }}
            >
              {/* Span bar */}
              <div
                className="absolute top-[5px] left-0 right-0 h-[6px] rounded-full transition-all"
                style={{
                  backgroundColor: seg.isCurrent ? '#FF6B2B' : isHovered ? '#00FF41' : '#555570',
                  opacity: seg.isCurrent ? 1 : isHovered ? 0.9 : 0.4,
                }}
              />

              {/* Start node dot */}
              <div
                className="absolute top-[3px] left-0 w-[10px] h-[10px] rounded-full border-2 transition-all -translate-x-1/2"
                style={{
                  backgroundColor: seg.isCurrent ? '#FF6B2B' : isHovered ? '#00FF41' : '#3a3a5f',
                  borderColor: seg.isCurrent ? '#FF8B4B' : isHovered ? '#00FF41' : '#555570',
                  transform: `translateX(-50%) scale(${isHovered ? 1.3 : 1})`,
                }}
              />

              {/* End node dot */}
              <div
                className="absolute top-[3px] right-0 w-[10px] h-[10px] rounded-full border-2 transition-all translate-x-1/2"
                style={{
                  backgroundColor: seg.isCurrent ? '#FF6B2B' : isHovered ? '#00FF41' : '#3a3a5f',
                  borderColor: seg.isCurrent ? '#FF8B4B' : isHovered ? '#00FF41' : '#555570',
                  transform: `translateX(50%) scale(${isHovered ? 1.3 : 1})`,
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
