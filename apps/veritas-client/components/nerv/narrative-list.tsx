'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import type { AnalyzedNarrative, AnalysisJob } from '../../lib/api';
import { NervBadge } from './nerv-badge';
import { NervBar } from './nerv-bar';

type SortKey = 'velocity' | 'sentiment' | 'posts' | 'recency';

const VELOCITY_COLORS: Record<string, string> = {
  surging: '#FF6B2B',
  growing: '#00FF41',
  steady: '#555570',
  fading: '#e94560',
};

const VELOCITY_DOT_CLASS: Record<string, string> = {
  surging: 'bg-nerv-orange animate-nerv-pulse',
  growing: 'bg-nerv-green',
  steady: 'bg-nerv-text-muted',
  fading: 'bg-nerv-red opacity-50',
};

const VELOCITY_LABEL: Record<string, string> = {
  surging: 'SURGING',
  growing: 'GROWING',
  steady: 'STEADY',
  fading: 'FADING',
};

const PLATFORM_ABBREV: Record<string, string> = {
  twitter: 'X',
  reddit: 'RD',
  youtube: 'YT',
  facebook: 'FB',
  tiktok: 'TK',
  instagram: 'IG',
  mastodon: 'MD',
};

const PLATFORM_COLOR: Record<string, 'blue' | 'orange' | 'red' | 'purple' | 'muted'> = {
  twitter: 'blue',
  reddit: 'orange',
  youtube: 'red',
  tiktok: 'purple',
  facebook: 'blue',
  instagram: 'purple',
  mastodon: 'muted',
};

interface NarrativeListProps {
  narratives: AnalyzedNarrative[];
  selectedId: string | null;
  onSelect: (id: string | null, shiftKey?: boolean) => void;
  unclusteredCount: number;
  /** Multi-select state for batch analysis */
  selectedNarrativeIds?: string[];
  /** Analysis jobs for showing queue status per narrative */
  analysisJobs?: AnalysisJob[];
  /** Narratives that have been investigated */
  investigatedNarrativeIds?: string[];
  onToggleSelection?: (narrativeId: string) => void;
  onAnalyzeSelected?: () => void;
  onInvestigateSelected?: () => void;
  onClearSelection?: () => void;
}

