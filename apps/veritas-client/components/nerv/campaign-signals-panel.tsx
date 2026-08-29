'use client';

import type { CampaignSignal, CampaignSignalsResult } from '../../lib/api';

/**
 * Renders the deterministic campaign signals behind a propaganda assessment.
 *
 * Three states per signal, all visually distinct on purpose:
 *   ELEVATED    exceeded its declared threshold — amber/red, the finding
 *   quiet       measured and unremarkable — neutral, still shown (a null
 *               result is a finding; hiding it would imply it wasn't checked)
 *   unmeasured  below its data floor — muted, with the reason. NEVER rendered
 *               as "clean": absence of assessment is not absence of signal.
 *
 * The evidence strings come from the backend verbatim — they are the numeric,
 * quotable statements ("34% of 61 posts are near-duplicates"), and the UI's
 * job is to show them, not to re-summarize them into adjectives.
 */

const SIGNAL_LABELS: Array<{ key: keyof CampaignSignalsResult & string; label: string }> = [
  { key: 'repetition', label: 'REPETITION' },
  { key: 'synchrony', label: 'SYNCHRONY' },
  { key: 'concentration', label: 'CONCENTRATION' },
  { key: 'infrastructure', label: 'INFRASTRUCTURE' },
  { key: 'crossPlatform', label: 'PROPAGATION' },
];

function SignalRow({ label, signal }: { label: string; signal: CampaignSignal }) {
  const glyph = !signal.measured ? '—' : signal.elevated ? '⚠' : '·';
  const tone = !signal.measured
    ? 'text-nerv-text-muted/50'
    : signal.elevated
      ? 'text-nerv-amber'
      : 'text-nerv-text-secondary';

  return (
    <div className="flex items-start gap-2 px-3 py-1.5 border-b border-nerv-border/40 last:border-b-0">
      <span className={`w-3 shrink-0 text-[12px] font-mono ${tone}`} aria-hidden>
        {glyph}
      </span>
      <div className="min-w-0">
        <span
          className={`text-[10px] font-mono uppercase tracking-wider ${
            signal.elevated ? 'text-nerv-amber' : 'text-nerv-text-muted'
          }`}
        >
          {label}
          {!signal.measured && (
            <span className="ml-1 normal-case tracking-normal text-nerv-text-muted/60 italic">
              not assessed
            </span>
          )}
        </span>
        <div className={`text-[11px] font-mono leading-snug ${tone}`}>{signal.evidence}</div>
      </div>
    </div>
  );
}

export function CampaignSignalsPanel({ signals }: { signals: CampaignSignalsResult }) {
  return (
    <div className="border border-nerv-border rounded-sm">
      <div
        className="px-3 py-1.5 border-b border-nerv-border bg-nerv-surface/50 flex items-baseline justify-between"
        title="Deterministic distributional measures over every post in the corpus — computed without any LLM. Propaganda is a campaign property: these are the campaign-level measurements."
      >
        <span className="text-[10px] font-mono uppercase tracking-wider text-nerv-text-muted">
          Campaign signals · {signals.postCount} posts
        </span>
        <span
          className={`text-[10px] font-mono uppercase ${
            signals.elevatedCount > 0 ? 'text-nerv-amber' : 'text-nerv-text-secondary'
          }`}
        >
          {signals.elevatedCount}/{signals.measurableCount} measurable elevated
        </span>
      </div>
      {SIGNAL_LABELS.map(({ key, label }) => {
        const signal = signals[key];
        return typeof signal === 'object' ? (
          <SignalRow key={key} label={label} signal={signal as CampaignSignal} />
        ) : null;
      })}
    </div>
  );
}
