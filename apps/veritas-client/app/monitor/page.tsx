'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  NervAlert,
  NervBadge,
  NervMetric,
  NervPanel,
  NervTicker,
  type NervTickerItem,
} from '../../components/nerv';
import {
  type Alert,
  archiveInvestigation,
  deleteInvestigation,
  fetchAlerts,
  fetchInvestigation,
  fetchInvestigations,
  fetchUnreadAlertCount,
  type Investigation,
  markAlertRead,
  markAllAlertsRead,
  renameInvestigation,
  type Snapshot,
} from '../../lib/api';
import { hasPluginCapability, usePluginManifest } from '../../lib/plugins';

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

function getInvestigationId(inv: Investigation): string {
  return inv._id ?? inv.id ?? '';
}

interface InvestigationPreview {
  investigation: Investigation;
  snapshot: Snapshot | null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MonitorPage() {
  const router = useRouter();
  const { plugins } = usePluginManifest();
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedInvId, setSelectedInvId] = useState<string | null>(null);
  const [menuOpenInvId, setMenuOpenInvId] = useState<string | null>(null);
  const [preview, setPreview] = useState<InvestigationPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [alertFilter, setAlertFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewRequestRef = useRef(0);
  const hasAtlas = hasPluginCapability(plugins, 'atlas-lenses');

  // Load data on mount
  useEffect(() => {
    Promise.all([
      fetchInvestigations().catch(() => []),
      fetchAlerts().catch(() => []),
      fetchUnreadAlertCount().catch(() => 0),
    ]).then(([invs, alts, count]) => {
      setInvestigations(invs);
      setAlerts(alts);
      setUnreadCount(count as number);
      setLoading(false);
    });
  }, []);

  // Poll alerts every 2 minutes — alert delivery isn't latency-critical,
  // and this page stays open for long stretches.
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const [alts, count] = await Promise.all([fetchAlerts(), fetchUnreadAlertCount()]);
        setAlerts(alts);
        setUnreadCount(count);
      } catch {
        /* silent */
      }
    }, 120_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Load preview when investigation selected
  useEffect(() => {
    if (!selectedInvId) {
      setPreview(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }

    const selectedInvestigation =
      investigations.find((inv) => getInvestigationId(inv) === selectedInvId) ?? null;
    if (selectedInvestigation) {
      setPreview((prev) => ({
        investigation: selectedInvestigation,
        snapshot:
          prev?.investigation && getInvestigationId(prev.investigation) === selectedInvId
            ? prev.snapshot
            : null,
      }));
    }
    setPreviewError(null);
    setPreviewLoading(true);

    const requestId = ++previewRequestRef.current;
    fetchInvestigation(selectedInvId)
      .then((data) => {
        if (previewRequestRef.current !== requestId) return;
        setPreview({
          investigation: data.investigation,
          snapshot: data.snapshot,
        });
        setPreviewError(null);
      })
      .catch((err) => {
        if (previewRequestRef.current !== requestId) return;
        setPreview((prev) =>
          prev && getInvestigationId(prev.investigation) === selectedInvId ? prev : null,
        );
        setPreviewError(
          err instanceof Error ? err.message : 'Failed to load investigation preview',
        );
      })
      .finally(() => {
        if (previewRequestRef.current === requestId) {
          setPreviewLoading(false);
        }
      });
  }, [selectedInvId, investigations]);

  const handleMarkRead = useCallback(async (alertId: string) => {
    await markAlertRead(alertId);
    setAlerts((prev) => prev.map((a) => (a._id === alertId ? { ...a, read: true } : a)));
    setUnreadCount((c) => Math.max(0, c - 1));
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    await markAllAlertsRead();
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
    setUnreadCount(0);
  }, []);

  const refreshInvestigations = useCallback(async () => {
    const invs = await fetchInvestigations().catch(() => []);
    setInvestigations(invs);
    return invs;
  }, []);

  const handleRenameInvestigation = useCallback(
    async (inv: Investigation) => {
      const investigationId = getInvestigationId(inv);
      if (!investigationId) return;
      const nextName = window.prompt('Rename investigation', inv.name || inv.query);
      if (!nextName?.trim()) return;

      await renameInvestigation(investigationId, nextName.trim());
      const invs = await refreshInvestigations();
      setMenuOpenInvId(null);
      if (selectedInvId === investigationId) {
        const next = invs.find((item) => getInvestigationId(item) === investigationId) ?? null;
        if (next) {
          setPreview((prev) => (prev ? { ...prev, investigation: next } : prev));
        }
      }
    },
    [refreshInvestigations, selectedInvId],
  );

  const handleArchiveInvestigation = useCallback(
    async (inv: Investigation) => {
      const investigationId = getInvestigationId(inv);
      if (!investigationId) return;
      const confirmed = window.confirm(`Archive "${inv.name || inv.query}"?`);
      if (!confirmed) return;

      await archiveInvestigation(investigationId);
      setMenuOpenInvId(null);
      await refreshInvestigations();
      if (selectedInvId === investigationId) {
        setSelectedInvId(null);
      }
    },
    [refreshInvestigations, selectedInvId],
  );

  const handleDeleteInvestigation = useCallback(
    async (inv: Investigation) => {
      const investigationId = getInvestigationId(inv);
      if (!investigationId) return;
      const label = inv.name || inv.query;
      const confirmed = window.confirm(
        `Delete "${label}" permanently?\n\nThis removes snapshots, scan history, dossiers, and monitor records.`,
      );
      if (!confirmed) return;

      await deleteInvestigation(investigationId);
      setMenuOpenInvId(null);
      await refreshInvestigations();
      if (selectedInvId === investigationId) {
        setSelectedInvId(null);
      }
    },
    [refreshInvestigations, selectedInvId],
  );

  const filteredAlerts =
    alertFilter === 'all' ? alerts : alerts.filter((a) => a.severity === alertFilter);

  const tickerItems: NervTickerItem[] = alerts
    .filter((a) => a.severity === 'critical' || a.severity === 'warning')
    .slice(0, 10)
    .map((a) => ({
      id: a._id,
      text: `[${a.severity.toUpperCase()}] ${a.title}`,
      severity: a.severity,
      timestamp: a.createdAt,
    }));

  const criticalCount = alerts.filter((a) => a.severity === 'critical' && !a.read).length;
  const warningCount = alerts.filter((a) => a.severity === 'warning' && !a.read).length;

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      {/* Main 3-column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Investigation list */}
        <div className="w-[260px] shrink-0 border-r border-nerv-border overflow-y-auto">
          <div className="p-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted">
                Investigations
              </span>
              <div className="flex items-center gap-3">
                {hasAtlas && (
                  <button
                    type="button"
                    onClick={() => router.push('/atlas')}
                    className="text-[8px] font-mono uppercase text-nerv-text-muted hover:text-nerv-orange"
                  >
                    ATLAS
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => router.push('/search')}
                  className="text-[8px] font-mono uppercase text-nerv-orange hover:underline"
                >
                  + New Scan
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-4 h-4 border-2 border-nerv-border border-t-nerv-blue rounded-full animate-spin" />
              </div>
            ) : investigations.length === 0 ? (
              <div className="py-8 text-center text-[10px] font-mono text-nerv-text-muted">
                No investigations yet
              </div>
            ) : (
              <div className="space-y-1">
                {investigations.map((inv) => {
                  const investigationId = getInvestigationId(inv);
                  const isSelected = selectedInvId === investigationId;
                  return (
                    <button
                      type="button"
                      key={investigationId || inv.query}
                      onClick={() => {
                        if (!investigationId) return;
                        setSelectedInvId(isSelected ? null : investigationId);
                      }}
                      className={`w-full text-left px-2 py-2 rounded-sm border transition-all ${
                        isSelected
                          ? 'border-nerv-orange/50 bg-nerv-orange/5'
                          : 'border-transparent hover:border-nerv-border hover:bg-nerv-bg-elevated/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-mono text-nerv-text truncate">
                          {inv.name || inv.query}
                        </span>
                        <NervBadge
                          label={inv.status === 'active' ? 'ACTIVE' : 'ARCHIVED'}
                          variant={inv.status === 'active' ? 'green' : 'muted'}
                          size="sm"
                        />
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[8px] font-mono text-nerv-text-muted">
                          {timeAgo(inv.updatedAt as unknown as string)}
                        </span>
                        {inv.settings?.platforms?.length > 0 && (
                          <span className="text-[8px] font-mono text-nerv-text-muted">
                            {inv.settings.platforms.length} sources
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Center: Overview / Investigation Preview */}
        <div className="flex-1 overflow-y-auto p-4">
          {!selectedInvId ? (
            /* Aggregate overview */
            <div className="space-y-4">
              <NervPanel title="System Overview" accent="orange" status="online">
                <div className="grid grid-cols-4 gap-4 p-4">
                  <NervMetric
                    label="Active Investigations"
                    value={String(investigations.filter((i) => i.status === 'active').length)}
                  />
                  <NervMetric
                    label="Critical Alerts"
                    value={String(criticalCount)}
                    severity={criticalCount > 0 ? 'critical' : undefined}
                  />
                  <NervMetric
                    label="Warnings"
                    value={String(warningCount)}
                    severity={warningCount > 0 ? 'warning' : undefined}
                  />
                  <NervMetric label="Unread Alerts" value={String(unreadCount)} />
                </div>
              </NervPanel>

              <NervPanel title="Active Investigations" accent="blue" corners>
                <div className="divide-y divide-nerv-border">
                  {investigations
                    .filter((i) => i.status === 'active')
                    .map((inv) => (
                      <div
                        key={getInvestigationId(inv) || inv.query}
                        className="flex items-center justify-between px-3 py-2 hover:bg-nerv-bg-elevated/20 transition-colors relative"
                      >
                        <div>
                          <span className="text-xs font-mono text-nerv-text">
                            {inv.name || inv.query}
                          </span>
                          <span className="text-[9px] font-mono text-nerv-text-muted ml-2">
                            {timeAgo(inv.updatedAt as unknown as string)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const investigationId = getInvestigationId(inv);
                              if (!investigationId) return;
                              router.push(`/investigate/${investigationId}`);
                            }}
                            className="text-[9px] font-mono uppercase text-nerv-orange hover:underline tracking-widest"
                          >
                            Investigate
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const investigationId = getInvestigationId(inv);
                              if (!investigationId) return;
                              setMenuOpenInvId((current) =>
                                current === investigationId ? null : investigationId,
                              );
                            }}
                            className="w-6 h-6 flex items-center justify-center border border-nerv-border text-nerv-text-muted hover:text-nerv-text hover:border-nerv-text-muted rounded-sm text-[12px] font-mono"
                            aria-label={`Actions for ${inv.name || inv.query}`}
                          >
                            ...
                          </button>
                        </div>

                        {menuOpenInvId === getInvestigationId(inv) && (
                          <div className="absolute right-3 top-10 z-20 w-44 border border-nerv-border bg-nerv-bg-panel shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
                            <button
                              type="button"
                              onClick={() => {
                                const investigationId = getInvestigationId(inv);
                                if (!investigationId) return;
                                setMenuOpenInvId(null);
                                router.push(`/investigate/${investigationId}`);
                              }}
                              className="w-full px-3 py-2 text-left text-[10px] font-mono uppercase tracking-widest text-nerv-text hover:bg-nerv-bg-elevated/30"
                            >
                              Open
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleRenameInvestigation(inv)}
                              className="w-full px-3 py-2 text-left text-[10px] font-mono uppercase tracking-widest text-nerv-text hover:bg-nerv-bg-elevated/30"
                            >
                              Rename
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleArchiveInvestigation(inv)}
                              className="w-full px-3 py-2 text-left text-[10px] font-mono uppercase tracking-widest text-nerv-text hover:bg-nerv-bg-elevated/30"
                            >
                              Archive
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteInvestigation(inv)}
                              className="w-full px-3 py-2 text-left text-[10px] font-mono uppercase tracking-widest text-nerv-red hover:bg-nerv-red/10"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </NervPanel>
            </div>
          ) : (
            /* Investigation preview */
            <div className="space-y-4">
              <NervPanel
                title={preview?.investigation?.name || 'Loading...'}
                accent="orange"
                status="online"
              >
                <div className="p-4 space-y-3">
                  {previewError && (
                    <div className="px-3 py-2 border border-nerv-red/40 bg-nerv-red/10 text-[10px] font-mono text-nerv-red">
                      Preview load issue: {previewError}
                    </div>
                  )}
                  {preview ? (
                    <>
                      <div className="grid grid-cols-3 gap-4">
                        <NervMetric label="Query" value={preview.investigation.query} />
                        <NervMetric
                          label="Time Range"
                          value={preview.investigation.settings?.timeRange || '7d'}
                        />
                        <NervMetric label="Status" value={preview.investigation.status} />
                      </div>

                      {preview.snapshot && (
                        <div className="grid grid-cols-3 gap-4 mt-3">
                          <NervMetric
                            label="Posts"
                            value={String(preview.snapshot.postCount ?? 0)}
                          />
                          <NervMetric
                            label="Narratives"
                            value={String(preview.snapshot.narrativeCount ?? 0)}
                          />
                          <NervMetric
                            label="Last Scan"
                            value={
                              preview.snapshot.timestamp
                                ? timeAgo(preview.snapshot.timestamp)
                                : 'N/A'
                            }
                          />
                        </div>
                      )}

                      <div className="pt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const investigationId = getInvestigationId(preview.investigation);
                            if (!investigationId) return;
                            router.push(`/investigate/${investigationId}`);
                          }}
                          className="px-4 py-2 bg-nerv-orange/20 border border-nerv-orange/50 text-nerv-orange text-[10px] font-mono uppercase tracking-widest hover:bg-nerv-orange/30 transition-all"
                        >
                          Open Investigation
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            router.push(
                              `/search?q=${encodeURIComponent(preview.investigation.query)}`,
                            )
                          }
                          className="px-4 py-2 bg-nerv-bg border border-nerv-border text-nerv-text-muted text-[10px] font-mono uppercase tracking-widest hover:border-nerv-text-muted transition-all"
                        >
                          Re-scan
                        </button>
                      </div>

                      {previewLoading && (
                        <div className="flex items-center gap-2 text-[9px] font-mono text-nerv-text-muted uppercase tracking-widest">
                          <div className="w-3 h-3 border-2 border-nerv-border border-t-nerv-orange rounded-full animate-spin" />
                          Refreshing Preview
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center justify-center py-6">
                      <div className="w-4 h-4 border-2 border-nerv-border border-t-nerv-orange rounded-full animate-spin" />
                    </div>
                  )}
                </div>
              </NervPanel>
            </div>
          )}
        </div>

        {/* Right: Alert feed */}
        <div className="w-[320px] shrink-0 border-l border-nerv-border overflow-y-auto">
          <div className="p-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted">
                Alert Feed{' '}
                {unreadCount > 0 && (
                  <NervBadge label={String(unreadCount)} variant="red" size="sm" />
                )}
              </span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-[8px] font-mono uppercase text-nerv-text-muted hover:text-nerv-text-secondary"
                >
                  Mark All Read
                </button>
              )}
            </div>

            {/* Severity filter */}
            <div className="flex gap-1 mb-2">
              {['all', 'critical', 'warning', 'info'].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setAlertFilter(f)}
                  className={`text-[8px] font-mono uppercase px-2 py-0.5 border rounded-sm transition-all ${
                    alertFilter === f
                      ? 'border-nerv-orange text-nerv-orange'
                      : 'border-nerv-border text-nerv-text-muted hover:border-nerv-text-muted'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Alert list */}
            <div className="space-y-1">
              {filteredAlerts.length === 0 ? (
                <div className="py-6 text-center text-[10px] font-mono text-nerv-text-muted">
                  No alerts
                </div>
              ) : (
                filteredAlerts.slice(0, 50).map((alert) => (
                  <button
                    key={alert._id}
                    onClick={() => handleMarkRead(alert._id)}
                    type="button"
                    className={`w-full text-left transition-opacity ${alert.read ? 'opacity-40' : 'opacity-100'}`}
                  >
                    <NervAlert
                      type={alert.type}
                      severity={alert.severity as 'info' | 'warning' | 'critical'}
                      title={alert.title}
                      description={alert.description}
                      timestamp={timeAgo(alert.createdAt)}
                    />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom ticker */}
      {tickerItems.length > 0 && <NervTicker items={tickerItems} />}
    </div>
  );
}
