'use client';

import { useMemo } from 'react';
import type {
  ClaimVerificationBatchResult,
  ExtractedClaim,
  PropagandaAnalysisResult,
  VerificationResult,
} from '../../lib/api';
import { NervBadge } from './nerv-badge';
import { NervBar } from './nerv-bar';
import type { NervTableColumn } from './nerv-table';
import { NervTable } from './nerv-table';

interface ClaimRow {
  index: number;
  claim: string;
  type: string;
  verifiability: string;
  frequency: number;
  status: string;
  confidence: number;
}

const STATUS_VARIANT: Record<string, 'green' | 'red' | 'amber' | 'orange' | 'muted'> = {
  verified: 'green',
  disputed: 'red',
  mixed: 'amber',
  false: 'red',
  unverified: 'muted',
};

const TYPE_VARIANT: Record<string, 'blue' | 'purple' | 'amber' | 'orange'> = {
  factual: 'blue',
  interpretive: 'purple',
  predictive: 'amber',
  normative: 'orange',
};

interface ClaimsMatrixProps {
  propaganda: PropagandaAnalysisResult | null;
  claims: ClaimVerificationBatchResult | null;
  selectedClaimIndex: number | null;
  onSelectClaim: (index: number | null) => void;
  onRunPropaganda?: () => void;
  propagandaLoading?: boolean;
  onVerifyClaims?: () => void;
  verifyingClaims?: boolean;
}

