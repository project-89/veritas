'use client';

import type {
  IntelligenceReport,
  CoordinatedCampaignReport,
  MarketManipulationReport,
  CrisisWarningReport,
  InfluenceOperationReport,
  NarrativeLegitimacyReport,
} from '../../lib/api';
import { NervBadge } from './nerv-badge';
import { NervBar } from './nerv-bar';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface IntelligenceReportPanelProps {
  report: IntelligenceReport | null;
  loading?: boolean;
  onRunAssessment?: (type: string) => void;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function ConfidenceBar({ value, label }: { value: number; label?: string }) {
  const color =
    value > 0.7 ? 'rgb(var(--nerv-red))' : value > 0.4 ? 'rgb(var(--nerv-orange))' : 'rgb(var(--nerv-green))';
  return (
    <div className="space-y-1">
      {label && (
        <span className="text-[9px] font-mono uppercase tracking-wider text-nerv-text-muted">
          {label}
        </span>
      )}
      <div className="flex items-center gap-2">
        <NervBar value={value} color={color} />
        <span className="text-[10px] font-mono tabular-nums text-nerv-text-secondary shrink-0">
          {(value * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted border-b border-nerv-border pb-1 mb-2">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state — 5 assessment type buttons
// ---------------------------------------------------------------------------

const ASSESSMENT_TYPES: {
  type: string;
  label: string;
  color: string;
  hoverBg: string;
  borderColor: string;
  icon: string;
}[] = [
  { type: 'campaign', label: 'DETECT COORDINATED CAMPAIGN', color: 'text-nerv-red', hoverBg: 'hover:bg-nerv-red/10', borderColor: 'border-nerv-red/50', icon: '\u25C9' },
  { type: 'manipulation', label: 'CHECK MARKET MANIPULATION', color: 'text-nerv-amber', hoverBg: 'hover:bg-nerv-amber/10', borderColor: 'border-nerv-amber/50', icon: '\u25B2' },
  { type: 'crisis', label: 'CRISIS EARLY WARNING', color: 'text-nerv-orange', hoverBg: 'hover:bg-nerv-orange/10', borderColor: 'border-nerv-orange/50', icon: '\u26A0' },
  { type: 'influence', label: 'ATTRIBUTE INFLUENCE OPS', color: 'text-nerv-purple', hoverBg: 'hover:bg-nerv-purple/10', borderColor: 'border-nerv-purple/50', icon: '\u2B21' },
  { type: 'legitimacy', label: 'SCORE NARRATIVE LEGITIMACY', color: 'text-nerv-blue', hoverBg: 'hover:bg-nerv-blue/10', borderColor: 'border-nerv-blue/50', icon: '\u2714' },
];

function EmptyState({ onRunAssessment }: { onRunAssessment?: (type: string) => void }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center max-w-md space-y-4">
        <div className="text-nerv-text-muted text-3xl mb-2">{'\u2B22'}</div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted">
          INTELLIGENCE ENGINE
        </div>
        <div className="text-[10px] font-mono text-nerv-text-secondary leading-relaxed">
          Run an intelligence assessment to analyze narratives for coordinated campaigns, market manipulation, crisis signals, influence operations, or legitimacy.
        </div>
        <div className="space-y-2 pt-2">
          {ASSESSMENT_TYPES.map((a) => (
            <button
              key={a.type}
              onClick={() => onRunAssessment?.(a.type)}
              disabled={!onRunAssessment}
              className={`w-full px-4 py-2 text-[9px] font-mono uppercase tracking-wider border ${a.borderColor} ${a.color} ${a.hoverBg} rounded-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2`}
            >
              <span>{a.icon}</span>
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Campaign report
// ---------------------------------------------------------------------------

const ROLE_COLORS: Record<string, string> = {
  orchestrator: 'text-nerv-red',
  amplifier: 'text-nerv-amber',
  bot: 'text-nerv-purple',
  organic: 'text-nerv-green',
};

const ROLE_VARIANTS: Record<string, 'red' | 'amber' | 'purple' | 'green' | 'muted'> = {
  orchestrator: 'red',
  amplifier: 'amber',
  bot: 'purple',
  organic: 'green',
};

function CampaignReportView({ report }: { report: CoordinatedCampaignReport }) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ConfidenceBar value={report.confidence} label="CAMPAIGN CONFIDENCE" />
        <NervBadge
          label={report.campaignDetected ? 'DETECTED' : 'NOT DETECTED'}
          variant={report.campaignDetected ? 'red' : 'green'}
          size="md"
        />
      </div>

      <div className="text-[10px] font-mono text-nerv-text-secondary leading-relaxed">
        {report.summary}
      </div>

      {/* Signals */}
      {report.signals.length > 0 && (
        <div>
          <SectionHeader>SIGNALS ({report.signals.length})</SectionHeader>
          <div className="space-y-2">
            {report.signals.map((signal, i) => (
              <div
                key={i}
                className="bg-nerv-bg-panel border border-nerv-border rounded-sm p-2 space-y-1"
              >
                <div className="flex items-center gap-2">
                  <NervBadge label={signal.type.replace(/_/g, ' ').toUpperCase()} variant="amber" size="sm" />
                  <span className="text-[9px] font-mono tabular-nums text-nerv-text-muted">
                    {(signal.confidence * 100).toFixed(0)}% confidence
                  </span>
                </div>
                <div className="text-[10px] font-mono text-nerv-text-secondary">
                  {signal.description}
                </div>
                {signal.actors.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {signal.actors.slice(0, 8).map((a) => (
                      <span key={a} className="text-[8px] font-mono text-nerv-text-muted bg-nerv-bg-elevated px-1 py-0.5 rounded-sm">
                        @{a}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actor table */}
      {report.actors.length > 0 && (
        <div>
          <SectionHeader>ACTORS ({report.actors.length})</SectionHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-[9px] font-mono">
              <thead>
                <tr className="text-nerv-text-muted uppercase tracking-wider">
                  <th className="text-left py-1 pr-2">Handle</th>
                  <th className="text-left py-1 pr-2">Role</th>
                  <th className="text-right py-1 pr-2">Bot</th>
                  <th className="text-right py-1">Influence</th>
                </tr>
              </thead>
              <tbody>
                {report.actors.slice(0, 20).map((actor) => (
                  <tr key={actor.handle} className="border-t border-nerv-border/30">
                    <td className="py-1 pr-2 text-nerv-text-secondary">@{actor.handle}</td>
                    <td className={`py-1 pr-2 ${ROLE_COLORS[actor.role] ?? 'text-nerv-text-muted'}`}>
                      <NervBadge
                        label={actor.role.toUpperCase()}
                        variant={ROLE_VARIANTS[actor.role] ?? 'muted'}
                        size="sm"
                      />
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums text-nerv-text-muted">
                      {(actor.botProbability * 100).toFixed(0)}%
                    </td>
                    <td className="py-1 text-right tabular-nums text-nerv-text-muted">
                      {(actor.influenceScore * 100).toFixed(0)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Timeline */}
      {report.timeline.length > 0 && (
        <div>
          <SectionHeader>TIMELINE</SectionHeader>
          <div className="space-y-1">
            {report.timeline.map((ev, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-[8px] font-mono tabular-nums text-nerv-text-muted shrink-0 pt-0.5">
                  {new Date(ev.timestamp).toLocaleString()}
                </span>
                <div className="w-1.5 h-1.5 rounded-full bg-nerv-orange mt-1 shrink-0" />
                <span className="text-[9px] font-mono text-nerv-text-secondary">
                  <span className="text-nerv-text-muted">@{ev.actor}</span> {ev.event}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manipulation report
// ---------------------------------------------------------------------------

const PATTERN_VARIANTS: Record<string, 'red' | 'amber' | 'purple' | 'blue' | 'muted'> = {
  pump: 'red',
  fud: 'amber',
  wash_narrative: 'purple',
  coordinated_shill: 'blue',
};

function ManipulationReportView({ report }: { report: MarketManipulationReport }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <ConfidenceBar value={report.confidence} label="MANIPULATION CONFIDENCE" />
        <NervBadge
          label={report.manipulationDetected ? 'DETECTED' : 'NOT DETECTED'}
          variant={report.manipulationDetected ? 'red' : 'green'}
          size="md"
        />
      </div>

      <div className="text-[10px] font-mono text-nerv-text-secondary leading-relaxed">
        {report.summary}
      </div>

      {/* Tickers mentioned */}
      {report.tickersMentioned.length > 0 && (
        <div>
          <SectionHeader>TICKERS</SectionHeader>
          <div className="flex flex-wrap gap-1">
            {report.tickersMentioned.map((t) => (
              <NervBadge key={t} label={`$${t}`} variant="amber" size="md" />
            ))}
          </div>
        </div>
      )}

      {/* Patterns */}
      {report.patterns.length > 0 && (
        <div>
          <SectionHeader>PATTERNS ({report.patterns.length})</SectionHeader>
          <div className="space-y-2">
            {report.patterns.map((pattern, i) => (
              <div
                key={i}
                className="bg-nerv-bg-panel border border-nerv-border rounded-sm p-2 space-y-1"
              >
                <div className="flex items-center gap-2">
                  <NervBadge
                    label={pattern.type.replace(/_/g, ' ').toUpperCase()}
                    variant={PATTERN_VARIANTS[pattern.type] ?? 'muted'}
                    size="sm"
                  />
                  <span className="text-[9px] font-mono text-nerv-text-muted">
                    ${pattern.ticker}
                  </span>
                  <span className="text-[9px] font-mono tabular-nums text-nerv-text-muted ml-auto">
                    {(pattern.confidence * 100).toFixed(0)}% conf
                  </span>
                </div>
                <div className="text-[10px] font-mono text-nerv-text-secondary">
                  {pattern.description}
                </div>
                <div className="flex gap-3 text-[8px] font-mono text-nerv-text-muted">
                  <span>Sentiment: {pattern.narrativeSentiment.toFixed(2)}</span>
                  <span>Price: {pattern.priceDirection}</span>
                  <span>Correlation: {pattern.correlation.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Crisis report
// ---------------------------------------------------------------------------

const SEVERITY_COLORS: Record<string, string> = {
  emergency: 'border-nerv-red bg-nerv-red/5',
  warning: 'border-nerv-amber bg-nerv-amber/5',
  watch: 'border-nerv-blue bg-nerv-blue/5',
};

const SEVERITY_VARIANTS: Record<string, 'red' | 'amber' | 'blue' | 'muted'> = {
  emergency: 'red',
  warning: 'amber',
  watch: 'blue',
};

function CrisisReportView({ report }: { report: CrisisWarningReport }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <NervBadge
          label={`SEVERITY: ${report.highestSeverity.toUpperCase()}`}
          variant={SEVERITY_VARIANTS[report.highestSeverity] ?? 'muted'}
          size="md"
        />
        <span className="text-[9px] font-mono text-nerv-text-muted">
          {report.totalEventsAnalyzed} events analyzed
        </span>
      </div>

      <div className="text-[10px] font-mono text-nerv-text-secondary leading-relaxed">
        {report.summary}
      </div>

      {/* Regional alerts */}
      {report.alerts.length > 0 && (
        <div>
          <SectionHeader>REGIONAL ALERTS ({report.alerts.length})</SectionHeader>
          <div className="space-y-2">
            {report.alerts.map((alert, i) => (
              <div
                key={i}
                className={`border rounded-sm p-3 space-y-2 ${SEVERITY_COLORS[alert.severity] ?? 'border-nerv-border'}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <NervBadge label={alert.severity.toUpperCase()} variant={SEVERITY_VARIANTS[alert.severity] ?? 'muted'} size="sm" />
                    <span className="text-[10px] font-mono font-bold text-nerv-text-primary">
                      {alert.region}
                    </span>
                  </div>
                  <span className="text-[8px] font-mono text-nerv-text-muted">
                    {alert.sourceCount} source(s)
                  </span>
                </div>
                <div className="text-[10px] font-mono text-nerv-text-secondary">
                  {alert.description}
                </div>
                {alert.narrativeCorrelation > 0.3 && (
                  <ConfidenceBar value={alert.narrativeCorrelation} label="NARRATIVE CORRELATION" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Regions affected */}
      {report.regionsAffected.length > 0 && (
        <div>
          <SectionHeader>REGIONS</SectionHeader>
          <div className="flex flex-wrap gap-1">
            {report.regionsAffected.map((r) => (
              <NervBadge key={r} label={r} variant="muted" size="sm" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Influence report
// ---------------------------------------------------------------------------

const ATTR_ROLE_COLORS: Record<string, string> = {
  originator: 'text-nerv-red',
  amplifier: 'text-nerv-amber',
  target: 'text-nerv-blue',
  beneficiary: 'text-nerv-purple',
};

function InfluenceReportView({ report }: { report: InfluenceOperationReport }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <ConfidenceBar value={report.confidence} label="INFLUENCE OP CONFIDENCE" />
        <NervBadge
          label={report.operationDetected ? 'DETECTED' : 'NOT DETECTED'}
          variant={report.operationDetected ? 'red' : 'green'}
          size="md"
        />
      </div>

      <div className="text-[10px] font-mono text-nerv-text-secondary leading-relaxed">
        {report.summary}
      </div>

      {/* Attribution chain */}
      {report.attributionChain.length > 0 && (
        <div>
          <SectionHeader>ATTRIBUTION CHAIN</SectionHeader>
          <div className="space-y-1">
            {report.attributionChain.map((node, i) => (
              <div key={i} className="flex items-center gap-2">
                {i > 0 && (
                  <span className="text-[8px] text-nerv-text-muted">{'\u2192'}</span>
                )}
                <div className="bg-nerv-bg-panel border border-nerv-border rounded-sm px-2 py-1 flex items-center gap-2">
                  <span className={`text-[9px] font-mono font-bold ${ATTR_ROLE_COLORS[node.role] ?? 'text-nerv-text-muted'}`}>
                    {node.role.toUpperCase()}
                  </span>
                  <span className="text-[9px] font-mono text-nerv-text-secondary">
                    @{node.handle}
                  </span>
                  <span className="text-[8px] font-mono text-nerv-text-muted">
                    {node.platform}
                  </span>
                  <span className="text-[8px] font-mono tabular-nums text-nerv-text-muted">
                    {(node.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Beneficiaries */}
      {report.beneficiaries.length > 0 && (
        <div>
          <SectionHeader>BENEFICIARIES</SectionHeader>
          <div className="space-y-2">
            {report.beneficiaries.map((b, i) => (
              <div
                key={i}
                className="bg-nerv-bg-panel border border-nerv-purple/30 rounded-sm p-2 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-nerv-purple">
                    {b.entity}
                  </span>
                  <span className="text-[8px] font-mono tabular-nums text-nerv-text-muted">
                    {(b.confidence * 100).toFixed(0)}% confidence
                  </span>
                </div>
                <div className="text-[9px] font-mono text-nerv-text-secondary">
                  {b.howTheyBenefit}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Platforms */}
      {report.platformsInvolved.length > 0 && (
        <div>
          <SectionHeader>PLATFORMS INVOLVED</SectionHeader>
          <div className="flex flex-wrap gap-1">
            {report.platformsInvolved.map((p) => (
              <NervBadge key={p} label={p.toUpperCase()} variant="muted" size="sm" />
            ))}
          </div>
        </div>
      )}

      {/* Investigative leads */}
      {report.investigativeLeads.length > 0 && (
        <div>
          <SectionHeader>INVESTIGATIVE LEADS</SectionHeader>
          <div className="space-y-1">
            {report.investigativeLeads.map((lead, i) => (
              <div key={i} className="flex items-start gap-2 text-[9px] font-mono">
                <NervBadge
                  label={lead.priority.toUpperCase()}
                  variant={lead.priority === 'high' ? 'red' : lead.priority === 'medium' ? 'amber' : 'muted'}
                  size="sm"
                />
                <span className="text-nerv-text-secondary">{lead.question}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legitimacy report
// ---------------------------------------------------------------------------

const VERDICT_CONFIG: Record<string, { color: string; bg: string; borderColor: string }> = {
  legitimate: { color: 'text-nerv-green', bg: 'bg-nerv-green/10', borderColor: 'border-nerv-green/50' },
  likely_legitimate: { color: 'text-nerv-green/80', bg: 'bg-nerv-green/5', borderColor: 'border-nerv-green/30' },
  uncertain: { color: 'text-nerv-amber', bg: 'bg-nerv-amber/10', borderColor: 'border-nerv-amber/50' },
  likely_false: { color: 'text-nerv-red/80', bg: 'bg-nerv-red/5', borderColor: 'border-nerv-red/30' },
  false: { color: 'text-nerv-red', bg: 'bg-nerv-red/10', borderColor: 'border-nerv-red/50' },
};

const VERDICT_VARIANTS: Record<string, 'green' | 'amber' | 'red' | 'muted'> = {
  legitimate: 'green',
  likely_legitimate: 'green',
  uncertain: 'amber',
  likely_false: 'red',
  false: 'red',
};

const STATUS_VARIANTS: Record<string, 'green' | 'amber' | 'red' | 'muted'> = {
  verified: 'green',
  mixed: 'amber',
  disputed: 'red',
  false: 'red',
  unverified: 'muted',
};

function LegitimacyReportView({ report }: { report: NarrativeLegitimacyReport }) {
  const verdictCfg = VERDICT_CONFIG[report.verdict] ?? VERDICT_CONFIG.uncertain!;

  return (
    <div className="space-y-4">
      {/* Big verdict badge */}
      <div className={`border ${verdictCfg.borderColor} ${verdictCfg.bg} rounded-sm p-4 text-center`}>
        <div className={`text-2xl font-mono font-bold uppercase tracking-wider ${verdictCfg.color}`}>
          {report.verdict.replace(/_/g, ' ')}
        </div>
        <div className="text-[9px] font-mono text-nerv-text-muted mt-1">
          NARRATIVE LEGITIMACY VERDICT
        </div>
      </div>

      {/* Score bar */}
      <ConfidenceBar value={report.score} label="LEGITIMACY SCORE" />

      <div className="text-[10px] font-mono text-nerv-text-secondary leading-relaxed">
        {report.summary}
      </div>

      {/* Evidence balance */}
      <div>
        <SectionHeader>EVIDENCE BALANCE</SectionHeader>
        <div className="flex gap-4 text-[10px] font-mono">
          <div className="flex items-center gap-1">
            <span className="text-nerv-green">{'\u25B2'}</span>
            <span className="text-nerv-text-secondary">
              {report.verifiedClaimCount} verified
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-nerv-red">{'\u25BC'}</span>
            <span className="text-nerv-text-secondary">
              {report.disputedClaimCount} disputed
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-nerv-text-muted">{'\u25CF'}</span>
            <span className="text-nerv-text-secondary">
              {report.unverifiedClaimCount} unverified
            </span>
          </div>
        </div>
        <div className="mt-2">
          <NervBar
            value={(report.evidenceBalance + 1) / 2}
            color={report.evidenceBalance > 0.2 ? 'rgb(var(--nerv-green))' : report.evidenceBalance < -0.2 ? 'rgb(var(--nerv-red))' : 'rgb(var(--nerv-orange))'}
          />
        </div>
      </div>

      {/* Claim breakdown */}
      {report.claimBreakdown.length > 0 && (
        <div>
          <SectionHeader>CLAIM BREAKDOWN ({report.claimBreakdown.length})</SectionHeader>
          <div className="space-y-1">
            {report.claimBreakdown.map((claim, i) => (
              <div key={i} className="flex items-start gap-2">
                <NervBadge
                  label={claim.status.toUpperCase()}
                  variant={STATUS_VARIANTS[claim.status] ?? 'muted'}
                  size="sm"
                />
                <span className="text-[9px] font-mono text-nerv-text-secondary line-clamp-2">
                  {claim.claim}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Source quality */}
      <div>
        <SectionHeader>SOURCE QUALITY</SectionHeader>
        <ConfidenceBar value={report.platformCredibilityAvg} label="PLATFORM CREDIBILITY AVG" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function IntelligenceReportPanel({
  report,
  loading = false,
  onRunAssessment,
}: IntelligenceReportPanelProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-nerv-orange text-2xl mb-3 animate-pulse">{'\u25C9'}</div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted">
            RUNNING INTELLIGENCE ASSESSMENT...
          </div>
        </div>
      </div>
    );
  }

  if (!report) {
    return <EmptyState onRunAssessment={onRunAssessment} />;
  }

  return (
    <div className="h-full overflow-auto p-4">
      {/* Header with type badge + run another */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted">
            INTELLIGENCE REPORT
          </span>
          <NervBadge
            label={report.type.toUpperCase()}
            variant={
              report.type === 'campaign' ? 'red' :
              report.type === 'manipulation' ? 'amber' :
              report.type === 'crisis' ? 'orange' :
              report.type === 'influence' ? 'purple' : 'blue'
            }
            size="md"
          />
        </div>
        {onRunAssessment && (
          <div className="flex gap-1">
            {ASSESSMENT_TYPES.filter((a) => a.type !== report.type).map((a) => (
              <button
                key={a.type}
                onClick={() => onRunAssessment(a.type)}
                className={`px-2 py-1 text-[8px] font-mono uppercase tracking-wider border ${a.borderColor} ${a.color} ${a.hoverBg} rounded-sm transition-colors`}
                title={a.label}
              >
                {a.icon}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Report body */}
      {report.type === 'campaign' && <CampaignReportView report={report.report} />}
      {report.type === 'manipulation' && <ManipulationReportView report={report.report} />}
      {report.type === 'crisis' && <CrisisReportView report={report.report} />}
      {report.type === 'influence' && <InfluenceReportView report={report.report} />}
      {report.type === 'legitimacy' && <LegitimacyReportView report={report.report} />}
    </div>
  );
}
