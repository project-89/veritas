'use client';

import { useEffect, useState } from 'react';
import { fetchCapabilities, type SystemCapabilities } from '../../lib/api';
import { NervPanel } from './nerv-panel';

/**
 * Live capability report straight from GET /capabilities — shows what THIS
 * deployment can actually reach (connectors, feeds, signal sources, LLM),
 * including why anything is down. The point is that degraded capability is
 * visible here instead of surfacing as mystery-empty scan results.
 */
export function CapabilitiesPanel() {
  const [caps, setCaps] = useState<SystemCapabilities | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchCapabilities()
      .then((c) => {
        if (!cancelled) setCaps(c);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <NervPanel title="System Capabilities" accent="orange" corners>
        <p className="px-3 py-3 text-[12px] font-mono text-nerv-text-muted">
          Capability report unavailable — API unreachable.
        </p>
      </NervPanel>
    );
  }

  if (!caps) {
    return (
      <NervPanel title="System Capabilities" accent="orange" corners>
        <p className="px-3 py-3 text-[12px] font-mono text-nerv-text-muted">loading…</p>
      </NervPanel>
    );
  }

  const live = caps.connectors.filter((c) => c.status === 'live');
  const down = caps.connectors.filter((c) => c.status !== 'live');

  return (
    <NervPanel title="System Capabilities" accent="orange" corners>
      <div className="grid grid-cols-1 gap-4 p-3 md:grid-cols-3">
        {/* Connectors */}
        <div>
          <div className="mb-1.5 text-[11px] font-mono uppercase tracking-widest text-nerv-text-muted">
            Connectors — {live.length}/{caps.connectors.length} live
          </div>
          <div className="flex flex-wrap gap-1.5">
            {live.map((c) => (
              <span
                key={c.platform}
                className="flex items-center gap-1 rounded-sm border border-nerv-green/30 bg-nerv-green/5 px-1.5 py-0.5 text-[10px] font-mono text-nerv-green/90"
              >
                <span className="h-1 w-1 rounded-full bg-nerv-green" />
                {c.platform}
              </span>
            ))}
            {down.map((c) => (
              <span
                key={c.platform}
                title={c.detail}
                className="flex items-center gap-1 rounded-sm border border-nerv-border px-1.5 py-0.5 text-[10px] font-mono text-nerv-text-muted/60"
              >
                <span className="h-1 w-1 rounded-full bg-nerv-red/60" />
                {c.platform}
              </span>
            ))}
          </div>
          {down.length > 0 && (
            <p className="mt-1.5 text-[10px] font-mono text-nerv-text-muted leading-snug">
              {down.map((c) => `${c.platform}: ${c.detail ?? 'offline'}`).join(' · ')}
            </p>
          )}
        </div>

        {/* Feeds + signals */}
        <div>
          <div className="mb-1.5 text-[11px] font-mono uppercase tracking-widest text-nerv-text-muted">
            Sources
          </div>
          <ul className="space-y-0.5 text-[11px] font-mono text-nerv-text-secondary">
            <li>
              {caps.feeds.total} RSS feeds ({caps.feeds.tier1} tier-1)
            </li>
            <li>
              {caps.feeds.stateMedia} state-media · {caps.feeds.publicBroadcaster} public
              broadcasters
            </li>
            <li>
              {caps.feeds.domesticAudience} domestic-audience ({caps.feeds.languages.join(', ')})
            </li>
            <li>{caps.signals.length} live signal sources (USGS, GDACS, EONET…)</li>
          </ul>
        </div>

        {/* Analysis */}
        <div>
          <div className="mb-1.5 text-[11px] font-mono uppercase tracking-widest text-nerv-text-muted">
            Analysis
          </div>
          {caps.analysis.llm.available ? (
            <ul className="space-y-0.5 text-[11px] font-mono text-nerv-text-secondary">
              <li className="text-nerv-green/90">LLM online — {caps.analysis.llm.chatModel}</li>
              <li>semantic clustering · grounded claim verification</li>
              <li>translation · propaganda · failure examples</li>
            </ul>
          ) : (
            <p className="text-[11px] font-mono leading-snug text-nerv-amber">
              GEMINI_API_KEY missing — analysis degrades to heuristics/abstention (no semantic
              clustering, claim verification, or translation).
            </p>
          )}
        </div>
      </div>
    </NervPanel>
  );
}
