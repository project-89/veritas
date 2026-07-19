'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EventDetailFlyout } from '../../components/nerv/event-detail-flyout';
import type { EventFilters } from '../../components/nerv/event-filter-panel';
import { EventFilterPanel } from '../../components/nerv/event-filter-panel';
import { NervStatus } from '../../components/nerv/nerv-status';
import { NervTicker } from '../../components/nerv/nerv-ticker';
import {
  EVENT_COLORS,
  type EventCategory,
  type EventSeverity,
  type GlobalEvent,
} from '../../lib/global-event.types';
import { useEventStream } from '../../lib/use-event-stream';

const CATEGORY_CHIPS: ReadonlyArray<{ key: EventCategory; label: string }> = [
  { key: 'environmental', label: 'ENV' },
  { key: 'political', label: 'POL' },
  { key: 'economic', label: 'ECON' },
  { key: 'media', label: 'MEDIA' },
];
const SEVERITY_RANK: Record<EventSeverity, number> = { critical: 3, high: 2, medium: 1, low: 0 };

// Dynamic import — Three.js requires window
const EventGlobe = dynamic(
  () => import('../../components/nerv/event-globe').then((m) => ({ default: m.EventGlobe })),
  { ssr: false },
);

const TIME_RANGE_MS: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

const ALL_CATEGORIES = new Set<EventCategory>(['environmental', 'political', 'economic', 'media']);
const ALL_SEVERITIES = new Set<EventSeverity>(['low', 'medium', 'high', 'critical']);

function isWorldMapEvent(event: GlobalEvent): boolean {
  if (event.source === 'CoinGecko') return false;
  if (event.metadata.feedCategory === 'crypto') return false;
  return true;
}

