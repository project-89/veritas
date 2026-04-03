'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  fetchInvestigations,
  fetchAlerts,
  markAlertRead,
  markAllAlertsRead,
  fetchUnreadAlertCount,
  fetchMonitorConfig,
  updateMonitorConfig,
  type Investigation,
  type Alert,
  type AlertType,
  type MonitorConfig,
} from '../../lib/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALERT_TYPE_ICONS: Record<AlertType, string> = {
  new_narrative: 'N',
  velocity_spike: 'V',
  sentiment_reversal: 'S',
  coordination_detected: 'C',
  new_platform: 'P',
  volume_surge: 'U',
};

const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  new_narrative: 'New Narrative',
  velocity_spike: 'Velocity Spike',
  sentiment_reversal: 'Sentiment Shift',
  coordination_detected: 'Coordination',
  new_platform: 'New Platform',
  volume_surge: 'Volume Surge',
};

const SEVERITY_COLORS: Record<string, string> = {
  info: 'border-blue-500/30 bg-blue-500/5',
  warning: 'border-amber-500/30 bg-amber-500/5',
  critical: 'border-red-500/30 bg-red-500/5',
};

const SEVERITY_DOT: Record<string, string> = {
  info: 'bg-blue-400',
  warning: 'bg-amber-400',
  critical: 'bg-red-400',
};