export function ClaimsMatrix({
  propaganda,
  claims,
  selectedClaimIndex,
  onSelectClaim,
  onRunPropaganda,
  propagandaLoading,
  onVerifyClaims,
  verifyingClaims,
}: ClaimsMatrixProps) {
  const rows: ClaimRow[] = useMemo(() => {
    if (!propaganda?.claims) return [];

    // Index verifications by normalized claim text so a difference in casing or
    // surrounding whitespace between extraction and verification doesn't silently
    // drop every row to "unverified".
    const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    const verificationByClaim = new Map<string, VerificationResult>();
    for (const r of claims?.results ?? []) {
      verificationByClaim.set(normalize(r.claim), r);
    }

    return propaganda.claims.map((c: ExtractedClaim, i: number) => {
      const verification: VerificationResult | undefined = verificationByClaim.get(
        normalize(c.claim),
      );
      return {
        index: i,
        claim: c.claim,
        type: c.type,
        verifiability: c.verifiability,
        frequency: c.frequency,
        status: verification?.status ?? 'unverified',
        confidence: verification?.confidence ?? 0,
      };
    });
  }, [propaganda, claims]);

  const columns: NervTableColumn<ClaimRow>[] = useMemo(
    () => [
      {
        key: 'status',
        label: 'Status',
        sortable: true,
        width: '90px',
        render: (val: unknown) => {
          const s = val as string;
          return (
            <NervBadge label={s.toUpperCase()} variant={STATUS_VARIANT[s] ?? 'muted'} size="sm" />
          );
        },
      },
      {
        key: 'claim',
        label: 'Claim',
        sortable: false,
        render: (val: unknown) => (
          <span
            className="text-nerv-text font-mono text-[12px] leading-snug line-clamp-2"
            title={val as string}
          >
            {val as string}
          </span>
        ),
      },
      {
        key: 'type',
        label: 'Type',
        sortable: true,
        width: '80px',
        render: (val: unknown) => {
          const t = val as string;
          return (
            <NervBadge label={t.toUpperCase()} variant={TYPE_VARIANT[t] ?? 'muted'} size="sm" />
          );
        },
      },
      {
        key: 'confidence',
        label: 'Conf',
        sortable: true,
        width: '80px',
        render: (val: unknown) => {
          const v = val as number;
          if (v === 0) return <span className="text-nerv-text-muted">--</span>;
          const color = v > 0.7 ? '#00FF41' : v > 0.4 ? '#f59e0b' : '#e94560';
          return <NervBar value={v} color={color} showLabel height={5} />;
        },
      },
      {
        key: 'frequency',
        label: 'Freq',
        sortable: true,
        width: '50px',
        render: (val: unknown) => (
          <span className="font-mono tabular-nums text-nerv-text">{val as number}</span>
        ),
      },
    ],
    [],
  );

  if (!propaganda) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="text-center">
          <div className="text-[12px] font-mono uppercase tracking-widest text-nerv-text-muted mb-2">
            PROPAGANDA ANALYSIS REQUIRED
          </div>
          <div className="text-[12px] font-mono text-nerv-text-secondary max-w-[300px] leading-relaxed">
            Run propaganda analysis to extract claims, detect manipulation techniques, and identify
            narrative frames.
          </div>
        </div>
        {onRunPropaganda && (
          <button
            type="button"
            onClick={onRunPropaganda}
            disabled={propagandaLoading}
            className={[
              'px-4 py-2 text-[12px] font-mono uppercase tracking-wider border rounded-sm transition-colors',
              propagandaLoading
                ? 'border-nerv-border text-nerv-text-muted cursor-wait animate-nerv-pulse'
                : 'border-nerv-orange text-nerv-orange hover:bg-nerv-orange/10',
            ].join(' ')}
          >
            {propagandaLoading ? 'ANALYZING...' : 'RUN PROPAGANDA ANALYSIS'}
          </button>
        )}
      </div>
    );
  }

  // No analysis actually ran — say so instead of implying "low manipulation".
  if (propaganda.analysisMode === 'unavailable') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-4">
        <div className="px-3 py-2 border border-nerv-amber/50 bg-nerv-amber/10 text-nerv-amber text-[12px] font-mono uppercase tracking-widest">
          PROPAGANDA ANALYSIS UNAVAILABLE
        </div>
        <div className="text-[12px] font-mono text-nerv-text-secondary max-w-[320px] text-center leading-relaxed">
          {propaganda.analysisModeReason ??
            'The analysis backend could not run. This is NOT a "no propaganda detected" finding.'}
        </div>
        {onRunPropaganda && (
          <button
            type="button"
            onClick={onRunPropaganda}
            disabled={propagandaLoading}
            className="px-4 py-2 text-[12px] font-mono uppercase tracking-wider border border-nerv-orange text-nerv-orange hover:bg-nerv-orange/10 rounded-sm transition-colors"
          >
            {propagandaLoading ? 'ANALYZING...' : 'RETRY ANALYSIS'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      {/* Assessment banner */}
      {propaganda.overallAssessment && (
        <div
          className={[
            'px-3 py-2 border-b text-[12px] font-mono',
            propaganda.overallAssessment.manipulationLikelihood === 'high'
              ? 'bg-nerv-red/10 border-nerv-red/30 text-nerv-red'
              : propaganda.overallAssessment.manipulationLikelihood === 'medium'
                ? 'bg-nerv-amber/10 border-nerv-amber/30 text-nerv-amber'
                : 'bg-nerv-green/10 border-nerv-green/30 text-nerv-green',
          ].join(' ')}
        >
          MANIPULATION LIKELIHOOD:{' '}
          <span className="uppercase font-bold">
            {propaganda.overallAssessment.manipulationLikelihood}
          </span>{' '}
          ({Math.round(propaganda.overallAssessment.confidence * 100)}% conf)
          {' - '}
          <span className="text-nerv-text-secondary">
            {propaganda.techniques.length} techniques / {propaganda.claims.length} claims /{' '}
            {propaganda.frames.length} frames
          </span>
        </div>
      )}

      <NervTable
        columns={columns}
        data={rows}
        getRowId={(row) => String(row.index)}
        selectedId={selectedClaimIndex !== null ? String(selectedClaimIndex) : undefined}
        onRowClick={(row) => onSelectClaim(row.index === selectedClaimIndex ? null : row.index)}
        compact
      />

      {/* Verify claims button + results summary */}
      <div className="mt-2 pt-2 border-t border-nerv-border/50">
        {claims ? (
          <div className="flex items-center gap-3 text-[11px] font-mono">
            {claims.analysisMode === 'heuristic' && (
              <span
                className="text-nerv-amber uppercase"
                title="Verdicts were produced by keyword-matching heuristics (no GEMINI_API_KEY configured), not LLM reasoning. Treat as weak signals."
              >
                ⚠ heuristic
              </span>
            )}
            <span className="text-nerv-green">{claims.verifiedCount ?? 0} verified</span>
            <span className="text-nerv-red">{claims.disputedCount ?? 0} disputed</span>
            <span className="text-nerv-text-muted">{claims.unverifiedCount ?? 0} unverified</span>
            {onVerifyClaims && (
              <button
                type="button"
                onClick={onVerifyClaims}
                disabled={verifyingClaims}
                className="ml-auto px-2 py-1 text-[10px] font-mono uppercase border border-nerv-blue/50 text-nerv-blue hover:bg-nerv-blue/10 rounded-sm transition-colors"
              >
                {verifyingClaims ? 'VERIFYING...' : 'RE-VERIFY'}
              </button>
            )}
          </div>
        ) : onVerifyClaims ? (
          <button
            type="button"
            onClick={onVerifyClaims}
            disabled={verifyingClaims || (propaganda?.claims?.length ?? 0) === 0}
            className={[
              'w-full px-4 py-2 text-[12px] font-mono uppercase tracking-wider border rounded-sm transition-colors',
              verifyingClaims
                ? 'border-nerv-border text-nerv-text-muted cursor-wait animate-pulse'
                : 'border-nerv-blue text-nerv-blue hover:bg-nerv-blue/10',
            ].join(' ')}
          >
            {verifyingClaims
              ? 'VERIFYING CLAIMS...'
              : `VERIFY ${propaganda?.claims?.length ?? 0} CLAIMS`}
          </button>
        ) : null}
      </div>
    </div>
  );
}
