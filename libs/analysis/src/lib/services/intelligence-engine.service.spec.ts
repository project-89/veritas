import { IntelligenceEngineService } from './intelligence-engine.service';
import type { BotDetectionResult, BotScore, StructuralPattern } from './graph-bot-detection.service';
import type { DeepInvestigationResult, UserInvestigationResult } from './deep-investigation.service';
import type { AnalyzedNarrative } from './narrative-analysis.service';
import type { ClaimVerificationBatchResult } from './claim-verification.service';
import type { ExternalSignal } from './signal-adapters/signal-adapter.interface';
import type { GlobalEvent } from '../types/global-event';
import { PlatformCredibilityService } from './platform-credibility.service';
import { ConfigService } from '@nestjs/config';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUser(
  handle: string,
  platform = 'twitter',
  overrides: Partial<UserInvestigationResult> = {},
): UserInvestigationResult {
  return {
    user: {
      handle,
      name: handle,
      platform,
      topicPosts: [],
      historicalPosts: [],
      firstMention: '2025-01-01T00:00:00Z',
      narrativeEvolution: [],
      profile: {
        summary: '',
        topics: [],
        patterns: { avgPostsPerDay: 5, mostActiveHours: [12], platformPresence: [platform] },
        motivations: [],
        coordinationFlags: [],
      },
    },
    adoptionTimestamp: overrides.adoptionTimestamp ?? '2025-01-01T00:00:00Z',
    likelySource: overrides.likelySource ?? null,
    influenceScore: overrides.influenceScore ?? 0.5,
    flags: overrides.flags ?? [],
  };
}

function makeBotScore(handle: string, botProbability: number, overrides: Partial<BotScore> = {}): BotScore {
  return {
    handle,
    platform: 'twitter',
    botProbability,
    structuralScore: overrides.structuralScore ?? botProbability * 0.8,
    temporalScore: overrides.temporalScore ?? botProbability * 0.7,
    behavioralScore: overrides.behavioralScore ?? botProbability * 0.6,
    detectedPatterns: overrides.detectedPatterns ?? [],
  };
}

function makeInvestigation(
  users: UserInvestigationResult[],
  overrides: Partial<DeepInvestigationResult> = {},
): DeepInvestigationResult {
  const firstUser = users[0]?.user.handle ?? 'unknown';
  return {
    topic: 'test narrative',
    users,
    originAnalysis: overrides.originAnalysis ?? {
      firstMover: firstUser,
      firstPlatform: 'twitter',
      firstTimestamp: '2025-01-01T00:00:00Z',
      propagationChain: users.map((u) => u.user.handle),
    },
    cuiBono: overrides.cuiBono ?? {
      beneficiaries: [],
      agendas: [],
      summary: 'No clear beneficiaries.',
    },
    coordination: overrides.coordination ?? {
      clusters: [],
      summary: 'No coordination detected.',
    },
  };
}

function makeBotResult(scores: BotScore[], patterns: StructuralPattern[] = []): BotDetectionResult {
  return {
    scores,
    structuralPatterns: patterns,
    summary: 'test',
    graphEnhanced: false,
  };
}

function makeNarrative(overrides: Partial<AnalyzedNarrative> = {}): AnalyzedNarrative {
  return {
    id: overrides.id ?? 'narrative-0',
    summary: overrides.summary ?? 'Test narrative',
    postIndices: overrides.postIndices ?? [0],
    avgSentiment: overrides.avgSentiment ?? 0,
    sentimentTrajectory: overrides.sentimentTrajectory ?? [],
    platforms: overrides.platforms ?? { twitter: 5 },
    authors: overrides.authors ?? [],
    firstSeen: overrides.firstSeen ?? '2025-01-01T00:00:00Z',
    lastSeen: overrides.lastSeen ?? '2025-01-01T12:00:00Z',
    totalEngagement: overrides.totalEngagement ?? 100,
    velocity: overrides.velocity ?? { postsPerHour: 5, acceleration: 0, trend: 'steady' },
    centroidEmbedding: overrides.centroidEmbedding ?? [],
  };
}

