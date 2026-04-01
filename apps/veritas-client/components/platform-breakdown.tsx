'use client';

import { useMemo } from 'react';
import type { NarrativeCluster } from '../lib/transform';

interface PlatformBreakdownProps {
  narratives: NarrativeCluster[];
}

const PLATFORM_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  twitter: { bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/30' },
  reddit: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
  youtube: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
};

function getPlatformStyle(platform: string) {
  return (
    PLATFORM_COLORS[platform] ?? {
      bg: 'bg-slate-500/10',
      text: 'text-slate-400',
      border: 'border-slate-500/30',
    }
  );
}

interface PlatformRow {
  platform: string;
  total: number;
  segments: Array<{
    narrativeId: string;
    label: string;
    color: string;
    count: number;
    pct: number;
  }>;
}

export function PlatformBreakdown({ narratives }: PlatformBreakdownProps) {
  const rows = useMemo(() => {
    // Collect all platforms and their narrative breakdown
    const platformMap = new Map<
      string,
      Map<string, { label: string; color: string; count: number }>
    >();

    for (const narrative of narratives) {
      for (const [platform, count] of Object.entries(narrative.platforms)) {
        if (!platformMap.has(platform)) {
          platformMap.set(platform, new Map());
        }
        const narMap = platformMap.get(platform)!;
        narMap.set(narrative.id, {
          label: narrative.label,
          color: narrative.color,
          count,
        });
      }
    }

    const result: PlatformRow[] = [];
    for (const [platform, narMap] of platformMap) {
      const total = Array.from(narMap.values()).reduce((s, n) => s + n.count, 0);
      const segments = Array.from(narMap.entries())
        .map(([narrativeId, data]) => ({
          narrativeId,
          label: data.label,
          color: data.color,
          count: data.count,
          pct: total > 0 ? (data.count / total) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count);

      result.push({ platform, total, segments });
    }

    // Sort platforms by total post count descending
    result.sort((a, b) => b.total - a.total);
    return result;
  }, [narratives]);

  if (narratives.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px] text-slate-500">
        No narrative data available.
      </div>
    );
  }

  // Legend
  const legendItems = narratives.map((n) => ({
    id: n.id,
    label: n.label,
    color: n.color,
  }));

  return (
    <div className="space-y-6">
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {legendItems.map((item) => (
          <div key={item.id} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-xs text-slate-400 truncate max-w-[180px]">
              {item.label}
            </span>
          </div>
        ))}
      </div>

      {/* Bars */}
      <div className="space-y-5">
        {rows.map((row) => {
          const style = getPlatformStyle(row.platform);
          return (
            <div key={row.platform} className="space-y-2">
              {/* Platform header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-medium capitalize ${style.text}`}
                  >
                    {row.platform}
                  </span>
                  <span className="text-xs text-slate-600">
                    {row.total.toLocaleString()} posts
                  </span>
                </div>
              </div>

              {/* Stacked bar */}
              <div className="flex h-9 rounded-md overflow-hidden bg-slate-800/50">
                {row.segments.map((seg) => (
                  <div
                    key={seg.narrativeId}
                    className="relative group flex items-center justify-center transition-opacity hover:opacity-90"
                    style={{
                      width: `${Math.max(seg.pct, 1)}%`,
                      backgroundColor: seg.color,
                      opacity: 0.85,
                    }}
                  >
                    {/* Label inside bar if segment is wide enough */}
                    {seg.pct >= 12 && (
                      <span className="text-xs font-medium text-white/90 truncate px-1.5">
                        {seg.count}
                      </span>
                    )}

                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-md text-xs text-slate-200 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-20 shadow-lg">
                      <div className="font-medium" style={{ color: seg.color }}>
                        {seg.label}
                      </div>
                      <div className="text-slate-400 mt-0.5">
                        {seg.count} posts ({seg.pct.toFixed(1)}%)
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Segment labels below bar */}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                {row.segments.map((seg) => (
                  <div
                    key={seg.narrativeId}
                    className="flex items-center gap-1 text-xs text-slate-500"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: seg.color }}
                    />
                    <span className="truncate max-w-[150px]">{seg.label}</span>
                    <span className="text-slate-600">
                      {seg.pct.toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
