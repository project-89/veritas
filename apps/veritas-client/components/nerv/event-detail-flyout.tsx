'use client';

import Link from 'next/link';
import type { GlobalEvent } from '../../lib/global-event.types';
import { EVENT_COLORS } from '../../lib/global-event.types';

export interface EventDetailFlyoutProps {
  event: GlobalEvent | null;
  onClose: () => void;
}

const SEVERITY_STYLES: Record<string, string> = {
  low: 'bg-nerv-text-muted/20 text-nerv-text-muted',
  medium: 'bg-nerv-amber/20 text-nerv-amber',
  high: 'bg-nerv-orange/20 text-nerv-orange',
  critical: 'bg-nerv-red/20 text-nerv-red',
};

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  } catch {
    return ts;
  }
}

export function EventDetailFlyout({ event, onClose }: EventDetailFlyoutProps) {
  if (!event) return null;

  const metaEntries = Object.entries(event.metadata).filter(
    ([, v]) => v !== null && v !== undefined && v !== '',
  );

  return (
    <div className="w-[320px] shrink-0 bg-nerv-bg-panel border-l border-nerv-border flex flex-col overflow-y-auto animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-nerv-border">
        <span className="text-[10px] font-mono uppercase tracking-widest text-nerv-text-secondary">
          Event Detail
        </span>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center text-nerv-text-muted hover:text-nerv-text transition-colors rounded-sm hover:bg-nerv-bg-elevated"
        >
          <span className="text-sm font-mono">{'\u00D7'}</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 p-3 space-y-4">
        {/* Title */}
        <h2 className="text-sm font-mono font-bold text-nerv-text leading-tight">
          {event.title}
        </h2>

        {/* Badges row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Severity badge */}
          <span
            className={[
              'px-2 py-0.5 rounded-sm text-[9px] font-mono uppercase tracking-wider',
              SEVERITY_STYLES[event.severity] ?? SEVERITY_STYLES.low,
            ].join(' ')}
          >
            {event.severity}
          </span>

          {/* Category badge */}
          <span
            className="px-2 py-0.5 rounded-sm text-[9px] font-mono uppercase tracking-wider"
            style={{
              background: `${EVENT_COLORS[event.category]}20`,
              color: EVENT_COLORS[event.category],
            }}
          >
            {event.category}
          </span>
        </div>

        {/* Source + Timestamp */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono uppercase tracking-wider text-nerv-text-muted w-14">
              Source
            </span>
            <span className="text-[10px] font-mono text-nerv-text-secondary">
              {event.source}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono uppercase tracking-wider text-nerv-text-muted w-14">
              Time
            </span>
            <span className="text-[10px] font-mono text-nerv-text-secondary tabular-nums">
              {formatTimestamp(event.timestamp)}
            </span>
          </div>
        </div>

        {/* Location */}
        <div className="bg-nerv-bg border border-nerv-border rounded-sm p-2.5">
          <div className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted mb-1.5">
            Location
          </div>
          <div className="text-[11px] font-mono text-nerv-text">
            {event.location.label}
          </div>
          <div className="text-[9px] font-mono text-nerv-text-muted mt-0.5 tabular-nums">
            {event.location.lat.toFixed(4)}, {event.location.lng.toFixed(4)}
            {event.location.countryCode && ` (${event.location.countryCode})`}
          </div>
        </div>

        {/* Description */}
        <div>
          <div className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted mb-1.5">
            Description
          </div>
          <p className="text-[11px] font-mono text-nerv-text-secondary leading-relaxed">
            {event.description}
          </p>
        </div>

        {/* Metadata */}
        {metaEntries.length > 0 && (
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted mb-1.5">
              Metadata
            </div>
            <div className="bg-nerv-bg border border-nerv-border rounded-sm divide-y divide-nerv-border">
              {metaEntries.map(([key, value]) => (
                <div key={key} className="flex items-center justify-between px-2.5 py-1.5">
                  <span className="text-[9px] font-mono uppercase tracking-wider text-nerv-text-muted">
                    {key}
                  </span>
                  <span className="text-[10px] font-mono text-nerv-text-secondary tabular-nums">
                    {String(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Investigate button */}
        <Link
          href={`/search?q=${encodeURIComponent(event.title)}`}
          className="flex items-center justify-center w-full px-4 py-2.5 bg-nerv-orange/15 border border-nerv-orange/30 rounded-sm text-[10px] font-mono uppercase tracking-widest text-nerv-orange hover:bg-nerv-orange/25 transition-colors"
        >
          Investigate This
        </Link>
      </div>
    </div>
  );
}