export default function WorldMapPage() {
  const { events, connected, error } = useEventStream();
  const [selectedEvent, setSelectedEvent] = useState<GlobalEvent | null>(null);
  const [filters, setFilters] = useState<EventFilters>({
    categories: new Set(ALL_CATEGORIES),
    severities: new Set(ALL_SEVERITIES),
    timeRange: '24h',
  });
  const [search, setSearch] = useState('');
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null);

  // Fly-to handoff from the tactical map (?lat=&lng=). Read from
  // window.location instead of useSearchParams to avoid a Suspense boundary.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lat = Number(params.get('lat'));
    const lng = Number(params.get('lng'));
    if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
      setFocus({ lat, lng });
    }
  }, []);

  // Apply filters client-side
  const filteredEvents = useMemo(() => {
    const now = Date.now();
    const rangeMs = TIME_RANGE_MS[filters.timeRange] ?? 86400000;
    const cutoff = now - rangeMs;
    const q = search.trim().toLowerCase();

    return events.filter((ev) => {
      if (!isWorldMapEvent(ev)) return false;
      if (!filters.categories.has(ev.category)) return false;
      if (!filters.severities.has(ev.severity)) return false;
      const ts = new Date(ev.timestamp).getTime();
      if (ts < cutoff) return false;
      if (
        q &&
        !ev.title.toLowerCase().includes(q) &&
        !ev.location.label.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [events, filters, search]);

  // Live per-category counts (everything but the category filter) for the chip bar.
  const categoryCounts = useMemo(() => {
    const cutoff = Date.now() - (TIME_RANGE_MS[filters.timeRange] ?? 86400000);
    const counts: Record<EventCategory, number> = {
      environmental: 0,
      political: 0,
      economic: 0,
      media: 0,
    };
    for (const ev of events) {
      if (!isWorldMapEvent(ev)) continue;
      if (!filters.severities.has(ev.severity)) continue;
      if (new Date(ev.timestamp).getTime() < cutoff) continue;
      if (counts[ev.category] !== undefined) counts[ev.category] += 1;
    }
    return counts;
  }, [events, filters.timeRange, filters.severities]);

  const toggleCategory = useCallback((cat: EventCategory) => {
    setFilters((f) => {
      const next = new Set(f.categories);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return { ...f, categories: next };
    });
  }, []);

  // Fly-to: swing the globe to the strongest geo-anchored match for the query.
  const runSearch = useCallback(() => {
    if (!search.trim()) {
      setFocus(null);
      return;
    }
    const top = [...filteredEvents]
      .filter((ev) => ev.location.region !== 'global' && ev.location.label !== 'Global')
      .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])[0];
    if (top) setFocus({ lat: top.location.lat, lng: top.location.lng });
  }, [search, filteredEvents]);

  // Ticker items from high/critical events
  const tickerItems = useMemo(() => {
    return filteredEvents
      .filter((ev) => ev.severity === 'high' || ev.severity === 'critical')
      .slice(0, 30)
      .map((ev) => ({
        id: ev.id,
        severity: ev.severity === 'critical' ? 'critical' : 'warning',
        text: `[${ev.category.toUpperCase()}] ${ev.title} — ${ev.location.label}`,
        timestamp: new Date(ev.timestamp).toISOString().slice(11, 16),
      }));
  }, [filteredEvents]);

  const handleEventClick = useCallback((event: GlobalEvent) => {
    setSelectedEvent(event);
  }, []);

  const handleTickerClick = useCallback(
    (id: string) => {
      const ev = events.find((event) => event.id === id);
      if (ev) setSelectedEvent(ev);
    },
    [events],
  );

  return (
    <div className="flex flex-col h-[calc(100vh-49px)] bg-nerv-bg">
      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Filter panel */}
        <EventFilterPanel events={filteredEvents} filters={filters} onFilterChange={setFilters} />

        {/* Center: Globe */}
        <div className="flex-1 relative min-w-0">
          <EventGlobe
            events={filteredEvents}
            onEventClick={handleEventClick}
            focusLocation={focus}
          />

          {/* HUD overlay */}
          <div className="absolute top-3 left-3 pointer-events-none z-10">
            <div className="text-[11px] font-mono uppercase tracking-widest text-nerv-text-muted mb-1">
              Global Event Intelligence
            </div>
            <div className="text-[12px] font-mono text-nerv-orange tabular-nums">
              {filteredEvents.length} EVENTS TRACKED
            </div>
          </div>

          {/* Search (fly-to) + category chips */}
          <div className="absolute top-3 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runSearch();
              }}
              className="flex items-center border border-nerv-border bg-nerv-bg-panel/90 backdrop-blur-sm"
            >
              <span className="pl-2.5 pr-1.5 text-[13px] font-mono text-nerv-orange">{'>'}</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="search a place or keyword — fly there"
                className="w-56 bg-transparent py-1.5 pr-2 text-[12px] font-mono text-nerv-text placeholder:text-nerv-text-muted outline-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setFocus(null);
                  }}
                  className="px-2 text-[12px] font-mono text-nerv-text-muted hover:text-nerv-orange"
                >
                  ✕
                </button>
              )}
              <button
                type="submit"
                className="border-l border-nerv-border px-2.5 py-1.5 text-[11px] font-mono uppercase tracking-wider text-nerv-orange hover:bg-nerv-orange/10"
              >
                fly
              </button>
            </form>

            <div className="flex items-center gap-1.5">
              {CATEGORY_CHIPS.map((chip) => {
                const active = filters.categories.has(chip.key);
                return (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => toggleCategory(chip.key)}
                    className={`flex items-center gap-1.5 rounded-sm border px-2 py-1 text-[10px] font-mono uppercase tracking-wider transition-colors ${
                      active
                        ? 'border-nerv-border bg-nerv-bg-panel/90 text-nerv-text'
                        : 'border-nerv-border/40 bg-nerv-bg-panel/40 text-nerv-text-muted/60'
                    }`}
                  >
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{
                        background: EVENT_COLORS[chip.key],
                        opacity: active ? 1 : 0.35,
                      }}
                    />
                    {chip.label}
                    <span className="tabular-nums opacity-70">{categoryCounts[chip.key]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live indicator */}
          <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
            <NervStatus status={connected ? 'online' : error ? 'critical' : 'offline'} size="sm" />
            <span className="text-[12px] font-mono uppercase tracking-wider text-nerv-text-muted">
              {connected ? 'LIVE' : 'CONNECTING...'}
            </span>
          </div>

          {/* Connection error banner */}
          {error && (
            <div className="absolute top-10 right-3 z-10">
              <div className="px-2.5 py-1.5 bg-nerv-red/10 border border-nerv-red/30 rounded-sm">
                <span className="text-[11px] font-mono text-nerv-red">{error}</span>
              </div>
            </div>
          )}

        </div>

        {/* Right: Detail flyout (conditional) */}
        {selectedEvent && (
          <EventDetailFlyout event={selectedEvent} onClose={() => setSelectedEvent(null)} />
        )}
      </div>

      {/* Bottom: Ticker */}
      <NervTicker items={tickerItems} onItemClick={handleTickerClick} />
    </div>
  );
}
