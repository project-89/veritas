'use client';

import { useMemo } from 'react';
import type { AnalyzedNarrative, RawPost } from '../../lib/api';

interface NarrativeEmergenceProps {
  narratives: AnalyzedNarrative[];
  posts: RawPost[];
  timeRange?: string | null;
  scanCreatedAt?: string | null;
  selectedNarrativeId: string | null;
  onSelectNarrative: (id: string | null) => void;
}

const NUM_BUCKETS = 32;

const TREND_STYLE: Record<AnalyzedNarrative['velocity']['trend'], { label: string; cls: string }> = {
  surging: { label: 'SURGING', cls: 'text-nerv-orange border-nerv-orange/50' },
  growing: { label: 'GROWING', cls: 'text-nerv-amber border-nerv-amber/50' },
  steady: { label: 'STEADY', cls: 'text-nerv-blue border-nerv-blue/40' },
  fading: { label: 'FADING', cls: 'text-nerv-text-muted border-nerv-text-muted/40' },
};

/** Resolve the shared time window the same way TemporalHeatmap does, so the two
 *  views line up: explicit absolute/relative scan window when available, else
 *  the natural post range. */
function resolveWindow(
  posts: RawPost[],
  timeRange: string | null | undefined,
  scanCreatedAt: string | null | undefined,
): { minTime: number; maxTime: number } | null {
  const stamps = posts
    .map((p) => new Date(p.timestamp).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  if (stamps.length === 0) return null;

  const relMatch = typeof timeRange === 'string' ? timeRange.match(/^(\d+)([dhm])$/) : null;
  const absMatch =
    typeof timeRange === 'string'
      ? timeRange.match(/^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/)
      : null;

  const first = stamps[0] ?? Date.now();
  const last = stamps[stamps.length - 1] ?? first;

  if (absMatch) {
    return {
      minTime: new Date(`${absMatch[1]}T00:00:00`).getTime(),
      maxTime: new Date(`${absMatch[2]}T23:59:59`).getTime(),
    };
  }
  if (relMatch) {
    const value = Number.parseInt(relMatch[1] ?? '0', 10);
    const unit = relMatch[2];
    const durationMs =
      unit === 'd' ? value * 86400000 : unit === 'h' ? value * 3600000 : value * 60000;
    const end = scanCreatedAt ? new Date(scanCreatedAt).getTime() : last;
    return { minTime: end - durationMs, maxTime: end };
  }
  return { minTime: first, maxTime: last };
}

interface EmergenceRow {
  narrative: AnalyzedNarrative;
  postCount: number;
  buckets: number[];
  peakBucket: number;
  emergenceBucket: number;
  origin: RawPost | null;
  topPlatforms: Array<[string, number]>;
}

export function NarrativeEmergence({
  narratives,
  posts,
  timeRange,
  scanCreatedAt,
  selectedNarrativeId,
  onSelectNarrative,
}: NarrativeEmergenceProps) {
  const model = useMemo(() => {
    const window = resolveWindow(posts, timeRange, scanCreatedAt);
    if (!window || narratives.length === 0) return null;

    const range = Math.max(window.maxTime - window.minTime, 3600000);
    const bucketSize = range / NUM_BUCKETS;

    const rows: EmergenceRow[] = narratives.map((narrative) => {
      const nPosts = narrative.postIndices
        .map((i) => posts[i])
        .filter((p): p is RawPost => Boolean(p));

      const buckets = new Array<number>(NUM_BUCKETS).fill(0);
      let earliest: RawPost | null = null;
      let earliestTime = Number.POSITIVE_INFINITY;
      const platformCounts = new Map<string, number>();

      for (const p of nPosts) {
        const t = new Date(p.timestamp).getTime();
        if (Number.isFinite(t)) {
          const bi = Math.min(NUM_BUCKETS - 1, Math.max(0, Math.floor((t - window.minTime) / bucketSize)));
          buckets[bi] = (buckets[bi] ?? 0) + 1;
          if (t < earliestTime) {
            earliestTime = t;
            earliest = p;
          }
        }
        platformCounts.set(p.platform, (platformCounts.get(p.platform) ?? 0) + 1);
      }

      let peakBucket = 0;
      let emergenceBucket = -1;
      for (let i = 0; i < NUM_BUCKETS; i++) {
        if ((buckets[i] ?? 0) > (buckets[peakBucket] ?? 0)) peakBucket = i;
        if (emergenceBucket === -1 && (buckets[i] ?? 0) > 0) emergenceBucket = i;
      }

      const topPlatforms = [...platformCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

      return {
        narrative,
        postCount: nPosts.length,
        buckets,
        peakBucket,
        emergenceBucket: emergenceBucket === -1 ? 0 : emergenceBucket,
        origin: earliest,
        topPlatforms,
      };
    });

    // Rank by dominance (post volume). No fabricated parent/child edges — the
    // clustering carries none; emergence order on the shared axis is the signal.
    rows.sort((a, b) => b.postCount - a.postCount);

    const totalClustered = rows.reduce((sum, r) => sum + r.postCount, 0);
    const maxBucketVal = Math.max(1, ...rows.flatMap((r) => r.buckets));

    // Axis tick labels (~5 evenly spaced)
    const ticks: Array<{ pct: number; label: string }> = [];
    const spanDays = range / 86400000;
    for (let i = 0; i <= 4; i++) {
      const t = window.minTime + (range * i) / 4;
      const d = new Date(t);
      ticks.push({
        pct: (i / 4) * 100,
        label:
          spanDays <= 1
            ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : d.toLocaleDateString([], { month: 'short', day: 'numeric' }),
      });
    }

    return { rows, totalClustered, maxBucketVal, ticks, window };
  }, [narratives, posts, timeRange, scanCreatedAt]);

  if (!model) {
    return (
      <div className="flex items-center justify-center h-full px-8">
        <span className="text-[12px] font-mono text-nerv-text-muted uppercase tracking-widest animate-nerv-pulse">
          Awaiting narrative clustering — run analysis to trace emergence
        </span>
      </div>
    );
  }

  const { rows, totalClustered, maxBucketVal, ticks } = model;
  const dominant = rows[0];
  const dominantShare =
    dominant && totalClustered > 0 ? Math.round((dominant.postCount / totalClustered) * 100) : 0;

  return (
    <div className="h-full overflow-auto p-4 font-mono">
      {/* Header / real dominance metric */}
      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-[13px] uppercase tracking-widest text-nerv-text">
          Narrative Emergence
        </span>
        <span className="text-[11px] text-nerv-text-muted">
          {rows.length} narrative{rows.length === 1 ? '' : 's'} · {totalClustered} clustered posts
        </span>
        {dominant && (
          <span className="text-[11px] text-nerv-text-secondary">
            dominant thread holds{' '}
            <span className="text-nerv-orange">{dominantShare}%</span> of clustered volume
          </span>
        )}
      </div>

      {/* Shared time axis */}
      <div className="relative ml-[320px] mb-1 h-4 border-b border-nerv-border">
        {ticks.map((t) => (
          <span
            key={t.pct}
            className="absolute -translate-x-1/2 text-[9px] text-nerv-text-muted whitespace-nowrap"
            style={{ left: `${t.pct}%` }}
          >
            {t.label}
          </span>
        ))}
      </div>

      {/* Lanes */}
      <div className="space-y-1.5">
        {rows.map((row, idx) => {
          const isDominant = idx === 0;
          const selected = selectedNarrativeId === row.narrative.id;
          const trend = TREND_STYLE[row.narrative.velocity.trend];
          const emerging = row.narrative.supportLevel === 'emerging';
          return (
            <button
              type="button"
              key={row.narrative.id}
              onClick={() => onSelectNarrative(selected ? null : row.narrative.id)}
              className={`flex w-full items-stretch gap-0 rounded-sm border text-left transition-colors ${
                selected
                  ? 'border-nerv-orange/70 bg-nerv-orange/5'
                  : 'border-nerv-border/60 hover:border-nerv-border hover:bg-nerv-bg-elevated/40'
              }`}
            >
              {/* Meta column */}
              <div className="w-[320px] shrink-0 border-r border-nerv-border/50 p-2">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-[9px] px-1 py-px rounded-sm border ${
                      isDominant
                        ? 'text-nerv-orange border-nerv-orange/50'
                        : 'text-nerv-text-muted border-nerv-text-muted/30'
                    }`}
                  >
                    {isDominant ? 'DOMINANT' : `#${idx + 1}`}
                  </span>
                  <span className={`text-[9px] px-1 py-px rounded-sm border ${trend.cls}`}>
                    {trend.label}
                  </span>
                  {emerging && (
                    <span
                      className="text-[9px] px-1 py-px rounded-sm border text-nerv-amber border-nerv-amber/40"
                      title="Emerging cluster — thin support; treat as provisional"
                    >
                      EMERGING
                    </span>
                  )}
                  <span className="ml-auto text-[10px] text-nerv-text-secondary">
                    {row.postCount} posts
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-nerv-text-secondary line-clamp-2">
                  {row.narrative.summary}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1 text-[9px] text-nerv-text-muted">
                  {row.topPlatforms.map(([platform, count]) => (
                    <span key={platform} className="rounded-sm bg-nerv-bg-elevated px-1 py-px">
                      {platform} {count}
                    </span>
                  ))}
                </div>
                {row.origin && (
                  <div className="mt-1 truncate text-[9px] text-nerv-text-muted">
                    origin:{' '}
                    <span className="text-nerv-text-secondary">
                      @{row.origin.authorHandle || row.origin.authorName || 'unknown'}
                    </span>{' '}
                    on {row.origin.platform} ·{' '}
                    {new Date(row.origin.timestamp).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                    })}
                    {row.origin.url && (
                      <a
                        href={row.origin.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="ml-1 text-nerv-blue hover:underline"
                      >
                        ↗
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* Timeline strip on the shared axis */}
              <div className="relative flex-1 self-stretch">
                <div className="flex h-full items-end gap-px px-1 py-2">
                  {row.buckets.map((count, bi) => {
                    const h = count > 0 ? 12 + (count / maxBucketVal) * 100 : 0;
                    const isEmergence = bi === row.emergenceBucket && count > 0;
                    const isPeak = bi === row.peakBucket && count > 0;
                    return (
                      <div
                        key={bi}
                        className="flex-1 min-w-px relative"
                        style={{ height: '100%' }}
                        title={count > 0 ? `${count} post${count === 1 ? '' : 's'}` : ''}
                      >
                        {count > 0 && (
                          <div
                            className={`absolute bottom-0 w-full rounded-t-sm ${
                              isPeak
                                ? 'bg-nerv-orange/80'
                                : isDominant
                                  ? 'bg-nerv-orange/40'
                                  : 'bg-nerv-blue/40'
                            }`}
                            style={{ height: `${h}%` }}
                          />
                        )}
                        {isEmergence && (
                          <div className="absolute bottom-0 left-0 h-full w-px bg-nerv-amber/70" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Legend — honest about what the view does and doesn't assert */}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-nerv-border/50 pt-2 text-[9px] text-nerv-text-muted">
        <span>
          <span className="text-nerv-amber">│</span> emergence (first activity)
        </span>
        <span>
          <span className="text-nerv-orange">▉</span> peak bucket
        </span>
        <span>ranked by volume (dominance); order left→right is real time</span>
        <span className="text-nerv-text-muted/70">
          branch relationships are not asserted — clustering carries no parent/child links
        </span>
      </div>
    </div>
  );
}
