'use client';

import { useState } from 'react';
import type { IdentityRecord, MagiProfileMode, PsychologicalProfile } from '../../../apps/veritas-client/lib/api';
import { NervBadge } from '../../../apps/veritas-client/components/nerv/nerv-badge';
import { NervBar } from '../../../apps/veritas-client/components/nerv/nerv-bar';
import { NervSparkline } from '../../../apps/veritas-client/components/nerv/nerv-sparkline';

interface MagiIdentityPanelProps {
  identity: IdentityRecord;
  onGenerateProfile?: (id: string, mode: MagiProfileMode) => void;
}

const ROLE_ICONS: Record<string, string> = {
  leader: '\u2606',
  amplifier: '\u21C9',
  bridge_node: '\u2194',
  follower: '\u2022',
  contrarian: '\u2620',
  provocateur: '\u26A0',
  analyst: '\u2318',
};

const MAGI_MODE_LABELS: Record<MagiProfileMode, string> = {
  'investigation-window': 'INV WINDOW',
  'current-state': 'CURRENT',
  historical: 'HISTORICAL',
  'deep-history': 'DEEP HIST',
};

function MagiProfile({ profile }: { profile: PsychologicalProfile }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const profileMode = profile.profileMode ?? 'current-state';
  const scope = profile.scope;
  const scanPostCount = scope?.scanPostCount ?? 0;
  const timelinePostCount = scope?.timelinePostCount ?? profile.postCountAnalyzed;

  const toggle = (section: string) =>
    setExpanded(expanded === section ? null : section);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 py-1 border-b border-nerv-orange/30">
        <span className="text-[10px] font-mono font-bold text-nerv-orange uppercase tracking-wider">
          MAGI PROFILE v{profile.version}
        </span>
        <span className="text-[9px] font-mono text-nerv-text-muted">
          {profile.postCountAnalyzed} posts analyzed
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-mono uppercase tracking-wider text-nerv-text-secondary">
          {profile.scopeLabel || MAGI_MODE_LABELS[profileMode]}
        </span>
        <span className="text-[8px] font-mono uppercase tracking-wider text-nerv-text-muted">
          {scanPostCount > 0 ? `${scanPostCount} scan` : '0 scan'} / {timelinePostCount} timeline
        </span>
      </div>

      <div className="flex items-center gap-2 p-2 bg-nerv-orange/5 border border-nerv-orange/20 rounded-sm">
        <span className="text-lg">
          {ROLE_ICONS[profile.socialRole.primary] ?? '\u2022'}
        </span>
        <div>
          <span className="text-[10px] font-mono font-bold text-nerv-orange uppercase">
            {profile.socialRole.primary.replace('_', ' ')}
          </span>
          <span className="text-[9px] font-mono text-nerv-text-muted ml-2">
            ({(profile.socialRole.confidence * 100).toFixed(0)}% confidence)
          </span>
        </div>
      </div>

      <p className="text-[10px] font-mono text-nerv-text-secondary leading-relaxed whitespace-pre-wrap">
        {profile.summary}
      </p>

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

      <CollapsibleSection
        title={`Core Beliefs (${profile.coreBeliefs.length})`}
        isOpen={expanded === 'beliefs'}
        onToggle={() => toggle('beliefs')}
      >
        <div className="space-y-1">
          {profile.coreBeliefs.map((belief, i) => (
            <div key={i} className="flex items-start gap-2">
              <NervBar value={belief.confidence} color="#FF6B2B" height={4} />
              <span className="text-[9px] font-mono text-nerv-text-secondary">
                {belief.belief}
              </span>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title={`Interest Domains (${profile.interestDomains.length})`}
        isOpen={expanded === 'interests'}
        onToggle={() => toggle('interests')}
      >
        <div className="space-y-1">
          {profile.interestDomains.map((domain, i) => (
            <div
              key={i}
              className="flex items-center justify-between text-[9px] font-mono"
            >
              <span className="text-nerv-text-secondary">{domain.domain}</span>
              <div className="flex items-center gap-2">
                <NervBadge
                  label={domain.engagementLevel}
                  variant={
                    domain.engagementLevel === 'primary'
                      ? 'orange'
                      : domain.engagementLevel === 'secondary'
                        ? 'blue'
                        : 'muted'
                  }
                  size="sm"
                />
                <span className="text-nerv-text-muted w-8 text-right">
                  {domain.postCount}p
                </span>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

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

      {(profile.riskIndicators.radicalizationSignals.length > 0 ||
        profile.riskIndicators.manipulationVulnerability !== 'low') && (
        <CollapsibleSection
          title="Risk Indicators"
          isOpen={expanded === 'risk'}
          onToggle={() => toggle('risk')}
          variant="warning"
        >
          <div className="space-y-1 text-[9px] font-mono">
            <Tag
              label="Manipulation Vulnerability"
              value={profile.riskIndicators.manipulationVulnerability}
            />
            <Tag
              label="Echo Chamber"
              value={profile.riskIndicators.echoChamberDepth}
            />
            {profile.riskIndicators.radicalizationSignals.map((signal, i) => (
              <div key={i} className="text-nerv-red">
                {'\u25B3'} {signal}
              </div>
            ))}
            {profile.riskIndicators.flags.map((flag, i) => (
              <NervBadge key={i} label={flag} variant="red" size="sm" />
            ))}
          </div>
          <EvidenceList evidence={profile.riskIndicators.evidence} />
        </CollapsibleSection>
      )}

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

function CollapsibleSection({
  title,
  isOpen,
  onToggle,
  children,
  variant = 'default',
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  variant?: 'default' | 'warning';
}) {
  return (
    <div
      className={`border rounded-sm ${
        variant === 'warning'
          ? 'border-nerv-red/30 bg-nerv-red/5'
          : 'border-nerv-border'
      }`}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-nerv-bg-elevated/30 transition-colors"
      >
        <span
          className={`text-[9px] font-mono uppercase tracking-wider ${
            variant === 'warning' ? 'text-nerv-red' : 'text-nerv-text-muted'
          }`}
        >
          {title}
        </span>
        <span className="text-[9px] text-nerv-text-muted">
          {isOpen ? '\u25B4' : '\u25BE'}
        </span>
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

function EmotionRow({
  emotion,
  items,
  color,
}: {
  emotion: string;
  items: string[];
  color: string;
}) {
  return (
    <div>
      <span className="text-[9px] font-mono font-bold" style={{ color }}>
        {emotion}
      </span>
      <div className="flex flex-wrap gap-1 mt-0.5">
        {items.map((item, i) => (
          <span
            key={i}
            className="text-[9px] font-mono text-nerv-text-secondary px-1 py-0.5 bg-nerv-bg-elevated/40 rounded-sm"
          >
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
        <div
          key={i}
          className="text-[8px] font-mono text-nerv-text-muted italic leading-relaxed"
        >
          &ldquo;{e.slice(0, 200)}&rdquo;
        </div>
      ))}
    </div>
  );
}

export function MagiIdentityPanel({
  identity,
  onGenerateProfile,
}: MagiIdentityPanelProps) {
  const id = identity._id ?? identity.id;
  const hasProfile = identity.psychologicalProfile != null;
  const profileStatus = identity.profileGenerationStatus;
  const canGenerate = profileStatus !== 'queued' && profileStatus !== 'generating';

  return (
    <>
      <div className="p-3 border border-nerv-orange/30 bg-nerv-orange/5 rounded-sm space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[9px] font-mono uppercase tracking-wider text-nerv-orange">
            MAGI PROFILE SCOPE
          </span>
          <span className="text-[8px] font-mono uppercase tracking-wider text-nerv-text-muted">
            {profileStatus === 'queued'
              ? 'QUEUED'
              : profileStatus === 'generating'
                ? 'GENERATING'
                : hasProfile
                  ? 'READY'
                  : 'IDLE'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {(Object.keys(MAGI_MODE_LABELS) as MagiProfileMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => onGenerateProfile?.(id, mode)}
              disabled={!canGenerate}
              className={`px-2 py-2 font-mono uppercase tracking-wider text-[9px] border rounded-sm transition-colors ${
                canGenerate
                  ? 'bg-nerv-orange/15 text-nerv-orange hover:bg-nerv-orange/25 border-nerv-orange/40'
                  : 'bg-nerv-amber/20 text-nerv-amber border-nerv-amber/50 cursor-wait animate-pulse'
              }`}
              title={`Generate ${MAGI_MODE_LABELS[mode].toLowerCase()} MAGI profile`}
            >
              {MAGI_MODE_LABELS[mode]}
            </button>
          ))}
        </div>
        <p className="text-[9px] font-mono text-nerv-text-muted leading-relaxed">
          Window mode uses the current investigation slice. Current mode uses the latest accessible timeline. Historical mode uses the widest locally available corpus. Deep history pulls a much larger timeline sample for fuller MAGI profiling.
        </p>
      </div>

      {hasProfile && identity.psychologicalProfile ? (
        <MagiProfile profile={identity.psychologicalProfile} />
      ) : (
        <p className="text-[9px] font-mono text-nerv-text-muted leading-relaxed">
          Deep psychological and behavioral analysis using {identity.totalPostsAnalyzed}+ observed posts. Covers communication style, beliefs, emotional triggers, influence patterns, and risk indicators.
        </p>
      )}
    </>
  );
}