export function NarrativeList({
  narratives,
  selectedId,
  onSelect,
  unclusteredCount,
  selectedNarrativeIds = [],
  analysisJobs = [],
  investigatedNarrativeIds = [],
  onToggleSelection,
  onAnalyzeSelected,
  onInvestigateSelected,
  onClearSelection,
}: NarrativeListProps) {
  const [sortKey, setSortKey] = useState<SortKey>('velocity');
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Scroll selected narrative into view when selection changes (e.g. from heatmap click)
  useEffect(() => {
    if (selectedId) {
      const el = itemRefs.current.get(selectedId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [selectedId]);

  const sorted = useMemo(() => {
    const arr = [...narratives];
    switch (sortKey) {
      case 'velocity':
        return arr.sort(
          (a, b) => (b.velocity?.postsPerHour ?? 0) - (a.velocity?.postsPerHour ?? 0),
        );
      case 'sentiment':
        return arr.sort((a, b) => a.avgSentiment - b.avgSentiment);
      case 'posts':
        return arr.sort((a, b) => b.postIndices.length - a.postIndices.length);
      case 'recency':
        return arr.sort(
          (a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime(),
        );
      default:
        return arr;
    }
  }, [narratives, sortKey]);

  const maxPosts = useMemo(
    () => Math.max(1, ...narratives.map((n) => n.postIndices.length)),
    [narratives],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Sort controls */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-nerv-border shrink-0">
        <span className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted mr-1">
          Sort:
        </span>
        {(['velocity', 'sentiment', 'posts', 'recency'] as SortKey[]).map((key) => (
          <button
            key={key}
            onClick={() => setSortKey(key)}
            className={[
              'text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-sm transition-colors',
              sortKey === key
                ? 'bg-nerv-orange/20 text-nerv-orange'
                : 'text-nerv-text-muted hover:text-nerv-text-secondary',
            ].join(' ')}
          >
            {key}
          </button>
        ))}
      </div>

      {/* Narrative items */}
      <div className="flex-1 overflow-y-auto">
        {sorted.map((narrative) => {
          const isSelected = selectedId === narrative.id;
          const isChecked = selectedNarrativeIds.includes(narrative.id);
          const trend = narrative.velocity?.trend ?? 'steady';
          const postCount = narrative.postIndices.length;
          const isInvestigated = investigatedNarrativeIds.includes(narrative.id);

          // Check analysis queue status for this narrative
          const narrativeJobs = analysisJobs.filter((j) => j.narrativeIds.includes(narrative.id));
          const hasRunningJob = narrativeJobs.some((j) => j.status === 'running');
          const hasPendingJob = narrativeJobs.some((j) => j.status === 'pending');
          const hasCompletedJob = narrativeJobs.some((j) => j.status === 'completed');
          const hasFailedJob = narrativeJobs.some((j) => j.status === 'failed');

          return (
            <div key={narrative.id} className="flex items-stretch border-b border-nerv-border/50">
              {onToggleSelection && (
                <label className="flex items-center gap-1 px-1.5 cursor-pointer hover:bg-nerv-bg-elevated/40">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onToggleSelection(narrative.id)}
                    className="w-3 h-3 accent-nerv-orange cursor-pointer"
                  />
                  {/* Status indicator dot */}
                  {hasRunningJob && (
                    <span className="w-1.5 h-1.5 rounded-full bg-nerv-orange animate-pulse shrink-0" title="Running" />
                  )}
                  {hasPendingJob && !hasRunningJob && (
                    <span className="w-1.5 h-1.5 rounded-full bg-nerv-text-muted shrink-0" title="Queued" />
                  )}
                  {hasCompletedJob && !hasRunningJob && !hasPendingJob && (
                    <span className="w-1.5 h-1.5 rounded-full bg-nerv-green shrink-0" title="Analyzed" />
                  )}
                  {hasFailedJob && !hasRunningJob && !hasPendingJob && !hasCompletedJob && (
                    <span className="w-1.5 h-1.5 rounded-full bg-nerv-red shrink-0" title="Failed" />
                  )}
                  {isInvestigated && !hasRunningJob && !hasPendingJob && (
                    <span className="text-[8px] text-nerv-green shrink-0" title="Investigated">{'\u2713'}</span>
                  )}
                </label>
              )}
              <button
              ref={(el) => { if (el) itemRefs.current.set(narrative.id, el); }}
              onClick={(e) => onSelect(isSelected ? null : narrative.id, e.shiftKey)}
              className={[
                'w-full text-left px-3 py-2.5 transition-all',
                isSelected
                  ? 'bg-nerv-orange/10 border-l-2 border-l-nerv-orange'
                  : 'border-l-2 border-l-transparent hover:bg-nerv-bg-elevated/40',
              ].join(' ')}
            >
              {/* Row 1: Status dot + summary */}
              <div className="flex items-start gap-2">
                <span
                  className={[
                    'w-2 h-2 rounded-full mt-1 shrink-0',
                    VELOCITY_DOT_CLASS[trend],
                  ].join(' ')}
                />
                <span className="text-[11px] font-mono text-nerv-text leading-snug line-clamp-2">
                  &quot;{narrative.summary}&quot;
                </span>
              </div>

              {/* Row 2: Velocity label, sentiment, volume bar, count */}
              <div className="flex items-center gap-2 mt-1.5 ml-4">
                <span
                  className="text-[9px] font-mono uppercase tracking-wider"
                  style={{ color: VELOCITY_COLORS[trend] }}
                >
                  {trend === 'surging' ? '\u2191\u2191' : trend === 'growing' ? '\u2191' : trend === 'fading' ? '\u2193' : '\u2192'}{' '}
                  {VELOCITY_LABEL[trend]}
                </span>
                <span
                  className={[
                    'text-[9px] font-mono tabular-nums',
                    narrative.avgSentiment > 0.1
                      ? 'text-nerv-green'
                      : narrative.avgSentiment < -0.1
                        ? 'text-nerv-red'
                        : 'text-nerv-text-muted',
                  ].join(' ')}
                >
                  {narrative.avgSentiment >= 0 ? '+' : ''}
                  {narrative.avgSentiment.toFixed(2)}
                </span>
                <div className="flex-1 max-w-[60px]">
                  <NervBar
                    value={postCount / maxPosts}
                    color={VELOCITY_COLORS[trend]}
                    height={4}
                  />
                </div>
                <span className="text-[9px] font-mono text-nerv-text-muted tabular-nums">
                  {postCount}
                </span>
              </div>

              {/* Row 3: Platform chips */}
              <div className="flex items-center gap-1 mt-1 ml-4">
                {Object.entries(narrative.platforms).map(([platform, count]) => (
                  <NervBadge
                    key={platform}
                    label={`${PLATFORM_ABBREV[platform] ?? platform.toUpperCase().slice(0, 2)}(${count})`}
                    variant={PLATFORM_COLOR[platform] ?? 'muted'}
                    size="sm"
                  />
                ))}
              </div>
            </button>
            </div>
          );
        })}
      </div>

      {/* Multi-select toolbar */}
      {selectedNarrativeIds.length > 0 && (
        <div className="px-3 py-2 border-t border-nerv-orange/30 bg-nerv-orange/5 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-mono text-nerv-orange font-bold">
              {selectedNarrativeIds.length} selected
            </span>
            <div className="flex gap-1">
              {onInvestigateSelected && (
                <button
                  onClick={onInvestigateSelected}
                  className="px-2 py-1 text-[9px] font-mono uppercase bg-nerv-orange/20 text-nerv-orange border border-nerv-orange/40 rounded-sm hover:bg-nerv-orange/30 transition-colors"
                >
                  Investigate
                </button>
              )}
              {onAnalyzeSelected && (
                <button
                  onClick={onAnalyzeSelected}
                  className="px-2 py-1 text-[9px] font-mono uppercase bg-nerv-blue/20 text-nerv-blue border border-nerv-blue/40 rounded-sm hover:bg-nerv-blue/30 transition-colors"
                >
                  Full Analysis
                </button>
              )}
              {onClearSelection && (
                <button
                  onClick={onClearSelection}
                  className="px-2 py-1 text-[9px] font-mono uppercase text-nerv-text-muted border border-nerv-border rounded-sm hover:bg-nerv-bg-elevated transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Unclustered count */}
      {unclusteredCount > 0 && (
        <div className="px-3 py-2 border-t border-nerv-border shrink-0">
          <span className="text-[10px] font-mono text-nerv-text-muted">
            {unclusteredCount} unclustered posts
          </span>
        </div>
      )}
    </div>
  );
}
