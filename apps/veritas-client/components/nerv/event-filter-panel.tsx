'use client';

import type { EventCategory, EventSeverity, GlobalEvent } from '../../lib/global-event.types';
import { EVENT_COLORS } from '../../lib/global-event.types';

export interface EventFilters {
  categories: Set<EventCategory>;
  severities: Set<EventSeverity>;
  timeRange: '1h' | '6h' | '24h' | '7d';
}

export interface EventFilterPanelProps {
  events: GlobalEvent[];
  filters: EventFilters;
  onFilterChange: (filters: EventFilters) => void;
}

const CATEGORIES: EventCategory[] = ['environmental', 'political', 'economic', 'media'];
const SEVERITIES: EventSeverity[] = ['low', 'medium', 'high', 'critical'];
const TIME_RANGES = ['1h', '6h', '24h', '7d'] as const;

const CATEGORY_LABELS: Record<EventCategory, string> = {
  environmental: 'ENV',
  political: 'POL',
  economic: 'ECON',
  media: 'MEDIA',
};

const SEVERITY_COLORS: Record<EventSeverity, string> = {
  low: 'text-nerv-text-muted border-nerv-border',
  medium: 'text-nerv-amber border-nerv-amber/40',
  high: 'text-nerv-orange border-nerv-orange/40',
  critical: 'text-nerv-red border-nerv-red/40',
};

export function EventFilterPanel({ events, filters, onFilterChange }: EventFilterPanelProps) {
  const toggleCategory = (cat: EventCategory) => {
    const next = new Set(filters.categories);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    onFilterChange({ ...filters, categories: next });
  };

  const toggleSeverity = (sev: EventSeverity) => {
    const next = new Set(filters.severities);
    if (next.has(sev)) next.delete(sev);
    else next.add(sev);
    onFilterChange({ ...filters, severities: next });
  };

  const setTimeRange = (range: EventFilters['timeRange']) => {
    onFilterChange({ ...filters, timeRange: range });
  };

  // Count events per category (from filtered events)
  const categoryCounts: Record<EventCategory, number> = {
    environmental: 0,
    political: 0,
    economic: 0,
    media: 0,
  };
  for (const ev of events) {
    if (categoryCounts[ev.category] !== undefined) {
      categoryCounts[ev.category]++;
    }
  }

  return (
    <div className="w-[240px] shrink-0 bg-nerv-bg-panel border-r border-nerv-border flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-nerv-border">
        <div className="text-[12px] font-mono uppercase tracking-widest text-nerv-text-secondary">
          Event Filters
        </div>
      </div>

      {/* Category toggles */}
      <div className="px-3 py-3 border-b border-nerv-border">
        <div className="text-[11px] font-mono uppercase tracking-widest text-nerv-text-muted mb-2">
          Category
        </div>
        <div className="flex flex-col gap-1.5">
          {CATEGORIES.map((cat) => {
            const active = filters.categories.has(cat);
            return (
              <button
                type="button"
                key={cat}
                onClick={() => toggleCategory(cat)}
                className={[
                  'flex items-center justify-between px-2 py-1.5 rounded-sm text-[12px] font-mono uppercase tracking-wider transition-colors',
                  active
                    ? 'bg-nerv-bg-elevated text-nerv-text'
                    : 'text-nerv-text-muted hover:bg-nerv-bg-elevated/40',
                ].join(' ')}
              >
                <span className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      background: active ? EVENT_COLORS[cat] : 'transparent',
                      border: `1.5px solid ${EVENT_COLORS[cat]}`,
                    }}
                  />
                  {CATEGORY_LABELS[cat]}
                </span>
                {/* Counts come from the client-side event cache, which can fill
                    between SSR and hydration — the mismatch is expected. */}
                <span className="text-[11px] text-nerv-text-muted tabular-nums" suppressHydrationWarning>
                  {categoryCounts[cat]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Severity toggles */}
      <div className="px-3 py-3 border-b border-nerv-border">
        <div className="text-[11px] font-mono uppercase tracking-widest text-nerv-text-muted mb-2">
          Severity
        </div>
        <div className="flex flex-wrap gap-1">
          {SEVERITIES.map((sev) => {
            const active = filters.severities.has(sev);
            return (
              <button
                type="button"
                key={sev}
                onClick={() => toggleSeverity(sev)}
                className={[
                  'px-2 py-1 rounded-sm text-[11px] font-mono uppercase tracking-wider border transition-colors',
                  active
                    ? SEVERITY_COLORS[sev]
                    : 'text-nerv-text-muted border-nerv-border/50 hover:border-nerv-border',
                  active ? 'bg-nerv-bg-elevated' : '',
                ].join(' ')}
              >
                {sev}
              </button>
            );
          })}
        </div>
      </div>

      {/* Time range */}
      <div className="px-3 py-3">
        <div className="text-[11px] font-mono uppercase tracking-widest text-nerv-text-muted mb-2">
          Time Range
        </div>
        <div className="flex gap-1">
          {TIME_RANGES.map((range) => {
            const active = filters.timeRange === range;
            return (
              <button
                type="button"
                key={range}
                onClick={() => setTimeRange(range)}
                className={[
                  'flex-1 px-1.5 py-1 rounded-sm text-[11px] font-mono uppercase tracking-wider transition-colors',
                  active
                    ? 'bg-nerv-orange/15 text-nerv-orange border border-nerv-orange/30'
                    : 'text-nerv-text-muted border border-nerv-border/50 hover:border-nerv-border',
                ].join(' ')}
              >
                {range}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