function makeGlobalEvent(overrides: Partial<GlobalEvent> = {}): GlobalEvent {
  return {
    id: overrides.id ?? 'evt-1',
    source: overrides.source ?? 'USGS',
    category: overrides.category ?? 'environmental',
    severity: overrides.severity ?? 'medium',
    title: overrides.title ?? 'Test event',
    description: overrides.description ?? 'A test event',
    timestamp: overrides.timestamp ?? '2025-01-01T00:00:00Z',
    location: overrides.location ?? { lat: 0, lng: 0, label: 'Test Region', region: 'TestRegion' },
    magnitude: overrides.magnitude ?? 0.5,
    metadata: overrides.metadata ?? {},
    expiresAt: overrides.expiresAt ?? '2025-01-02T00:00:00Z',
  };
}

function makeSignal(overrides: Partial<ExternalSignal> = {}): ExternalSignal {
  return {
    id: overrides.id ?? 'sig-1',
    domain: overrides.domain ?? 'market',
    source: overrides.source ?? 'Yahoo Finance',
    title: overrides.title ?? '$BTC price move',
    description: overrides.description ?? 'Price change',
    timestamp: overrides.timestamp ?? '2025-01-01T00:00:00Z',
    magnitude: overrides.magnitude ?? 0.5,
    metadata: overrides.metadata ?? {},
  };
}

