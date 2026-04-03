'use client';

import { useMemo } from 'react';
import type {
  AnalyzedNarrative,
  InvestigationResult,
  RawPost,
  UserInvestigationResult,
} from '../../lib/api';
import { NervTable } from './nerv-table';
import type { NervTableColumn } from './nerv-table';
import { NervBadge } from './nerv-badge';
import { NervBar } from './nerv-bar';

interface ActorRow {
  handle: string;
  platform: string;
  credibility: number;
  botProbability: number;
  influence: number;
  postCount: number;
  flags: string[];
}

interface ActorsMatrixProps {
  narratives: AnalyzedNarrative[];
  posts: RawPost[];
  investigation: InvestigationResult | null;
  selectedHandle: string | null;
  onSelectActor: (handle: string | null) => void;
}

export function ActorsMatrix({
  narratives,
  posts,
  investigation,
  selectedHandle,
  onSelectActor,
}: ActorsMatrixProps) {
  const actors: ActorRow[] = useMemo(() => {
    if (investigation?.users && investigation.users.length > 0) {
      return investigation.users.map((u: UserInvestigationResult) => ({
        handle: u.user.handle,
        platform: u.user.platform,
        credibility: u.credibility?.overallScore ?? 0.5,
        botProbability: u.botScore?.botProbability ?? 0,
        influence: u.influenceScore,
        postCount: posts.filter(
          (p) => p.authorHandle === u.user.handle,
        ).length,
        flags: u.flags,
      }));
    }

    // Derive from narrative authors
    const authorMap = new Map<
      string,
      { handle: string; platform: string; postCount: number }
    >();
    for (const narrative of narratives) {
      for (const author of narrative.authors) {
        const key = author.handle || author.name;
        const existing = authorMap.get(key);
        if (existing) {
          existing.postCount += author.postCount;
        } else {
          // Find platform from posts
          const matchingPost = posts.find(
            (p) => p.authorHandle === author.handle || p.authorName === author.name,
          );
          authorMap.set(key, {
            handle: author.handle || author.name,
            platform: matchingPost?.platform ?? 'unknown',
            postCount: author.postCount,
          });
        }
      }
    }

    return Array.from(authorMap.values()).map((a) => ({
      handle: a.handle,
      platform: a.platform,
      credibility: 0.5,
      botProbability: 0,
      influence: 0,
      postCount: a.postCount,
      flags: [],
    }));
  }, [narratives, posts, investigation]);

  const columns: NervTableColumn<ActorRow>[] = useMemo(
    () => [
      {
        key: 'handle',
        label: 'Handle',
        sortable: true,
        width: '140px',
        render: (_val: unknown, row: ActorRow) => (
          <span className="font-mono text-nerv-text">@{row.handle}</span>
        ),
      },
      {
        key: 'platform',
        label: 'Platform',
        sortable: true,
        width: '80px',
        render: (val: unknown) => {
          const p = val as string;
          const variant =
            p === 'twitter'
              ? 'blue'
              : p === 'reddit'
                ? 'orange'
                : p === 'youtube'
                  ? 'red'
                  : 'muted';
          const displayLabel = p === 'twitter' ? 'X' : p.toUpperCase().slice(0, 2);
          return (
            <NervBadge
              label={displayLabel}
              variant={variant as 'blue' | 'orange' | 'red' | 'muted'}
            />
          );
        },
      },
      {
        key: 'credibility',
        label: 'Credibility',
        sortable: true,
        width: '100px',
        render: (val: unknown, row: ActorRow) => {
          const v = val as number;
          const color = v > 0.6 ? '#00FF41' : v > 0.3 ? '#f59e0b' : '#e94560';
          const isDefault = v === 0.5 && row.botProbability === 0;
          return (
            <div className="relative group">
              <NervBar value={v} color={color} showLabel height={5} />
              {isDefault && (
                <div className="hidden group-hover:block absolute z-10 bottom-full left-0 mb-1 px-2 py-1 bg-nerv-bg-elevated border border-nerv-border rounded-sm shadow-lg whitespace-nowrap">
                  <span className="text-[9px] font-mono text-nerv-text-secondary">
                    Run INVESTIGATE on a narrative for detailed credibility analysis
                  </span>
                </div>
              )}
            </div>
          );
        },
      },
      {
        key: 'botProbability',
        label: 'Bot Prob',
        sortable: true,
        width: '100px',
        render: (val: unknown) => {
          const v = val as number;
          const color = v < 0.3 ? '#00FF41' : v < 0.7 ? '#f59e0b' : '#e94560';
          return (
            <div className={v > 0.7 ? 'animate-nerv-pulse' : ''}>
              <NervBar value={v} color={color} showLabel height={5} />
            </div>
          );
        },
      },
      {
        key: 'influence',
        label: 'Influence',
        sortable: true,
        width: '90px',
        render: (val: unknown) => (
          <NervBar value={val as number} color="#FF6B2B" showLabel height={5} />
        ),
      },
      {
        key: 'postCount',
        label: 'Posts',
        sortable: true,
        width: '50px',
        render: (val: unknown) => (
          <span className="font-mono tabular-nums text-nerv-text">{val as number}</span>
        ),
      },
      {
        key: 'flags',
        label: 'Flags',
        width: '120px',
        render: (val: unknown) => {
          const flags = val as string[];
          if (!flags || flags.length === 0) return <span className="text-nerv-text-muted">--</span>;
          return (
            <div className="flex flex-wrap gap-0.5">
              {flags.slice(0, 3).map((f) => (
                <NervBadge key={f} label={f} variant="red" size="sm" />
              ))}
              {flags.length > 3 && (
                <span className="text-[8px] text-nerv-text-muted">+{flags.length - 3}</span>
              )}
            </div>
          );
        },
      },
    ],
    [],
  );

  const hasInvestigation = investigation?.users && investigation.users.length > 0;

  return (
    <div className="h-full overflow-auto">
      {!hasInvestigation && actors.length > 0 && (
        <div className="mx-3 mt-3 mb-2 p-3 bg-nerv-orange/5 border border-nerv-orange/20 rounded-sm nerv-corners">
          <div className="flex items-start gap-2">
            <span className="text-nerv-orange text-sm mt-0.5">{'\u26A0'}</span>
            <div>
              <p className="text-[11px] font-mono text-nerv-orange font-bold uppercase tracking-wider">
                Limited data — no investigation run
              </p>
              <p className="text-[10px] font-mono text-nerv-text-muted mt-1 leading-relaxed">
                Credibility, bot detection, and influence scores require a deep investigation.
                Select a narrative in the left panel, then click <span className="text-nerv-orange">INVESTIGATE THIS NARRATIVE</span> in the detail panel.
              </p>
            </div>
          </div>
        </div>
      )}
      <NervTable
        columns={columns}
        data={actors}
        getRowId={(row) => row.handle}
        selectedId={selectedHandle ?? undefined}
        onRowClick={(row) =>
          onSelectActor(row.handle === selectedHandle ? null : row.handle)
        }
        compact
      />
    </div>
  );
}
