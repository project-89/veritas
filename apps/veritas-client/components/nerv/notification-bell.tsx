'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type Alert,
  type AlertSeverity,
  fetchAlerts,
  fetchUnreadAlertCount,
  markAlertRead,
  markAllAlertsRead,
} from '../../lib/api';

const SEV_DOT: Record<AlertSeverity, string> = {
  critical: 'bg-nerv-red',
  warning: 'bg-nerv-amber',
  info: 'bg-nerv-blue',
};

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/**
 * Global alerts surface in the top bar: an unread-count bell that opens a
 * dropdown of recent alerts, each linking to its investigation. Replaces the
 * old count-badge-on-the-Monitor-link so alerts are reachable from any page.
 */
export function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Poll the unread count.
  useEffect(() => {
    let mounted = true;
    const poll = () => {
      fetchUnreadAlertCount()
        .then((c) => mounted && setUnread(c))
        .catch(() => undefined);
    };
    poll();
    const id = setInterval(poll, 60_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  // Load recent alerts when the dropdown opens.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchAlerts()
      .then((a) => setAlerts(a.slice(0, 12)))
      .catch(() => setAlerts([]))
      .finally(() => setLoading(false));
  }, [open]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markAll = useCallback(async () => {
    setUnread(0);
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
    await markAllAlertsRead().catch(() => undefined);
  }, []);

  const onOpenAlert = useCallback((alert: Alert) => {
    setOpen(false);
    if (!alert.read) {
      setUnread((c) => Math.max(0, c - 1));
      void markAlertRead(alert._id).catch(() => undefined);
    }
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Alerts${unread > 0 ? ` (${unread} unread)` : ''}`}
        className="relative rounded-sm px-1.5 py-1 text-nerv-text-secondary transition-colors hover:bg-nerv-bg-panel/50 hover:text-nerv-orange"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 3a5 5 0 0 0-5 5v3.5c0 .8-.3 1.5-.9 2.1L5 15h14l-1.1-1.4a3 3 0 0 1-.9-2.1V8a5 5 0 0 0-5-5Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-nerv-red px-1 text-[9px] font-mono font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded border border-nerv-border bg-nerv-bg-panel shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-between border-b border-nerv-border px-3 py-2">
            <span className="text-[12px] font-mono uppercase tracking-[0.18em] text-nerv-text-muted">
              Alerts
            </span>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAll}
                className="text-[10px] font-mono uppercase tracking-wider text-nerv-blue hover:text-nerv-orange"
              >
                mark all read
              </button>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {loading ? (
              <div className="px-3 py-6 text-center text-[11px] font-mono text-nerv-text-muted">
                loading…
              </div>
            ) : alerts.length === 0 ? (
              <div className="px-3 py-6 text-center text-[11px] font-mono text-nerv-text-muted">
                No alerts.
              </div>
            ) : (
              <ul className="divide-y divide-nerv-border/60">
                {alerts.map((a) => (
                  <li key={a._id}>
                    <Link
                      href={`/investigate/${a.investigationId}`}
                      onClick={() => onOpenAlert(a)}
                      className={`flex gap-2 px-3 py-2 transition-colors hover:bg-nerv-bg-elevated/50 ${
                        a.read ? 'opacity-60' : ''
                      }`}
                    >
                      <span
                        className={`mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${SEV_DOT[a.severity] ?? 'bg-nerv-text-muted'}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[12px] font-mono text-nerv-text">
                            {a.title}
                          </span>
                          <span className="shrink-0 text-[10px] font-mono text-nerv-text-muted">
                            {timeAgo(a.createdAt)}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] font-mono text-nerv-text-muted">
                          {a.description}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Link
            href="/monitor"
            onClick={() => setOpen(false)}
            className="block border-t border-nerv-border px-3 py-2 text-center text-[10px] font-mono uppercase tracking-wider text-nerv-text-secondary hover:text-nerv-orange"
          >
            View all in Monitor ▸
          </Link>
        </div>
      )}
    </div>
  );
}
