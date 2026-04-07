'use client';

import { useMemo, useState } from 'react';
import type {
  AnalyzedNarrative,
  RawPost,
  InvestigationResult,
  PropagandaAnalysisResult,
  ClaimVerificationBatchResult,
  DeviationResponse,
  UserInvestigationResult,
  VerificationResult,
  EvidenceItem,
  IdentityRecord,
  MagiProfileMode,
  Investigation as InvestigationRecord,
  InvestigationEvidenceEntity,
  InvestigationEvidenceSeed,
} from '../../lib/api';
import { IdentityDossier } from './identity-dossier';
import type { SearchSummary } from '../../lib/investigation-context';
import { NervPanel } from './nerv-panel';
import { NervMetric } from './nerv-metric';
import { NervSparkline } from './nerv-sparkline';
import { NervBadge } from './nerv-badge';
import { NervBar } from './nerv-bar';

interface DetailPanelProps {
  // Selection
  selectedNarrativeId: string | null;
  selectedActorHandle: string | null;
  selectedClaimIndex: number | null;

  // Data
  narratives: AnalyzedNarrative[];
  posts: RawPost[];
  summary: SearchSummary | null;
  investigation: InvestigationResult | null;
  investigationRecord?: InvestigationRecord | null;
  deviations: DeviationResponse | null;
  propaganda: PropagandaAnalysisResult | null;
  claims: ClaimVerificationBatchResult | null;

  // Investigation state
  investigatingNarrativeId?: string | null;
  investigatedNarrativeIds?: string[];

  // Identity (MAGI)
  selectedIdentity?: IdentityRecord | null;
  identityLoading?: boolean;
  evidenceSeedSaving?: boolean;
  onGenerateProfile?: (id: string, mode: MagiProfileMode) => void;
  onAddEvidenceSeed?: (seed: {
    kind: InvestigationEvidenceSeed['kind'];
    value: string;
    notes?: string | null;
  }) => Promise<void>;

  // Actions
  onInvestigate?: (narrativeId: string) => void;
  onRunPropaganda?: () => void;
  onVerifyClaims?: () => void;
  onGenerateReport?: () => void;
  onRunIntelligence?: (type: string) => void;
}

// ---------------------------------------------------------------------------
// Platform color helper
// ---------------------------------------------------------------------------

const PLATFORM_COLORS: Record<string, string> = {
  twitter: '#0ea5e9',
  reddit: '#FF6B2B',
  youtube: '#e94560',
  facebook: '#0ea5e9',
  tiktok: '#a855f7',
};

const PLATFORM_BADGE_VARIANT: Record<string, 'blue' | 'orange' | 'red' | 'purple' | 'muted'> = {
  twitter: 'blue',
  reddit: 'orange',
  youtube: 'red',
  tiktok: 'purple',
};

const EVIDENCE_SEED_OPTIONS: Array<{
  value: InvestigationEvidenceSeed['kind'];
  label: string;
  placeholder: string;
}> = [
  { value: 'youtube', label: 'YouTube', placeholder: 'https://www.youtube.com/watch?v=...' },
  { value: 'article', label: 'Article', placeholder: 'https://source.example/report' },
  { value: 'url', label: 'URL', placeholder: 'https://source.example/path' },
  { value: 'wallet', label: 'Wallet', placeholder: '0x...' },
  { value: 'contract', label: 'Contract', placeholder: '0x...' },
  { value: 'domain', label: 'Domain', placeholder: 'example.com' },
  { value: 'post', label: 'Post', placeholder: 'https://x.com/... or source permalink' },
  { value: 'document', label: 'Document', placeholder: 'https://source.example/file.pdf' },
  { value: 'note', label: 'Note', placeholder: 'Analyst note or lead...' },
];

