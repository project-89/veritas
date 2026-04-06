'use client';

import type { NarrativeComparison } from '../../lib/api';
import { NervBadge } from './nerv-badge';
import { NervBar } from './nerv-bar';

export interface NarrativeComparisonPanelProps {
  comparison: NarrativeComparison | null;
  loading?: boolean;
  onClose?: () => void;
}

function sentimentColor(v: number): string {
  if (v > 0.15) return 'var(--nerv-green)';
  if (v < -0.15) return 'var(--nerv-red)';
  return 'var(--nerv-orange)';
}

export function NarrativeComparisonPanel({
  comparison,
  loading = false,
  onClose,
}: NarrativeComparisonPanelProps) {
  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-nerv-bg-deep/70 backdrop-blur-sm">
        <div className="bg-nerv-bg-panel border border-nerv-border rounded-sm p-8 text-center">
          <div className="text-nerv-orange text-2xl mb-3 animate-pulse">{'\u25C9'}</div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted">
            COMPARING NARRATIVES...
          </div>
        </div>
      </div>
    );
  }

  if (!comparison) return null;

  const { narrativeA, narrativeB, similarity, sentimentDelta, velocityComparison, platformOverlap, authorOverlap, differenceAnalysis } = comparison;

  const faster = velocityComparison.fasterNarrative;
  const fasterLabel = faster === 'a' ? 'A faster' : faster === 'b' ? 'B faster' : 'Equal';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-nerv-bg-deep/70 backdrop-blur-sm">
      <div className="bg-nerv-bg border border-nerv-border rounded-sm w-full max-w-2xl max-h-[85vh] overflow-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-nerv-border">
          <span className="text-[10px] font-mono uppercase tracking-widest text-nerv-text-secondary">
            NARRATIVE COMPARISON
          </span>
          {onClose && (
            <button
              onClick={onClose}
              className="text-[10px] font-mono text-nerv-text-muted hover:text-nerv-text-secondary transition-colors px-2 py-0.5 border border-nerv-border rounded-sm hover:border-nerv-text-muted"
            >
              CLOSE
            </button>
          )}
        </div>

        <div className="p-4 space-y-4">
          {/* Side-by-side summaries */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-nerv-bg-panel border border-nerv-border rounded-sm p-3">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="inline-block w-3 h-1 rounded-sm shrink-0 bg-nerv-orange"
                />
                <span className="text-[9px] font-mono uppercase tracking-wider text-nerv-text-muted">
                  NARRATIVE A
                </span>
              </div>
              <div className="text-[10px] font-mono text-nerv-text-secondary leading-snug">
                {narrativeA.summary}
              </div>
            </div>
            <div className="bg-nerv-bg-panel border border-nerv-border rounded-sm p-3">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="inline-block w-3 h-1 rounded-sm shrink-0 bg-nerv-blue"
                />
                <span className="text-[9px] font-mono uppercase tracking-wider text-nerv-text-muted">
                  NARRATIVE B
                </span>
              </div>
              <div className="text-[10px] font-mono text-nerv-text-secondary leading-snug">
                {narrativeB.summary}
              </div>
            </div>
          </div>

          {/* Similarity score */}
          <div className="bg-nerv-bg-panel border border-nerv-border rounded-sm p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono uppercase tracking-wider text-nerv-text-muted">
                SIMILARITY
              </span>
              <span className="text-[11px] font-mono font-bold tabular-nums text-nerv-orange">
                {Math.round(similarity * 100)}%
              </span>
            </div>
            <NervBar value={similarity} color="var(--nerv-orange)" showLabel={false} />
          </div>

          {/* Sentiment delta */}
          <div className="bg-nerv-bg-panel border border-nerv-border rounded-sm p-3">
            <span className="text-[9px] font-mono uppercase tracking-wider text-nerv-text-muted block mb-1">
              SENTIMENT DELTA
            </span>
            <div className="flex items-center gap-3">
              <NervBar
                value={(Math.abs(sentimentDelta) + 1) / 2}
                color={sentimentColor(sentimentDelta)}
                showLabel
              />
              <span className="text-[10px] font-mono text-nerv-text-secondary shrink-0">
                {sentimentDelta > 0 ? 'A more positive' : sentimentDelta < 0 ? 'B more positive' : 'Similar'}
              </span>
            </div>
          </div>

          {/* Velocity comparison */}
          <div className="bg-nerv-bg-panel border border-nerv-border rounded-sm p-3">
            <span className="text-[9px] font-mono uppercase tracking-wider text-nerv-text-muted block mb-2">
              VELOCITY
            </span>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <span className="text-[9px] font-mono text-nerv-text-muted">A</span>
                <div className="text-[11px] font-mono font-bold tabular-nums text-nerv-orange">
                  {velocityComparison.aPostsPerHour.toFixed(2)}
                  <span className="text-[8px] text-nerv-text-muted font-normal ml-1">posts/hr</span>
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-[9px] font-mono text-nerv-text-muted">B</span>
                <div className="text-[11px] font-mono font-bold tabular-nums text-nerv-blue">
                  {velocityComparison.bPostsPerHour.toFixed(2)}
                  <span className="text-[8px] text-nerv-text-muted font-normal ml-1">posts/hr</span>
                </div>
              </div>
            </div>
            <NervBadge
              label={fasterLabel.toUpperCase()}
              variant={faster === 'equal' ? 'muted' : faster === 'a' ? 'orange' : 'blue'}
              size="sm"
            />
          </div>

          {/* Platform overlap - Venn-style */}
          <div className="bg-nerv-bg-panel border border-nerv-border rounded-sm p-3">
            <span className="text-[9px] font-mono uppercase tracking-wider text-nerv-text-muted block mb-2">
              PLATFORM OVERLAP
            </span>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-[8px] font-mono uppercase tracking-wider text-nerv-text-muted mb-1">
                  ONLY A
                </div>
                <div className="flex flex-wrap justify-center gap-1">
                  {platformOverlap.onlyA.length > 0 ? (
                    platformOverlap.onlyA.map((p) => (
                      <NervBadge key={p} label={p.toUpperCase()} variant="orange" size="sm" />
                    ))
                  ) : (
                    <span className="text-[9px] font-mono text-nerv-text-muted">{'\u2014'}</span>
                  )}
                </div>
              </div>
              <div className="border-x border-nerv-border px-2">
                <div className="text-[8px] font-mono uppercase tracking-wider text-nerv-text-muted mb-1">
                  SHARED
                </div>
                <div className="flex flex-wrap justify-center gap-1">
                  {platformOverlap.shared.length > 0 ? (
                    platformOverlap.shared.map((p) => (
                      <NervBadge key={p} label={p.toUpperCase()} variant="green" size="sm" />
                    ))
                  ) : (
                    <span className="text-[9px] font-mono text-nerv-text-muted">{'\u2014'}</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-[8px] font-mono uppercase tracking-wider text-nerv-text-muted mb-1">
                  ONLY B
                </div>
                <div className="flex flex-wrap justify-center gap-1">
                  {platformOverlap.onlyB.length > 0 ? (
                    platformOverlap.onlyB.map((p) => (
                      <NervBadge key={p} label={p.toUpperCase()} variant="blue" size="sm" />
                    ))
                  ) : (
                    <span className="text-[9px] font-mono text-nerv-text-muted">{'\u2014'}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Author overlap */}
          <div className="bg-nerv-bg-panel border border-nerv-border rounded-sm p-3">
            <span className="text-[9px] font-mono uppercase tracking-wider text-nerv-text-muted block mb-2">
              AUTHOR OVERLAP
            </span>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <div className="text-[8px] font-mono uppercase tracking-wider text-nerv-text-muted mb-1">
                  ONLY A ({authorOverlap.onlyA.length})
                </div>
                <div className="flex flex-wrap gap-1 max-h-20 overflow-auto">
                  {authorOverlap.onlyA.slice(0, 8).map((a) => (
                    <span
                      key={a}
                      className="text-[9px] font-mono text-nerv-text-secondary bg-nerv-bg-elevated px-1.5 py-0.5 rounded-sm"
                    >
                      @{a}
                    </span>
                  ))}
                  {authorOverlap.onlyA.length > 8 && (
                    <span className="text-[8px] font-mono text-nerv-text-muted">
                      +{authorOverlap.onlyA.length - 8} more
                    </span>
                  )}
                </div>
              </div>
              <div className="border-x border-nerv-border px-2">
                <div className="text-[8px] font-mono uppercase tracking-wider text-nerv-text-muted mb-1">
                  SHARED ({authorOverlap.shared.length})
                </div>
                <div className="flex flex-wrap gap-1 max-h-20 overflow-auto">
                  {authorOverlap.shared.slice(0, 8).map((a) => (
                    <span
                      key={a}
                      className="text-[9px] font-mono font-bold text-nerv-green bg-nerv-green/10 px-1.5 py-0.5 rounded-sm"
                    >
                      @{a}
                    </span>
                  ))}
                  {authorOverlap.shared.length > 8 && (
                    <span className="text-[8px] font-mono text-nerv-text-muted">
                      +{authorOverlap.shared.length - 8} more
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-[8px] font-mono uppercase tracking-wider text-nerv-text-muted mb-1">
                  ONLY B ({authorOverlap.onlyB.length})
                </div>
                <div className="flex flex-wrap gap-1 max-h-20 overflow-auto">
                  {authorOverlap.onlyB.slice(0, 8).map((a) => (
                    <span
                      key={a}
                      className="text-[9px] font-mono text-nerv-text-secondary bg-nerv-bg-elevated px-1.5 py-0.5 rounded-sm"
                    >
                      @{a}
                    </span>
                  ))}
                  {authorOverlap.onlyB.length > 8 && (
                    <span className="text-[8px] font-mono text-nerv-text-muted">
                      +{authorOverlap.onlyB.length - 8} more
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* LLM difference analysis */}
          {differenceAnalysis && (
            <div className="bg-nerv-bg-panel border border-nerv-border rounded-sm p-3">
              <span className="text-[9px] font-mono uppercase tracking-wider text-nerv-text-muted block mb-2">
                DIFFERENCE ANALYSIS
              </span>
              <div className="text-[10px] font-mono text-nerv-text-secondary leading-relaxed whitespace-pre-wrap">
                {differenceAnalysis}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
