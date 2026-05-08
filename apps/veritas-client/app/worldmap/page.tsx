'use client';

import dynamic from 'next/dynamic';
import { useCallback, useMemo, useState } from 'react';
import { EventDetailFlyout } from '../../components/nerv/event-detail-flyout';
import type { EventFilters } from '../../components/nerv/event-filter-panel';
import { EventFilterPanel } from '../../components/nerv/event-filter-panel';
import { NervStatus } from '../../components/nerv/nerv-status';
import { NervTicker } from '../../components/nerv/nerv-ticker';
import type { EventCategory, EventSeverity, GlobalEvent } from '../../lib/global-event.types';
import { useEventStream } from '../../lib/use-event-stream';

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

  // Apply filters client-side
  const filteredEvents = useMemo(() => {
    const now = Date.now();
    const rangeMs = TIME_RANGE_MS[filters.timeRange] ?? 86400000;
    const cutoff = now - rangeMs;

    return events.filter((ev) => {
      if (!isWorldMapEvent(ev)) return false;
      if (!filters.categories.has(ev.category)) return false;
      if (!filters.severities.has(ev.severity)) return false;
      const ts = new Date(ev.timestamp).getTime();
      if (ts < cutoff) return false;
      return true;
    });
  }, [events, filters]);

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
    <div className="flex flex-col h-[calc(100vh-44px)] bg-nerv-bg">
      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Filter panel */}
        <EventFilterPanel events={filteredEvents} filters={filters} onFilterChange={setFilters} />

        {/* Center: Globe */}
        <div className="flex-1 relative min-w-0">
          <EventGlobe events={filteredEvents} onEventClick={handleEventClick} />

          {/* HUD overlay */}
          <div className="absolute top-3 left-3 pointer-events-none z-10">
            <div className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted mb-1">
              Global Event Intelligence
            </div>
            <div className="text-[10px] font-mono text-nerv-orange tabular-nums">
              {filteredEvents.length} EVENTS TRACKED
            </div>
          </div>

          {/* Live indicator */}
          <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
            <NervStatus status={connected ? 'online' : error ? 'critical' : 'offline'} size="sm" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-nerv-text-muted">
              {connected ? 'LIVE' : 'CONNECTING...'}
            </span>
          </div>

          {/* Connection error banner */}
          {error && (
            <div className="absolute top-10 right-3 z-10">
              <div className="px-2.5 py-1.5 bg-nerv-red/10 border border-nerv-red/30 rounded-sm">
                <span className="text-[9px] font-mono text-nerv-red">{error}</span>
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="absolute bottom-3 left-3 pointer-events-none z-10">
            <div className="flex items-center gap-3 text-[8px] font-mono uppercase tracking-wider text-nerv-text-muted">
              <span className="flex items-center gap-1">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ background: '#00E676' }}
                />
                ENV
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ background: '#FF1744' }}
                />
                POL
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ background: '#FFD600' }}
                />
                ECON
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ background: '#2979FF' }}
                />
                MEDIA
              </span>
            </div>
          </div>
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
