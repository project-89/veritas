'use client';

import type { ReactNode } from 'react';

interface MentalModelLike {
  domain: string;
  status: 'draft' | 'generating' | 'generated' | 'failed';
  summary: string;
  sourceSummary: {
    totalSeeds: number;
    processedSeeds: number;
  };
  heuristics: Array<{
    title: string;
    description: string;
    evidence: string[];
  }>;
  decisionRules: string[];
  evidencePreferences: string[];
}

interface AtlasInvestigationPanelProps {
  mentalModel?: MentalModelLike | null;
  mentalModelSaving?: boolean;
  onBuildMentalModel?: () => Promise<void>;
  onRefreshMentalModel?: () => Promise<void>;
}

function AtlasBadge({
  label,
  variant = 'muted',
}: {
  label: string;
  variant?: 'muted' | 'blue' | 'green' | 'amber' | 'red';
}) {
  const variantClass = {
    muted: 'border-nerv-border text-nerv-text-muted bg-nerv-bg-elevated/20',
    blue: 'border-nerv-blue/40 text-nerv-blue bg-nerv-blue/10',
    green: 'border-nerv-green/40 text-nerv-green bg-nerv-green/10',
    amber: 'border-nerv-amber/40 text-nerv-amber bg-nerv-amber/10',
    red: 'border-nerv-red/40 text-nerv-red bg-nerv-red/10',
  }[variant];

  return (
    <span
      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wider ${variantClass}`}
    >
      {label}
    </span>
  );
}

function PanelSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5 rounded-sm border border-nerv-border bg-nerv-bg-elevated/20 p-2">
      <div className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted">
        {label}
      </div>
      {children}
    </div>
  );
}

export function AtlasInvestigationPanel({
  mentalModel,
  mentalModelSaving,
  onBuildMentalModel,
  onRefreshMentalModel,
}: AtlasInvestigationPanelProps) {
  return (
    <div className="space-y-2 border-t border-nerv-border pt-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted">
          ATLAS LENS
        </div>
        <button
          type="button"
          onClick={() => {
            void onBuildMentalModel?.();
          }}
          disabled={mentalModelSaving || !onBuildMentalModel}
          className="rounded-sm border border-nerv-orange/50 px-2 py-1 text-[8px] font-mono uppercase tracking-wider text-nerv-orange transition-colors hover:bg-nerv-orange/10 disabled:cursor-wait disabled:opacity-40"
        >
          {mentalModelSaving ? 'BUILDING...' : mentalModel ? 'REFRESH LENS' : 'BUILD LENS'}
        </button>
      </div>

      {mentalModel ? (
        <div className="space-y-2">
          <div className="space-y-1.5 rounded-sm border border-nerv-border bg-nerv-bg-elevated/20 p-2">
            <div className="flex flex-wrap items-center gap-1">
              <div className="text-[10px] font-mono text-nerv-text">{mentalModel.domain}</div>
              <AtlasBadge
                label={mentalModel.status.toUpperCase()}
                variant={mentalModel.status === 'generated' ? 'green' : 'amber'}
              />
              <AtlasBadge
                label={`${mentalModel.sourceSummary.processedSeeds}/${mentalModel.sourceSummary.totalSeeds} SRC`}
                variant="blue"
              />
            </div>
            <div className="whitespace-pre-wrap text-[9px] font-mono leading-relaxed text-nerv-text-secondary">
              {mentalModel.summary}
            </div>
          </div>

          {mentalModel.heuristics.length > 0 ? (
            <PanelSection label="Heuristics">
              <div className="space-y-1.5">
                {mentalModel.heuristics.slice(0, 4).map((heuristic) => (
                  <div key={heuristic.title} className="space-y-0.5">
                    <div className="text-[9px] font-mono text-nerv-orange">{heuristic.title}</div>
                    <div className="text-[9px] font-mono leading-relaxed text-nerv-text-secondary">
                      {heuristic.description}
                    </div>
                    {heuristic.evidence.length > 0 ? (
                      <div className="break-words text-[8px] font-mono text-nerv-text-muted">
                        {heuristic.evidence.join(' · ')}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </PanelSection>
          ) : null}

          {mentalModel.decisionRules.length > 0 || mentalModel.evidencePreferences.length > 0 ? (
            <div className="grid grid-cols-1 gap-2">
              {mentalModel.decisionRules.length > 0 ? (
                <PanelSection label="Decision Rules">
                  {mentalModel.decisionRules.slice(0, 4).map((rule, index) => (
                    <div
                      key={`${rule}-${index}`}
                      className="text-[9px] font-mono leading-relaxed text-nerv-text-secondary"
                    >
                      {'\u25B8'} {rule}
                    </div>
                  ))}
                </PanelSection>
              ) : null}
              {mentalModel.evidencePreferences.length > 0 ? (
                <PanelSection label="Evidence Prefs">
                  <div className="flex flex-wrap gap-1">
                    {mentalModel.evidencePreferences.slice(0, 6).map((preference) => (
                      <AtlasBadge key={preference} label={preference} variant="muted" />
                    ))}
                  </div>
                </PanelSection>
              ) : null}
            </div>
          ) : null}

          {onRefreshMentalModel ? (
            <button
              type="button"
              onClick={() => {
                void onRefreshMentalModel();
              }}
              className="w-full rounded-sm border border-nerv-border px-3 py-2 text-[8px] font-mono uppercase tracking-wider text-nerv-text-secondary transition-colors hover:bg-nerv-bg-elevated"
            >
              Refresh ATLAS Lens
            </button>
          ) : null}
        </div>
      ) : (
        <div className="rounded-sm border border-dashed border-nerv-border px-2 py-3 text-center text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted">
          Build an ATLAS lens from the attached evidence to capture reasoning patterns and
          tradecraft.
        </div>
      )}
    </div>
  );
}
