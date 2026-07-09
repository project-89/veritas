'use client';

import { useState } from 'react';
import type {
  ClaimVerificationBatchResult,
  EvidenceItem,
  InvestigativeLead,
  PropagandaAnalysisResult,
  VerificationResult,
} from '../../lib/api';
import { NervBadge } from './nerv-badge';
import { NervBar } from './nerv-bar';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EvidenceChainPanelProps {
  claims: ClaimVerificationBatchResult | null;
  propaganda: PropagandaAnalysisResult | null;
  onTriggerAnalysis?: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_VARIANT: Record<string, 'green' | 'red' | 'amber' | 'blue' | 'muted'> = {
  verified: 'green',
  disputed: 'red',
  mixed: 'amber',
  false: 'red',
  unverified: 'muted',
};

function sourceIcon(source: string): string {
  const lower = source.toLowerCase();
  if (lower.includes('etherscan') || lower.includes('chain') || lower.includes('dex'))
    return '\u26D3'; // chain
  if (lower.includes('github') || lower.includes('code')) return '\u2318'; // code/command
  if (lower.includes('sec') || lower.includes('edgar') || lower.includes('gov')) return '\u2616'; // building
  if (lower.includes('wikipedia') || lower.includes('gdelt') || lower.includes('news'))
    return '\u2609'; // globe
  return '\u25CB'; // circle
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CollapsibleSection({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-nerv-border rounded-sm">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-nerv-bg-elevated/30 transition-colors"
      >
        <span className="text-[11px] font-mono uppercase tracking-wider text-nerv-text-muted">
          {title}
        </span>
        <span className="text-[11px] text-nerv-text-muted">{isOpen ? '\u25B4' : '\u25BE'}</span>
      </button>
      {isOpen && <div className="px-2 pb-2 space-y-1">{children}</div>}
    </div>
  );
}

function EvidenceItemRow({
  item,
  stance,
}: {
  item: EvidenceItem;
  stance: 'supporting' | 'contradicting';
}) {
  const borderColor = stance === 'supporting' ? 'border-l-nerv-green' : 'border-l-nerv-red';
  const credVariant: 'green' | 'amber' | 'red' =
    item.credibility === 'high' ? 'green' : item.credibility === 'medium' ? 'amber' : 'red';

  return (
    <div className={`pl-2 py-1 border-l-2 ${borderColor} bg-nerv-bg-elevated/20 rounded-r-sm`}>
      <div className="flex items-center gap-1.5">
        <span className="text-[12px]">{sourceIcon(item.source)}</span>
        <span className="text-[11px] font-mono text-nerv-text-secondary font-bold truncate">
          {item.source}
        </span>
        <NervBadge label={item.credibility} variant={credVariant} size="sm" />
      </div>
      <p className="text-[11px] font-mono text-nerv-text-muted leading-relaxed mt-0.5 line-clamp-3">
        {item.excerpt}
      </p>
      {item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] font-mono text-nerv-blue hover:underline mt-0.5 inline-block truncate max-w-full"
        >
          {item.url}
        </a>
      )}
    </div>
  );
}

function LeadCard({ lead }: { lead: InvestigativeLead }) {
  const priorityVariant: 'red' | 'amber' | 'muted' =
    lead.priority === 'high' ? 'red' : lead.priority === 'medium' ? 'amber' : 'muted';

  return (
    <div className="p-2 bg-nerv-bg-elevated/30 border border-nerv-border rounded-sm space-y-1">
      <div className="flex items-start gap-1.5">
        <span className="text-[12px] text-nerv-orange shrink-0">{'\u2753'}</span>
        <span className="text-[11px] font-mono text-nerv-text-secondary leading-relaxed">
          {lead.question}
        </span>
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        <NervBadge label={lead.priority} variant={priorityVariant} size="sm" />
        <NervBadge
          label={lead.automatable ? 'Automatable' : 'Manual'}
          variant={lead.automatable ? 'green' : 'amber'}
          size="sm"
        />
        {lead.dataSources.map((ds) => (
          <NervBadge key={ds} label={ds} variant="blue" size="sm" />
        ))}
      </div>
    </div>
  );
}

