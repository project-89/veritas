import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlatformCredibilityProfile {
  platform: string;
  credibilityWeight: number; // 0-1, how likely content is true
  influenceWeight: number; // 0-1, real-world impact regardless of truth
  manipulationRisk: number; // 0-1, how likely content is manipulated
  botPrevalence: number; // 0-1, how common bots are
}

export interface RssSubProfile {
  tier: string;
  credibilityWeight: number;
  influenceWeight: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_PROFILES: ReadonlyMap<string, PlatformCredibilityProfile> =
  new Map([
    [
      'twitter',
      {
        platform: 'twitter',
        credibilityWeight: 0.4,
        influenceWeight: 0.9,
        manipulationRisk: 0.7,
        botPrevalence: 0.6,
      },
    ],
    [
      'truthsocial',
      {
        platform: 'truthsocial',
        credibilityWeight: 0.2,
        influenceWeight: 0.7,
        manipulationRisk: 0.9,
        botPrevalence: 0.4,
      },
    ],
    [
      'reddit',
      {
        platform: 'reddit',
        credibilityWeight: 0.5,
        influenceWeight: 0.6,
        manipulationRisk: 0.5,
        botPrevalence: 0.3,
      },
    ],
    [
      'farcaster',
      {
        platform: 'farcaster',
        credibilityWeight: 0.7,
        influenceWeight: 0.3,
        manipulationRisk: 0.2,
        botPrevalence: 0.1,
      },
    ],
    [
      'youtube',
      {
        platform: 'youtube',
        credibilityWeight: 0.5,
        influenceWeight: 0.8,
        manipulationRisk: 0.4,
        botPrevalence: 0.2,
      },
    ],
    [
      'telegram',
      {
        platform: 'telegram',
        credibilityWeight: 0.3,
        influenceWeight: 0.5,
        manipulationRisk: 0.8,
        botPrevalence: 0.5,
      },
    ],
    [
      'rss',
      {
        platform: 'rss',
        credibilityWeight: 0.7,
        influenceWeight: 0.6,
        manipulationRisk: 0.2,
        botPrevalence: 0.0,
      },
    ],
  ]);

const NEUTRAL_DEFAULT: PlatformCredibilityProfile = {
  platform: 'unknown',
  credibilityWeight: 0.5,
  influenceWeight: 0.5,
  manipulationRisk: 0.5,
  botPrevalence: 0.3,
};

const RSS_SUB_PROFILES: ReadonlyMap<string, RssSubProfile> = new Map([
  ['tier-1', { tier: 'tier-1', credibilityWeight: 0.9, influenceWeight: 0.8 }],
  ['tier-2', { tier: 'tier-2', credibilityWeight: 0.7, influenceWeight: 0.5 }],
  ['tier-3', { tier: 'tier-3', credibilityWeight: 0.4, influenceWeight: 0.2 }],
]);

// Known tier-1 sources for automatic classification
const TIER_1_DOMAINS = new Set([
  'bbc.com',
  'bbc.co.uk',
  'reuters.com',
  'apnews.com',
  'ap.org',
]);

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class PlatformCredibilityService {
  private readonly logger = new Logger(PlatformCredibilityService.name);
  private readonly profiles: Map<string, PlatformCredibilityProfile>;
  private readonly rssSubProfiles: Map<string, RssSubProfile>;

  constructor(private readonly config: ConfigService) {
    this.profiles = new Map(DEFAULT_PROFILES);
    this.rssSubProfiles = new Map(RSS_SUB_PROFILES);

    // Allow override via environment variable
    const overrideJson = this.config.get<string>(
      'PLATFORM_CREDIBILITY_CONFIG',
    );
    if (overrideJson) {
      try {
        const overrides = JSON.parse(overrideJson) as Record<
          string,
          Partial<PlatformCredibilityProfile>
        >;
        for (const [platform, partial] of Object.entries(overrides)) {
          const existing = this.profiles.get(platform) ?? {
            ...NEUTRAL_DEFAULT,
            platform,
          };
          this.profiles.set(platform, { ...existing, ...partial, platform });
        }
        this.logger.log(
          `Applied platform credibility overrides for: ${Object.keys(overrides).join(', ')}`,
        );
      } catch (err) {
        this.logger.warn(
          `Failed to parse PLATFORM_CREDIBILITY_CONFIG: ${err}`,
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Profile access
  // -------------------------------------------------------------------------

  /**
   * Returns the credibility profile for a platform.
   * Falls back to a neutral default if the platform is unknown.
   */
  getProfile(platform: string): PlatformCredibilityProfile {
    const normalized = platform.toLowerCase().trim();
    return (
      this.profiles.get(normalized) ?? { ...NEUTRAL_DEFAULT, platform: normalized }
    );
  }

  /**
   * Returns the RSS sub-profile for a given tier.
   */
  getRssSubProfile(tier: string): RssSubProfile | undefined {
    return this.rssSubProfiles.get(tier);
  }

  /**
   * Classify an RSS source domain into a tier.
   */
  classifyRssTier(domain: string): string {
    const normalized = domain.toLowerCase().trim();
    if (TIER_1_DOMAINS.has(normalized)) return 'tier-1';
    // Default: tier-2 for unclassified domains
    return 'tier-2';
  }

  // -------------------------------------------------------------------------
  // Multipliers
  // -------------------------------------------------------------------------

  /**
   * Credibility multiplier (0-1). Higher means more credible platform.
   */
  getCredibilityMultiplier(platform: string): number {
    return this.getProfile(platform).credibilityWeight;
  }

  /**
   * Influence multiplier (0-1). Higher means more real-world impact.
   */
  getInfluenceMultiplier(platform: string): number {
    return this.getProfile(platform).influenceWeight;
  }

  // -------------------------------------------------------------------------
  // Composite adjustments
  // -------------------------------------------------------------------------

  /**
   * Adjust a claim's verification confidence by the platform it originated on.
   * Content from more credible platforms gets a boost; less credible gets dampened.
   *
   * Formula: confidence * (0.5 + 0.5 * credibilityWeight)
   * This maps credibility [0,1] to a multiplier range of [0.5, 1.0],
   * so platform never fully zeroes out a confidence score.
   */
  adjustClaimWeight(confidence: number, originPlatform: string): number {
    const credibility = this.getCredibilityMultiplier(originPlatform);
    const multiplier = 0.5 + 0.5 * credibility;
    return Math.min(1, Math.max(0, confidence * multiplier));
  }

  /**
   * Adjust a narrative's threat score based on which platforms it appears on.
   * Platforms with higher influence weight contribute more to threat.
   *
   * @param threatScore - base threat score (0-1)
   * @param platforms - map of platform -> post count on that platform
   * @returns adjusted threat score (0-1)
   */
  adjustNarrativeThreat(
    threatScore: number,
    platforms: Record<string, number>,
  ): number {
    const entries = Object.entries(platforms);
    if (entries.length === 0) return threatScore;

    // Compute weighted influence across platforms
    let totalPosts = 0;
    let weightedInfluence = 0;

    for (const [platform, count] of entries) {
      const influence = this.getInfluenceMultiplier(platform);
      weightedInfluence += influence * count;
      totalPosts += count;
    }

    if (totalPosts === 0) return threatScore;

    const avgInfluence = weightedInfluence / totalPosts;

    // Scale threat by average influence: [0.5, 1.5] range
    const influenceMultiplier = 0.5 + avgInfluence;
    return Math.min(1, Math.max(0, threatScore * influenceMultiplier));
  }

  // -------------------------------------------------------------------------
  // Risk assessment
  // -------------------------------------------------------------------------

  /**
   * Returns true if the platform has a manipulation risk above 0.7.
   */
  isHighManipulationRisk(platform: string): boolean {
    return this.getProfile(platform).manipulationRisk > 0.7;
  }
}
