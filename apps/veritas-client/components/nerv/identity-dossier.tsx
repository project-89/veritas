'use client';

import type { IdentityRecord, PlatformAccount } from '../../lib/api';
import { GENERATED_IDENTITY_PANEL_COMPONENTS } from '../../lib/generated-plugin-components';
import { hasPluginCapability, usePluginManifest } from '../../lib/plugins';
import { NervBadge } from './nerv-badge';
import { NervBar } from './nerv-bar';
import { NervSparkline } from './nerv-sparkline';

interface IdentityDossierProps {
  identity: IdentityRecord;
  loading?: boolean;
  onGenerateProfile?: (id: string, mode: import('../../lib/api').MagiProfileMode) => void;
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

const DISCOVERY_TIER_LABELS: Record<'actionable' | 'corroborating' | 'extended', string> = {
  actionable: 'Actionable',
  corroborating: 'Corroborating',
  extended: 'Extended',
};

function normalizeDiscoveryTier(account: PlatformAccount): 'actionable' | 'corroborating' | 'extended' {
  if (account.discoveryTier === 'actionable' || account.discoveryTier === 'corroborating' || account.discoveryTier === 'extended') {
    return account.discoveryTier;
  }
  if (account.verified) return 'actionable';
  return account.discoveryMethod === 'sherlock' ? 'corroborating' : 'actionable';
}

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
        {identity.displayName &&
          identity.displayName !== identity.primaryHandle && (
            <span className="text-[10px] font-mono text-nerv-text-secondary">
              {identity.displayName}
            </span>
          )}
        <div className="flex items-center gap-2 mt-0.5">
          <NervBadge
            label={identity.primaryPlatform}
            variant="blue"
            size="sm"
          />
          {identity.totalInvestigations > 0 && (
            <span className="text-[9px] font-mono text-nerv-text-muted">
              {identity.totalInvestigations} investigation
              {identity.totalInvestigations !== 1 ? 's' : ''}
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
          <div className="text-xs font-mono font-bold text-nerv-text">
            {formatNumber(ap.followersCount)}
          </div>
          <div className="text-[8px] font-mono text-nerv-text-muted uppercase">
            Followers
          </div>
        </div>
      )}
      {ap.followingCount != null && (
        <div className="text-center p-1.5 bg-nerv-bg-elevated/30 rounded-sm">
          <div className="text-xs font-mono font-bold text-nerv-text">
            {formatNumber(ap.followingCount)}
          </div>
          <div className="text-[8px] font-mono text-nerv-text-muted uppercase">
            Following
          </div>
        </div>
      )}
      {ap.postsCount != null && (
        <div className="text-center p-1.5 bg-nerv-bg-elevated/30 rounded-sm">
          <div className="text-xs font-mono font-bold text-nerv-text">
            {formatNumber(ap.postsCount)}
          </div>
          <div className="text-[8px] font-mono text-nerv-text-muted uppercase">
            Posts
          </div>
        </div>
      )}
    </div>
  );
}

