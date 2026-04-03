'use client';

import { useState } from 'react';
import type { IdentityRecord, PsychologicalProfile } from '../../lib/api';
import { NervPanel } from './nerv-panel';
import { NervBadge } from './nerv-badge';
import { NervBar } from './nerv-bar';
import { NervSparkline } from './nerv-sparkline';

interface IdentityDossierProps {
  identity: IdentityRecord;
  loading?: boolean;
  onGenerateProfile?: (id: string) => void;
}

const PLATFORM_COLORS: Record<string, string> = {
  twitter: '#0ea5e9',
  reddit: '#FF4500',
  youtube: '#FF0000',
  facebook: '#1877F2',
  instagram: '#E1306C',
  tiktok: '#a855f7',
  mastodon: '#6364FF',
};

const ROLE_ICONS: Record<string, string> = {
  leader: '\u2606',       // star
  amplifier: '\u21C9',    // arrows
  bridge_node: '\u2194',  // left-right arrow
  follower: '\u2022',     // bullet
  contrarian: '\u2620',   // skull
  provocateur: '\u26A0',  // warning
  analyst: '\u2318',      // command
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProfileImageDisplay({ identity }: { identity: IdentityRecord }) {
  const currentImage = identity.profileImages.find((img) => img.isCurrent);

  return (
    <div className="flex items-center gap-3">
      {currentImage ? (
        <img
          src={currentImage.url}
          alt={identity.primaryHandle}
          className="w-12 h-12 rounded-full border-2 border-nerv-orange/50 object-cover"
        />
      ) : (
        <div className="w-12 h-12 rounded-full border-2 border-nerv-border bg-nerv-bg-elevated flex items-center justify-center">
          <span className="text-lg font-mono text-nerv-text-muted">
            {identity.primaryHandle[0]?.toUpperCase() ?? '?'}
          </span>
        </div>
      )}
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono font-bold text-nerv-text">
            @{identity.primaryHandle}
          </span>
          {identity.authorProfile?.isVerified && (
            <span className="text-nerv-blue text-xs">{'\u2713'}</span>
          )}
        </div>
        {identity.displayName && identity.displayName !== identity.primaryHandle && (
          <span className="text-[10px] font-mono text-nerv-text-secondary">{identity.displayName}</span>
        )}
        <div className="flex items-center gap-2 mt-0.5">
          <NervBadge label={identity.primaryPlatform} variant="blue" size="sm" />
          {identity.totalInvestigations > 0 && (
            <span className="text-[9px] font-mono text-nerv-text-muted">
              {identity.totalInvestigations} investigation{identity.totalInvestigations !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function AuthorStats({ identity }: { identity: IdentityRecord }) {
  const ap = identity.authorProfile;
  if (!ap) return null;

  return (
    <div className="grid grid-cols-3 gap-2">
      {ap.followersCount != null && (
        <div className="text-center p-1.5 bg-nerv-bg-elevated/30 rounded-sm">
          <div className="text-xs font-mono font-bold text-nerv-text">{formatNumber(ap.followersCount)}</div>
          <div className="text-[8px] font-mono text-nerv-text-muted uppercase">Followers</div>
        </div>
      )}
      {ap.followingCount != null && (
        <div className="text-center p-1.5 bg-nerv-bg-elevated/30 rounded-sm">
          <div className="text-xs font-mono font-bold text-nerv-text">{formatNumber(ap.followingCount)}</div>
          <div className="text-[8px] font-mono text-nerv-text-muted uppercase">Following</div>
        </div>
      )}
      {ap.postsCount != null && (
        <div className="text-center p-1.5 bg-nerv-bg-elevated/30 rounded-sm">
          <div className="text-xs font-mono font-bold text-nerv-text">{formatNumber(ap.postsCount)}</div>
          <div className="text-[8px] font-mono text-nerv-text-muted uppercase">Posts</div>
        </div>
      )}
    </div>
  );
}

function CrossPlatformMap({ identity }: { identity: IdentityRecord }) {
  if (identity.platformAccounts.length <= 1) return null;

  return (
    <div className="space-y-1">
      <div className="text-[9px] font-mono uppercase tracking-wider text-nerv-text-muted">
        Cross-Platform Presence
      </div>
      <div className="flex flex-wrap gap-1">
        {identity.platformAccounts.map((account, i) => (
          <a
            key={`${account.platform}-${account.handle}-${i}`}
            href={account.url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-nerv-bg-elevated/40 border border-nerv-border rounded-sm hover:border-nerv-orange/50 transition-colors"
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: PLATFORM_COLORS[account.platform] ?? '#888' }}
            />
            <span className="text-[9px] font-mono text-nerv-text-secondary">
              @{account.handle}
            </span>
            {account.verified && (
              <span className="text-[8px] text-nerv-green">{'\u2713'}</span>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}

function ScoreDashboard({ identity }: { identity: IdentityRecord }) {
  const credHistory = identity.credibilityHistory.map((h) => h.value);
  const botHistory = identity.botProbabilityHistory.map((h) => h.value);

  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="p-2 border border-nerv-border rounded-sm">
        <div className="text-[8px] font-mono uppercase text-nerv-text-muted mb-1">Credibility</div>
        <div className="flex items-center gap-2">
          <NervBar
            value={identity.currentCredibility ?? 0}
            max={1}
            color={
              (identity.currentCredibility ?? 0) > 0.6 ? '#00FF41' :
              (identity.currentCredibility ?? 0) > 0.3 ? '#f59e0b' : '#e94560'
            }
            height={6}
          />
          <span className="text-[10px] font-mono text-nerv-text tabular-nums w-8 text-right">
            {((identity.currentCredibility ?? 0) * 100).toFixed(0)}%
          </span>
        </div>
        {credHistory.length > 1 && (
          <NervSparkline data={credHistory} color="#00FF41" height={20} className="mt-1" />
        )}
      </div>
      <div className="p-2 border border-nerv-border rounded-sm">
        <div className="text-[8px] font-mono uppercase text-nerv-text-muted mb-1">Bot Probability</div>
        <div className="flex items-center gap-2">
          <NervBar
            value={identity.currentBotProbability ?? 0}
            max={1}
            color={
              (identity.currentBotProbability ?? 0) > 0.7 ? '#e94560' :
              (identity.currentBotProbability ?? 0) > 0.4 ? '#f59e0b' : '#00FF41'
            }
            height={6}
          />
          <span className="text-[10px] font-mono text-nerv-text tabular-nums w-8 text-right">
            {((identity.currentBotProbability ?? 0) * 100).toFixed(0)}%
          </span>
        </div>
        {botHistory.length > 1 && (
          <NervSparkline data={botHistory} color="#e94560" height={20} className="mt-1" />
        )}
      </div>
    </div>
  );
}

function MagiProfile({ profile }: { profile: PsychologicalProfile }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggle = (section: string) => setExpanded(expanded === section ? null : section);

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center gap-2 py-1 border-b border-nerv-orange/30">
        <span className="text-[10px] font-mono font-bold text-nerv-orange uppercase tracking-wider">
          MAGI PROFILE v{profile.version}
        </span>
        <span className="text-[9px] font-mono text-nerv-text-muted">
          {profile.postCountAnalyzed} posts analyzed
        </span>
      </div>

      {/* Social Role */}
      <div className="flex items-center gap-2 p-2 bg-nerv-orange/5 border border-nerv-orange/20 rounded-sm">
        <span className="text-lg">{ROLE_ICONS[profile.socialRole.primary] ?? '\u2022'}</span>
        <div>
          <span className="text-[10px] font-mono font-bold text-nerv-orange uppercase">
            {profile.socialRole.primary.replace('_', ' ')}
          </span>
          <span className="text-[9px] font-mono text-nerv-text-muted ml-2">
            ({(profile.socialRole.confidence * 100).toFixed(0)}% confidence)
          </span>
        </div>
      </div>

      {/* Summary */}
      <p className="text-[10px] font-mono text-nerv-text-secondary leading-relaxed whitespace-pre-wrap">
        {profile.summary}
      </p>

      {/* Communication Style */}
      <CollapsibleSection
        title="Communication Style"
        isOpen={expanded === 'comm'}
        onToggle={() => toggle('comm')}
      >
        <div className="grid grid-cols-3 gap-1 text-[9px] font-mono">
          <Tag label="Formality" value={profile.communicationStyle.formality} />
          <Tag label="Tone" value={profile.communicationStyle.tone} />
          <Tag label="Complexity" value={profile.communicationStyle.complexity} />
        </div>
        <EvidenceList evidence={profile.communicationStyle.evidence} />
      </CollapsibleSection>

      {/* Core Beliefs */}
      <CollapsibleSection
        title={`Core Beliefs (${profile.coreBeliefs.length})`}
        isOpen={expanded === 'beliefs'}
        onToggle={() => toggle('beliefs')}
      >
        <div className="space-y-1">
          {profile.coreBeliefs.map((belief, i) => (
            <div key={i} className="flex items-start gap-2">
              <NervBar value={belief.confidence} max={1} color="#FF6B2B" height={4} className="w-12 mt-1.5 shrink-0" />
              <span className="text-[9px] font-mono text-nerv-text-secondary">{belief.belief}</span>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Interest Domains */}
      <CollapsibleSection
        title={`Interest Domains (${profile.interestDomains.length})`}
        isOpen={expanded === 'interests'}
        onToggle={() => toggle('interests')}
      >
        <div className="space-y-1">
          {profile.interestDomains.map((domain, i) => (
            <div key={i} className="flex items-center justify-between text-[9px] font-mono">
              <span className="text-nerv-text-secondary">{domain.domain}</span>
              <div className="flex items-center gap-2">
                <NervBadge
                  label={domain.engagementLevel}
                  variant={domain.engagementLevel === 'primary' ? 'orange' : domain.engagementLevel === 'secondary' ? 'blue' : 'muted'}
                  size="sm"
                />
                <span className="text-nerv-text-muted w-8 text-right">{domain.postCount}p</span>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Emotional Triggers */}
      <CollapsibleSection
        title="Emotional Triggers"
        isOpen={expanded === 'emotions'}
        onToggle={() => toggle('emotions')}
      >
        <div className="space-y-1.5">
          {profile.emotionalTriggers.anger.length > 0 && (
            <EmotionRow emotion="Anger" items={profile.emotionalTriggers.anger} color="#e94560" />
          )}
          {profile.emotionalTriggers.excitement.length > 0 && (
            <EmotionRow emotion="Excitement" items={profile.emotionalTriggers.excitement} color="#00FF41" />
          )}
          {profile.emotionalTriggers.fear.length > 0 && (
            <EmotionRow emotion="Fear" items={profile.emotionalTriggers.fear} color="#f59e0b" />
          )}
        </div>
      </CollapsibleSection>

      {/* Risk Indicators */}
      {(profile.riskIndicators.radicalizationSignals.length > 0 ||
        profile.riskIndicators.manipulationVulnerability !== 'low') && (
        <CollapsibleSection
          title="Risk Indicators"
          isOpen={expanded === 'risk'}
          onToggle={() => toggle('risk')}
          variant="warning"
        >
          <div className="space-y-1 text-[9px] font-mono">
            <Tag label="Manipulation Vulnerability" value={profile.riskIndicators.manipulationVulnerability} />
            <Tag label="Echo Chamber" value={profile.riskIndicators.echoChamberDepth} />
            {profile.riskIndicators.radicalizationSignals.map((signal, i) => (
              <div key={i} className="text-nerv-red">{'\u25B3'} {signal}</div>
            ))}
            {profile.riskIndicators.flags.map((flag, i) => (
              <NervBadge key={i} label={flag} variant="red" size="sm" />
            ))}
          </div>
          <EvidenceList evidence={profile.riskIndicators.evidence} />
        </CollapsibleSection>
      )}

      {/* Persuasion & Influence */}
      <CollapsibleSection
        title="Persuasion & Influence"
        isOpen={expanded === 'persuasion'}
        onToggle={() => toggle('persuasion')}
      >
        <div className="text-[9px] font-mono space-y-1">
          <div className="text-nerv-text-secondary">
            <span className="text-nerv-text-muted">Techniques: </span>
            {profile.persuasionStyle.primaryTechniques.join(', ') || 'None identified'}
          </div>
          <div className="text-nerv-text-secondary">
            <span className="text-nerv-text-muted">Target: </span>
            {profile.persuasionStyle.targetAudience || 'N/A'}
          </div>
          <Tag label="Effectiveness" value={profile.persuasionStyle.effectiveness} />
          <div className="mt-1 text-nerv-text-secondary">
            <span className="text-nerv-text-muted">Vulnerable to: </span>
            {profile.influenceSusceptibility.vulnerableTo.join(', ') || 'None identified'}
          </div>
          <div className="text-nerv-text-secondary">
            <span className="text-nerv-text-muted">Resistant to: </span>
            {profile.influenceSusceptibility.resistantTo.join(', ') || 'None identified'}
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utility sub-components
// ---------------------------------------------------------------------------

function CollapsibleSection({
  title, isOpen, onToggle, children, variant = 'default',
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  variant?: 'default' | 'warning';
}) {
  return (
    <div className={`border rounded-sm ${variant === 'warning' ? 'border-nerv-red/30 bg-nerv-red/5' : 'border-nerv-border'}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-nerv-bg-elevated/30 transition-colors"
      >
        <span className={`text-[9px] font-mono uppercase tracking-wider ${variant === 'warning' ? 'text-nerv-red' : 'text-nerv-text-muted'}`}>
          {title}
        </span>
        <span className="text-[9px] text-nerv-text-muted">{isOpen ? '\u25B4' : '\u25BE'}</span>
      </button>
      {isOpen && <div className="px-2 pb-2 space-y-1">{children}</div>}
    </div>
  );
}

function Tag({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1 text-[9px] font-mono">
      <span className="text-nerv-text-muted">{label}:</span>
      <span className="text-nerv-text-secondary capitalize">{value}</span>
    </div>
  );
}

function EmotionRow({ emotion, items, color }: { emotion: string; items: string[]; color: string }) {
  return (
    <div>
      <span className="text-[9px] font-mono font-bold" style={{ color }}>{emotion}</span>
      <div className="flex flex-wrap gap-1 mt-0.5">
        {items.map((item, i) => (
          <span key={i} className="text-[9px] font-mono text-nerv-text-secondary px-1 py-0.5 bg-nerv-bg-elevated/40 rounded-sm">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function EvidenceList({ evidence }: { evidence: string[] }) {
  if (!evidence || evidence.length === 0) return null;
  return (
    <div className="mt-1 pt-1 border-t border-nerv-border/30">
      {evidence.slice(0, 3).map((e, i) => (
        <div key={i} className="text-[8px] font-mono text-nerv-text-muted italic leading-relaxed">
          &ldquo;{e.slice(0, 200)}&rdquo;
        </div>
      ))}
    </div>
  );
}

function InvestigationTimeline({ identity }: { identity: IdentityRecord }) {
  if (identity.investigations.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="text-[9px] font-mono uppercase tracking-wider text-nerv-text-muted">
        Investigation History ({identity.totalInvestigations})
      </div>
      <div className="space-y-1 max-h-32 overflow-auto">
        {identity.investigations.map((inv, i) => (
          <div key={i} className="flex items-center justify-between text-[9px] font-mono px-2 py-1 bg-nerv-bg-elevated/20 rounded-sm">
            <span className="text-nerv-text-secondary truncate max-w-[150px]">&ldquo;{inv.query}&rdquo;</span>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-nerv-text-muted">{inv.postCount}p</span>
              <span className="text-nerv-text-muted">
                {new Date(inv.timestamp).toLocaleDateString()}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function IdentityDossier({ identity, loading, onGenerateProfile }: IdentityDossierProps) {
  if (loading) {
    return (
      <NervPanel title="IDENTITY DOSSIER" status="processing">
        <div className="p-4 text-center">
          <div className="text-[10px] font-mono text-nerv-amber animate-pulse">
            Loading identity record...
          </div>
        </div>
      </NervPanel>
    );
  }

  const id = identity._id ?? identity.id;
  const hasProfile = identity.psychologicalProfile != null;
  const profileStatus = identity.profileGenerationStatus;

  return (
    <NervPanel title="IDENTITY DOSSIER" status={hasProfile ? 'online' : 'standby'}>
      <div className="p-3 space-y-3">
        {/* Header with avatar */}
        <ProfileImageDisplay identity={identity} />

        {/* Bio */}
        {identity.authorProfile?.bio && (
          <p className="text-[10px] font-mono text-nerv-text-secondary leading-relaxed">
            {identity.authorProfile.bio}
          </p>
        )}

        {/* Stats */}
        <AuthorStats identity={identity} />

        {/* Cross-platform accounts */}
        <CrossPlatformMap identity={identity} />

        {/* Score dashboard */}
        <ScoreDashboard identity={identity} />

        {/* Flags */}
        {identity.aggregatedFlags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {identity.aggregatedFlags.map((flag, i) => (
              <NervBadge key={i} label={flag} variant="red" size="sm" />
            ))}
          </div>
        )}

        {/* MAGI Profile or generate button */}
        {hasProfile && identity.psychologicalProfile ? (
          <MagiProfile profile={identity.psychologicalProfile} />
        ) : (
          <div className="p-3 border border-nerv-orange/30 bg-nerv-orange/5 rounded-sm">
            <button
              onClick={() => onGenerateProfile?.(id)}
              disabled={profileStatus === 'queued' || profileStatus === 'generating'}
              className={`w-full px-4 py-2.5 font-mono uppercase tracking-wider text-xs border rounded-sm transition-colors font-bold ${
                profileStatus === 'queued' || profileStatus === 'generating'
                  ? 'bg-nerv-amber/20 text-nerv-amber border-nerv-amber/50 cursor-wait animate-pulse'
                  : 'bg-nerv-orange/20 text-nerv-orange hover:bg-nerv-orange/30 border-nerv-orange/50'
              }`}
            >
              {profileStatus === 'queued'
                ? '\u23F3 MAGI PROFILE QUEUED...'
                : profileStatus === 'generating'
                  ? '\u23F3 GENERATING MAGI PROFILE...'
                  : profileStatus === 'failed'
                    ? '\u26A0 RETRY MAGI PROFILE'
                    : '\u25B6 GENERATE MAGI PROFILE'}
            </button>
            <p className="text-[9px] font-mono text-nerv-text-muted mt-2 leading-relaxed">
              Deep psychological and behavioral analysis using {identity.totalPostsAnalyzed}+ posts.
              Analyzes communication style, beliefs, emotional triggers, influence patterns, and risk indicators.
            </p>
          </div>
        )}

        {/* Investigation timeline */}
        <InvestigationTimeline identity={identity} />
      </div>
    </NervPanel>
  );
}
