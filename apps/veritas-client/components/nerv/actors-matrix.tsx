'use client';

import { useMemo } from 'react';
import type {
  AnalyzedNarrative,
  InvestigationResult,
  RawPost,
  UserInvestigationResult,
} from '../../lib/api';
import { NervBadge } from './nerv-badge';
import { NervBar } from './nerv-bar';
import type { NervTableColumn } from './nerv-table';
import { NervTable } from './nerv-table';

interface ActorRow {
  handle: string;
  platform: string;
  credibility: number;
  /** null = not assessed / insufficient data (not the same as 0). */
  botProbability: number | null;
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
    // Handles are keyed case-insensitively throughout so the same person from
    // the investigation, narrative authors, and raw posts collapses to ONE row
    // (the backend lowercases handles; the client used to compare raw-case).
    const norm = (s: string) => s.trim().toLowerCase();

    const investigationActors = (investigation?.users ?? []).map((u: UserInvestigationResult) => ({
      handle: u.user.handle,
      platform: u.user.platform,
      credibility: u.credibility?.overallScore ?? 0.5,
      botProbability: u.botScore?.botProbability ?? null,
      influence: u.influenceScore,
      postCount: posts.filter((p) => norm(p.authorHandle ?? '') === norm(u.user.handle)).length,
      flags: u.flags,
    }));

    // Derive from narrative authors, keyed by normalized handle/name.
    const authorMap = new Map<string, { handle: string; platform: string; postCount: number }>();
    for (const narrative of narratives) {
      for (const author of narrative.authors) {
        const key = norm(author.handle || author.name);
        if (!key) continue;
        const existing = authorMap.get(key);
        if (existing) {
          existing.postCount += author.postCount;
        } else {
          const matchingPost = posts.find(
            (p) => norm(p.authorHandle ?? '') === key || norm(p.authorName ?? '') === key,
          );
          authorMap.set(key, {
            handle: author.handle || author.name,
            platform: matchingPost?.platform ?? 'unknown',
            postCount: author.postCount,
          });
        }
      }
    }

    // Also collect unique authors directly from posts (covers authors not in narrative.authors)
    for (const post of posts) {
      const display = post.authorHandle || post.authorName || '';
      const key = norm(display);
      if (!key) continue;
      const existing = authorMap.get(key);
      if (existing) continue;
      authorMap.set(key, {
        handle: display,
        platform: post.platform ?? 'unknown',
        postCount: posts.filter((p) => norm(p.authorHandle || p.authorName || '') === key).length,
      });
    }

    const discoveredActors = Array.from(authorMap.values()).map((a) => ({
      handle: a.handle,
      platform: a.platform,
      credibility: 0.5,
      // Not investigated → bot probability is unknown, not zero.
      botProbability: null as number | null,
      influence: 0,
      postCount: a.postCount,
      flags: [] as string[],
    }));

    if (investigationActors.length > 0) {
      const merged = new Map<string, ActorRow>();
      for (const actor of discoveredActors) {
        merged.set(norm(actor.handle), actor);
      }
      for (const actor of investigationActors) {
        const key = norm(actor.handle);
        const prev = merged.get(key);
        merged.set(key, {
          ...(prev ?? actor),
          ...actor,
          // Prefer a known platform over a discovered 'unknown'.
          platform:
            actor.platform && actor.platform !== 'unknown'
              ? actor.platform
              : (prev?.platform ?? actor.platform),
          postCount: actor.postCount || prev?.postCount || 0,
          flags: actor.flags.length > 0 ? actor.flags : (prev?.flags ?? []),
        });
      }
      return Array.from(merged.values());
    }

    return discoveredActors;
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
          const isDefault = v === 0.5 && row.botProbability === null;
          return (
            <div className="relative group">
              <NervBar value={v} color={color} showLabel height={5} />
              {isDefault && (
                <div className="hidden group-hover:block absolute z-10 bottom-full left-0 mb-1 px-2 py-1 bg-nerv-bg-elevated border border-nerv-border rounded-sm shadow-lg whitespace-nowrap">
                  <span className="text-[11px] font-mono text-nerv-text-secondary">
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
          const v = val as number | null;
          if (v === null) {
            return (
              <span
                className="text-[10px] font-mono text-nerv-text-muted/50 italic"
                title="Insufficient data to assess (not investigated, or too few posts)"
              >
                n/a
              </span>
            );
          }
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
                <span className="text-[10px] text-nerv-text-muted">+{flags.length - 3}</span>
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
              <p className="text-[13px] font-mono text-nerv-orange font-bold uppercase tracking-wider">
                Limited data — no investigation run
              </p>
              <p className="text-[12px] font-mono text-nerv-text-muted mt-1 leading-relaxed">
                Credibility, bot detection, and influence scores require a deep investigation.
                Select a narrative in the left panel, then click{' '}
                <span className="text-nerv-orange">INVESTIGATE THIS NARRATIVE</span> in the detail
                panel.
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
        onRowClick={(row) => onSelectActor(row.handle === selectedHandle ? null : row.handle)}
        compact
      />
    </div>
  );
}
