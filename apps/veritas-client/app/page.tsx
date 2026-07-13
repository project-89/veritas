'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { NervBadge, NervMetric, NervPanel } from '../components/nerv';
import {
  type Alert,
  createOrGetInvestigation,
  fetchAlerts,
  fetchInvestigations,
  fetchUnreadAlertCount,
  getRecentScans,
  type Investigation,
  type ScanJob,
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
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [recentScans, setRecentScans] = useState<ScanJob[]>([]);
  const [events, setEvents] = useState<GlobalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchInvestigations().catch(() => [] as Investigation[]),
      fetchAlerts().catch(() => [] as Alert[]),
      fetchUnreadAlertCount().catch(() => 0),
      getRecentScans(8).catch(() => [] as ScanJob[]),
      prefetchRecentEvents().catch(() => [] as GlobalEvent[]),
    ]).then(([invs, alts, count, scans, evts]) => {
      if (cancelled) return;
      setInvestigations(invs);
      setAlerts(alts);
      setUnreadCount(count as number);
      setRecentScans(scans);
      setEvents(evts);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
  const unreadAlerts = useMemo(() => alerts.filter((a) => !a.read).slice(0, 6), [alerts]);
  const recentInvestigations = useMemo(
    () =>
      [...investigations]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 8),
    [investigations],
  );

  return (
    <div className="min-h-[calc(100vh-49px)] lg:h-[calc(100vh-49px)] lg:overflow-hidden bg-nerv-bg-deep text-nerv-text px-4 py-4 sm:px-6 lg:px-8 flex flex-col">
      <div className="mx-auto max-w-[1400px] w-full flex flex-col lg:flex-1 lg:min-h-0">
        {/* Command bar */}
        <header className="mb-4 shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[13px] font-mono text-nerv-orange tracking-widest">{'//'}</span>
            <h1 className="text-[15px] font-mono font-semibold tracking-[0.2em] text-nerv-text">
              VERITAS
            </h1>
            <span className="text-[13px] font-mono text-nerv-text-muted tracking-[0.2em]">
              COMMAND
            </span>
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

        {/* Content region — fills the remaining viewport; sections scroll
            internally instead of pushing the page past the fold. */}
        <div className="flex flex-col gap-4 lg:flex-1 lg:min-h-0">
        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:flex-[3] lg:min-h-0">
          {/* Active + recent operations */}
          <NervPanel
            title="OPERATIONS"
            subtitle="active & recent investigations"
            accent="orange"
            className="lg:col-span-2 p-3 lg:min-h-0"
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

          {/* Alerts */}
          <NervPanel
            title="ALERTS"
            subtitle={unreadCount ? `${unreadCount} unread` : 'all clear'}
            accent={unreadCount ? 'red' : 'green'}
            status={unreadCount ? 'warning' : 'online'}
            className="p-3 lg:min-h-0"
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
            ) : unreadAlerts.length === 0 ? (
              <p className="text-[12px] font-mono text-nerv-text-muted py-6 text-center">
                No unread alerts.
              </p>
            ) : (
              <ul className="space-y-2 overflow-y-auto pr-1 max-h-[42vh] lg:max-h-none lg:h-full">
                {unreadAlerts.map((a) => (
                  <li key={a._id}>
                    <Link
                      href={`/investigate/${a.investigationId}`}
                      className="block border-l-2 border-nerv-border pl-2 py-1 hover:border-nerv-orange hover:bg-nerv-bg-elevated/60 transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <NervBadge
                          label={a.severity.toUpperCase()}
                          variant={SEVERITY_VARIANT[a.severity] ?? 'muted'}
                          size="sm"
                        />
                        <span className="text-[11px] font-mono text-nerv-text-muted">
                          {timeAgo(a.createdAt)}
                        </span>
                      </span>
                      <span className="block mt-0.5 text-[12px] font-mono text-nerv-text leading-snug">
                        {a.title}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </NervPanel>
        </div>

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
                </li>
              ))}
            </ul>
          )}
        </NervPanel>
        </div>
      </div>
    </div>
  );
}
