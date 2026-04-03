'use client';

import { useMemo, useState } from 'react';
import type { ScanJob } from '../../lib/api';

interface ScanHistoryBarProps {
  scans: ScanJob[];
  currentScanId?: string;
  onSelectScan?: (scanId: string) => void;
  onFillGap?: (startDate: string, endDate: string) => void;
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

interface Segment {
  type: 'data' | 'gap';
  start: number;
  end: number;
  // Only for 'data' segments
  scanId?: string;
  posts?: number;
  timeRange?: string;
  isCurrent?: boolean;
  platforms?: string[];
}

export function ScanHistoryBar({ scans, currentScanId, onSelectScan, onFillGap }: ScanHistoryBarProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const completedScans = useMemo(
    () => scans
      .filter((s) => s.status === 'completed' && s.totalPosts > 0)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [scans],
  );

  // Build a unified timeline with data segments and gaps
  const { segments, totalStart, totalEnd } = useMemo(() => {
    if (completedScans.length === 0) return { segments: [] as Segment[], totalStart: 0, totalEnd: 0 };

    // Convert scans to coverage windows
    const windows = completedScans.map((scan) => {
      const created = new Date(scan.createdAt).getTime();
      const rangeMs = parseTimeRange(scan.settings?.timeRange ?? '7d');
      return {
        start: created - rangeMs,
        end: created,
        scanId: scan._id ?? scan.id,
        posts: scan.totalPosts,
        timeRange: scan.settings?.timeRange ?? '7d',
        isCurrent: (scan._id ?? scan.id) === currentScanId,
        platforms: Object.keys(scan.connectors ?? {}),
      };
    });

    // Sort by start time and merge overlapping windows into a unified timeline
    windows.sort((a, b) => a.start - b.start);

    const allSegments: Segment[] = [];
    let cursor = windows[0]!.start;

    for (const win of windows) {
      // Gap before this window?
      if (win.start > cursor + 3600000) { // >1hr gap counts as a real gap
        allSegments.push({
          type: 'gap',
          start: cursor,
          end: win.start,
        });
      }

      // Data segment
      allSegments.push({
        type: 'data',
        start: Math.max(win.start, cursor),
        end: win.end,
        scanId: win.scanId,
        posts: win.posts,
        timeRange: win.timeRange,
        isCurrent: win.isCurrent,
        platforms: win.platforms,
      });

      cursor = Math.max(cursor, win.end);
    }

    const allStart = allSegments[0]!.start;
    const allEnd = allSegments[allSegments.length - 1]!.end;

    return { segments: allSegments, totalStart: allStart, totalEnd: allEnd };
  }, [completedScans, currentScanId]);

  if (segments.length === 0) return null;
  // Only show if there's meaningful history (multiple data segments or a gap)
  const dataSegments = segments.filter((s) => s.type === 'data');
  if (dataSegments.length < 2) return null;

  const totalRange = totalEnd - totalStart || 1;
  const hovered = hoveredIdx !== null ? segments[hoveredIdx] : null;

  return (
    <div className="px-4 py-1.5 border-b border-nerv-border/50 bg-nerv-bg">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted">
          Data Coverage &middot; {dataSegments.length} scans
          {segments.some((s) => s.type === 'gap') && (
            <span className="text-nerv-amber ml-1">
              &middot; {segments.filter((s) => s.type === 'gap').length} gap{segments.filter((s) => s.type === 'gap').length !== 1 ? 's' : ''}
            </span>
          )}
        </span>
        {hovered ? (
          <span className={`text-[9px] font-mono tabular-nums ${
            hovered.type === 'gap' ? 'text-nerv-amber' :
            hovered.isCurrent ? 'text-nerv-orange' : 'text-nerv-text-secondary'
          }`}>
            {hovered.type === 'gap'
              ? `Missing: ${shortDate(hovered.start)} \u2192 ${shortDate(hovered.end)}`
              : `${shortDateTime(hovered.start)} \u2192 ${shortDateTime(hovered.end)} \u00B7 ${hovered.posts} posts \u00B7 ${hovered.timeRange}`}
          </span>
        ) : (
          <span className="text-[9px] font-mono text-nerv-text-muted tabular-nums">
            {shortDate(totalStart)} {'\u2192'} {shortDate(totalEnd)}
          </span>
        )}
      </div>

      {/* Timeline */}
      <svg width="100%" height="16" className="overflow-visible">
        {/* Background track */}
        <line x1="0" y1="8" x2="100%" y2="8" stroke="#2a2a45" strokeWidth="1" />

        {/* Segments */}
        {segments.map((seg, i) => {
          const x1Pct = ((seg.start - totalStart) / totalRange) * 100;
          const x2Pct = ((seg.end - totalStart) / totalRange) * 100;
          const widthPct = Math.max(x2Pct - x1Pct, 0.5);
          const isHovered = hoveredIdx === i;

          if (seg.type === 'gap') {
            return (
              <g
                key={`gap-${i}`}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                onClick={() => onFillGap?.(new Date(seg.start).toISOString(), new Date(seg.end).toISOString())}
                style={{ cursor: onFillGap ? 'pointer' : 'default' }}
              >
                <rect x={`${x1Pct}%`} y="0" width={`${widthPct}%`} height="16" fill="transparent" />
                {/* Dashed line for gap */}
                <line
                  x1={`${x1Pct}%`}
                  y1="8"
                  x2={`${x2Pct}%`}
                  y2="8"
                  stroke={isHovered ? '#f59e0b' : '#f59e0b'}
                  strokeWidth={isHovered ? 3 : 1.5}
                  strokeDasharray="4 3"
                  opacity={isHovered ? 0.8 : 0.3}
                />
              </g>
            );
          }

          const barColor = seg.isCurrent ? '#FF6B2B' : isHovered ? '#00FF41' : '#555570';
          const barOpacity = seg.isCurrent ? 1 : isHovered ? 0.8 : 0.4;

          return (
            <g
              key={`data-${i}`}
              onClick={() => seg.scanId && onSelectScan?.(seg.scanId)}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{ cursor: 'pointer' }}
            >
              <rect x={`${x1Pct}%`} y="0" width={`${widthPct}%`} height="16" fill="transparent" />
              <line
                x1={`${x1Pct}%`}
                y1="8"
                x2={`${x2Pct}%`}
                y2="8"
                stroke={barColor}
                strokeWidth={isHovered ? 5 : 3}
                opacity={barOpacity}
                strokeLinecap="round"
              />
            </g>
          );
        })}

        {/* Dots layer: only at boundaries between segments (not inside) */}
        {(() => {
          // Collect unique boundary timestamps
          const boundaries = new Map<number, { isCurrent: boolean; isHovered: boolean }>();
          for (let i = 0; i < segments.length; i++) {
            const seg = segments[i]!;
            if (seg.type !== 'data') continue;
            const isHov = hoveredIdx === i;
            const update = (ts: number) => {
              const existing = boundaries.get(ts);
              boundaries.set(ts, {
                isCurrent: (existing?.isCurrent ?? false) || (seg.isCurrent ?? false),
                isHovered: (existing?.isHovered ?? false) || isHov,
              });
            };
            update(seg.start);
            update(seg.end);
          }

          return Array.from(boundaries.entries()).map(([ts, state]) => {
            const xPct = ((ts - totalStart) / totalRange) * 100;
            const r = state.isHovered ? 4.5 : 3;
            const fill = state.isCurrent ? '#FF6B2B' : state.isHovered ? '#00FF41' : '#3a3a5f';
            const stroke = state.isCurrent ? '#FF8B4B' : state.isHovered ? '#00FF41' : '#555570';

            return (
              <circle
                key={`dot-${ts}`}
                cx={`${xPct}%`}
                cy="8"
                r={r}
                fill={fill}
                stroke={stroke}
                strokeWidth="1.5"
                style={{ transition: 'r 0.15s, fill 0.15s', pointerEvents: 'none' }}
              />
            );
          });
        })()}
      </svg>
    </div>
  );
}
