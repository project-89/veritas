'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  NervAlert,
  NervBadge,
  NervMetric,
  NervPanel,
  NervSparkline,
  NervStatus,
  NervTicker,
} from '../components/nerv';
import type { Alert, Investigation } from '../lib/api';
import { fetchAlerts, fetchInvestigations, fetchUnreadAlertCount } from '../lib/api';

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
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function severityVariant(severity: string): 'blue' | 'amber' | 'red' {
  if (severity === 'critical') return 'red';
  if (severity === 'warning') return 'amber';
  return 'blue';
}

function statusBadgeVariant(status: string): 'green' | 'muted' {
  return status === 'active' ? 'green' : 'muted';
}

/** Generate a fake sparkline from an investigation's updatedAt to give visual texture. */
function fakeSparkline(id: string): number[] {
  // Deterministic-ish based on id hash
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  const pts: number[] = [];
  let val = Math.abs(hash % 50) + 10;
  for (let i = 0; i < 12; i++) {
    val += (((hash >> i) % 11) - 5);
    if (val < 0) val = 2;
    pts.push(val);
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CommandCenter() {
  const router = useRouter();

  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingInv, setLoadingInv] = useState(true);
  const [loadingAlerts, setLoadingAlerts] = useState(true);

  // Fetch data on mount
  useEffect(() => {
    let cancelled = false;

    fetchInvestigations()
      .then((data) => { if (!cancelled) setInvestigations(data); })
      .catch(() => { if (!cancelled) setInvestigations([]); })
      .finally(() => { if (!cancelled) setLoadingInv(false); });

    fetchAlerts()
      .then((data) => { if (!cancelled) setAlerts(data); })
      .catch(() => { if (!cancelled) setAlerts([]); })
      .finally(() => { if (!cancelled) setLoadingAlerts(false); });

    fetchUnreadAlertCount()
      .then((count) => { if (!cancelled) setUnreadCount(count); })
      .catch(() => { if (!cancelled) setUnreadCount(0); });

    return () => { cancelled = true; };
  }, []);

  // Ticker items from latest alerts
  const tickerItems = useMemo(
    () =>
      alerts.slice(0, 20).map((a) => ({
        id: a._id,
        severity: a.severity,
        text: a.title,
        timestamp: timeAgo(a.createdAt),
      })),
    [alerts],
  );

  // Alert counts by severity
  const alertCounts = useMemo(() => {
    const counts = { critical: 0, warning: 0, info: 0 };
    for (const a of alerts) {
      if (a.severity in counts) counts[a.severity as keyof typeof counts]++;
    }
    return counts;
  }, [alerts]);

  const activeInvestigations = investigations.filter((i) => i.status === 'active');

  const navigateToInvestigation = useCallback(
    (inv: Investigation) => {
      // Pass investigation ID so results page loads from snapshot instead of re-searching
      router.push(`/results?q=${encodeURIComponent(inv.query)}&inv=${inv._id}`);
    },
    [router],
  );

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Main content area */}
      <div className="flex-1 flex min-h-0">
        {/* ── LEFT COLUMN: Active Investigations (~40%) ── */}
        <div className="w-[40%] border-r border-nerv-border flex flex-col min-h-0">
          <NervPanel
            title="Active Investigations"
            status="online"
            accent="orange"
            corners={false}
            className="flex-1 flex flex-col min-h-0 border-0"
            headerRight={
              <NervBadge
                label={`${activeInvestigations.length} active`}
                variant="orange"
                size="sm"
              />
            }
          >
            <div className="flex-1 overflow-y-auto min-h-0">
              {loadingInv ? (
                <div className="flex items-center justify-center py-16">
                  <div className="flex items-center gap-3 text-nerv-text-muted">
                    <div className="w-4 h-4 border-2 border-nerv-border border-t-nerv-orange rounded-full animate-spin" />
                    <span className="text-[10px] font-mono uppercase tracking-widest">
                      Loading investigations...
                    </span>
                  </div>
                </div>
              ) : investigations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-nerv-text-muted">
                  <span className="text-[10px] font-mono uppercase tracking-widest mb-2">
                    No investigations found
                  </span>
                  <span className="text-[10px] font-mono text-nerv-text-muted">
                    Initiate a scan to begin
                  </span>
                </div>
              ) : (
                <div className="divide-y divide-nerv-border">
                  {investigations.map((inv) => {
                    const invAlerts = alerts.filter(
                      (a) => a.investigationId === inv._id && !a.read,
                    );
                    return (
                      <button
                        key={inv._id}
                        onClick={() => navigateToInvestigation(inv)}
                        className="w-full text-left px-3 py-2.5 hover:bg-nerv-bg-elevated/30 transition-colors group"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono text-nerv-text truncate flex-1">
                            {inv.name || inv.query}
                          </span>
                          <NervBadge
                            label={inv.status}
                            variant={statusBadgeVariant(inv.status)}
                            size="sm"
                            pulse={inv.status === 'active'}
                          />
                        </div>

                        {inv.name && inv.name !== inv.query && (
                          <div className="text-[10px] font-mono text-nerv-text-muted mb-1 truncate">
                            q: {inv.query}
                          </div>
                        )}

                        <div className="flex items-center gap-3">
                          {/* Alert count */}
                          {invAlerts.length > 0 && (
                            <span className="text-[10px] font-mono text-nerv-red">
                              {invAlerts.length} alert{invAlerts.length !== 1 ? 's' : ''}
                            </span>
                          )}

                          {/* Platforms */}
                          {inv.settings?.platforms?.length > 0 && (
                            <span className="text-[10px] font-mono text-nerv-text-muted">
                              {inv.settings.platforms.join(' / ')}
                            </span>
                          )}

                          {/* Sparkline */}
                          <div className="ml-auto">
                            <NervSparkline
                              data={fakeSparkline(inv._id)}
                              width={60}
                              height={16}
                              color="#FF6B2B"
                              showEndDot
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[10px] font-mono text-nerv-text-muted">
                            Last scan: {timeAgo(inv.updatedAt)}
                          </span>
                          <span className="text-[10px] font-mono text-nerv-orange opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-widest">
                            Open &rarr;
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* New Investigation button */}
            <div className="border-t border-nerv-border px-3 py-2">
              <button
                onClick={() => router.push('/search')}
                className="w-full py-2 border border-nerv-orange/40 text-nerv-orange text-[10px] font-mono uppercase tracking-widest hover:bg-nerv-orange/10 hover:border-nerv-orange/60 transition-colors"
              >
                + New Investigation
              </button>
            </div>
          </NervPanel>
        </div>

        {/* ── RIGHT COLUMN: Alerts + System Status (~60%) ── */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Global Alert Feed */}
          <div className="flex-1 min-h-0 flex flex-col">
            <NervPanel
              title="Global Alert Feed"
              status={alertCounts.critical > 0 ? 'critical' : alertCounts.warning > 0 ? 'warning' : 'online'}
              accent={alertCounts.critical > 0 ? 'red' : 'blue'}
              corners={false}
              className="flex-1 flex flex-col min-h-0 border-0 border-b border-nerv-border"
              headerRight={
                unreadCount > 0 ? (
                  <NervBadge
                    label={`${unreadCount} unread`}
                    variant="red"
                    size="sm"
                    pulse
                  />
                ) : undefined
              }
            >
              <div className="flex-1 overflow-y-auto min-h-0">
                {loadingAlerts ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="flex items-center gap-3 text-nerv-text-muted">
                      <div className="w-4 h-4 border-2 border-nerv-border border-t-nerv-blue rounded-full animate-spin" />
                      <span className="text-[10px] font-mono uppercase tracking-widest">
                        Loading alerts...
                      </span>
                    </div>
                  </div>
                ) : alerts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-nerv-text-muted">
                    <span className="text-[10px] font-mono uppercase tracking-widest mb-2">
                      No alerts
                    </span>
                    <span className="text-[10px] font-mono text-nerv-text-muted">
                      Alerts will appear here as investigations detect changes
                    </span>
                  </div>
                ) : (
                  <div className="divide-y divide-nerv-border/50">
                    {alerts.map((alert) => (
                      <NervAlert
                        key={alert._id}
                        type={alert.type.replace(/_/g, ' ')}
                        severity={alert.severity}
                        title={alert.title}
                        description={alert.description}
                        timestamp={timeAgo(alert.createdAt)}
                        onClick={() => {
                          const inv = investigations.find(
                            (i) => i._id === alert.investigationId,
                          );
                          if (inv) navigateToInvestigation(inv);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </NervPanel>
          </div>

          {/* System Status (bottom-right) */}
          <div className="shrink-0">
            <NervPanel
              title="System Status"
              status="online"
              accent="green"
              corners={false}
              className="border-0"
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-nerv-border">
                <NervMetric
                  label="Investigations"
                  value={investigations.length}
                  severity="normal"
                />
                <NervMetric
                  label="Active"
                  value={activeInvestigations.length}
                  severity="normal"
                  trend={activeInvestigations.length > 0 ? 'up' : 'stable'}
                />
                <NervMetric
                  label="Alerts"
                  value={alerts.length}
                  severity={alertCounts.critical > 0 ? 'critical' : alertCounts.warning > 0 ? 'warning' : 'normal'}
                  trend={alertCounts.critical > 0 ? 'up' : 'stable'}
                />
                <NervMetric
                  label="Unread"
                  value={unreadCount}
                  severity={unreadCount > 5 ? 'warning' : 'normal'}
                />
              </div>

              {/* Connector status row */}
              <div className="flex items-center gap-4 px-3 py-2 border-t border-nerv-border">
                <NervStatus status="online" label="Twitter" size="sm" />
                <NervStatus status="online" label="Reddit" size="sm" />
                <NervStatus status="online" label="YouTube" size="sm" />
                <NervStatus status="offline" label="Facebook" size="sm" />
                <div className="ml-auto text-[10px] font-mono text-nerv-text-muted">
                  DB: OK | Queue: idle
                </div>
              </div>
            </NervPanel>
          </div>
        </div>
      </div>

      {/* ── BOTTOM TICKER ── */}
      <div className="shrink-0">
        <NervTicker
          items={
            tickerItems.length > 0
              ? tickerItems
              : [
                  {
                    id: 'sys-ready',
                    severity: 'info',
                    text: 'VERITAS system online. Initiate a scan to begin monitoring.',
                    timestamp: 'SYS',
                  },
                ]
          }
          onItemClick={(id) => {
            const alert = alerts.find((a) => a._id === id);
            if (alert) {
              const inv = investigations.find(
                (i) => i._id === alert.investigationId,
              );
              if (inv) navigateToInvestigation(inv);
            }
          }}
        />
      </div>
    </div>
  );
}