function CrossPlatformMap({ identity }: { identity: IdentityRecord }) {
  if (identity.platformAccounts.length <= 1) return null;

  const grouped = {
    actionable: identity.platformAccounts.filter((account) => normalizeDiscoveryTier(account) === 'actionable'),
    corroborating: identity.platformAccounts.filter((account) => normalizeDiscoveryTier(account) === 'corroborating'),
    extended: identity.platformAccounts.filter((account) => normalizeDiscoveryTier(account) === 'extended'),
  };

  const visibleGroups = [
    ['actionable', grouped.actionable],
    ['corroborating', grouped.corroborating],
  ] as const;

  const hasVisibleAccounts = visibleGroups.some(([, accounts]) => accounts.length > 0);
  if (!hasVisibleAccounts) return null;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[9px] font-mono uppercase tracking-wider text-nerv-text-muted">
          Cross-Platform Presence
        </div>
        {grouped.extended.length > 0 && (
          <div className="text-[8px] font-mono uppercase tracking-wider text-nerv-text-muted">
            +{grouped.extended.length} extended match{grouped.extended.length === 1 ? '' : 'es'}
          </div>
        )}
      </div>
      <div className="space-y-2">
        {visibleGroups.map(([tier, accounts]) => {
          if (accounts.length === 0) return null;
          return (
            <div key={tier} className="space-y-1">
              <div className="text-[8px] font-mono uppercase tracking-wider text-nerv-text-muted">
                {DISCOVERY_TIER_LABELS[tier]}
              </div>
              <div className="flex flex-wrap gap-1">
                {accounts.map((account, i) => (
                  <a
                    key={`${account.platform}-${account.handle}-${i}`}
                    href={account.url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-nerv-bg-elevated/40 border border-nerv-border rounded-sm hover:border-nerv-orange/50 transition-colors"
                    title={`${DISCOVERY_TIER_LABELS[tier]} match on ${account.platform}`}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        backgroundColor: PLATFORM_COLORS[account.platform] ?? '#888',
                      }}
                    />
                    <span className="text-[9px] font-mono text-nerv-text-secondary">
                      @{account.handle}
                    </span>
                    <span className="text-[8px] font-mono uppercase text-nerv-text-muted">
                      {account.platform}
                    </span>
                    {account.verified && (
                      <span className="text-[8px] text-nerv-green">{'\u2713'}</span>
                    )}
                  </a>
                ))}
              </div>
            </div>
          );
        })}
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
        <div className="text-[8px] font-mono uppercase text-nerv-text-muted mb-1">
          Credibility
        </div>
        <div className="flex items-center gap-2">
          <NervBar
            value={identity.currentCredibility ?? 0}
            color={
              (identity.currentCredibility ?? 0) > 0.6
                ? '#00FF41'
                : (identity.currentCredibility ?? 0) > 0.3
                ? '#f59e0b'
                : '#e94560'
            }
            height={6}
          />
          <span className="text-[10px] font-mono text-nerv-text tabular-nums w-8 text-right">
            {((identity.currentCredibility ?? 0) * 100).toFixed(0)}%
          </span>
        </div>
        {credHistory.length > 1 && (
          <NervSparkline
            data={credHistory}
            color="#00FF41"
            height={20}
          />
        )}
      </div>
      <div className="p-2 border border-nerv-border rounded-sm">
        <div className="text-[8px] font-mono uppercase text-nerv-text-muted mb-1">
          Bot Probability
        </div>
        <div className="flex items-center gap-2">
          <NervBar
            value={identity.currentBotProbability ?? 0}
            color={
              (identity.currentBotProbability ?? 0) > 0.7
                ? '#e94560'
                : (identity.currentBotProbability ?? 0) > 0.4
                ? '#f59e0b'
                : '#00FF41'
            }
            height={6}
          />
          <span className="text-[10px] font-mono text-nerv-text tabular-nums w-8 text-right">
            {((identity.currentBotProbability ?? 0) * 100).toFixed(0)}%
          </span>
        </div>
        {botHistory.length > 1 && (
          <NervSparkline
            data={botHistory}
            color="#e94560"
            height={20}
          />
        )}
      </div>
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
          <div
            key={i}
            className="flex items-center justify-between text-[9px] font-mono px-2 py-1 bg-nerv-bg-elevated/20 rounded-sm"
          >
            <span className="text-nerv-text-secondary truncate max-w-[150px]">
              &ldquo;{inv.query}&rdquo;
            </span>
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

export function IdentityDossier({
  identity,
  loading,
  onGenerateProfile,
}: IdentityDossierProps) {
  const { plugins } = usePluginManifest();
  if (loading) {
    return (
      <div className="p-4 text-center">
        <div className="text-[10px] font-mono text-nerv-amber animate-pulse">
          Loading identity record...
        </div>
      </div>
    );
  }

  const hasMagi = hasPluginCapability(plugins, 'magi-profiles');

  return (
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

      {hasMagi && (() => {
        const MagiIdentityPanel = GENERATED_IDENTITY_PANEL_COMPONENTS['magi-profiles'];
        if (!MagiIdentityPanel) return null;
        return <MagiIdentityPanel identity={identity} onGenerateProfile={onGenerateProfile} />;
      })()}

      {/* Investigation timeline */}
      <InvestigationTimeline identity={identity} />
    </div>
  );
}
