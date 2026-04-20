'use client';

import type { MentalModel } from '../../../apps/veritas-client/lib/api';
import { NervBadge } from '../../../apps/veritas-client/components/nerv/nerv-badge';

interface AtlasInvestigationPanelProps {
  mentalModel?: MentalModel | null;
  mentalModelSaving?: boolean;
  onBuildMentalModel?: () => Promise<void>;
  onRefreshMentalModel?: () => Promise<void>;
}

export function AtlasInvestigationPanel({
  mentalModel,
  mentalModelSaving,
  onBuildMentalModel,
  onRefreshMentalModel,
}: AtlasInvestigationPanelProps) {
  return (
    <div className="pt-2 border-t border-nerv-border space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted">
          ATLAS LENS
        </div>
        <button
          onClick={() => {
            void onBuildMentalModel?.();
          }}
          disabled={mentalModelSaving || !onBuildMentalModel}
          className="px-2 py-1 text-[8px] font-mono uppercase tracking-wider border border-nerv-orange/50 text-nerv-orange hover:bg-nerv-orange/10 rounded-sm transition-colors disabled:opacity-40 disabled:cursor-wait"
        >
          {mentalModelSaving ? 'BUILDING...' : mentalModel ? 'REFRESH LENS' : 'BUILD LENS'}
        </button>
      </div>

      {mentalModel ? (
        <div className="space-y-2">
          <div className="border border-nerv-border rounded-sm bg-nerv-bg-elevated/20 p-2 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1">
              <div className="text-[10px] font-mono text-nerv-text">{mentalModel.domain}</div>
              <NervBadge label={mentalModel.status.toUpperCase()} variant={mentalModel.status === 'generated' ? 'green' : 'amber'} size="sm" />
              <NervBadge label={`${mentalModel.sourceSummary.processedSeeds}/${mentalModel.sourceSummary.totalSeeds} SRC`} variant="blue" size="sm" />
            </div>
            <div className="text-[9px] font-mono text-nerv-text-secondary leading-relaxed whitespace-pre-wrap">
              {mentalModel.summary}
            </div>
          </div>

          {mentalModel.heuristics.length > 0 && (
            <div className="border border-nerv-border rounded-sm bg-nerv-bg-elevated/20 p-2 space-y-1.5">
              <div className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted">
                HEURISTICS
              </div>
              <div className="space-y-1.5">
                {mentalModel.heuristics.slice(0, 4).map((heuristic) => (
                  <div key={heuristic.title} className="space-y-0.5">
                    <div className="text-[9px] font-mono text-nerv-orange">{heuristic.title}</div>
                    <div className="text-[9px] font-mono text-nerv-text-secondary leading-relaxed">
                      {heuristic.description}
                    </div>
                    {heuristic.evidence.length > 0 && (
                      <div className="text-[8px] font-mono text-nerv-text-muted break-words">
                        {heuristic.evidence.join(' · ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(mentalModel.decisionRules.length > 0 || mentalModel.evidencePreferences.length > 0) && (
            <div className="grid grid-cols-1 gap-2">
              {mentalModel.decisionRules.length > 0 && (
                <div className="border border-nerv-border rounded-sm bg-nerv-bg-elevated/20 p-2 space-y-1">
                  <div className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted">
                    DECISION RULES
                  </div>
                  {mentalModel.decisionRules.slice(0, 4).map((rule, index) => (
                    <div key={`${rule}-${index}`} className="text-[9px] font-mono text-nerv-text-secondary leading-relaxed">
                      {'\u25B8'} {rule}
                    </div>
                  ))}
                </div>
              )}
              {mentalModel.evidencePreferences.length > 0 && (
                <div className="border border-nerv-border rounded-sm bg-nerv-bg-elevated/20 p-2 space-y-1">
                  <div className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted">
                    EVIDENCE PREFS
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {mentalModel.evidencePreferences.slice(0, 6).map((preference) => (
                      <NervBadge key={preference} label={preference} variant="muted" size="sm" />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {onRefreshMentalModel && (
            <button
              onClick={() => {
                void onRefreshMentalModel();
              }}
              className="w-full px-3 py-2 text-[8px] font-mono uppercase tracking-wider border border-nerv-border text-nerv-text-secondary hover:bg-nerv-bg-elevated rounded-sm transition-colors"
            >
              Refresh ATLAS Lens
            </button>
          )}
        </div>
      ) : (
        <div className="px-2 py-3 border border-dashed border-nerv-border rounded-sm text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted text-center">
          Build an ATLAS lens from the attached evidence to capture reasoning patterns and tradecraft.
        </div>
      )}
    </div>
  );
}
