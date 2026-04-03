'use client';

import { useMemo } from 'react';
import type {
  PropagandaAnalysisResult,
  ClaimVerificationBatchResult,
  ExtractedClaim,
  VerificationResult,
} from '../../lib/api';
import { NervTable } from './nerv-table';
import type { NervTableColumn } from './nerv-table';
import { NervBadge } from './nerv-badge';
import { NervBar } from './nerv-bar';

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
}

export function ClaimsMatrix({
  propaganda,
  claims,
  selectedClaimIndex,
  onSelectClaim,
  onRunPropaganda,
  propagandaLoading,
}: ClaimsMatrixProps) {
  const rows: ClaimRow[] = useMemo(() => {
    if (!propaganda?.claims) return [];

    return propaganda.claims.map((c: ExtractedClaim, i: number) => {
      const verification: VerificationResult | undefined = claims?.results?.find(
        (r) => r.claim === c.claim,
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
            <NervBadge
              label={s.toUpperCase()}
              variant={STATUS_VARIANT[s] ?? 'muted'}
              size="sm"
            />
          );
        },
      },
      {
        key: 'claim',
        label: 'Claim',
        sortable: false,
        render: (val: unknown) => (
          <span
            className="text-nerv-text font-mono text-[10px] leading-snug line-clamp-2"
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
            <NervBadge
              label={t.toUpperCase()}
              variant={TYPE_VARIANT[t] ?? 'muted'}
              size="sm"
            />
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
          <div className="text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted mb-2">
            PROPAGANDA ANALYSIS REQUIRED
          </div>
          <div className="text-[10px] font-mono text-nerv-text-secondary max-w-[300px] leading-relaxed">
            Run propaganda analysis to extract claims, detect manipulation techniques, and identify narrative frames.
          </div>
        </div>
        {onRunPropaganda && (
          <button
            onClick={onRunPropaganda}
            disabled={propagandaLoading}
            className={[
              'px-4 py-2 text-[10px] font-mono uppercase tracking-wider border rounded-sm transition-colors',
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

  return (
    <div className="h-full overflow-auto">
      {/* Assessment banner */}
      {propaganda.overallAssessment && (
        <div
          className={[
            'px-3 py-2 border-b text-[10px] font-mono',
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
            {propaganda.techniques.length} techniques / {propaganda.claims.length} claims / {propaganda.frames.length} frames
          </span>
        </div>
      )}

      <NervTable
        columns={columns}
        data={rows}
        getRowId={(row) => String(row.index)}
        selectedId={selectedClaimIndex !== null ? String(selectedClaimIndex) : undefined}
        onRowClick={(row) =>
          onSelectClaim(row.index === selectedClaimIndex ? null : row.index)
        }
        compact
      />
    </div>
  );
}
