'use client';

import type { PlatformComparison } from '../../lib/api';
import { NervBadge } from './nerv-badge';
import { NervBar } from './nerv-bar';

export interface PlatformComparisonPanelProps {
  comparison: PlatformComparison | null;
  loading?: boolean;
  onRunComparison?: () => void;
}

const PLATFORM_VARIANTS: Record<
  string,
  'orange' | 'green' | 'blue' | 'purple' | 'amber' | 'red' | 'muted'
> = {
  twitter: 'blue',
  reddit: 'orange',
  youtube: 'red',
  telegram: 'blue',
  facebook: 'blue',
  instagram: 'purple',
  tiktok: 'amber',
};

function sentimentColor(v: number): string {
  if (v > 0.15) return '#00FF41';
  if (v < -0.15) return '#FF3366';
  return '#FF6B2B';
}

export function PlatformComparisonPanel({
  comparison,
  loading = false,
  onRunComparison,
}: PlatformComparisonPanelProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-nerv-orange text-2xl mb-3 animate-pulse">{'\u25C9'}</div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted">
            ANALYZING PLATFORMS...
          </div>
        </div>
      </div>
    );
  }

  if (!comparison) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-nerv-text-muted text-3xl mb-3">{'\u2B21'}</div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted mb-2">
            PLATFORM COMPARISON
          </div>
          <div className="text-[10px] font-mono text-nerv-text-secondary max-w-[320px] leading-relaxed mb-4">
            Run platform comparison to see cross-platform narrative distribution
          </div>
          {onRunComparison && (
            <button
              type="button"
              onClick={onRunComparison}
              className="px-4 py-1.5 text-[9px] font-mono uppercase tracking-wider border border-nerv-orange text-nerv-orange hover:bg-nerv-orange/10 rounded-sm transition-colors"
            >
              RUN COMPARISON
            </button>
          )}
        </div>
      </div>
    );
  }

  const maxPosts = Math.max(...comparison.perPlatform.map((p) => p.postCount), 1);

  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted">
          PLATFORM ANALYSIS
        </span>
        <span className="text-[9px] font-mono text-nerv-text-muted">
          {comparison.platforms.length} platforms
        </span>
      </div>

      {/* Per-platform cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {comparison.perPlatform.map((p) => (
          <div
            key={p.platform}
            className="bg-nerv-bg-panel border border-nerv-border rounded-sm p-3 space-y-2"
          >
            {/* Platform name */}
            <div className="flex items-center justify-between">
              <NervBadge
                label={p.platform.toUpperCase()}
                variant={PLATFORM_VARIANTS[p.platform.toLowerCase()] ?? 'muted'}
                size="md"
              />
              <span className="text-[10px] font-mono tabular-nums text-nerv-text-secondary">
                {p.postCount} posts
              </span>
            </div>

            {/* Volume bar */}
            <NervBar value={p.postCount / maxPosts} color="#FF6B2B" />

            {/* Avg sentiment */}
            <div className="space-y-1">
              <span className="text-[9px] font-mono uppercase tracking-wider text-nerv-text-muted">
                AVG SENTIMENT
              </span>
              <NervBar
                value={(p.avgSentiment + 1) / 2}
                color={sentimentColor(p.avgSentiment)}
                showLabel
              />
            </div>

            {/* Dominant narrative */}
            <div className="space-y-1">
              <span className="text-[9px] font-mono uppercase tracking-wider text-nerv-text-muted">
                DOMINANT NARRATIVE
              </span>
              <div className="text-[10px] font-mono text-nerv-text-secondary leading-snug line-clamp-2">
                {p.dominantNarrative}
              </div>
            </div>

            {/* Top authors */}
            {p.topAuthors.length > 0 && (
              <div className="space-y-1">
                <span className="text-[9px] font-mono uppercase tracking-wider text-nerv-text-muted">
                  TOP AUTHORS
                </span>
                <div className="flex flex-wrap gap-1">
                  {p.topAuthors.slice(0, 5).map((author) => (
                    <span
                      key={author}
                      className="text-[9px] font-mono text-nerv-text-secondary bg-nerv-bg-elevated px-1.5 py-0.5 rounded-sm"
                    >
                      @{author}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Cross-platform narratives */}
      {comparison.crossPlatform.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted">
              CROSS-PLATFORM NARRATIVES
            </span>
            <span className="text-[9px] font-mono text-nerv-text-muted">
              {comparison.crossPlatform.length} shared
            </span>
          </div>

          <div className="space-y-2">
            {comparison.crossPlatform.map((cp) => (
              <div
                key={`${cp.summary}:${cp.platforms.join(',')}`}
                className="bg-nerv-bg-panel border border-nerv-border rounded-sm p-3 space-y-2"
              >
                <div className="text-[10px] font-mono text-nerv-text-secondary leading-snug">
                  {cp.summary}
                </div>
                <div className="flex flex-wrap gap-1 mb-1">
                  {cp.platforms.map((pl) => (
                    <NervBadge
                      key={pl}
                      label={pl.toUpperCase()}
                      variant={PLATFORM_VARIANTS[pl.toLowerCase()] ?? 'muted'}
                      size="sm"
                    />
                  ))}
                </div>
                {/* Sentiment by platform mini bars */}
                <div className="space-y-1">
                  {Object.entries(cp.sentimentByPlatform).map(([pl, sentiment]) => (
                    <div key={pl} className="flex items-center gap-2">
                      <span className="text-[8px] font-mono text-nerv-text-muted w-16 text-right shrink-0 uppercase">
                        {pl}
                      </span>
                      <div className="flex-1">
                        <NervBar
                          value={(sentiment + 1) / 2}
                          color={sentimentColor(sentiment)}
                          height={4}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
