'use client';

import { useState, useMemo } from 'react';
import type { EntityAnalysisResponse, EntityDossier, AnalyzedNarrative } from '../../lib/api';
import { NervPanel } from './nerv-panel';
import { NervMetric } from './nerv-metric';
import { NervSparkline } from './nerv-sparkline';
import { NervBar } from './nerv-bar';
import { NervBadge } from './nerv-badge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EntityPanelProps {
  entities: EntityAnalysisResponse | null;
  narratives: AnalyzedNarrative[];
}

type EntityTypeFilter = 'all' | 'person' | 'org' | 'topic' | 'hashtag' | 'mention';

const ENTITY_TYPES: EntityTypeFilter[] = ['all', 'person', 'org', 'topic', 'hashtag', 'mention'];

const TYPE_BADGE_VARIANT: Record<string, 'orange' | 'green' | 'red' | 'blue' | 'amber' | 'purple' | 'muted'> = {
  person: 'blue',
  org: 'purple',
  topic: 'orange',
  hashtag: 'green',
  mention: 'amber',
};

const PLATFORM_COLORS: Record<string, string> = {
  twitter: '#1DA1F2',
  reddit: '#FF5700',
  youtube: '#FF0000',
  facebook: '#1877F2',
  instagram: '#E4405F',
  tiktok: '#00F2EA',
  news: '#FFD700',
  web: '#8888a0',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EntityPanel({ entities, narratives }: EntityPanelProps) {
  const [typeFilter, setTypeFilter] = useState<EntityTypeFilter>('all');
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);

  const dossiers = entities?.dossiers ?? [];

  const filtered = useMemo(() => {
    const sorted = [...dossiers].sort((a, b) => b.totalMentions - a.totalMentions);
    if (typeFilter === 'all') return sorted;
    return sorted.filter((d) => d.type.toLowerCase() === typeFilter);
  }, [dossiers, typeFilter]);

  const selected: EntityDossier | null = useMemo(() => {
    if (!selectedEntity) return filtered[0] ?? null;
    return dossiers.find((d) => d.name === selectedEntity) ?? null;
  }, [selectedEntity, filtered, dossiers]);

  // Auto-select first when filter changes
  const effectiveSelected = selected ?? filtered[0] ?? null;

  if (!entities || dossiers.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-nerv-text-muted text-3xl mb-3">{'\u2B22'}</div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted mb-1">
            ENTITY ANALYSIS
          </div>
          <div className="text-[10px] font-mono text-nerv-text-secondary max-w-[280px] leading-relaxed">
            Entities are analyzed during the pipeline — data will appear once analysis completes.
          </div>
        </div>
      </div>
    );
  }

  const maxMentions = Math.max(...dossiers.map((d) => d.totalMentions), 1);
  const maxCoOccurrence = effectiveSelected
    ? Math.max(...(effectiveSelected.coOccurrences.map((c) => c.frequency)), 1)
    : 1;
  const maxPlatformCount = effectiveSelected
    ? Math.max(...Object.values(effectiveSelected.platformBreakdown), 1)
    : 1;

  return (
    <div className="flex h-full min-h-0">
      {/* Left sidebar: entity list */}
      <div className="w-[220px] shrink-0 border-r border-nerv-border flex flex-col overflow-hidden">
        {/* Type filter */}
        <div className="px-2 py-1.5 border-b border-nerv-border flex flex-wrap gap-1">
          {ENTITY_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={[
                'px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wider rounded-sm transition-colors',
                typeFilter === t
                  ? 'bg-nerv-orange text-nerv-bg-deep font-bold'
                  : 'text-nerv-text-muted hover:text-nerv-text-secondary hover:bg-nerv-bg-elevated/40',
              ].join(' ')}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Entity list */}
        <div className="flex-1 overflow-y-auto nerv-scrollbar">
          {filtered.map((d) => (
            <button
              key={d.name}
              onClick={() => setSelectedEntity(d.name)}
              className={[
                'w-full text-left px-3 py-2 border-b border-nerv-border/50 transition-colors',
                effectiveSelected?.name === d.name
                  ? 'bg-nerv-orange/10 border-l-2 border-l-nerv-orange'
                  : 'hover:bg-nerv-bg-elevated/30',
              ].join(' ')}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[10px] font-mono text-nerv-text truncate flex-1 font-medium">
                  {d.name}
                </span>
                <NervBadge
                  label={d.type.toUpperCase().slice(0, 4)}
                  variant={TYPE_BADGE_VARIANT[d.type.toLowerCase()] ?? 'muted'}
                  size="sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 bg-nerv-bg-elevated rounded-sm overflow-hidden">
                  <div
                    className="h-full bg-nerv-orange/60 rounded-sm"
                    style={{ width: `${(d.totalMentions / maxMentions) * 100}%` }}
                  />
                </div>
                <span className="text-[9px] font-mono tabular-nums text-nerv-text-muted">
                  {d.totalMentions}
                </span>
              </div>
            </button>
          ))}
        </div>

        <div className="px-2 py-1 border-t border-nerv-border">
          <span className="text-[9px] font-mono text-nerv-text-muted">
            {filtered.length}/{dossiers.length} entities
          </span>
        </div>
      </div>

      {/* Right area: dossier */}
      {effectiveSelected ? (
        <div className="flex-1 overflow-y-auto nerv-scrollbar p-3 space-y-3">
          {/* Header */}
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-mono font-bold text-nerv-orange">
              {effectiveSelected.name}
            </h2>
            <NervBadge
              label={effectiveSelected.type.toUpperCase()}
              variant={TYPE_BADGE_VARIANT[effectiveSelected.type.toLowerCase()] ?? 'muted'}
              size="md"
            />
          </div>

          {/* Mentions metric */}
          <div className="grid grid-cols-3 gap-2">
            <NervPanel title="TOTAL MENTIONS">
              <NervMetric
                label="Mentions"
                value={effectiveSelected.totalMentions}
                severity={effectiveSelected.totalMentions > 50 ? 'warning' : 'normal'}
              />
            </NervPanel>
            <NervPanel title="NARRATIVES">
              <NervMetric
                label="Appearances"
                value={effectiveSelected.narrativeAppearances.length}
              />
            </NervPanel>
            <NervPanel title="PLATFORMS">
              <NervMetric
                label="Active"
                value={Object.keys(effectiveSelected.platformBreakdown).length}
              />
            </NervPanel>
          </div>

          {/* Sentiment timeline */}
          {effectiveSelected.sentimentTimeline.length > 1 && (
            <NervPanel title="SENTIMENT TIMELINE">
              <div className="p-3">
                <NervSparkline
                  data={effectiveSelected.sentimentTimeline.map((s) => s.score)}
                  width={500}
                  height={60}
                  color="#00FF41"
                  showEndDot
                />
                <div className="flex justify-between mt-1">
                  <span className="text-[8px] font-mono text-nerv-text-muted">
                    {new Date(effectiveSelected.sentimentTimeline[0].timestamp).toLocaleDateString()}
                  </span>
                  <span className="text-[8px] font-mono text-nerv-text-muted">
                    {new Date(
                      effectiveSelected.sentimentTimeline[
                        effectiveSelected.sentimentTimeline.length - 1
                      ].timestamp,
                    ).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </NervPanel>
          )}

          {/* Platform breakdown */}
          <NervPanel title="PLATFORM BREAKDOWN">
            <div className="p-3 space-y-2">
              {Object.entries(effectiveSelected.platformBreakdown)
                .sort(([, a], [, b]) => b - a)
                .map(([platform, count]) => (
                  <div key={platform} className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-nerv-text-secondary w-16 truncate uppercase">
                      {platform === 'twitter' ? 'X' : platform}
                    </span>
                    <div className="flex-1">
                      <NervBar
                        value={count / maxPlatformCount}
                        color={PLATFORM_COLORS[platform.toLowerCase()] ?? '#8888a0'}
                        showLabel
                      />
                    </div>
                    <span className="text-[10px] font-mono tabular-nums text-nerv-text-muted w-8 text-right">
                      {count}
                    </span>
                  </div>
                ))}
            </div>
          </NervPanel>

          {/* Narrative appearances */}
          {effectiveSelected.narrativeAppearances.length > 0 && (
            <NervPanel title="NARRATIVE APPEARANCES">
              <div className="divide-y divide-nerv-border/50">
                {effectiveSelected.narrativeAppearances.map((na) => {
                  const sentColor =
                    na.avgSentimentTowardEntity > 0.2
                      ? 'text-nerv-green'
                      : na.avgSentimentTowardEntity < -0.2
                        ? 'text-nerv-red'
                        : 'text-nerv-text-muted';
                  return (
                    <div key={na.narrativeId} className="px-3 py-2">
                      <div className="text-[10px] font-mono text-nerv-text leading-relaxed mb-1">
                        {na.narrativeSummary}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[9px] font-mono text-nerv-text-muted">
                          {na.mentionCount} mentions
                        </span>
                        <span className={['text-[9px] font-mono tabular-nums', sentColor].join(' ')}>
                          sentiment: {na.avgSentimentTowardEntity.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </NervPanel>
          )}

          {/* Co-occurrences */}
          {effectiveSelected.coOccurrences.length > 0 && (
            <NervPanel title="CO-OCCURRENCES">
              <div className="p-3 space-y-1.5">
                {effectiveSelected.coOccurrences
                  .sort((a, b) => b.frequency - a.frequency)
                  .slice(0, 15)
                  .map((co) => (
                    <div key={co.entity} className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-nerv-text w-28 truncate">
                        {co.entity}
                      </span>
                      <NervBadge
                        label={co.type.slice(0, 3).toUpperCase()}
                        variant={TYPE_BADGE_VARIANT[co.type.toLowerCase()] ?? 'muted'}
                        size="sm"
                      />
                      <div className="flex-1">
                        <NervBar
                          value={co.frequency / maxCoOccurrence}
                          color="#FF6B2B"
                        />
                      </div>
                      <span className="text-[9px] font-mono tabular-nums text-nerv-text-muted w-6 text-right">
                        {co.frequency}
                      </span>
                    </div>
                  ))}
              </div>
            </NervPanel>
          )}

          {/* Top authors */}
          {effectiveSelected.topAuthors.length > 0 && (
            <NervPanel title="TOP AUTHORS">
              <div className="divide-y divide-nerv-border/50">
                {effectiveSelected.topAuthors.slice(0, 10).map((a) => (
                  <div
                    key={`${a.handle}-${a.platform}`}
                    className="px-3 py-1.5 flex items-center gap-3"
                  >
                    <span className="text-[10px] font-mono text-nerv-blue flex-1 truncate">
                      @{a.handle}
                    </span>
                    <NervBadge
                      label={a.platform === 'twitter' ? 'X' : a.platform.toUpperCase()}
                      variant="muted"
                      size="sm"
                    />
                    <span className="text-[10px] font-mono tabular-nums text-nerv-text-secondary">
                      {a.mentionCount}
                    </span>
                  </div>
                ))}
              </div>
            </NervPanel>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[10px] font-mono text-nerv-text-muted">
            SELECT AN ENTITY
          </span>
        </div>
      )}
    </div>
  );
}
