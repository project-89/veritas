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
      <div className="flex items-center justify-between mb-1">
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

      {/* Timeline: SVG-based for precise rendering */}
      <svg width="100%" height="20" className="overflow-visible">
        {/* Background track */}
        <line x1="0" y1="10" x2="100%" y2="10" stroke="#2a2a45" strokeWidth="1" />

        {/* Layer 1: Hit areas + bars (rendered first, underneath) */}
        {segments.map((seg) => {
          const x1Pct = ((seg.start - totalStart) / totalRange) * 100;
          const x2Pct = ((seg.end - totalStart) / totalRange) * 100;
          const isHovered = hoveredId === seg.scanId;
          const barColor = seg.isCurrent ? '#FF6B2B' : isHovered ? '#00FF41' : '#555570';
          const barOpacity = seg.isCurrent ? 1 : isHovered ? 0.8 : 0.35;

          return (
            <g
              key={`bar-${seg.scanId}`}
              onClick={() => onSelectScan?.(seg.scanId)}
              onMouseEnter={() => setHoveredId(seg.scanId)}
              onMouseLeave={() => setHoveredId(null)}
              style={{ cursor: 'pointer' }}
            >
              <rect
                x={`${x1Pct}%`}
                y="0"
                width={`${Math.max(x2Pct - x1Pct, 1)}%`}
                height="20"
                fill="transparent"
              />
              <line
                x1={`${x1Pct}%`}
                y1="10"
                x2={`${x2Pct}%`}
                y2="10"
                stroke={barColor}
                strokeWidth={isHovered ? 4 : 3}
                opacity={barOpacity}
                strokeLinecap="round"
              />
            </g>
          );
        })}

        {/* Layer 2: All dots (rendered last, always on top of all bars) */}
        {segments.map((seg) => {
          const x1Pct = ((seg.start - totalStart) / totalRange) * 100;
          const x2Pct = ((seg.end - totalStart) / totalRange) * 100;
          const isHovered = hoveredId === seg.scanId;
          const dotRadius = isHovered ? 5 : 3.5;
          const dotColor = seg.isCurrent ? '#FF6B2B' : isHovered ? '#00FF41' : '#555570';
          const strokeColor = seg.isCurrent ? '#FF8B4B' : isHovered ? '#00FF41' : '#3a3a5f';

          return (
            <g
              key={`dots-${seg.scanId}`}
              onClick={() => onSelectScan?.(seg.scanId)}
              onMouseEnter={() => setHoveredId(seg.scanId)}
              onMouseLeave={() => setHoveredId(null)}
              style={{ cursor: 'pointer' }}
            >
              <circle
                cx={`${x1Pct}%`}
                cy="10"
                r={dotRadius}
                fill={dotColor}
                stroke={strokeColor}
                strokeWidth="1.5"
                style={{ transition: 'r 0.15s, fill 0.15s' }}
              />
              <circle
                cx={`${x2Pct}%`}
                cy="10"
                r={dotRadius}
                fill={dotColor}
                stroke={strokeColor}
                strokeWidth="1.5"
                style={{ transition: 'r 0.15s, fill 0.15s' }}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
