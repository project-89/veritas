'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { NervBadge, NervMetric, NervPanel, NervTicker } from '../components/nerv';
import { HexTacticalMap } from '../components/nerv/hex-tactical-map';
import {
  createOrGetInvestigation,
  fetchInvestigations,
  fetchSurgeZones,
  fetchUnreadAlertCount,
  getRecentScans,
  type Investigation,
  type ScanJob,
  type SurgeZone,
} from '../lib/api';
import type { GlobalEvent } from '../lib/global-event.types';
import { prefetchRecentEvents } from '../lib/use-event-stream';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const SEVERITY_VARIANT: Record<string, 'red' | 'amber' | 'blue' | 'muted'> = {
  critical: 'red',
  high: 'red',
  warning: 'amber',
  medium: 'amber',
  info: 'blue',
  low: 'blue',
};

// ---------------------------------------------------------------------------
// Command Overview — the operational home. Answers "what's happening + start
// something new" at a glance, with search one keystroke away.
// ---------------------------------------------------------------------------

export default function CommandHome() {
  const router = useRouter();
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [recentScans, setRecentScans] = useState<ScanJob[]>([]);
  const [events, setEvents] = useState<GlobalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [launching, setLaunching] = useState(false);
  const [view, setView] = useState<'command' | 'tactical'>('command');
  const [surge, setSurge] = useState<SurgeZone[]>([]);

  // Remember the last-used home view (Command dashboard vs Tactical hex map).
  useEffect(() => {
    const v = localStorage.getItem('veritas-home-view');
    if (v === 'tactical' || v === 'command') setView(v);
  }, []);
  const selectView = useCallback((v: 'command' | 'tactical') => {
    setView(v);
    localStorage.setItem('veritas-home-view', v);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchInvestigations().catch(() => [] as Investigation[]),
      fetchUnreadAlertCount().catch(() => 0),
      getRecentScans(8).catch(() => [] as ScanJob[]),
      prefetchRecentEvents().catch(() => [] as GlobalEvent[]),
      fetchSurgeZones().catch(() => [] as SurgeZone[]),
    ]).then(([invs, count, scans, evts, surges]) => {
      if (cancelled) return;
      setInvestigations(invs);
      setUnreadCount(count as number);
      setRecentScans(scans);
      setEvents(evts);
      setSurge(surges);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Region-grouped ticker under the tactical map: the map shows WHERE (the
  // hexes carry geography), the ticker says WHAT per region. Regions come
  // from the last comma segment of the location label ("Denali, Alaska" →
  // ALASKA), using the same placement-honesty filter as the map itself.
  const regionTicker = useMemo(() => {
    interface Group {
      key: string;
      count: number;
      cats: Map<string, number>;
      topSev: number;
      latest: number;
      latSum: number;
      lngSum: number;
    }
    const rank: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 };
    const groups = new Map<string, Group>();
    for (const e of events) {
      const lat = e.location?.lat;
      const lng = e.location?.lng;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (e.location.region === 'global' || e.location.label === 'Global') continue;
      if (e.source.startsWith('RSS:') && e.location.region !== 'geocoded') continue;
      const label = e.location.label ?? '';
      const seg = label.includes(',') ? label.slice(label.lastIndexOf(',') + 1).trim() : label;
      const key = (seg || 'Unknown').toUpperCase();
      let g = groups.get(key);
      if (!g) {
        g = { key, count: 0, cats: new Map(), topSev: 0, latest: 0, latSum: 0, lngSum: 0 };
        groups.set(key, g);
      }
      g.count++;
      g.cats.set(e.category, (g.cats.get(e.category) ?? 0) + 1);
      g.topSev = Math.max(g.topSev, rank[e.severity] ?? 0);
      g.latest = Math.max(g.latest, new Date(e.timestamp).getTime() || 0);
      g.latSum += lat;
      g.lngSum += lng;
    }
    const CAT_ABBR: Record<string, string> = {
      environmental: 'ENV',
      political: 'POL',
      economic: 'ECON',
      media: 'MEDIA',
    };
    const sorted = [...groups.values()]
      .sort((a, b) => b.topSev - a.topSev || b.count - a.count)
      .slice(0, 20);
    const coords = new Map<string, { lat: number; lng: number }>();
    const items = sorted.map((g) => {
      coords.set(g.key, { lat: g.latSum / g.count, lng: g.lngSum / g.count });
      const breakdown = [...g.cats.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([c, n]) => `${n} ${CAT_ABBR[c] ?? c.toUpperCase()}`)
        .join(' · ');
      return {
        id: g.key,
        severity: g.topSev >= 2 ? 'critical' : g.count >= 8 ? 'warning' : 'info',
        text: `${g.key} — ${breakdown}`,
        timestamp: g.latest ? new Date(g.latest).toISOString().slice(11, 16) : '',
      };
    });
    return { items, coords };
  }, [events]);

  const handleRegionTickerClick = useCallback(
    (id: string) => {
      const c = regionTicker.coords.get(id);
      if (c) router.push(`/worldmap?lat=${c.lat.toFixed(3)}&lng=${c.lng.toFixed(3)}`);
    },
    [regionTicker, router],
  );

  // Quick launch: create/find the investigation with sensible defaults and
  // drop into the workspace. "configure" (below) is the full search form.
  const launch = useCallback(async () => {
    const q = query.trim();
    if (!q || launching) return;
    setLaunching(true);
    const params = new URLSearchParams({ q, mode: 'topic', timeRange: '7d', fresh: '1' });
    try {
      const inv = await createOrGetInvestigation(q, { timeRange: '7d', searchMode: 'topic' });
      const id = inv._id ?? inv.id;
      router.push(id ? `/investigate/${id}?${params}` : `/results?${params}`);
    } catch {
      router.push(`/results?${params}`);
    }
  }, [query, launching, router]);

  const activeScans = useMemo(
    () => recentScans.filter((s) => s.status === 'running' || s.status === 'pending'),
    [recentScans],
  );
  const recentInvestigations = useMemo(
    () =>
      [...investigations]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 8),
    [investigations],
  );

  return (
    <div className="min-h-[calc(100vh-49px)] lg:h-[calc(100vh-49px)] lg:overflow-hidden bg-nerv-bg-deep text-nerv-text px-4 pt-4 pb-8 sm:px-6 lg:px-8 flex flex-col">
      <div className="mx-auto max-w-[1400px] w-full flex flex-col lg:flex-1 lg:min-h-0">
        {/* Command bar */}
        <header className="mb-4 shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[13px] font-mono text-nerv-orange tracking-widest">{'//'}</span>
            <h1 className="text-[15px] font-mono font-semibold tracking-[0.2em] text-nerv-text">
              VERITAS
            </h1>
            <span className="text-[13px] font-mono text-nerv-text-muted tracking-[0.2em]">
              {view === 'tactical' ? 'TACTICAL' : 'COMMAND'}
            </span>
            {/* View toggle — Command dashboard vs holographic hex map */}
            <div className="ml-auto flex items-center rounded-sm border border-nerv-border overflow-hidden">
              {(['command', 'tactical'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => selectView(v)}
                  className={`px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider transition-colors ${
                    view === v
                      ? 'bg-nerv-orange/15 text-nerv-orange'
                      : 'text-nerv-text-muted hover:text-nerv-text'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="flex items-stretch border border-nerv-border-active bg-nerv-bg-panel focus-within:border-nerv-orange transition-colors">
              <span className="flex items-center pl-3 pr-2 text-nerv-orange font-mono text-[15px]">
                {'>'}
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') launch();
                }}
                // biome-ignore lint/a11y/noAutofocus: command console — search is the primary action on load.
                autoFocus
                placeholder="search a narrative, topic, or @handle…"
                className="flex-1 bg-transparent py-3 pr-3 text-[15px] font-mono text-nerv-text placeholder:text-nerv-text-muted outline-none"
              />
              <button
                type="button"
                onClick={launch}
                disabled={!query.trim() || launching}
                className="px-5 text-[13px] font-mono uppercase tracking-wider text-nerv-orange border-l border-nerv-border-active hover:bg-nerv-orange/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {launching ? 'LAUNCHING…' : 'INVESTIGATE'}
              </button>
            </div>
            <div className="mt-1.5 flex items-center gap-4 text-[11px] font-mono text-nerv-text-muted">
              <span>Enter to launch with defaults (all platforms · 7d)</span>
              <Link
                href="/search"
                className="text-nerv-blue hover:text-nerv-orange transition-colors"
              >
                configure ▸
              </Link>
            </div>
          </div>
        </header>

        {/* Stat strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 shrink-0">
          <NervPanel className="p-3" corners={false}>
            <NervMetric label="INVESTIGATIONS" value={loading ? '—' : investigations.length} />
          </NervPanel>
          <NervPanel
            className="p-3"
            corners={false}
            accent={activeScans.length ? 'amber' : 'orange'}
          >
            <NervMetric
              label="ACTIVE SCANS"
              value={loading ? '—' : activeScans.length}
              severity={activeScans.length ? 'warning' : 'normal'}
            />
          </NervPanel>
          <NervPanel className="p-3" corners={false} accent={unreadCount ? 'red' : 'orange'}>
            <NervMetric
              label="UNREAD ALERTS"
              value={loading ? '—' : unreadCount}
              severity={unreadCount ? 'critical' : 'normal'}
            />
          </NervPanel>
          <NervPanel className="p-3" corners={false} accent="blue">
            <NervMetric label="GLOBAL EVENTS" value={loading ? '—' : events.length} />
          </NervPanel>
        </div>

        {view === 'tactical' ? (
          <div className="flex flex-col min-h-[420px] lg:flex-1 lg:min-h-0">
            <div className="flex-1 min-h-0 flex">
              <HexTacticalMap
                events={events}
                  surge={surge}
                  onSelectEvent={(e) =>
                  router.push(
                    `/worldmap?lat=${e.location.lat.toFixed(3)}&lng=${e.location.lng.toFixed(3)}`,
                  )
                }
              />
            </div>
            <NervTicker items={regionTicker.items} onItemClick={handleRegionTickerClick} />
          </div>
        ) : (
        // Content region — fills the remaining viewport; sections scroll
        // internally instead of pushing the page past the fold.
        <div className="flex flex-col gap-4 lg:flex-1 lg:min-h-0">
        {/* Active + recent operations (full width; alerts moved to the top-bar bell) */}
        <NervPanel
          title="OPERATIONS"
          subtitle="active & recent investigations"
          accent="orange"
          className="p-3 lg:flex-[3] lg:min-h-0"
            headerRight={
              <Link
                href="/monitor"
                className="text-[11px] font-mono text-nerv-blue hover:text-nerv-orange"
              >
                all ▸
              </Link>
            }
          >
            {loading ? (
              <p className="text-[12px] font-mono text-nerv-text-muted py-6 text-center">
                loading…
              </p>
            ) : recentInvestigations.length === 0 ? (
              <p className="text-[12px] font-mono text-nerv-text-muted py-6 text-center">
                No investigations yet — search above to start one.
              </p>
            ) : (
              <ul className="divide-y divide-nerv-border/60 overflow-y-auto pr-1 max-h-[42vh] lg:max-h-none lg:h-full">
                {recentInvestigations.map((inv) => {
                  const id = inv._id ?? inv.id ?? '';
                  const activeScan = activeScans.find((s) => s.investigationId === id);
                  return (
                    <li key={id}>
                      <Link
                        href={`/investigate/${id}`}
                        className="flex items-center gap-3 py-2 px-1 hover:bg-nerv-bg-elevated/60 transition-colors"
                      >
                        <span className="flex-1 min-w-0">
                          <span className="block truncate text-[13px] font-mono text-nerv-text">
                            {inv.name || inv.query}
                          </span>
                          <span className="block truncate text-[11px] font-mono text-nerv-text-muted">
                            {inv.settings?.platforms?.length ?? 0} platforms ·{' '}
                            {inv.settings?.timeRange ?? '—'} · {timeAgo(inv.updatedAt)}
                          </span>
                        </span>
                        {activeScan ? (
                          <NervBadge label="SCANNING" variant="amber" size="sm" pulse />
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
        </NervPanel>

        {/* Global feed */}
        <NervPanel
          title="GLOBAL FEED"
          subtitle="recent world events"
          accent="blue"
          className="p-3 lg:flex-[2] lg:min-h-0"
          headerRight={
            <Link
              href="/worldmap"
              className="text-[11px] font-mono text-nerv-blue hover:text-nerv-orange"
            >
              world map ▸
            </Link>
          }
        >
          {loading ? (
            <p className="text-[12px] font-mono text-nerv-text-muted py-4 text-center">loading…</p>
          ) : events.length === 0 ? (
            <p className="text-[12px] font-mono text-nerv-text-muted py-4 text-center">
              No recent global events.
            </p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5 content-start overflow-y-auto pr-1 max-h-[32vh] lg:max-h-none lg:h-full">
              {events.slice(0, 30).map((e) => (
                <li key={e.id} className="flex items-baseline gap-2 min-w-0">
                  <span
                    className={[
                      'shrink-0 w-1.5 h-1.5 rounded-full translate-y-1',
                      SEVERITY_VARIANT[e.severity] === 'red'
                        ? 'bg-nerv-red'
                        : SEVERITY_VARIANT[e.severity] === 'amber'
                          ? 'bg-nerv-amber'
                          : 'bg-nerv-blue',
                    ].join(' ')}
                  />
                  <span className="truncate text-[12px] font-mono text-nerv-text-secondary">
                    {e.title}
                  </span>
                  {(e.metadata['feedOwnership'] === 'state-media' ||
                    e.metadata['feedOwnership'] === 'state-official') && (
                    <span className="shrink-0 px-1 text-[9px] font-mono uppercase tracking-wider border border-nerv-red/40 text-nerv-red/80 rounded-sm">
                      state
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </NervPanel>
        </div>
        )}
      </div>
    </div>
  );
}