const DOSSIER_GROUP_LABELS: Record<string, string> = {
  domain: 'Domains',
  wallet: 'Wallets',
  contract: 'Contracts',
  address: 'Addresses',
  handle: 'Handles',
  telegram: 'Telegram',
  youtube_video: 'Videos',
  url: 'URLs',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function NarrativeDetail({
  narrative,
  posts,
  deviations,
  investigatingNarrativeId,
  investigatedNarrativeIds,
  onInvestigate,
  onRunPropaganda,
  onVerifyClaims,
  onGenerateReport,
  onRunIntelligence,
}: {
  narrative: AnalyzedNarrative;
  posts: RawPost[];
  deviations: DeviationResponse | null;
  investigatingNarrativeId?: string | null;
  investigatedNarrativeIds?: string[];
  onInvestigate?: (id: string) => void;
  onRunPropaganda?: () => void;
  onVerifyClaims?: () => void;
  onGenerateReport?: () => void;
  onRunIntelligence?: (type: string) => void;
}) {
  const narrativePosts = useMemo(
    () => narrative.postIndices.map((i) => posts[i]).filter(Boolean),
    [narrative, posts],
  );

  const deviation = deviations?.deviations?.find(
    (d) => d.narrativeId === narrative.id,
  );

  const sentimentData = useMemo(
    () => narrative.sentimentTrajectory?.map((p) => p.score) ?? [],
    [narrative.sentimentTrajectory],
  );

  const velocityTrend =
    narrative.velocity?.trend === 'surging' || narrative.velocity?.trend === 'growing'
      ? 'up'
      : narrative.velocity?.trend === 'fading'
        ? 'down'
        : 'stable';

  return (
    <div className="space-y-3 p-3">
      {/* Summary */}
      <div className="text-[11px] font-mono text-nerv-text leading-relaxed">
        {narrative.summary}
      </div>

      {/* Date range */}
      <div className="flex items-center gap-2 text-[10px] font-mono text-nerv-text-muted">
        <span>{new Date(narrative.firstSeen).toLocaleDateString()}</span>
        <span className="text-nerv-orange">{'\u2192'}</span>
        <span>{new Date(narrative.lastSeen).toLocaleDateString()}</span>
        <span className="text-nerv-text-muted/60 ml-1">
          ({Math.ceil((new Date(narrative.lastSeen).getTime() - new Date(narrative.firstSeen).getTime()) / (1000 * 60 * 60 * 24))}d span)
        </span>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-2 gap-0 border border-nerv-border rounded-sm overflow-hidden">
        <NervMetric
          label="Sentiment"
          value={narrative.avgSentiment.toFixed(2)}
          severity={
            narrative.avgSentiment < -0.3 ? 'critical' : narrative.avgSentiment < -0.1 ? 'warning' : 'normal'
          }
          sparkline={sentimentData.length > 1 ? sentimentData : undefined}
        />
        <NervMetric
          label="Velocity"
          value={narrative.velocity?.postsPerHour.toFixed(1) ?? '0'}
          unit="/hr"
          trend={velocityTrend as 'up' | 'down' | 'stable'}
        />
        <NervMetric
          label="Engagement"
          value={narrative.totalEngagement.toLocaleString()}
        />
        <NervMetric
          label="Deviation"
          value={deviation ? deviation.deviationMagnitude.toFixed(2) : '--'}
          severity={
            deviation && deviation.deviationMagnitude > 0.7
              ? 'critical'
              : deviation && deviation.deviationMagnitude > 0.4
                ? 'warning'
                : 'normal'
          }
        />
      </div>

      {/* Sentiment trajectory */}
      {sentimentData.length > 1 && (
        <div>
          <div className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted mb-1">
            SENTIMENT TRAJECTORY
          </div>
          <NervSparkline
            data={sentimentData}
            width={320}
            height={40}
            color={narrative.avgSentiment > 0 ? '#00FF41' : '#e94560'}
            showEndDot
          />
        </div>
      )}

      {/* Platform breakdown */}
      <div>
        <div className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted mb-1.5">
          PLATFORM BREAKDOWN
        </div>
        <div className="space-y-1">
          {Object.entries(narrative.platforms)
            .sort(([, a], [, b]) => b - a)
            .map(([platform, count]) => (
              <div key={platform} className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-nerv-text-secondary w-16">
                  {platform === 'twitter' ? 'X' : platform}
                </span>
                <div className="flex-1">
                  <NervBar
                    value={count / narrative.postIndices.length}
                    color={PLATFORM_COLORS[platform] ?? '#555570'}
                    height={5}
                  />
                </div>
                <span className="text-[10px] font-mono tabular-nums text-nerv-text-muted w-6 text-right">
                  {count}
                </span>
              </div>
            ))}
        </div>
      </div>

      {/* Top authors */}
      <div>
        <div className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted mb-1.5">
          TOP AUTHORS
        </div>
        <div className="space-y-1">
          {narrative.authors.slice(0, 6).map((author) => (
            <div key={author.handle || author.name} className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-nerv-text">
                  @{author.handle || author.name}
                </span>
              </div>
              <span className="text-[10px] font-mono tabular-nums text-nerv-text-muted">
                {author.postCount}
              </span>
            </div>
          ))}
          {narrative.authors.length > 6 && (
            <span className="text-[9px] font-mono text-nerv-text-muted">
              +{narrative.authors.length - 6} more
            </span>
          )}
        </div>
      </div>

      {/* Top posts */}
      <div>
        <div className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted mb-1.5">
          TOP POSTS
        </div>
        <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
          {narrativePosts
            .sort((a, b) => (b?.engagement?.viralityScore ?? 0) - (a?.engagement?.viralityScore ?? 0))
            .slice(0, 10)
            .map((post, idx) => {
              if (!post) return null;
              return (
              <div
                key={`${post.id}-${idx}`}
                className="px-2 py-1.5 bg-nerv-bg-elevated/40 border border-nerv-border/30 rounded-sm"
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[9px] font-mono text-nerv-text-secondary">
                    @{post.authorHandle || post.authorName}
                  </span>
                  <NervBadge
                    label={post.platform === 'twitter' ? 'X' : post.platform.toUpperCase().slice(0, 2)}
                    variant={PLATFORM_BADGE_VARIANT[post.platform] ?? 'muted'}
                    size="sm"
                  />
                  <span className="text-[8px] font-mono text-nerv-text-muted ml-auto">
                    {new Date(post.timestamp).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-[10px] font-mono text-nerv-text leading-snug break-words whitespace-pre-wrap">
                  {post.text}
                </p>
                {post.url && (
                  <a
                    href={post.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[9px] font-mono text-nerv-blue hover:underline mt-0.5 inline-block"
                  >
                    VIEW SOURCE
                  </a>
                )}
              </div>
              );
            })}
        </div>
      </div>

      {/* Primary action: ANALYZE NARRATIVE */}
      {onInvestigate && (() => {
        const isInvestigating = investigatingNarrativeId === narrative.id;
        const isInvestigated = investigatedNarrativeIds?.includes(narrative.id);
        const isOtherInvestigating = investigatingNarrativeId != null && investigatingNarrativeId !== narrative.id;

        return (
          <div className={`nerv-corners p-3 rounded-sm border ${
            isInvestigating
              ? 'bg-nerv-amber/10 border-nerv-amber/50 animate-pulse'
              : isInvestigated
                ? 'bg-nerv-green/5 border-nerv-green/30'
                : 'bg-nerv-orange/5 border-nerv-orange/30'
          }`}>
            <button
              onClick={() => onInvestigate(narrative.id)}
              disabled={isInvestigating || isOtherInvestigating}
              className={`w-full px-4 py-2.5 font-mono uppercase tracking-wider text-xs border rounded-sm transition-colors font-bold ${
                isInvestigating
                  ? 'bg-nerv-amber/20 text-nerv-amber border-nerv-amber/50 cursor-wait'
                  : isOtherInvestigating
                    ? 'bg-nerv-bg-secondary text-nerv-text-muted border-nerv-border cursor-not-allowed'
                    : isInvestigated
                      ? 'bg-nerv-green/10 text-nerv-green border-nerv-green/50 hover:bg-nerv-green/20'
                      : 'bg-nerv-orange/20 text-nerv-orange hover:bg-nerv-orange/30 border-nerv-orange/50'
              }`}
            >
              {isInvestigating
                ? '\u23F3 ANALYZING...'
                : isInvestigated
                  ? '\u2713 RE-ANALYZE NARRATIVE'
                  : '\u25B6 DEEP DIVE \u2014 ANALYZE NARRATIVE'}
            </button>
            <p className="text-[10px] font-mono text-nerv-text-muted mt-2 leading-relaxed">
              {isInvestigating
                ? 'Investigating authors, analyzing propaganda techniques, correlating downstream effects...'
                : isOtherInvestigating
                  ? 'Another analysis is in progress. Wait for it to complete.'
                  : `Investigate ${narrative.authors?.length ?? 0} authors, detect propaganda techniques, and trace downstream effects.`}
            </p>
          </div>
        );
      })()}

      {/* Secondary action buttons */}
      <div className="flex flex-wrap gap-1.5 pt-2 border-t border-nerv-border">
        {/* RE-INVESTIGATE is available from the main button above */}
        {onRunPropaganda && (
          <button
            onClick={onRunPropaganda}
            className="px-3 py-1.5 text-[9px] font-mono uppercase tracking-wider border border-nerv-amber text-nerv-amber hover:bg-nerv-amber/10 rounded-sm transition-colors"
          >
            PROPAGANDA SCAN
          </button>
        )}
        {onVerifyClaims && (
          <button
            onClick={onVerifyClaims}
            className="px-3 py-1.5 text-[9px] font-mono uppercase tracking-wider border border-nerv-blue text-nerv-blue hover:bg-nerv-blue/10 rounded-sm transition-colors"
          >
            VERIFY CLAIMS
          </button>
        )}
        {onGenerateReport && (
          <button
            onClick={onGenerateReport}
            className="px-3 py-1.5 text-[9px] font-mono uppercase tracking-wider border border-nerv-text-muted text-nerv-text-secondary hover:bg-nerv-bg-elevated rounded-sm transition-colors"
          >
            REPORT
          </button>
        )}
        {onRunIntelligence && (
          <button
            onClick={() => onRunIntelligence('legitimacy')}
            className="px-3 py-1.5 text-[9px] font-mono uppercase tracking-wider border border-nerv-green text-nerv-green hover:bg-nerv-green/10 rounded-sm transition-colors"
          >
            LEGITIMACY SCORE
          </button>
        )}
        {onRunIntelligence && (
          <button
            onClick={() => onRunIntelligence('campaign')}
            className="px-3 py-1.5 text-[9px] font-mono uppercase tracking-wider border border-nerv-red text-nerv-red hover:bg-nerv-red/10 rounded-sm transition-colors"
          >
            DETECT CAMPAIGN
          </button>
        )}
      </div>
    </div>
  );
}

function ActorDossier({
  handle,
  investigation,
  posts,
}: {
  handle: string;
  investigation: InvestigationResult | null;
  posts: RawPost[];
}) {
  const user: UserInvestigationResult | undefined = investigation?.users?.find(
    (u) => u.user.handle === handle,
  );

  const actorPosts = useMemo(
    () =>
      posts
        .filter((p) => p.authorHandle === handle || p.authorName === handle)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [posts, handle],
  );

  const platform = actorPosts[0]?.platform ?? 'unknown';

  return (
    <div className="space-y-3 p-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-mono font-bold text-nerv-text">@{handle}</span>
        <NervBadge
          label={platform === 'twitter' ? 'X' : platform.toUpperCase()}
          variant={PLATFORM_BADGE_VARIANT[platform] ?? 'muted'}
        />
      </div>

      {/* Credibility breakdown */}
      {user?.credibility && (
        <div>
          <div className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted mb-1.5">
            CREDIBILITY SIGNALS
          </div>
          <div className="space-y-1">
            {Object.entries(user.credibility.signals)
              .filter(([, v]) => v !== null)
              .map(([key, value]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-nerv-text-secondary w-32 truncate">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </span>
                  <div className="flex-1">
                    <NervBar value={value as number} color="#00FF41" height={4} showLabel />
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Bot probability */}
      {user?.botScore && (
        <div>
          <div className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted mb-1.5">
            BOT PROBABILITY
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-nerv-text-secondary w-32">Overall</span>
              <div className="flex-1">
                <NervBar
                  value={user.botScore.botProbability}
                  color={user.botScore.botProbability > 0.7 ? '#e94560' : user.botScore.botProbability > 0.4 ? '#f59e0b' : '#00FF41'}
                  height={5}
                  showLabel
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-nerv-text-secondary w-32">Structural</span>
              <div className="flex-1">
                <NervBar value={user.botScore.structuralScore} color="#f59e0b" height={4} showLabel />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-nerv-text-secondary w-32">Temporal</span>
              <div className="flex-1">
                <NervBar value={user.botScore.temporalScore} color="#f59e0b" height={4} showLabel />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-nerv-text-secondary w-32">Behavioral</span>
              <div className="flex-1">
                <NervBar value={user.botScore.behavioralScore} color="#f59e0b" height={4} showLabel />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Flags */}
      {user && user.flags.length > 0 && (
        <div>
          <div className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted mb-1.5">
            FLAGS
          </div>
          <div className="flex flex-wrap gap-1">
            {user.flags.map((f) => (
              <NervBadge key={f} label={f} variant="red" size="sm" />
            ))}
          </div>
        </div>
      )}

      {/* Narrative evolution */}
      {user && user.user.narrativeEvolution.length > 0 && (
        <div>
          <div className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted mb-1.5">
            STANCE SHIFTS
          </div>
          <div className="space-y-1">
            {user.user.narrativeEvolution.map((ev, i) => (
              <div key={i} className="flex items-start gap-2 text-[10px] font-mono">
                <span className="text-nerv-text-muted shrink-0">
                  {new Date(ev.timestamp).toLocaleDateString()}
                </span>
                <span className="text-nerv-amber">{ev.fromStance}</span>
                <span className="text-nerv-text-muted">{'\u2192'}</span>
                <span className="text-nerv-orange">{ev.toStance}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Posts by actor */}
      <div>
        <div className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted mb-1.5">
          POSTS ({actorPosts.length})
        </div>
        <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
          {actorPosts.slice(0, 15).map((post, idx) => (
            <div
              key={`${post.id}-${idx}`}
              className="px-2 py-1.5 bg-nerv-bg-elevated/40 border border-nerv-border/30 rounded-sm"
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <NervBadge
                  label={post.platform === 'twitter' ? 'X' : post.platform.toUpperCase().slice(0, 2)}
                  variant={PLATFORM_BADGE_VARIANT[post.platform] ?? 'muted'}
                  size="sm"
                />
                <span className="text-[8px] font-mono text-nerv-text-muted ml-auto">
                  {new Date(post.timestamp).toLocaleDateString()}
                </span>
              </div>
              <p className="text-[10px] font-mono text-nerv-text leading-snug break-words whitespace-pre-wrap">
                {post.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ClaimDetail({
  claimIndex,
  propaganda,
  claims,
}: {
  claimIndex: number;
  propaganda: PropagandaAnalysisResult | null;
  claims: ClaimVerificationBatchResult | null;
}) {
  const extractedClaim = propaganda?.claims?.[claimIndex];
  const verification: VerificationResult | undefined = claims?.results?.find(
    (r) => r.claim === extractedClaim?.claim,
  );

  if (!extractedClaim) {
    return (
      <div className="p-3 text-[10px] font-mono text-nerv-text-muted">
        Claim data not available.
      </div>
    );
  }

  const statusVariant: Record<string, 'green' | 'red' | 'amber' | 'muted'> = {
    verified: 'green',
    disputed: 'red',
    mixed: 'amber',
    false: 'red',
    unverified: 'muted',
  };

  return (
    <div className="space-y-3 p-3">
      {/* Claim text */}
      <div className="text-[11px] font-mono text-nerv-text leading-relaxed">
        &quot;{extractedClaim.claim}&quot;
      </div>

      {/* Status + confidence */}
      <div className="flex items-center gap-2">
        <NervBadge
          label={(verification?.status ?? 'unverified').toUpperCase()}
          variant={statusVariant[verification?.status ?? 'unverified'] ?? 'muted'}
          size="md"
        />
        {verification && (
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-mono text-nerv-text-muted">CONF:</span>
            <NervBar
              value={verification.confidence}
              color={verification.confidence > 0.7 ? '#00FF41' : '#f59e0b'}
              height={5}
              showLabel
            />
          </div>
        )}
      </div>

      {/* Supporting evidence */}
      {verification?.evidence?.supporting && verification.evidence.supporting.length > 0 && (
        <div>
          <div className="text-[9px] font-mono uppercase tracking-widest text-nerv-green mb-1.5">
            SUPPORTING EVIDENCE
          </div>
          <div className="space-y-1.5">
            {verification.evidence.supporting.map((ev: EvidenceItem, i: number) => (
              <div
                key={i}
                className="px-2 py-1.5 bg-nerv-green/5 border border-nerv-green/20 rounded-sm"
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[9px] font-mono text-nerv-green">{ev.source}</span>
                  <NervBadge label={ev.credibility.toUpperCase()} variant="green" size="sm" />
                </div>
                <p className="text-[10px] font-mono text-nerv-text-secondary leading-snug">
                  {ev.excerpt}
                </p>
                {ev.url && (
                  <a href={ev.url} target="_blank" rel="noopener noreferrer"
                    className="text-[9px] font-mono text-nerv-blue hover:underline mt-0.5 inline-block">
                    SOURCE
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contradicting evidence */}
      {verification?.evidence?.contradicting && verification.evidence.contradicting.length > 0 && (
        <div>
          <div className="text-[9px] font-mono uppercase tracking-widest text-nerv-red mb-1.5">
            CONTRADICTING EVIDENCE
          </div>
          <div className="space-y-1.5">
            {verification.evidence.contradicting.map((ev: EvidenceItem, i: number) => (
              <div
                key={i}
                className="px-2 py-1.5 bg-nerv-red/5 border border-nerv-red/20 rounded-sm"
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[9px] font-mono text-nerv-red">{ev.source}</span>
                  <NervBadge label={ev.credibility.toUpperCase()} variant="red" size="sm" />
                </div>
                <p className="text-[10px] font-mono text-nerv-text-secondary leading-snug">
                  {ev.excerpt}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reasoning */}
      {verification?.reasoning && (
        <div>
          <div className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted mb-1.5">
            LLM REASONING
          </div>
          <div className="px-2 py-1.5 bg-nerv-bg-elevated/60 border border-nerv-border rounded-sm">
            <p className="text-[10px] font-mono text-nerv-green/80 leading-relaxed whitespace-pre-wrap">
              {verification.reasoning}
            </p>
          </div>
        </div>
      )}

      {/* Caveats */}
      {verification?.caveats && verification.caveats.length > 0 && (
        <div>
          <div className="text-[9px] font-mono uppercase tracking-widest text-nerv-amber mb-1.5">
            CAVEATS
          </div>
          <ul className="space-y-0.5">
            {verification.caveats.map((c: string, i: number) => (
              <li key={i} className="text-[10px] font-mono text-nerv-text-secondary leading-snug">
                {'\u25B8'} {c}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function InvestigationSummary({
  posts,
  narratives,
  summary,
  investigationRecord,
  evidenceSeedSaving,
  onAddEvidenceSeed,
  onRunPropaganda,
  onGenerateReport,
}: {
  posts: RawPost[];
  narratives: AnalyzedNarrative[];
  summary: SearchSummary | null;
  investigationRecord?: InvestigationRecord | null;
  evidenceSeedSaving?: boolean;
  onAddEvidenceSeed?: (seed: {
    kind: InvestigationEvidenceSeed['kind'];
    value: string;
    notes?: string | null;
  }) => Promise<void>;
  onRunPropaganda?: () => void;
  onGenerateReport?: () => void;
}) {
  const [seedKind, setSeedKind] = useState<InvestigationEvidenceSeed['kind']>('youtube');
  const [seedValue, setSeedValue] = useState('');
  const [seedNotes, setSeedNotes] = useState('');
  const [seedError, setSeedError] = useState<string | null>(null);

  const platforms = Object.entries(summary?.byPlatform ?? {});
  const selectedSeedOption = EVIDENCE_SEED_OPTIONS.find((option) => option.value === seedKind) ?? EVIDENCE_SEED_OPTIONS[0];
  const sortedSeeds = useMemo(
    () =>
      [...(investigationRecord?.evidenceSeeds ?? [])].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [investigationRecord?.evidenceSeeds],
  );

  const handleAttachSeed = async () => {
    if (!onAddEvidenceSeed) return;
    const trimmedValue = seedValue.trim();
    if (!trimmedValue) {
      setSeedError('A seed value is required.');
      return;
    }

    setSeedError(null);
    try {
      await onAddEvidenceSeed({
        kind: seedKind,
        value: trimmedValue,
        notes: seedNotes.trim() || null,
      });
      setSeedValue('');
      setSeedNotes('');
    } catch (error) {
      setSeedError(error instanceof Error ? error.message : 'Failed to attach evidence seed.');
    }
  };

  const statusVariant: Record<InvestigationEvidenceSeed['status'], 'muted' | 'blue' | 'green' | 'red'> = {
    pending: 'muted',
    fetched: 'blue',
    processed: 'green',
    error: 'red',
  };
  const groupedEntityEntries = Object.entries(investigationRecord?.evidenceDossier?.groupedEntities ?? {})
    .sort((a, b) => (b[1]?.length ?? 0) - (a[1]?.length ?? 0));

  return (
    <div className="space-y-3 p-3">
      <div className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted">
        INVESTIGATION OVERVIEW
      </div>

      {summary ? (
        <>
          <div className="grid grid-cols-2 gap-0 border border-nerv-border rounded-sm overflow-hidden">
            <NervMetric label="Total Posts" value={summary.total} />
            <NervMetric label="Narratives" value={narratives.length} />
            <NervMetric
              label="Positive"
              value={summary.positive}
              severity="normal"
            />
            <NervMetric
              label="Negative"
              value={summary.negative}
              severity={summary.negative > summary.positive ? 'critical' : 'normal'}
            />
          </div>

          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted mb-1.5">
              SENTIMENT DISTRIBUTION
            </div>
            <div className="flex h-4 overflow-hidden rounded-sm border border-nerv-border">
              {summary.positive > 0 && (
                <div
                  className="bg-nerv-green/60"
                  style={{ width: `${(summary.positive / summary.total) * 100}%` }}
                />
              )}
              {summary.neutral > 0 && (
                <div
                  className="bg-nerv-text-muted/40"
                  style={{ width: `${(summary.neutral / summary.total) * 100}%` }}
                />
              )}
              {summary.negative > 0 && (
                <div
                  className="bg-nerv-red/60"
                  style={{ width: `${(summary.negative / summary.total) * 100}%` }}
                />
              )}
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[9px] font-mono text-nerv-green">+{summary.positive}</span>
              <span className="text-[9px] font-mono text-nerv-text-muted">~{summary.neutral}</span>
              <span className="text-[9px] font-mono text-nerv-red">-{summary.negative}</span>
            </div>
          </div>

          {platforms.length > 0 && (
            <div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted mb-1.5">
                PLATFORMS
              </div>
              <div className="space-y-1">
                {platforms.map(([platform, count]) => (
                  <div key={platform} className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-nerv-text-secondary w-16">
                      {platform === 'twitter' ? 'X' : platform}
                    </span>
                    <div className="flex-1">
                      <NervBar
                        value={count / summary.total}
                        color={PLATFORM_COLORS[platform] ?? '#555570'}
                        height={5}
                      />
                    </div>
                    <span className="text-[10px] font-mono tabular-nums text-nerv-text-muted w-8 text-right">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="px-3 py-4 border border-dashed border-nerv-border rounded-sm text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted text-center">
          AWAITING DATA...
        </div>
      )}

      <div className="pt-2 border-t border-nerv-border space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted">
            EVIDENCE SEEDS
          </div>
          <NervBadge
            label={String(sortedSeeds.length)}
            variant={sortedSeeds.length > 0 ? 'orange' : 'muted'}
            size="sm"
          />
        </div>
        <p className="text-[10px] font-mono text-nerv-text-secondary leading-relaxed">
          Attach explicit source material, wallet leads, domains, notes, or videos directly to this investigation.
        </p>

        <div className="space-y-2 border border-nerv-border rounded-sm p-2 bg-nerv-bg-elevated/30">
          <div className="grid grid-cols-[110px_1fr] gap-2">
            <select
              value={seedKind}
              onChange={(event) => setSeedKind(event.target.value as InvestigationEvidenceSeed['kind'])}
              className="px-2 py-2 bg-nerv-bg border border-nerv-border text-[10px] font-mono text-nerv-text focus:outline-none focus:border-nerv-orange/50"
            >
              {EVIDENCE_SEED_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <textarea
              value={seedValue}
              onChange={(event) => setSeedValue(event.target.value)}
              rows={3}
              placeholder={selectedSeedOption.placeholder}
              className="w-full px-2 py-2 bg-nerv-bg border border-nerv-border text-[10px] font-mono text-nerv-text placeholder:text-nerv-text-muted focus:outline-none focus:border-nerv-orange/50 resize-none"
            />
          </div>
          <input
            value={seedNotes}
            onChange={(event) => setSeedNotes(event.target.value)}
            placeholder="Optional context, theory, or why this seed matters"
            className="w-full px-2 py-2 bg-nerv-bg border border-nerv-border text-[10px] font-mono text-nerv-text placeholder:text-nerv-text-muted focus:outline-none focus:border-nerv-orange/50"
          />
          {seedError && (
            <div className="text-[9px] font-mono text-nerv-red">
              {seedError}
            </div>
          )}
          <button
            onClick={handleAttachSeed}
            disabled={evidenceSeedSaving || !onAddEvidenceSeed}
            className="w-full px-3 py-2 text-[9px] font-mono uppercase tracking-wider border border-nerv-orange/50 text-nerv-orange hover:bg-nerv-orange/10 rounded-sm transition-colors disabled:opacity-40 disabled:cursor-wait"
          >
            {evidenceSeedSaving ? 'INGESTING EVIDENCE...' : 'ATTACH EVIDENCE SEED'}
          </button>
        </div>

        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
          {sortedSeeds.length > 0 ? (
            sortedSeeds.map((seed) => (
              <div
                key={seed.id}
                className="border border-nerv-border rounded-sm bg-nerv-bg-elevated/20 px-2 py-2 space-y-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono text-nerv-text break-words">
                      {seed.label || seed.value}
                    </div>
                    <div className="text-[9px] font-mono text-nerv-text-muted break-all">
                      {seed.value}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <NervBadge label={seed.kind.toUpperCase()} variant="blue" size="sm" />
                    <NervBadge label={seed.status.toUpperCase()} variant={statusVariant[seed.status]} size="sm" />
                  </div>
                </div>
                {seed.notes && (
                  <div className="text-[9px] font-mono text-nerv-text-secondary leading-relaxed">
                    {seed.notes}
                  </div>
                )}
                {typeof seed.metadata?.contentPreview === 'string' && seed.metadata.contentPreview && (
                  <div className="text-[9px] font-mono text-nerv-green/80 leading-relaxed whitespace-pre-wrap">
                    {seed.metadata.contentPreview}
                  </div>
                )}
                <div className="flex flex-wrap gap-1">
                  {typeof seed.metadata?.host === 'string' && seed.metadata.host && (
                    <NervBadge label={String(seed.metadata.host)} variant="muted" size="sm" />
                  )}
                  {seed.extractedEntities.slice(0, 8).map((entity, index) => (
                    <NervBadge
                      key={`${seed.id}-${entity.type}-${entity.value}-${index}`}
                      label={`${entity.type}:${entity.value}`}
                      variant="orange"
                      size="sm"
                    />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="px-2 py-3 border border-dashed border-nerv-border rounded-sm text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted text-center">
              No explicit evidence seeds attached yet.
            </div>
          )}
        </div>
      </div>

      <div className="pt-2 border-t border-nerv-border space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted">
            DOSSIER SNAPSHOT
          </div>
          <div className="flex items-center gap-1">
            <NervBadge
              label={`${investigationRecord?.evidenceDossier?.processedSeeds ?? 0}/${investigationRecord?.evidenceDossier?.totalSeeds ?? 0} PROCESSED`}
              variant="blue"
              size="sm"
            />
            <NervBadge
              label={`${investigationRecord?.evidenceDossier?.topEntities?.length ?? 0} ENTITIES`}
              variant="orange"
              size="sm"
            />
          </div>
        </div>

        {groupedEntityEntries.length > 0 ? (
          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
            {groupedEntityEntries.map(([group, entities]) => (
              <div key={group} className="border border-nerv-border rounded-sm bg-nerv-bg-elevated/20 p-2 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted">
                    {DOSSIER_GROUP_LABELS[group] ?? group}
                  </div>
                  <NervBadge label={String(entities.length)} variant="muted" size="sm" />
                </div>
                <div className="space-y-1">
                  {entities.slice(0, 6).map((entity: InvestigationEvidenceEntity) => (
                    <div key={`${entity.type}:${entity.value}`} className="flex items-start justify-between gap-2 text-[9px] font-mono">
                      <div className="min-w-0">
                        <div className="text-nerv-text break-all">{entity.displayValue}</div>
                        <div className="text-nerv-text-muted break-words">
                          {entity.sources.slice(0, 2).map((source) => source.label).join(' · ')}
                          {entity.sources.length > 2 ? ` +${entity.sources.length - 2} more` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <NervBadge label={`${entity.sourceCount} SRC`} variant="blue" size="sm" />
                        <NervBadge label={`${entity.occurrenceCount} HIT`} variant="orange" size="sm" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-2 py-3 border border-dashed border-nerv-border rounded-sm text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted text-center">
            Attach evidence seeds to start building the investigation dossier.
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 pt-2 border-t border-nerv-border">
        {onGenerateReport && (
          <button
            onClick={onGenerateReport}
            className="px-3 py-1.5 text-[9px] font-mono uppercase tracking-wider border border-nerv-text-muted text-nerv-text-secondary hover:bg-nerv-bg-elevated rounded-sm transition-colors"
          >
            EXPORT REPORT
          </button>
        )}
        {onRunPropaganda && (
          <button
            onClick={onRunPropaganda}
            className="px-3 py-1.5 text-[9px] font-mono uppercase tracking-wider border border-nerv-amber text-nerv-amber hover:bg-nerv-amber/10 rounded-sm transition-colors"
          >
            PROPAGANDA ANALYSIS
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main DetailPanel
// ---------------------------------------------------------------------------

export function DetailPanel({
  selectedNarrativeId,
  selectedActorHandle,
  selectedClaimIndex,
  narratives,
  posts,
  summary,
  investigation,
  investigationRecord,
  deviations,
  propaganda,
  claims,
  investigatingNarrativeId,
  investigatedNarrativeIds,
  selectedIdentity,
  identityLoading,
  evidenceSeedSaving,
  onGenerateProfile,
  onAddEvidenceSeed,
  onInvestigate,
  onRunPropaganda,
  onVerifyClaims,
  onGenerateReport,
  onRunIntelligence,
}: DetailPanelProps) {
  const selectedNarrative = narratives.find((n) => n.id === selectedNarrativeId);

  // Determine panel title and content
  let title: string;
  let status: 'online' | 'warning' | 'critical' | 'offline' = 'online';
  let content: React.ReactNode;

  if (selectedNarrative) {
    title = 'NARRATIVE DETAIL';
    status = selectedNarrative.avgSentiment < -0.3 ? 'critical' : 'online';
    content = (
      <NarrativeDetail
        narrative={selectedNarrative}
        posts={posts}
        deviations={deviations}
        investigatingNarrativeId={investigatingNarrativeId}
        investigatedNarrativeIds={investigatedNarrativeIds}
        onInvestigate={onInvestigate}
        onRunPropaganda={onRunPropaganda}
        onVerifyClaims={onVerifyClaims}
        onGenerateReport={onGenerateReport}
        onRunIntelligence={onRunIntelligence}
      />
    );
  } else if (selectedActorHandle) {
    title = selectedIdentity ? 'IDENTITY DOSSIER' : 'ACTOR DOSSIER';
    status = selectedIdentity?.psychologicalProfile ? 'online' : 'offline';
    content = selectedIdentity ? (
      <IdentityDossier
        identity={selectedIdentity}
        loading={identityLoading}
        onGenerateProfile={onGenerateProfile}
      />
    ) : (
      <ActorDossier
        handle={selectedActorHandle}
        investigation={investigation}
        posts={posts}
      />
    );
  } else if (selectedClaimIndex !== null) {
    title = 'CLAIM VERIFICATION';
    content = (
      <ClaimDetail
        claimIndex={selectedClaimIndex}
        propaganda={propaganda}
        claims={claims}
      />
    );
  } else {
    title = 'INVESTIGATION SUMMARY';
    status = 'online';
    content = (
      <InvestigationSummary
        posts={posts}
        narratives={narratives}
        summary={summary}
        investigationRecord={investigationRecord}
        evidenceSeedSaving={evidenceSeedSaving}
        onAddEvidenceSeed={onAddEvidenceSeed}
        onRunPropaganda={onRunPropaganda}
        onGenerateReport={onGenerateReport}
      />
    );
  }

  return (
    <NervPanel title={title} status={status} accent="orange" className="h-full">
      <div className="h-full overflow-y-auto">{content}</div>
    </NervPanel>
  );
}