const INTERVAL_OPTIONS = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '6 hours', value: 360 },
  { label: '12 hours', value: 720 },
  { label: '24 hours', value: 1440 },
];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatNextRun(dateStr: string | null): string {
  if (!dateStr) return '--';
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return 'due now';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.floor(hours / 24);
  return `in ${days}d`;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function ScheduleConfig({
  investigationId,
  config,
  onConfigChange,
}: {
  investigationId: string;
  config: MonitorConfig | null;
  onConfigChange: (config: MonitorConfig) => void;
}) {
  const [saving, setSaving] = useState(false);

  const handleToggle = async () => {
    setSaving(true);
    try {
      const newEnabled = !config?.enabled;
      await updateMonitorConfig(investigationId, {
        enabled: newEnabled,
        intervalMinutes: config?.intervalMinutes ?? 60,
      });
      const updated = await fetchMonitorConfig(investigationId);
      onConfigChange(updated);
    } catch (err) {
      console.error('Failed to toggle auto-refresh:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleIntervalChange = async (minutes: number) => {
    setSaving(true);
    try {
      await updateMonitorConfig(investigationId, {
        enabled: config?.enabled ?? false,
        intervalMinutes: minutes,
      });
      const updated = await fetchMonitorConfig(investigationId);
      onConfigChange(updated);
    } catch (err) {
      console.error('Failed to update interval:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-slate-800">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">
          Auto-refresh
        </span>
        <button
          onClick={handleToggle}
          disabled={saving}
          className={`relative w-8 h-4 rounded-full transition-colors ${
            config?.enabled
              ? 'bg-emerald-600'
              : 'bg-slate-700'
          } ${saving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <span
            className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
              config?.enabled ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {config?.enabled && (
        <>
          <div className="flex items-center gap-1.5 flex-wrap">
            {INTERVAL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleIntervalChange(opt.value)}
                disabled={saving}
                className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                  config?.intervalMinutes === opt.value
                    ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/30'
                    : 'bg-slate-800 text-slate-500 border border-slate-700 hover:border-slate-600'
                } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-600">
            {config?.lastRunAt && (
              <span>Last: {timeAgo(config.lastRunAt)}</span>
            )}
            {config?.nextRunAt && (
              <span>Next: {formatNextRun(config.nextRunAt)}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function InvestigationCard({
  investigation,
  alertCount,
  refreshing,
  onRefresh,
  config,
  onConfigChange,
}: {
  investigation: Investigation;
  alertCount: number;
  refreshing: boolean;
  onRefresh: () => void;
  config: MonitorConfig | null;
  onConfigChange: (config: MonitorConfig) => void;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-white truncate">
            {investigation.name}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5 truncate">
            {investigation.query}
          </p>
        </div>
        <div className="flex items-center gap-1.5 ml-2">
          {config?.enabled && (
            <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-medium px-1.5 py-0.5 rounded-full">
              Auto
            </span>
          )}
          {alertCount > 0 && (
            <span className="bg-red-500/20 text-red-300 text-xs font-medium px-2 py-0.5 rounded-full">
              {alertCount}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-600">
          Updated {timeAgo(investigation.updatedAt)}
        </span>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className={`text-xs px-3 py-1 rounded-md transition-colors ${
            refreshing
              ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
              : 'bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30'
          }`}
        >
          {refreshing ? 'Scanning...' : 'Refresh Now'}
        </button>
      </div>

      <ScheduleConfig
        investigationId={investigation._id}
        config={config}
        onConfigChange={onConfigChange}
      />
    </div>
  );
}

function AlertRow({
  alert,
  investigationName,
  onMarkRead,
  onNavigate,
}: {
  alert: Alert;
  investigationName: string;
  onMarkRead: (id: string) => void;
  onNavigate: (investigationId: string) => void;
}) {
  return (
    <button
      onClick={() => {
        if (!alert.read) onMarkRead(alert._id);
        onNavigate(alert.investigationId);
      }}
      className={`w-full text-left border rounded-lg p-3 transition-colors ${
        alert.read
          ? 'border-slate-800/50 bg-slate-900/50 opacity-60'
          : SEVERITY_COLORS[alert.severity] ?? SEVERITY_COLORS['info']
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Type icon + severity dot */}
        <div className="flex flex-col items-center gap-1 pt-0.5">
          <span className="text-xs font-mono font-bold text-slate-400 bg-slate-800 w-6 h-6 flex items-center justify-center rounded">
            {ALERT_TYPE_ICONS[alert.type] ?? '?'}
          </span>
          {!alert.read && (
            <span
              className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity] ?? SEVERITY_DOT['info']}`}
            />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-white">
              {alert.title}
            </span>
            <span className="text-[10px] text-slate-600">
              {ALERT_TYPE_LABELS[alert.type] ?? alert.type}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">
            {alert.description}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[10px] text-slate-600">
              {investigationName}
            </span>
            <span className="text-[10px] text-slate-700">|</span>
            <span className="text-[10px] text-slate-600">
              {timeAgo(alert.createdAt)}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MonitorPage() {
  const router = useRouter();
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [alertCountByInvestigation, setAlertCountByInvestigation] = useState<
    Record<string, number>
  >({});
  const [configs, setConfigs] = useState<Record<string, MonitorConfig>>({});

  const loadData = useCallback(async () => {
    try {
      const [invs, allAlerts] = await Promise.all([
        fetchInvestigations(),
        fetchAlerts(),
      ]);

      const activeInvs = invs.filter((i) => i.status === 'active');
      setInvestigations(activeInvs);
      setAlerts(allAlerts);

      // Count unread alerts per investigation
      const counts: Record<string, number> = {};
      for (const a of allAlerts) {
        if (!a.read) {
          counts[a.investigationId] = (counts[a.investigationId] ?? 0) + 1;
        }
      }
      setAlertCountByInvestigation(counts);

      // Load monitor configs for all active investigations
      const configResults = await Promise.allSettled(
        activeInvs.map((inv) => fetchMonitorConfig(inv._id)),
      );
      const configMap: Record<string, MonitorConfig> = {};
      for (let i = 0; i < activeInvs.length; i++) {
        const result = configResults[i];
        if (result && result.status === 'fulfilled') {
          configMap[activeInvs[i]!._id] = result.value;
        }
      }
      setConfigs(configMap);
    } catch (err) {
      console.error('Failed to load monitor data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Build investigation lookup maps
  const invNameMap: Record<string, string> = {};
  const invQueryMap: Record<string, string> = {};
  for (const inv of investigations) {
    invNameMap[inv._id] = inv.name;
    invQueryMap[inv._id] = inv.query;
  }

  const handleRefresh = useCallback(
    (investigationId: string) => {
      // Navigate to the investigation's results page with fresh=1 to trigger scan queue
      const query = invQueryMap[investigationId];
      if (query) {
        router.push(`/results?q=${encodeURIComponent(query)}&fresh=1`);
      }
    },
    [router, invQueryMap],
  );

  const handleMarkRead = useCallback(
    async (alertId: string) => {
      try {
        await markAlertRead(alertId);
        setAlerts((prev) =>
          prev.map((a) => (a._id === alertId ? { ...a, read: true } : a)),
        );
        // Recalculate counts
        setAlertCountByInvestigation((prev) => {
          const alert = alerts.find((a) => a._id === alertId);
          if (!alert || alert.read) return prev;
          const next = { ...prev };
          const count = (next[alert.investigationId] ?? 1) - 1;
          if (count <= 0) {
            delete next[alert.investigationId];
          } else {
            next[alert.investigationId] = count;
          }
          return next;
        });
      } catch (err) {
        console.error('Mark read failed:', err);
      }
    },
    [alerts],
  );

  const handleMarkAllRead = useCallback(async () => {
    try {
      await markAllAlertsRead();
      setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
      setAlertCountByInvestigation({});
    } catch (err) {
      console.error('Mark all read failed:', err);
    }
  }, []);

  const handleConfigChange = useCallback(
    (investigationId: string, config: MonitorConfig) => {
      setConfigs((prev) => ({ ...prev, [investigationId]: config }));
    },
    [],
  );

  const handleNavigateToInvestigation = useCallback(
    (investigationId: string) => {
      const query = invQueryMap[investigationId];
      if (query) {
        router.push(`/results?q=${encodeURIComponent(query)}&inv=${investigationId}`);
      }
    },
    [router, invQueryMap],
  );

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-800 rounded w-48" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 bg-slate-800/50 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Monitor</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Track narrative changes across your investigations
          </p>
        </div>
      </div>

      {/* Investigation grid */}
      {investigations.length === 0 ? (
        <div className="text-center py-16 text-slate-600">
          <p className="text-sm">No active investigations.</p>
          <p className="text-xs mt-1">
            Search for a topic to create your first investigation.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {investigations.map((inv) => (
            <InvestigationCard
              key={inv._id}
              investigation={inv}
              alertCount={alertCountByInvestigation[inv._id] ?? 0}
              refreshing={refreshingIds.has(inv._id)}
              onRefresh={() => handleRefresh(inv._id)}
              config={configs[inv._id] ?? null}
              onConfigChange={(c) => handleConfigChange(inv._id, c)}
            />
          ))}
        </div>
      )}

      {/* Alert feed */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-slate-300">
            Recent Alerts
          </h2>
          {alerts.some((a) => !a.read) && (
            <button
              onClick={handleMarkAllRead}
              className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
            >
              Mark all read
            </button>
          )}
        </div>

        {alerts.length === 0 ? (
          <div className="text-center py-12 text-slate-700">
            <p className="text-sm">No alerts yet.</p>
            <p className="text-xs mt-1">
              Alerts appear when narrative changes are detected during a refresh.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert) => (
              <AlertRow
                key={alert._id}
                alert={alert}
                investigationName={
                  invNameMap[alert.investigationId] ?? 'Unknown'
                }
                onMarkRead={handleMarkRead}
                onNavigate={handleNavigateToInvestigation}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
