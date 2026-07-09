'use client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlatformCredibilityBadgeProps {
  platform: string;
  size?: 'sm' | 'md';
}

interface PlatformProfile {
  credibilityWeight: number;
  influenceWeight: number;
  manipulationRisk: number;
}

// ---------------------------------------------------------------------------
// Hardcoded platform profiles (mirrors backend defaults)
// ---------------------------------------------------------------------------

const PLATFORM_PROFILES: Record<string, PlatformProfile> = {
  twitter: { credibilityWeight: 0.4, influenceWeight: 0.9, manipulationRisk: 0.7 },
  truthsocial: { credibilityWeight: 0.2, influenceWeight: 0.7, manipulationRisk: 0.9 },
  reddit: { credibilityWeight: 0.5, influenceWeight: 0.6, manipulationRisk: 0.5 },
  farcaster: { credibilityWeight: 0.7, influenceWeight: 0.3, manipulationRisk: 0.2 },
  youtube: { credibilityWeight: 0.5, influenceWeight: 0.8, manipulationRisk: 0.4 },
  telegram: { credibilityWeight: 0.3, influenceWeight: 0.5, manipulationRisk: 0.8 },
  rss: { credibilityWeight: 0.7, influenceWeight: 0.6, manipulationRisk: 0.2 },
  facebook: { credibilityWeight: 0.4, influenceWeight: 0.7, manipulationRisk: 0.6 },
  instagram: { credibilityWeight: 0.4, influenceWeight: 0.7, manipulationRisk: 0.5 },
  tiktok: { credibilityWeight: 0.3, influenceWeight: 0.8, manipulationRisk: 0.7 },
  mastodon: { credibilityWeight: 0.6, influenceWeight: 0.2, manipulationRisk: 0.1 },
};

const NEUTRAL_PROFILE: PlatformProfile = {
  credibilityWeight: 0.5,
  influenceWeight: 0.5,
  manipulationRisk: 0.5,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function credibilityColor(value: number): string {
  if (value >= 0.6) return '#00FF41'; // green
  if (value >= 0.35) return '#f59e0b'; // amber
  return '#e94560'; // red
}

function influenceColor(value: number): string {
  if (value >= 0.7) return '#FF6B2B'; // bright orange
  if (value >= 0.4) return '#FF6B2B99'; // medium
  return '#FF6B2B44'; // dim
}

function riskLabel(value: number): string {
  if (value >= 0.7) return 'High';
  if (value >= 0.4) return 'Medium';
  return 'Low';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PlatformCredibilityBadge({ platform, size = 'sm' }: PlatformCredibilityBadgeProps) {
  const normalized = platform.toLowerCase().trim();
  const profile = PLATFORM_PROFILES[normalized] ?? NEUTRAL_PROFILE;

  const credPct = Math.round(profile.credibilityWeight * 100);
  const inflPct = Math.round(profile.influenceWeight * 100);
  const risk = riskLabel(profile.manipulationRisk);

  const isSm = size === 'sm';
  const barH = isSm ? 3 : 4;
  const textSize = isSm ? 'text-[11px]' : 'text-[12px]';

  return (
    <div className="group relative inline-flex flex-col items-center">
      {/* Platform name */}
      <span className={`font-mono uppercase tracking-wider text-nerv-text-secondary ${textSize}`}>
        {normalized}
      </span>

      {/* Dual bar */}
      <div className="flex w-full mt-0.5 rounded-sm overflow-hidden" style={{ height: barH }}>
        {/* Left: credibility */}
        <div
          className="flex-1"
          style={{
            backgroundColor: credibilityColor(profile.credibilityWeight),
            opacity: 0.4 + profile.credibilityWeight * 0.6,
          }}
        />
        {/* Right: influence */}
        <div
          className="flex-1"
          style={{
            backgroundColor: influenceColor(profile.influenceWeight),
            opacity: 0.3 + profile.influenceWeight * 0.7,
          }}
        />
      </div>

      {/* Tooltip */}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-sm border border-nerv-border bg-nerv-bg-elevated px-2 py-1 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        <span className="text-[11px] font-mono text-nerv-text">
          {platform.charAt(0).toUpperCase() + platform.slice(1)} &mdash; Credibility: {credPct}% |
          Influence: {inflPct}% | Manipulation Risk: {risk}
        </span>
      </div>
    </div>
  );
}