function ClaimCard({ result }: { result: VerificationResult }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggle = (section: string) => setExpanded(expanded === section ? null : section);

  const statusVariant = STATUS_VARIANT[result.status] ?? 'muted';
  const hasEvidence =
    result.evidence.supporting.length > 0 || result.evidence.contradicting.length > 0;
  const leads = result.investigativeLeads ?? [];

  return (
    <div className="border border-nerv-border rounded-sm p-2 space-y-2">
      {/* Claim header */}
      <div className="space-y-1">
        <div className="flex items-start gap-2">
          <p className="text-[12px] font-mono text-nerv-text leading-relaxed flex-1">
            {result.claim}
          </p>
          <NervBadge label={result.status} variant={statusVariant} size="sm" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase text-nerv-text-muted shrink-0">
            Confidence
          </span>
          <NervBar
            value={result.confidence}
            color={
              result.confidence > 0.7 ? '#00FF41' : result.confidence > 0.4 ? '#f59e0b' : '#e94560'
            }
            height={4}
            showLabel
          />
        </div>
      </div>

      {/* Evidence section */}
      {hasEvidence && (
        <CollapsibleSection
          title={`Evidence (${result.evidence.supporting.length}S / ${result.evidence.contradicting.length}C)`}
          isOpen={expanded === 'evidence'}
          onToggle={() => toggle('evidence')}
        >
          <div className="space-y-1.5">
            {result.evidence.supporting.map((ev) => (
              <EvidenceItemRow
                key={`s-${ev.source}-${ev.url ?? ev.excerpt.slice(0, 32)}`}
                item={ev}
                stance="supporting"
              />
            ))}
            {result.evidence.contradicting.map((ev) => (
              <EvidenceItemRow
                key={`c-${ev.source}-${ev.url ?? ev.excerpt.slice(0, 32)}`}
                item={ev}
                stance="contradicting"
              />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Investigative leads */}
      {leads.length > 0 && (
        <CollapsibleSection
          title={`Investigative Leads (${leads.length})`}
          isOpen={expanded === 'leads'}
          onToggle={() => toggle('leads')}
        >
          <div className="space-y-1.5">
            {leads.map((lead) => (
              <LeadCard key={lead.question} lead={lead} />
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Reasoning */}
      {result.reasoning && (
        <CollapsibleSection
          title="Reasoning"
          isOpen={expanded === 'reasoning'}
          onToggle={() => toggle('reasoning')}
        >
          <p className="text-[11px] font-mono text-nerv-text-secondary leading-relaxed whitespace-pre-wrap">
            {result.reasoning}
          </p>
          {result.caveats.length > 0 && (
            <div className="mt-1 pt-1 border-t border-nerv-border/30">
              <span className="text-[10px] font-mono uppercase text-nerv-text-muted">Caveats:</span>
              {result.caveats.map((c) => (
                <p key={c} className="text-[10px] font-mono text-nerv-amber/80 leading-relaxed">
                  {'\u25B3'} {c}
                </p>
              ))}
            </div>
          )}
        </CollapsibleSection>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function EvidenceChainPanel({
  claims,
  propaganda,
  onTriggerAnalysis,
}: EvidenceChainPanelProps) {
  if (!claims) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-nerv-text-muted text-3xl mb-3">{'\u2696'}</div>
          <div className="text-[13px] font-mono uppercase tracking-widest text-nerv-text-muted mb-2">
            EVIDENCE CHAINS
          </div>
          <div className="text-[13px] font-mono text-nerv-text-secondary max-w-[320px] leading-relaxed">
            Evidence chains populate after claim verification. Run propaganda analysis first.
          </div>
          {onTriggerAnalysis && (
            <button
              type="button"
              onClick={onTriggerAnalysis}
              className="mt-4 px-4 py-2 text-[12px] font-mono uppercase tracking-wider border border-nerv-amber text-nerv-amber hover:bg-nerv-amber/10 rounded-sm transition-colors font-bold"
            >
              RUN ANALYSIS
            </button>
          )}
          <div className="text-[13px] font-mono text-nerv-orange mt-3 max-w-[320px] leading-relaxed">
            {'\u2192'} Click <span className="font-bold">ANALYZE</span> on a scanned narrative to
            generate claims and verify them.
          </div>
        </div>
      </div>
    );
  }

  const totalLeads =
    (claims.investigativeLeads ?? []).length +
    claims.results.reduce((acc, r) => acc + (r.investigativeLeads?.length ?? 0), 0);

  return (
    <div className="h-full flex flex-col">
      {/* Summary header */}
      <div className="shrink-0 px-3 py-2 border-b border-nerv-border bg-nerv-bg">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[12px] font-mono font-bold text-nerv-orange uppercase tracking-wider">
            Evidence Chains
          </span>
          <div className="flex items-center gap-2">
            <NervBadge label={`${claims.verifiedCount} verified`} variant="green" size="sm" />
            <NervBadge label={`${claims.disputedCount} disputed`} variant="red" size="sm" />
            <NervBadge label={`${claims.unverifiedCount} unverified`} variant="muted" size="sm" />
            {totalLeads > 0 && (
              <NervBadge label={`${totalLeads} leads`} variant="amber" size="sm" />
            )}
          </div>
        </div>
        {claims.summary && (
          <p className="text-[11px] font-mono text-nerv-text-secondary leading-relaxed mt-1">
            {claims.summary}
          </p>
        )}
        {propaganda && (
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] font-mono uppercase text-nerv-text-muted">
              Manipulation:
            </span>
            <NervBadge
              label={propaganda.overallAssessment.manipulationLikelihood}
              variant={
                propaganda.overallAssessment.manipulationLikelihood === 'high'
                  ? 'red'
                  : propaganda.overallAssessment.manipulationLikelihood === 'medium'
                    ? 'amber'
                    : 'green'
              }
              size="sm"
            />
            <NervBar value={propaganda.overallAssessment.confidence} color="#f59e0b" height={4} />
          </div>
        )}
      </div>

      {/* Claims list */}
      <div className="flex-1 overflow-auto p-3 space-y-2">
        {claims.results.map((result) => (
          <ClaimCard key={`${result.claim}-${result.status}`} result={result} />
        ))}

        {/* Batch-level investigative leads */}
        {(claims.investigativeLeads ?? []).length > 0 && (
          <div className="border border-nerv-orange/30 bg-nerv-orange/5 rounded-sm p-2 space-y-1.5">
            <div className="text-[11px] font-mono uppercase tracking-wider text-nerv-orange font-bold">
              Additional Investigative Leads
            </div>
            {(claims.investigativeLeads ?? []).map((lead) => (
              <LeadCard key={lead.question} lead={lead} />
            ))}
          </div>
        )}

        {/* Propaganda techniques summary */}
        {propaganda && propaganda.techniques.length > 0 && (
          <div className="border border-nerv-border rounded-sm p-2 space-y-1">
            <div className="text-[11px] font-mono uppercase tracking-wider text-nerv-text-muted">
              Propaganda Techniques Detected ({propaganda.techniques.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {propaganda.techniques.map((tech) => (
                <NervBadge key={tech.name} label={tech.name} variant="red" size="sm" />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