function makeVerification(
  results: Array<{ claim: string; status: 'verified' | 'disputed' | 'unverified' | 'mixed' | 'false'; confidence: number }>,
): ClaimVerificationBatchResult {
  return {
    results: results.map((r) => ({
      claim: r.claim,
      status: r.status,
      confidence: r.confidence,
      evidence: { supporting: [], contradicting: [] },
      reasoning: '',
      caveats: [],
      sourcesChecked: [],
    })),
    summary: '',
    verifiedCount: results.filter((r) => r.status === 'verified').length,
    disputedCount: results.filter((r) => r.status === 'disputed' || r.status === 'false').length,
    unverifiedCount: results.filter((r) => r.status === 'unverified' || r.status === 'mixed').length,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IntelligenceEngineService', () => {
  let service: IntelligenceEngineService;
  let serviceWithCredibility: IntelligenceEngineService;
  let credibilityService: PlatformCredibilityService;

  beforeEach(() => {
    service = new IntelligenceEngineService();
    const configService = { get: () => undefined } as unknown as ConfigService;
    credibilityService = new PlatformCredibilityService(configService);
    serviceWithCredibility = new IntelligenceEngineService(credibilityService);
  });

  // =========================================================================
  // detectCoordinatedCampaign
  // =========================================================================
  describe('detectCoordinatedCampaign', () => {
    it('should detect campaign with high bot scores and temporal clustering', () => {
      const users = [
        makeUser('orchestrator', 'twitter', { influenceScore: 0.9, adoptionTimestamp: '2025-01-01T00:00:00Z', flags: ['suspicious_timing', 'burst_posting'] }),
        makeUser('bot1', 'twitter', { influenceScore: 0.2, adoptionTimestamp: '2025-01-01T00:01:00Z' }),
        makeUser('bot2', 'twitter', { influenceScore: 0.2, adoptionTimestamp: '2025-01-01T00:02:00Z' }),
        makeUser('bot3', 'twitter', { influenceScore: 0.1, adoptionTimestamp: '2025-01-01T00:03:00Z' }),
      ];
      const investigation = makeInvestigation(users, {
        coordination: {
          clusters: [{ users: ['orchestrator', 'bot1', 'bot2', 'bot3'], pattern: 'synchronized_posting', confidence: 0.8 }],
          summary: 'Coordinated posting detected.',
        },
      });
      const botResult = makeBotResult([
        makeBotScore('orchestrator', 0.3),
        makeBotScore('bot1', 0.9),
        makeBotScore('bot2', 0.85),
        makeBotScore('bot3', 0.95),
      ]);

      const report = service.detectCoordinatedCampaign(botResult, investigation);

      expect(report.campaignDetected).toBe(true);
      expect(report.confidence).toBeGreaterThan(0.4);
      expect(report.actors.filter((a) => a.role === 'bot')).toHaveLength(3);
      expect(report.actors.find((a) => a.handle === 'orchestrator')?.role).toBe('orchestrator');
      expect(report.signals.length).toBeGreaterThanOrEqual(2);
      expect(report.summary).toContain('Coordinated campaign detected');
    });

    it('should not detect campaign with organic behavior', () => {
      const users = [
        makeUser('alice', 'twitter', { influenceScore: 0.3, adoptionTimestamp: '2025-01-01T00:00:00Z' }),
        makeUser('bob', 'reddit', { influenceScore: 0.2, adoptionTimestamp: '2025-01-05T12:00:00Z' }),
        makeUser('charlie', 'twitter', { influenceScore: 0.1, adoptionTimestamp: '2025-01-10T08:00:00Z' }),
      ];
      const investigation = makeInvestigation(users);
      const botResult = makeBotResult([
        makeBotScore('alice', 0.1),
        makeBotScore('bob', 0.15),
        makeBotScore('charlie', 0.05),
      ]);

      const report = service.detectCoordinatedCampaign(botResult, investigation);

      expect(report.campaignDetected).toBe(false);
      expect(report.summary).toContain('organic');
    });

    it('should classify actors correctly by role', () => {
      const users = [
        makeUser('leader', 'twitter', { influenceScore: 0.9, flags: ['burst_posting', 'suspicious_timing'] }),
        makeUser('helper', 'twitter', { influenceScore: 0.5, flags: ['content_similarity'] }),
        makeUser('regular', 'twitter', { influenceScore: 0.1 }),
      ];
      const investigation = makeInvestigation(users);
      const botResult = makeBotResult([
        makeBotScore('leader', 0.3),
        makeBotScore('helper', 0.3),
        makeBotScore('regular', 0.05),
      ]);

      const report = service.detectCoordinatedCampaign(botResult, investigation);

      const leader = report.actors.find((a) => a.handle === 'leader');
      const helper = report.actors.find((a) => a.handle === 'helper');
      const regular = report.actors.find((a) => a.handle === 'regular');

      expect(leader?.role).toBe('orchestrator');
      expect(helper?.role).toBe('amplifier');
      expect(regular?.role).toBe('organic');
    });

    it('should build timeline from adoption timestamps', () => {
      const users = [
        makeUser('first', 'twitter', { adoptionTimestamp: '2025-01-01T00:00:00Z' }),
        makeUser('second', 'twitter', { adoptionTimestamp: '2025-01-01T01:00:00Z' }),
      ];
      const investigation = makeInvestigation(users);
      const botResult = makeBotResult([makeBotScore('first', 0.1), makeBotScore('second', 0.1)]);

      const report = service.detectCoordinatedCampaign(botResult, investigation);

      expect(report.timeline).toHaveLength(2);
      expect(report.timeline[0]!.actor).toBe('first');
      expect(report.timeline[1]!.actor).toBe('second');
    });

    it('should include structural patterns in report', () => {
      const users = [makeUser('a', 'twitter'), makeUser('b', 'twitter')];
      const investigation = makeInvestigation(users);
      const patterns: StructuralPattern[] = [
        { type: 'star', members: ['a', 'b'], description: 'Star pattern', confidence: 0.7 },
      ];
      const botResult = makeBotResult([makeBotScore('a', 0.5), makeBotScore('b', 0.5)], patterns);

      const report = service.detectCoordinatedCampaign(botResult, investigation);

      expect(report.structuralPatterns).toHaveLength(1);
      expect(report.structuralPatterns[0]!.type).toBe('star');
    });

    it('should handle single user investigation', () => {
      const users = [makeUser('solo', 'twitter')];
      const investigation = makeInvestigation(users);
      const botResult = makeBotResult([makeBotScore('solo', 0.1)]);

      const report = service.detectCoordinatedCampaign(botResult, investigation);

      expect(report.campaignDetected).toBe(false);
      expect(report.actors).toHaveLength(1);
    });

    it('should handle empty bot scores', () => {
      const users = [makeUser('a', 'twitter'), makeUser('b', 'twitter')];
      const investigation = makeInvestigation(users);
      const botResult = makeBotResult([]);

      const report = service.detectCoordinatedCampaign(botResult, investigation);

      expect(report.campaignDetected).toBe(false);
      expect(report.actors.every((a) => a.botProbability === 0)).toBe(true);
    });
  });

  // =========================================================================
  // detectMarketManipulation
  // =========================================================================
  describe('detectMarketManipulation', () => {
    it('should detect FUD pattern with negative sentiment and price drop', () => {
      const narratives = [makeNarrative({ summary: '$BTC crash incoming, sell everything', avgSentiment: -0.6 })];
      const signals = [makeSignal({ metadata: { symbol: 'BTC', priceChange: -0.15 } })];
      const posts = [
        { text: 'Sell your $BTC now!', authorHandle: 'fudder1' },
        { text: '$BTC is going to zero', authorHandle: 'fudder2' },
      ];

      const report = service.detectMarketManipulation(narratives, signals, posts);

      expect(report.manipulationDetected).toBe(true);
      expect(report.patterns.some((p) => p.type === 'fud')).toBe(true);
      expect(report.tickersMentioned).toContain('BTC');
      expect(report.summary).toContain('FUD');
    });

    it('should detect pump pattern with positive sentiment and price rise', () => {
      const narratives = [makeNarrative({ summary: '$SOL to the moon, massive adoption', avgSentiment: 0.8 })];
      const signals = [makeSignal({ metadata: { symbol: 'SOL', priceChange: 0.25 } })];
      const posts = [
        { text: 'Buy $SOL now!', authorHandle: 'pumper1' },
        { text: '$SOL is the future', authorHandle: 'pumper2' },
      ];

      const report = service.detectMarketManipulation(narratives, signals, posts);

      expect(report.manipulationDetected).toBe(true);
      expect(report.patterns.some((p) => p.type === 'pump')).toBe(true);
    });

    it('should not detect manipulation when no correlation', () => {
      const narratives = [makeNarrative({ summary: 'General tech discussion', avgSentiment: 0.1 })];
      const signals = [makeSignal({ metadata: { symbol: 'AAPL', priceChange: 0.01 } })];
      const posts = [
        { text: 'Just bought $AAPL', authorHandle: 'investor1' },
      ];

      const report = service.detectMarketManipulation(narratives, signals, posts);

      // No manipulation because no narrative mentions AAPL with strong sentiment
      expect(report.patterns.length).toBe(0);
    });

    it('should handle posts with no ticker mentions', () => {
      const narratives = [makeNarrative()];
      const signals = [makeSignal()];
      const posts = [
        { text: 'Just a normal post', authorHandle: 'user1' },
      ];

      const report = service.detectMarketManipulation(narratives, signals, posts);

      expect(report.manipulationDetected).toBe(false);
      expect(report.tickersMentioned).toHaveLength(0);
    });

    it('should handle empty inputs', () => {
      const report = service.detectMarketManipulation([], [], []);

      expect(report.manipulationDetected).toBe(false);
      expect(report.patterns).toHaveLength(0);
      expect(report.tickersMentioned).toHaveLength(0);
    });

    it('should extract multiple tickers from posts', () => {
      const narratives = [makeNarrative()];
      const signals: ExternalSignal[] = [];
      const posts = [
        { text: '$BTC and $ETH are moving', authorHandle: 'user1' },
        { text: '$SOL looking good', authorHandle: 'user2' },
      ];

      const report = service.detectMarketManipulation(narratives, signals, posts);

      expect(report.tickersMentioned).toContain('BTC');
      expect(report.tickersMentioned).toContain('ETH');
      expect(report.tickersMentioned).toContain('SOL');
    });

    it('should detect coordinated shilling with many actors and flat price', () => {
      const narratives = [makeNarrative({ summary: '$MEME is the best token', avgSentiment: 0.7 })];
      const signals = [makeSignal({ metadata: { symbol: 'MEME', priceChange: 0.001 } })];
      const posts = [
        { text: 'Buy $MEME now!', authorHandle: 'shill1' },
        { text: '$MEME is amazing', authorHandle: 'shill2' },
        { text: 'Everyone needs $MEME', authorHandle: 'shill3' },
        { text: '$MEME to the moon', authorHandle: 'shill4' },
      ];

      const report = service.detectMarketManipulation(narratives, signals, posts);

      expect(report.patterns.some((p) => p.type === 'coordinated_shill')).toBe(true);
    });

    it('should match signals by title when metadata symbol is absent', () => {
      const narratives = [makeNarrative({ summary: '$DOGE wow much pump', avgSentiment: 0.8 })];
      const signals = [makeSignal({ title: '$DOGE market data', metadata: { priceChange: 0.20 } })];
      const posts = [{ text: 'Buy $DOGE now!', authorHandle: 'user1' }];

      const report = service.detectMarketManipulation(narratives, signals, posts);

      expect(report.signalsMatched.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // assessCrisisRisk
  // =========================================================================
  describe('assessCrisisRisk', () => {
    it('should flag emergency when 3+ sources converge on a region', () => {
      const events = [
        makeGlobalEvent({ source: 'USGS', location: { lat: 35, lng: 139, label: 'Tokyo', region: 'Japan' } }),
        makeGlobalEvent({ source: 'GDELT', location: { lat: 35, lng: 139, label: 'Tokyo', region: 'Japan' } }),
        makeGlobalEvent({ source: 'ACLED', location: { lat: 35, lng: 139, label: 'Tokyo', region: 'Japan' } }),
      ];

      const report = service.assessCrisisRisk(events, []);

      expect(report.highestSeverity).toBe('emergency');
      expect(report.alerts[0]!.severity).toBe('emergency');
      expect(report.alerts[0]!.sourceCount).toBe(3);
    });

    it('should flag warning when 2 sources converge', () => {
      const events = [
        makeGlobalEvent({ source: 'USGS', location: { lat: 0, lng: 0, label: 'Region A', region: 'RegionA' } }),
        makeGlobalEvent({ source: 'GDELT', location: { lat: 0, lng: 0, label: 'Region A', region: 'RegionA' } }),
      ];

      const report = service.assessCrisisRisk(events, []);

      expect(report.highestSeverity).toBe('warning');
      expect(report.alerts[0]!.severity).toBe('warning');
    });

    it('should flag watch when single source', () => {
      const events = [
        makeGlobalEvent({ source: 'USGS', location: { lat: 0, lng: 0, label: 'Remote', region: 'Remote' } }),
      ];

      const report = service.assessCrisisRisk(events, []);

      expect(report.highestSeverity).toBe('watch');
    });

    it('should handle empty events', () => {
      const report = service.assessCrisisRisk([], []);

      expect(report.highestSeverity).toBe('none');
      expect(report.alerts).toHaveLength(0);
      expect(report.totalEventsAnalyzed).toBe(0);
    });

    it('should group events by region', () => {
      const events = [
        makeGlobalEvent({ source: 'USGS', location: { lat: 0, lng: 0, label: 'A', region: 'RegionA' } }),
        makeGlobalEvent({ source: 'USGS', location: { lat: 0, lng: 0, label: 'B', region: 'RegionB' } }),
        makeGlobalEvent({ source: 'GDELT', location: { lat: 0, lng: 0, label: 'A', region: 'RegionA' } }),
      ];

      const report = service.assessCrisisRisk(events, []);

      expect(report.regionsAffected).toHaveLength(2);
      expect(report.alerts.find((a) => a.region === 'RegionA')!.sourceCount).toBe(2);
      expect(report.alerts.find((a) => a.region === 'RegionB')!.sourceCount).toBe(1);
    });

    it('should boost severity when narrative correlates with events', () => {
      const events = [
        makeGlobalEvent({ source: 'USGS', title: 'Earthquake in Turkey', location: { lat: 39, lng: 35, label: 'Turkey', region: 'Turkey' } }),
      ];
      const narratives = [
        makeNarrative({ summary: 'Massive earthquake devastates Turkey', velocity: { postsPerHour: 50, acceleration: 2, trend: 'surging' } }),
      ];

      const report = service.assessCrisisRisk(events, narratives);

      // Should be boosted from 'watch' to 'warning' due to narrative correlation
      expect(report.alerts[0]!.severity).toBe('warning');
      expect(report.alerts[0]!.narrativeCorrelation).toBeGreaterThan(0);
    });

    it('should sort alerts by severity descending', () => {
      const events = [
        makeGlobalEvent({ source: 'USGS', location: { lat: 0, lng: 0, label: 'A', region: 'Watch' } }),
        makeGlobalEvent({ source: 'USGS', location: { lat: 0, lng: 0, label: 'B', region: 'Emergency' } }),
        makeGlobalEvent({ source: 'GDELT', location: { lat: 0, lng: 0, label: 'B', region: 'Emergency' } }),
        makeGlobalEvent({ source: 'ACLED', location: { lat: 0, lng: 0, label: 'B', region: 'Emergency' } }),
      ];

      const report = service.assessCrisisRisk(events, []);

      expect(report.alerts[0]!.severity).toBe('emergency');
      expect(report.alerts[1]!.severity).toBe('watch');
    });

    it('should include narrative correlation info in summary', () => {
      const events = [
        makeGlobalEvent({ source: 'USGS', title: 'Flooding in Brazil', location: { lat: -15, lng: -47, label: 'Brazil', region: 'Brazil' } }),
        makeGlobalEvent({ source: 'GDELT', title: 'Flooding in Brazil', location: { lat: -15, lng: -47, label: 'Brazil', region: 'Brazil' } }),
      ];
      const narratives = [
        makeNarrative({ summary: 'Severe flooding hits Brazil', velocity: { postsPerHour: 30, acceleration: 1, trend: 'surging' } }),
      ];

      const report = service.assessCrisisRisk(events, narratives);

      expect(report.summary).toContain('Brazil');
    });
  });

  // =========================================================================
  // attributeInfluenceOperation
  // =========================================================================
  describe('attributeInfluenceOperation', () => {
    it('should detect influence operation with clear propagation chain', () => {
      const users = [
        makeUser('origin', 'telegram', { influenceScore: 0.9, flags: ['first_mover'] }),
        makeUser('amp1', 'twitter', { influenceScore: 0.6, flags: ['amplifier'] }),
        makeUser('amp2', 'twitter', { influenceScore: 0.5 }),
        makeUser('target1', 'reddit', { influenceScore: 0.2 }),
        makeUser('target2', 'reddit', { influenceScore: 0.1 }),
      ];
      const investigation = makeInvestigation(users, {
        cuiBono: {
          beneficiaries: [{ entity: 'CompanyX', howTheyBenefit: 'Stock price manipulation', confidence: 0.7 }],
          agendas: ['market manipulation'],
          summary: 'CompanyX benefits.',
        },
      });
      const botResult = makeBotResult([
        makeBotScore('origin', 0.2),
        makeBotScore('amp1', 0.7),
        makeBotScore('amp2', 0.65),
        makeBotScore('target1', 0.1),
        makeBotScore('target2', 0.05),
      ]);
      const narratives = [makeNarrative()];

      const report = service.attributeInfluenceOperation(investigation, botResult, narratives);

      expect(report.operationDetected).toBe(true);
      expect(report.confidence).toBeGreaterThan(0);
      expect(report.attributionChain.find((n) => n.role === 'originator')?.handle).toBe('origin');
      expect(report.beneficiaries).toHaveLength(1);
      expect(report.platformsInvolved.length).toBeGreaterThan(1);
      expect(report.summary).toContain('origin');
    });

    it('should not detect operation when propagation appears organic', () => {
      const users = [
        makeUser('alice', 'twitter', { influenceScore: 0.3 }),
        makeUser('bob', 'reddit', { influenceScore: 0.2 }),
      ];
      const investigation = makeInvestigation(users);
      const botResult = makeBotResult([
        makeBotScore('alice', 0.1),
        makeBotScore('bob', 0.05),
      ]);

      const report = service.attributeInfluenceOperation(investigation, botResult, []);

      expect(report.operationDetected).toBe(false);
      expect(report.summary).toContain('organic');
    });

    it('should generate investigative leads for originator', () => {
      const users = [
        makeUser('origin', 'twitter', { influenceScore: 0.8, flags: ['suspicious'] }),
        makeUser('amp', 'twitter', { influenceScore: 0.5 }),
        makeUser('follower', 'twitter', { influenceScore: 0.1 }),
      ];
      const investigation = makeInvestigation(users, {
        cuiBono: {
          beneficiaries: [{ entity: 'Entity1', howTheyBenefit: 'Profits from FUD', confidence: 0.6 }],
          agendas: [],
          summary: '',
        },
      });
      const botResult = makeBotResult([
        makeBotScore('origin', 0.3),
        makeBotScore('amp', 0.7),
        makeBotScore('follower', 0.1),
      ]);

      const report = service.attributeInfluenceOperation(investigation, botResult, []);

      expect(report.investigativeLeads.length).toBeGreaterThan(0);
      expect(report.investigativeLeads.some((l) => l.question.includes('origin'))).toBe(true);
    });

    it('should use platform credibility when available', () => {
      const users = [
        makeUser('origin', 'telegram', { influenceScore: 0.8, flags: ['suspicious'] }),
        makeUser('amp', 'twitter', { influenceScore: 0.6 }),
        makeUser('target', 'farcaster', { influenceScore: 0.3 }),
      ];
      const investigation = makeInvestigation(users);
      const botResult = makeBotResult([
        makeBotScore('origin', 0.3),
        makeBotScore('amp', 0.7),
        makeBotScore('target', 0.1),
      ]);

      const report = serviceWithCredibility.attributeInfluenceOperation(investigation, botResult, []);

      // Platform credibility should affect confidence values
      expect(report.attributionChain.length).toBeGreaterThan(0);
    });

    it('should include beneficiaries in attribution chain', () => {
      const users = [makeUser('a', 'twitter'), makeUser('b', 'twitter'), makeUser('c', 'twitter')];
      const investigation = makeInvestigation(users, {
        cuiBono: {
          beneficiaries: [
            { entity: 'Corp1', howTheyBenefit: 'Market advantage', confidence: 0.8 },
            { entity: 'Corp2', howTheyBenefit: 'Competitor damage', confidence: 0.6 },
          ],
          agendas: [],
          summary: '',
        },
      });
      const botResult = makeBotResult([makeBotScore('a', 0.1), makeBotScore('b', 0.7), makeBotScore('c', 0.1)]);

      const report = service.attributeInfluenceOperation(investigation, botResult, []);

      const beneficiaryNodes = report.attributionChain.filter((n) => n.role === 'beneficiary');
      expect(beneficiaryNodes).toHaveLength(2);
    });
  });

  // =========================================================================
  // scoreNarrativeLegitimacy
  // =========================================================================
  describe('scoreNarrativeLegitimacy', () => {
    it('should score high for verified claims', () => {
      const verification = makeVerification([
        { claim: 'Claim A', status: 'verified', confidence: 0.9 },
        { claim: 'Claim B', status: 'verified', confidence: 0.85 },
        { claim: 'Claim C', status: 'verified', confidence: 0.8 },
      ]);

      const report = service.scoreNarrativeLegitimacy(verification, { twitter: 5 });

      expect(report.score).toBeGreaterThan(0.6);
      expect(report.verdict).toMatch(/legitimate/);
      expect(report.verifiedClaimCount).toBe(3);
      expect(report.disputedClaimCount).toBe(0);
    });

    it('should score low for disputed claims', () => {
      const verification = makeVerification([
        { claim: 'False claim A', status: 'disputed', confidence: 0.8 },
        { claim: 'False claim B', status: 'false', confidence: 0.9 },
        { claim: 'False claim C', status: 'disputed', confidence: 0.85 },
      ]);

      const report = service.scoreNarrativeLegitimacy(verification, { twitter: 5 });

      expect(report.score).toBeLessThan(0.4);
      expect(report.verdict).toMatch(/false|uncertain/);
      expect(report.disputedClaimCount).toBe(3);
    });

    it('should return uncertain for mixed claims', () => {
      const verification = makeVerification([
        { claim: 'Verified', status: 'verified', confidence: 0.8 },
        { claim: 'Disputed', status: 'disputed', confidence: 0.8 },
        { claim: 'Unverified', status: 'unverified', confidence: 0.5 },
      ]);

      const report = service.scoreNarrativeLegitimacy(verification, { twitter: 5 });

      expect(report.score).toBeGreaterThan(0.3);
      expect(report.score).toBeLessThan(0.7);
    });

    it('should handle empty verification results', () => {
      const verification = makeVerification([]);

      const report = service.scoreNarrativeLegitimacy(verification, {});

      expect(report.verifiedClaimCount).toBe(0);
      expect(report.disputedClaimCount).toBe(0);
      expect(report.summary).toContain('No claims');
    });

    it('should factor in platform credibility when service is available', () => {
      const verification = makeVerification([
        { claim: 'Claim A', status: 'verified', confidence: 0.8 },
      ]);

      // Farcaster has high credibility (0.7)
      const reportHighCred = serviceWithCredibility.scoreNarrativeLegitimacy(verification, { farcaster: 10 });
      // Truth Social has low credibility (0.2)
      const reportLowCred = serviceWithCredibility.scoreNarrativeLegitimacy(verification, { truthsocial: 10 });

      expect(reportHighCred.platformCredibilityAvg).toBeGreaterThan(reportLowCred.platformCredibilityAvg);
      expect(reportHighCred.score).toBeGreaterThan(reportLowCred.score);
    });

    it('should calculate evidence balance correctly', () => {
      const verification = makeVerification([
        { claim: 'A', status: 'verified', confidence: 0.9 },
        { claim: 'B', status: 'verified', confidence: 0.8 },
        { claim: 'C', status: 'disputed', confidence: 0.7 },
      ]);

      const report = service.scoreNarrativeLegitimacy(verification, { twitter: 5 });

      // 2 verified vs 1 disputed — balance should be positive
      expect(report.evidenceBalance).toBeGreaterThan(0);
    });

    it('should include claim breakdown in report', () => {
      const verification = makeVerification([
        { claim: 'Claim X', status: 'verified', confidence: 0.9 },
        { claim: 'Claim Y', status: 'disputed', confidence: 0.7 },
      ]);

      const report = service.scoreNarrativeLegitimacy(verification, { twitter: 5 });

      expect(report.claimBreakdown).toHaveLength(2);
      expect(report.claimBreakdown[0]!.claim).toBe('Claim X');
      expect(report.claimBreakdown[1]!.claim).toBe('Claim Y');
    });

    it('should map scores to correct verdicts', () => {
      // All verified with high confidence → legitimate
      const highReport = service.scoreNarrativeLegitimacy(
        makeVerification([
          { claim: 'A', status: 'verified', confidence: 1 },
          { claim: 'B', status: 'verified', confidence: 1 },
        ]),
        {},
      );
      expect(highReport.verdict).toBe('legitimate');

      // All disputed → false or likely_false
      const lowReport = service.scoreNarrativeLegitimacy(
        makeVerification([
          { claim: 'A', status: 'false', confidence: 1 },
          { claim: 'B', status: 'disputed', confidence: 1 },
        ]),
        {},
      );
      expect(['false', 'likely_false']).toContain(lowReport.verdict);
    });

    it('should handle single claim', () => {
      const verification = makeVerification([
        { claim: 'Single claim', status: 'unverified', confidence: 0.5 },
      ]);

      const report = service.scoreNarrativeLegitimacy(verification, { reddit: 3 });

      expect(report.unverifiedClaimCount).toBe(1);
      expect(report.verdict).toBe('uncertain');
    });
  });
});
