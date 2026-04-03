import { ConfigService } from '@nestjs/config';
import { PlatformCredibilityService } from './platform-credibility.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfigService(
  overrideJson?: string,
): ConfigService {
  return {
    get: (key: string) => {
      if (key === 'PLATFORM_CREDIBILITY_CONFIG') return overrideJson;
      return undefined;
    },
  } as unknown as ConfigService;
}

function createService(overrideJson?: string): PlatformCredibilityService {
  return new PlatformCredibilityService(makeConfigService(overrideJson));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlatformCredibilityService', () => {
  let service: PlatformCredibilityService;

  beforeEach(() => {
    service = createService();
  });

  // -----------------------------------------------------------------------
  // Default profiles
  // -----------------------------------------------------------------------

  describe('getProfile', () => {
    it('returns twitter profile with expected values', () => {
      const profile = service.getProfile('twitter');
      expect(profile.platform).toBe('twitter');
      expect(profile.credibilityWeight).toBe(0.4);
      expect(profile.influenceWeight).toBe(0.9);
      expect(profile.manipulationRisk).toBe(0.7);
      expect(profile.botPrevalence).toBe(0.6);
    });

    it('returns truthsocial profile', () => {
      const profile = service.getProfile('truthsocial');
      expect(profile.credibilityWeight).toBe(0.2);
      expect(profile.manipulationRisk).toBe(0.9);
    });

    it('returns reddit profile', () => {
      const profile = service.getProfile('reddit');
      expect(profile.credibilityWeight).toBe(0.5);
      expect(profile.influenceWeight).toBe(0.6);
    });

    it('returns farcaster profile', () => {
      const profile = service.getProfile('farcaster');
      expect(profile.credibilityWeight).toBe(0.7);
      expect(profile.botPrevalence).toBe(0.1);
    });

    it('returns youtube profile', () => {
      const profile = service.getProfile('youtube');
      expect(profile.influenceWeight).toBe(0.8);
    });

    it('returns telegram profile', () => {
      const profile = service.getProfile('telegram');
      expect(profile.manipulationRisk).toBe(0.8);
      expect(profile.botPrevalence).toBe(0.5);
    });

    it('returns rss profile', () => {
      const profile = service.getProfile('rss');
      expect(profile.credibilityWeight).toBe(0.7);
      expect(profile.botPrevalence).toBe(0.0);
    });

    it('falls back to neutral default for unknown platform', () => {
      const profile = service.getProfile('mastodon');
      expect(profile.platform).toBe('mastodon');
      expect(profile.credibilityWeight).toBe(0.5);
      expect(profile.influenceWeight).toBe(0.5);
      expect(profile.manipulationRisk).toBe(0.5);
      expect(profile.botPrevalence).toBe(0.3);
    });

    it('normalizes platform name to lowercase', () => {
      const profile = service.getProfile('Twitter');
      expect(profile.platform).toBe('twitter');
      expect(profile.credibilityWeight).toBe(0.4);
    });
  });

  // -----------------------------------------------------------------------
  // Multipliers
  // -----------------------------------------------------------------------

  describe('getCredibilityMultiplier', () => {
    it('returns credibility weight for known platform', () => {
      expect(service.getCredibilityMultiplier('twitter')).toBe(0.4);
      expect(service.getCredibilityMultiplier('farcaster')).toBe(0.7);
      expect(service.getCredibilityMultiplier('rss')).toBe(0.7);
    });

    it('returns 0.5 for unknown platform', () => {
      expect(service.getCredibilityMultiplier('unknown-platform')).toBe(0.5);
    });
  });

  describe('getInfluenceMultiplier', () => {
    it('returns influence weight for known platform', () => {
      expect(service.getInfluenceMultiplier('twitter')).toBe(0.9);
      expect(service.getInfluenceMultiplier('farcaster')).toBe(0.3);
    });

    it('returns 0.5 for unknown platform', () => {
      expect(service.getInfluenceMultiplier('unknown-platform')).toBe(0.5);
    });
  });

  // -----------------------------------------------------------------------
  // Claim weight adjustment
  // -----------------------------------------------------------------------

  describe('adjustClaimWeight', () => {
    it('boosts confidence for high-credibility platform', () => {
      // farcaster credibility = 0.7 => multiplier = 0.5 + 0.35 = 0.85
      const adjusted = service.adjustClaimWeight(0.8, 'farcaster');
      expect(adjusted).toBeCloseTo(0.8 * 0.85, 5);
    });

    it('dampens confidence for low-credibility platform', () => {
      // truthsocial credibility = 0.2 => multiplier = 0.5 + 0.1 = 0.6
      const adjusted = service.adjustClaimWeight(0.8, 'truthsocial');
      expect(adjusted).toBeCloseTo(0.8 * 0.6, 5);
    });

    it('never exceeds 1.0', () => {
      const adjusted = service.adjustClaimWeight(1.0, 'rss');
      expect(adjusted).toBeLessThanOrEqual(1.0);
    });

    it('never goes below 0.0', () => {
      const adjusted = service.adjustClaimWeight(0.0, 'twitter');
      expect(adjusted).toBeGreaterThanOrEqual(0.0);
    });

    it('uses neutral default for unknown platform', () => {
      // unknown credibility = 0.5 => multiplier = 0.75
      const adjusted = service.adjustClaimWeight(0.8, 'myspace');
      expect(adjusted).toBeCloseTo(0.8 * 0.75, 5);
    });
  });

  // -----------------------------------------------------------------------
  // Narrative threat adjustment
  // -----------------------------------------------------------------------

  describe('adjustNarrativeThreat', () => {
    it('increases threat for high-influence platforms', () => {
      // twitter influence = 0.9, multiplier = 0.5 + 0.9 = 1.4
      const adjusted = service.adjustNarrativeThreat(0.5, { twitter: 10 });
      expect(adjusted).toBeCloseTo(0.5 * 1.4, 5);
    });

    it('decreases threat for low-influence platforms', () => {
      // farcaster influence = 0.3, multiplier = 0.5 + 0.3 = 0.8
      const adjusted = service.adjustNarrativeThreat(0.5, { farcaster: 10 });
      expect(adjusted).toBeCloseTo(0.5 * 0.8, 5);
    });

    it('weights by post count across platforms', () => {
      // twitter(0.9)*8 + farcaster(0.3)*2 = 7.2 + 0.6 = 7.8 / 10 = 0.78
      // multiplier = 0.5 + 0.78 = 1.28
      const adjusted = service.adjustNarrativeThreat(0.5, {
        twitter: 8,
        farcaster: 2,
      });
      expect(adjusted).toBeCloseTo(0.5 * 1.28, 5);
    });

    it('returns base threat when no platforms provided', () => {
      expect(service.adjustNarrativeThreat(0.5, {})).toBe(0.5);
    });

    it('clamps to 1.0', () => {
      const adjusted = service.adjustNarrativeThreat(0.9, { twitter: 100 });
      expect(adjusted).toBeLessThanOrEqual(1.0);
    });

    it('clamps to 0.0', () => {
      const adjusted = service.adjustNarrativeThreat(0.0, { twitter: 100 });
      expect(adjusted).toBeGreaterThanOrEqual(0.0);
    });
  });

  // -----------------------------------------------------------------------
  // Manipulation risk
  // -----------------------------------------------------------------------

  describe('isHighManipulationRisk', () => {
    it('returns true for truthsocial (0.9)', () => {
      expect(service.isHighManipulationRisk('truthsocial')).toBe(true);
    });

    it('returns true for telegram (0.8)', () => {
      expect(service.isHighManipulationRisk('telegram')).toBe(true);
    });

    it('returns false for twitter (0.7 — not strictly greater)', () => {
      expect(service.isHighManipulationRisk('twitter')).toBe(false);
    });

    it('returns false for farcaster (0.2)', () => {
      expect(service.isHighManipulationRisk('farcaster')).toBe(false);
    });

    it('returns false for unknown platform (0.5)', () => {
      expect(service.isHighManipulationRisk('mastodon')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // RSS sub-profiles
  // -----------------------------------------------------------------------

  describe('getRssSubProfile', () => {
    it('returns tier-1 profile', () => {
      const profile = service.getRssSubProfile('tier-1');
      expect(profile).toBeDefined();
      expect(profile!.credibilityWeight).toBe(0.9);
      expect(profile!.influenceWeight).toBe(0.8);
    });

    it('returns tier-2 profile', () => {
      const profile = service.getRssSubProfile('tier-2');
      expect(profile).toBeDefined();
      expect(profile!.credibilityWeight).toBe(0.7);
      expect(profile!.influenceWeight).toBe(0.5);
    });

    it('returns tier-3 profile', () => {
      const profile = service.getRssSubProfile('tier-3');
      expect(profile).toBeDefined();
      expect(profile!.credibilityWeight).toBe(0.4);
      expect(profile!.influenceWeight).toBe(0.2);
    });

    it('returns undefined for unknown tier', () => {
      expect(service.getRssSubProfile('tier-99')).toBeUndefined();
    });
  });

  describe('classifyRssTier', () => {
    it('classifies BBC as tier-1', () => {
      expect(service.classifyRssTier('bbc.com')).toBe('tier-1');
    });

    it('classifies Reuters as tier-1', () => {
      expect(service.classifyRssTier('reuters.com')).toBe('tier-1');
    });

    it('classifies AP as tier-1', () => {
      expect(service.classifyRssTier('apnews.com')).toBe('tier-1');
    });

    it('classifies unknown domain as tier-2', () => {
      expect(service.classifyRssTier('some-news.com')).toBe('tier-2');
    });
  });

  // -----------------------------------------------------------------------
  // Config override
  // -----------------------------------------------------------------------

  describe('PLATFORM_CREDIBILITY_CONFIG override', () => {
    it('overrides specific platform values', () => {
      const overrides = JSON.stringify({
        twitter: { credibilityWeight: 0.8 },
      });
      const s = createService(overrides);
      const profile = s.getProfile('twitter');
      expect(profile.credibilityWeight).toBe(0.8);
      // Other values should remain at defaults
      expect(profile.influenceWeight).toBe(0.9);
    });

    it('adds a new platform via override', () => {
      const overrides = JSON.stringify({
        mastodon: {
          credibilityWeight: 0.8,
          influenceWeight: 0.4,
          manipulationRisk: 0.1,
          botPrevalence: 0.05,
        },
      });
      const s = createService(overrides);
      const profile = s.getProfile('mastodon');
      expect(profile.credibilityWeight).toBe(0.8);
      expect(profile.influenceWeight).toBe(0.4);
    });

    it('handles malformed JSON gracefully', () => {
      const s = createService('not-valid-json');
      // Should still work with defaults
      expect(s.getProfile('twitter').credibilityWeight).toBe(0.4);
    });
  });
});
