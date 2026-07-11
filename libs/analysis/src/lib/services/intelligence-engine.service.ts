import { Injectable, Logger, Optional } from '@nestjs/common';
import type { GlobalEvent } from '../types/global-event';
import type {
  ClaimVerificationBatchResult,
  VerificationResult,
} from './claim-verification.service';
import type {
  DeepInvestigationResult,
  UserInvestigationResult,
} from './deep-investigation.service';
import type { InvestigativeLead } from './evidence-adapters/evidence-adapter.interface';
import type {
  BotDetectionResult,
  BotScore,
  StructuralPattern,
} from './graph-bot-detection.service';
import type { AnalyzedNarrative } from './narrative-analysis.service';
import { PlatformCredibilityService } from './platform-credibility.service';
import type { ExternalSignal } from './signal-adapters/signal-adapter.interface';

// ---------------------------------------------------------------------------
// Types — Coordinated Campaign Detection
// ---------------------------------------------------------------------------

export interface CampaignSignal {
  type: 'temporal_cluster' | 'content_similarity' | 'bot_network' | 'coordination_pattern';
  description: string;
  confidence: number;
  actors: string[];
  timestamp?: string;
}

export interface CampaignActor {
  handle: string;
  platform: string;
  role: 'orchestrator' | 'amplifier' | 'bot' | 'organic';
  botProbability: number;
  adoptionTimestamp: string | null;
  influenceScore: number;
  flags: string[];
}

export interface CampaignTimeline {
  timestamp: string;
  actor: string;
  event: string;
}

export interface CoordinatedCampaignReport {
  campaignDetected: boolean;
  confidence: number;
  actors: CampaignActor[];
  signals: CampaignSignal[];
  timeline: CampaignTimeline[];
  coordinationClusters: Array<{ users: string[]; pattern: string; confidence: number }>;
  structuralPatterns: StructuralPattern[];
  summary: string;
}

// ---------------------------------------------------------------------------
// Types — Market Manipulation Detection
// ---------------------------------------------------------------------------

export interface ManipulationPattern {
  ticker: string;
  type: 'pump' | 'fud' | 'wash_narrative' | 'coordinated_shill';
  narrativeSentiment: number;
  priceDirection: 'up' | 'down' | 'flat';
  correlation: number;
  confidence: number;
  description: string;
  involvedActors: string[];
}

export interface MarketManipulationReport {
  manipulationDetected: boolean;
  confidence: number;
  patterns: ManipulationPattern[];
  tickersMentioned: string[];
  signalsMatched: ExternalSignal[];
  summary: string;
}

// ---------------------------------------------------------------------------
// Types — Crisis Warning
// ---------------------------------------------------------------------------

export interface CrisisAlert {
  region: string;
  severity: 'watch' | 'warning' | 'emergency';
  sourceCount: number;
  sources: string[];
  events: GlobalEvent[];
  narrativeCorrelation: number;
  description: string;
}

export interface CrisisWarningReport {
  alerts: CrisisAlert[];
  highestSeverity: 'none' | 'watch' | 'warning' | 'emergency';
  totalEventsAnalyzed: number;
  regionsAffected: string[];
  summary: string;
}

// ---------------------------------------------------------------------------
// Types — Influence Operation Attribution
// ---------------------------------------------------------------------------

export interface AttributionNode {
  handle: string;
  platform: string;
  role: 'originator' | 'amplifier' | 'target' | 'beneficiary';
  confidence: number;
  evidence: string[];
}

export interface InfluenceOperationReport {
  operationDetected: boolean;
  confidence: number;
  attributionChain: AttributionNode[];
  propagationPath: string[];
  beneficiaries: Array<{ entity: string; howTheyBenefit: string; confidence: number }>;
  platformsInvolved: string[];
  investigativeLeads: InvestigativeLead[];
  summary: string;
}

// ---------------------------------------------------------------------------
// Types — Narrative Legitimacy Scoring
// ---------------------------------------------------------------------------

export interface NarrativeLegitimacyReport {
  score: number;
  verdict: 'legitimate' | 'likely_legitimate' | 'uncertain' | 'likely_false' | 'false';
  verifiedClaimCount: number;
  disputedClaimCount: number;
  unverifiedClaimCount: number;
  evidenceBalance: number;
  platformCredibilityAvg: number;
  claimBreakdown: Array<{
    claim: string;
    status: string;
    weight: number;
  }>;
  summary: string;
}

// ---------------------------------------------------------------------------
// Union type
// ---------------------------------------------------------------------------

/**
 * Whether the assessment received the inputs it actually needs. Several
 * assessments depend on data the caller may not supply (bot scores, geolocated
 * global events, external signals); without them the engine still returns a
 * structurally valid report that reads as "nothing detected". This flag lets
 * the UI say "insufficient input" instead of presenting an empty-input run as
 * an authoritative all-clear.
 */
export interface DataSufficiency {
  sufficient: boolean;
  /** Human-readable names of the missing critical inputs, e.g. ['bot scores']. */
  missingInputs: string[];
  note?: string;
}

export type IntelligenceReport = (
  | { type: 'campaign'; report: CoordinatedCampaignReport }
  | { type: 'manipulation'; report: MarketManipulationReport }
  | { type: 'crisis'; report: CrisisWarningReport }
  | { type: 'influence'; report: InfluenceOperationReport }
  | { type: 'legitimacy'; report: NarrativeLegitimacyReport }
) & { dataSufficiency: DataSufficiency };

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class IntelligenceEngineService {
  private readonly logger = new Logger(IntelligenceEngineService.name);

  constructor(@Optional() private readonly platformCredibility?: PlatformCredibilityService) {}

  // =========================================================================
  // 1. Coordinated Campaign Detection
  // =========================================================================

  detectCoordinatedCampaign(
    botResult: BotDetectionResult,
    investigation: DeepInvestigationResult,
  ): CoordinatedCampaignReport {
    const signals: CampaignSignal[] = [];
    const botScoreMap = new Map<string, BotScore>();
    for (const score of botResult.scores) {
      botScoreMap.set(score.handle.toLowerCase(), score);
    }

    // --- Classify actors ---
    const actors: CampaignActor[] = investigation.users.map((u) => {
      const bs = botScoreMap.get(u.user.handle.toLowerCase());
      const botProb = bs?.botProbability ?? 0;
      const role = this.classifyActorRole(u, botProb, investigation);
      return {
        handle: u.user.handle,
        platform: u.user.platform,
        role,
        botProbability: botProb,
        adoptionTimestamp: u.adoptionTimestamp,
        influenceScore: u.influenceScore,
        flags: [...u.flags, ...(bs?.detectedPatterns ?? [])],
      };
    });

    // --- Bot network signal ---
    const highBotActors = actors.filter((a) => a.botProbability >= 0.7);
    if (highBotActors.length >= 2) {
      signals.push({
        type: 'bot_network',
        description: `${highBotActors.length} actors with high bot probability (>= 0.7) detected`,
        confidence: Math.min(1, highBotActors.length / Math.max(actors.length, 1)),
        actors: highBotActors.map((a) => a.handle),
      });
    }

    // --- Temporal clustering signal ---
    const adoptionTimestamps = actors
      .filter((a) => a.adoptionTimestamp)
      .map((a) => ({
        handle: a.handle,
        ts: a.adoptionTimestamp ? new Date(a.adoptionTimestamp).getTime() : 0,
      }))
      .sort((a, b) => a.ts - b.ts);

    if (adoptionTimestamps.length >= 3) {
      const gaps: number[] = [];
      for (let i = 1; i < adoptionTimestamps.length; i++) {
        const current = adoptionTimestamps[i];
        const previous = adoptionTimestamps[i - 1];
        if (!current || !previous) continue;
        gaps.push(current.ts - previous.ts);
      }
      const medianGap = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] ?? 0;
      // If median gap is under 10 minutes, suspicious temporal clustering
      const TEN_MINUTES = 10 * 60 * 1000;
      if (medianGap < TEN_MINUTES && medianGap >= 0) {
        const clusteredActors = adoptionTimestamps.map((a) => a.handle);
        signals.push({
          type: 'temporal_cluster',
          description: `${clusteredActors.length} actors adopted the narrative within tight temporal window (median gap: ${Math.round(medianGap / 1000)}s)`,
          confidence: Math.min(1, (TEN_MINUTES / Math.max(medianGap, 1)) * 0.1),
          actors: clusteredActors,
          timestamp: adoptionTimestamps[0]?.ts
            ? new Date(adoptionTimestamps[0].ts).toISOString()
            : undefined,
        });
      }
    }

    // --- Coordination cluster signals from investigation ---
    const coordinationClusters = investigation.coordination.clusters;
    for (const cluster of coordinationClusters) {
      if (cluster.confidence >= 0.5) {
        signals.push({
          type: 'coordination_pattern',
          description: `Coordination cluster: ${cluster.pattern} (${cluster.users.length} users)`,
          confidence: cluster.confidence,
          actors: cluster.users,
        });
      }
    }

    // --- Structural pattern signals ---
    for (const pattern of botResult.structuralPatterns) {
      if (pattern.confidence >= 0.5) {
        signals.push({
          type: 'content_similarity',
          description: `Structural pattern "${pattern.type}": ${pattern.description}`,
          confidence: pattern.confidence,
          actors: pattern.members,
        });
      }
    }

    // --- Build timeline ---
    const timeline: CampaignTimeline[] = adoptionTimestamps.map((a) => ({
      timestamp: new Date(a.ts).toISOString(),
      actor: a.handle,
      event: 'adopted narrative',
    }));

    // --- Calculate overall confidence ---
    const campaignConfidence =
      signals.length > 0
        ? Math.min(1, signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length)
        : 0;

    const campaignDetected = campaignConfidence >= 0.4 && signals.length >= 2;

    // --- Build summary ---
    const orchestrators = actors.filter((a) => a.role === 'orchestrator');
    const bots = actors.filter((a) => a.role === 'bot');
    const amplifiers = actors.filter((a) => a.role === 'amplifier');

    let summary: string;
    if (!campaignDetected) {
      summary = `No coordinated campaign detected. Analyzed ${actors.length} actors with ${signals.length} weak signal(s). Activity appears organic.`;
    } else {
      const parts: string[] = [
        `Coordinated campaign detected with ${(campaignConfidence * 100).toFixed(0)}% confidence.`,
      ];
      if (orchestrators.length > 0) {
        parts.push(
          `${orchestrators.length} likely orchestrator(s): ${orchestrators.map((o) => o.handle).join(', ')}.`,
        );
      }
      if (bots.length > 0) {
        parts.push(`${bots.length} bot account(s) identified.`);
      }
      if (amplifiers.length > 0) {
        parts.push(`${amplifiers.length} amplifier(s) spreading the narrative.`);
      }
      parts.push(
        `${signals.length} coordination signal(s) detected across ${coordinationClusters.length} cluster(s).`,
      );
      summary = parts.join(' ');
    }

    return {
      campaignDetected,
      confidence: campaignConfidence,
      actors,
      signals,
      timeline,
      coordinationClusters,
      structuralPatterns: botResult.structuralPatterns,
      summary,
    };
  }

  private classifyActorRole(
    user: UserInvestigationResult,
    botProbability: number,
    investigation: DeepInvestigationResult,
  ): CampaignActor['role'] {
    // Bots first
    if (botProbability >= 0.7) return 'bot';

    // Orchestrator: first mover or high influence + flags
    const isFirstMover =
      user.user.handle.toLowerCase() === investigation.originAnalysis.firstMover.toLowerCase();
    if (isFirstMover && user.influenceScore >= 0.5) return 'orchestrator';
    if (user.influenceScore >= 0.8 && user.flags.length >= 2) return 'orchestrator';

    // Amplifier: moderate influence or some flags
    if (user.influenceScore >= 0.3 || user.flags.length >= 1) return 'amplifier';

    return 'organic';
  }

  // =========================================================================
  // 2. Market Manipulation Detection
  // =========================================================================

  detectMarketManipulation(
    narratives: AnalyzedNarrative[],
    signals: ExternalSignal[],
    posts: Array<{ text: string; authorHandle: string }>,
  ): MarketManipulationReport {
    // --- Extract $TICKER mentions from posts ---
    const tickerRegex = /\$([A-Z]{2,10})\b/g;
    const tickerMentions = new Map<string, Set<string>>();
    const tickerPostTexts = new Map<string, string[]>();

    for (const post of posts) {
      const regex = new RegExp(tickerRegex.source, tickerRegex.flags);
      let match = regex.exec(post.text);
      while (match !== null) {
        const rawTicker = match[1];
        if (!rawTicker) {
          match = regex.exec(post.text);
          continue;
        }
        const ticker = rawTicker.toUpperCase();
        if (!tickerMentions.has(ticker)) {
          tickerMentions.set(ticker, new Set());
          tickerPostTexts.set(ticker, []);
        }
        tickerMentions.get(ticker)?.add(post.authorHandle);
        tickerPostTexts.get(ticker)?.push(post.text);
        match = regex.exec(post.text);
      }
    }

    const tickersMentioned = Array.from(tickerMentions.keys());

    // --- Match signals by symbol ---
    const marketSignalMap = new Map<string, ExternalSignal[]>();
    for (const signal of signals) {
      if (signal.domain !== 'market') continue;
      const symbol =
        (signal.metadata['symbol'] as string)?.toUpperCase() ??
        signal.title.match(/\$([A-Z]{2,10})/)?.[1]?.toUpperCase() ??
        '';
      if (symbol && tickerMentions.has(symbol)) {
        if (!marketSignalMap.has(symbol)) marketSignalMap.set(symbol, []);
        marketSignalMap.get(symbol)?.push(signal);
      }
    }

    // --- Detect patterns ---
    const patterns: ManipulationPattern[] = [];
    const signalsMatched: ExternalSignal[] = [];

    for (const ticker of tickersMentioned) {
      const matchedSignals = marketSignalMap.get(ticker) ?? [];
      if (matchedSignals.length === 0) continue;

      signalsMatched.push(...matchedSignals);

      // Calculate narrative sentiment for this ticker
      const narrativeSentiment = this.calculateTickerSentiment(ticker, narratives);

      // Determine price direction from signals
      const priceDirection = this.determinePriceDirection(matchedSignals);

      // Correlate sentiment with price movement
      const correlation = this.calculateSentimentPriceCorrelation(
        narrativeSentiment,
        priceDirection,
      );

      const actors = Array.from(tickerMentions.get(ticker) ?? []);

      // FUD pattern: negative narrative correlates with price drops
      if (narrativeSentiment < -0.2 && priceDirection === 'down' && correlation > 0.3) {
        patterns.push({
          ticker,
          type: 'fud',
          narrativeSentiment,
          priceDirection,
          correlation,
          confidence: Math.min(1, correlation * 0.8 + 0.2),
          description: `Negative narrative about $${ticker} correlates with price decline — possible FUD campaign`,
          involvedActors: actors,
        });
      }

      // Pump pattern: positive narrative correlates with price rises
      if (narrativeSentiment > 0.2 && priceDirection === 'up' && correlation > 0.3) {
        patterns.push({
          ticker,
          type: 'pump',
          narrativeSentiment,
          priceDirection,
          correlation,
          confidence: Math.min(1, correlation * 0.8 + 0.2),
          description: `Positive narrative about $${ticker} correlates with price increase — possible pump scheme`,
          involvedActors: actors,
        });
      }

      // Coordinated shill: many actors, positive sentiment, but weak or flat price
      if (narrativeSentiment > 0.2 && priceDirection === 'flat' && actors.length >= 3) {
        patterns.push({
          ticker,
          type: 'coordinated_shill',
          narrativeSentiment,
          priceDirection,
          correlation: 0,
          confidence: Math.min(1, actors.length / 10),
          description: `${actors.length} actors promoting $${ticker} with positive narrative but no price movement — possible coordinated shilling`,
          involvedActors: actors,
        });
      }
    }

    const manipulationDetected = patterns.length > 0;
    const confidence = manipulationDetected
      ? Math.min(
          1,
          patterns.reduce((max, p) => Math.max(max, p.confidence), 0),
        )
      : 0;

    let summary: string;
    if (!manipulationDetected) {
      summary = `No market manipulation patterns detected. Analyzed ${tickersMentioned.length} ticker(s) mentioned across ${posts.length} posts with ${signals.length} market signal(s).`;
    } else {
      const fudCount = patterns.filter((p) => p.type === 'fud').length;
      const pumpCount = patterns.filter((p) => p.type === 'pump').length;
      const parts: string[] = [
        `Market manipulation detected with ${(confidence * 100).toFixed(0)}% confidence.`,
      ];
      if (pumpCount > 0) parts.push(`${pumpCount} pump pattern(s).`);
      if (fudCount > 0) parts.push(`${fudCount} FUD pattern(s).`);
      parts.push(`Tickers involved: ${patterns.map((p) => `$${p.ticker}`).join(', ')}.`);
      summary = parts.join(' ');
    }

    return {
      manipulationDetected,
      confidence,
      patterns,
      tickersMentioned,
      signalsMatched,
      summary,
    };
  }

  private calculateTickerSentiment(ticker: string, narratives: AnalyzedNarrative[]): number {
    // Find narratives that mention this ticker in their summary
    const relevant = narratives.filter(
      (n) => n.summary.toUpperCase().includes(ticker) || n.summary.includes(`$${ticker}`),
    );
    if (relevant.length === 0) return 0;
    return relevant.reduce((sum, n) => sum + n.avgSentiment, 0) / relevant.length;
  }

  private determinePriceDirection(signals: ExternalSignal[]): 'up' | 'down' | 'flat' {
    // Look at magnitude and metadata for price change hints
    let totalChange = 0;
    let signalCount = 0;

    for (const signal of signals) {
      const change =
        (signal.metadata['priceChange'] as number) ??
        (signal.metadata['changePercent'] as number) ??
        0;
      totalChange += change;
      signalCount++;
    }

    if (signalCount === 0) return 'flat';
    const avgChange = totalChange / signalCount;
    if (avgChange > 0.01) return 'up';
    if (avgChange < -0.01) return 'down';
    return 'flat';
  }

  private calculateSentimentPriceCorrelation(
    sentiment: number,
    direction: 'up' | 'down' | 'flat',
  ): number {
    if (direction === 'flat') return 0;
    // Positive correlation: sentiment and price move same direction
    // Negative correlation (for FUD): both negative
    const directionSign = direction === 'up' ? 1 : -1;
    const alignment = sentiment * directionSign;
    // Normalize to 0-1 range
    return Math.max(0, Math.min(1, alignment));
  }

  // =========================================================================
  // 3. Crisis Risk Assessment
  // =========================================================================

  assessCrisisRisk(events: GlobalEvent[], narratives: AnalyzedNarrative[]): CrisisWarningReport {
    if (events.length === 0) {
      return {
        alerts: [],
        highestSeverity: 'none',
        totalEventsAnalyzed: 0,
        regionsAffected: [],
        summary: 'No global events to assess for crisis risk.',
      };
    }

    // --- Group events by region ---
    const regionMap = new Map<string, GlobalEvent[]>();
    for (const event of events) {
      const region = event.location.region ?? event.location.countryCode ?? event.location.label;
      if (!regionMap.has(region)) regionMap.set(region, []);
      regionMap.get(region)?.push(event);
    }

    // --- Build alerts per region ---
    const alerts: CrisisAlert[] = [];

    for (const [region, regionEvents] of regionMap) {
      // Count unique sources
      const uniqueSources = new Set(regionEvents.map((e) => e.source));
      const sourceCount = uniqueSources.size;

      // Determine severity based on multi-source convergence
      let severity: CrisisAlert['severity'];
      if (sourceCount >= 3) severity = 'emergency';
      else if (sourceCount >= 2) severity = 'warning';
      else severity = 'watch';

      // Cross-reference with narrative velocity
      const narrativeCorrelation = this.calculateNarrativeRegionCorrelation(
        region,
        regionEvents,
        narratives,
      );

      // Boost severity if narratives are surging about this region
      if (narrativeCorrelation > 0.5 && severity === 'watch') {
        severity = 'warning';
      }

      const highSeverityEvents = regionEvents.filter(
        (e) => e.severity === 'high' || e.severity === 'critical',
      );
      const description =
        highSeverityEvents.length > 0
          ? `${highSeverityEvents.length} high/critical event(s) in ${region} from ${sourceCount} source(s). ${narrativeCorrelation > 0.3 ? 'Narrative activity detected about this region.' : 'No significant narrative activity detected.'}`
          : `${regionEvents.length} event(s) in ${region} from ${sourceCount} source(s).`;

      alerts.push({
        region,
        severity,
        sourceCount,
        sources: Array.from(uniqueSources),
        events: regionEvents,
        narrativeCorrelation,
        description,
      });
    }

    // Sort by severity (emergency > warning > watch)
    const severityOrder: Record<string, number> = { emergency: 3, warning: 2, watch: 1 };
    alerts.sort((a, b) => (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0));

    const highestSeverity = alerts[0]?.severity ?? ('none' as const);
    const regionsAffected = alerts.map((a) => a.region);

    const emergencyCount = alerts.filter((a) => a.severity === 'emergency').length;
    const warningCount = alerts.filter((a) => a.severity === 'warning').length;
    const watchCount = alerts.filter((a) => a.severity === 'watch').length;

    let summary: string;
    if (alerts.length === 0) {
      summary = `No crisis indicators detected from ${events.length} event(s).`;
    } else {
      const parts: string[] = [
        `Crisis assessment: ${alerts.length} region(s) flagged from ${events.length} event(s).`,
      ];
      if (emergencyCount > 0) parts.push(`${emergencyCount} emergency alert(s).`);
      if (warningCount > 0) parts.push(`${warningCount} warning(s).`);
      if (watchCount > 0) parts.push(`${watchCount} watch alert(s).`);
      const narrativeRegions = alerts.filter((a) => a.narrativeCorrelation > 0.3);
      if (narrativeRegions.length > 0) {
        parts.push(
          `Narrative activity correlates with events in: ${narrativeRegions.map((a) => a.region).join(', ')}.`,
        );
      }
      summary = parts.join(' ');
    }

    return {
      alerts,
      highestSeverity: highestSeverity as CrisisWarningReport['highestSeverity'],
      totalEventsAnalyzed: events.length,
      regionsAffected,
      summary,
    };
  }

  private calculateNarrativeRegionCorrelation(
    region: string,
    regionEvents: GlobalEvent[],
    narratives: AnalyzedNarrative[],
  ): number {
    const regionLower = region.toLowerCase();
    // Check how many narratives reference this region or related keywords
    const keywords = [
      regionLower,
      ...regionEvents.map((e) => e.title.toLowerCase()),
      ...regionEvents.map((e) => e.location.label.toLowerCase()),
    ];

    let matchingNarratives = 0;
    let totalVelocity = 0;

    for (const narrative of narratives) {
      const summaryLower = narrative.summary.toLowerCase();
      const matches = keywords.some((kw) => summaryLower.includes(kw));
      if (matches) {
        matchingNarratives++;
        totalVelocity += narrative.velocity.postsPerHour;
      }
    }

    if (narratives.length === 0) return 0;

    // Correlation based on fraction of narratives mentioning region + velocity
    const fractionMatch = matchingNarratives / narratives.length;
    const velocityBoost = Math.min(1, totalVelocity / 10);

    return Math.min(1, fractionMatch * 0.6 + velocityBoost * 0.4);
  }

  // =========================================================================
  // 4. Influence Operation Attribution
  // =========================================================================

  attributeInfluenceOperation(
    investigation: DeepInvestigationResult,
    botResult: BotDetectionResult,
  ): InfluenceOperationReport {
    const attributionChain: AttributionNode[] = [];
    const platformsInvolved = new Set<string>();
    const investigativeLeads: InvestigativeLead[] = [];
    const botScoreMap = new Map<string, BotScore>();

    for (const score of botResult.scores) {
      botScoreMap.set(score.handle.toLowerCase(), score);
    }

    // --- Build attribution chain from propagation path ---
    const propagationChain = investigation.originAnalysis.propagationChain;

    for (let i = 0; i < propagationChain.length; i++) {
      const handle = propagationChain[i];
      if (!handle) continue;
      const userResult = investigation.users.find(
        (u) => u.user.handle.toLowerCase() === handle.toLowerCase(),
      );
      const botScore = botScoreMap.get(handle.toLowerCase());
      const platform = userResult?.user.platform ?? 'unknown';
      platformsInvolved.add(platform);

      let role: AttributionNode['role'];
      const evidence: string[] = [];

      if (i === 0) {
        role = 'originator';
        evidence.push(
          `First mover on ${investigation.originAnalysis.firstPlatform} at ${investigation.originAnalysis.firstTimestamp}`,
        );
      } else if (i < propagationChain.length * 0.3) {
        role = 'amplifier';
        evidence.push(`Early amplifier — position ${i + 1} in propagation chain`);
      } else {
        role = 'target';
        evidence.push(`Late adopter — position ${i + 1} in propagation chain`);
      }

      if (botScore && botScore.botProbability != null && botScore.botProbability >= 0.6) {
        evidence.push(`High bot probability: ${(botScore.botProbability * 100).toFixed(0)}%`);
      }
      if (userResult && userResult.influenceScore >= 0.7) {
        evidence.push(`High influence score: ${(userResult.influenceScore * 100).toFixed(0)}%`);
      }
      if (userResult && userResult.flags.length > 0) {
        evidence.push(`Flags: ${userResult.flags.join(', ')}`);
      }

      // Use platform credibility to adjust confidence
      const credMultiplier = this.platformCredibility
        ? 1 - this.platformCredibility.getProfile(platform).manipulationRisk
        : 0.5;

      const confidence = Math.min(
        1,
        (userResult?.influenceScore ?? 0.3) * 0.5 + credMultiplier * 0.3 + (i === 0 ? 0.2 : 0),
      );

      attributionChain.push({ handle, platform, role, confidence, evidence });
    }

    // --- Add beneficiaries from cui bono ---
    for (const beneficiary of investigation.cuiBono.beneficiaries) {
      attributionChain.push({
        handle: beneficiary.entity,
        platform: 'unknown',
        role: 'beneficiary',
        confidence: beneficiary.confidence,
        evidence: [beneficiary.howTheyBenefit],
      });
    }

    // --- Generate investigative leads ---
    const originator = attributionChain.find((n) => n.role === 'originator');
    if (originator) {
      investigativeLeads.push({
        question: `What is ${originator.handle}'s posting history and network connections before this narrative?`,
        dataSources: ['social_graph', 'platform_history'],
        priority: 'high',
        automatable: true,
      });
    }

    for (const beneficiary of investigation.cuiBono.beneficiaries) {
      if (beneficiary.confidence >= 0.5) {
        investigativeLeads.push({
          question: `What are the financial ties between ${beneficiary.entity} and the narrative originators?`,
          dataSources: ['on_chain', 'sec_filings', 'corporate_records'],
          priority: 'high',
          automatable: false,
        });
      }
    }

    // --- Overall assessment ---
    const operationDetected =
      attributionChain.length >= 3 &&
      attributionChain.some((n) => n.role === 'originator') &&
      (attributionChain.some((n) => n.role === 'amplifier') ||
        botResult.scores.some((s) => s.botProbability != null && s.botProbability >= 0.6));

    const confidence = operationDetected
      ? Math.min(
          1,
          attributionChain
            .filter((n) => n.role !== 'target')
            .reduce((sum, n) => sum + n.confidence, 0) /
            Math.max(attributionChain.filter((n) => n.role !== 'target').length, 1),
        )
      : 0;

    let summary: string;
    if (!operationDetected) {
      summary = `No influence operation detected. Analyzed ${propagationChain.length} actors in the propagation chain across ${platformsInvolved.size} platform(s). Narrative spread appears organic.`;
    } else {
      const parts: string[] = [
        `Influence operation detected with ${(confidence * 100).toFixed(0)}% confidence.`,
      ];
      if (originator) {
        parts.push(`Origin traced to ${originator.handle} on ${originator.platform}.`);
      }
      const amplifiers = attributionChain.filter((n) => n.role === 'amplifier');
      if (amplifiers.length > 0) {
        parts.push(`${amplifiers.length} amplifier(s) in the chain.`);
      }
      if (investigation.cuiBono.beneficiaries.length > 0) {
        parts.push(
          `Likely beneficiaries: ${investigation.cuiBono.beneficiaries.map((b) => b.entity).join(', ')}.`,
        );
      }
      parts.push(
        `Spans ${platformsInvolved.size} platform(s): ${Array.from(platformsInvolved).join(', ')}.`,
      );
      summary = parts.join(' ');
    }

    return {
      operationDetected,
      confidence,
      attributionChain,
      propagationPath: propagationChain,
      beneficiaries: investigation.cuiBono.beneficiaries,
      platformsInvolved: Array.from(platformsInvolved),
      investigativeLeads,
      summary,
    };
  }

  // =========================================================================
  // 5. Narrative Legitimacy Scoring
  // =========================================================================

  scoreNarrativeLegitimacy(
    verification: ClaimVerificationBatchResult,
    platforms: Record<string, number>,
  ): NarrativeLegitimacyReport {
    const results = verification.results;

    // --- Calculate platform credibility average ---
    let platformCredibilityAvg = 0.5;
    if (this.platformCredibility) {
      const entries = Object.entries(platforms);
      if (entries.length > 0) {
        let weightedCred = 0;
        let totalPosts = 0;
        for (const [platform, count] of entries) {
          weightedCred += this.platformCredibility.getCredibilityMultiplier(platform) * count;
          totalPosts += count;
        }
        platformCredibilityAvg = totalPosts > 0 ? weightedCred / totalPosts : 0.5;
      }
    }

    // --- Count claims by status, weighted by platform credibility ---
    let verifiedWeight = 0;
    let disputedWeight = 0;
    let unverifiedWeight = 0;
    let verifiedCount = 0;
    let disputedCount = 0;
    let unverifiedCount = 0;

    const claimBreakdown: NarrativeLegitimacyReport['claimBreakdown'] = [];

    for (const result of results) {
      const weight = this.platformCredibility
        ? this.platformCredibility.adjustClaimWeight(
            result.confidence,
            this.inferPlatformFromResult(result, platforms),
          )
        : result.confidence;

      if (result.status === 'verified') {
        verifiedWeight += weight;
        verifiedCount++;
      } else if (result.status === 'disputed' || result.status === 'false') {
        disputedWeight += weight;
        disputedCount++;
      } else {
        unverifiedWeight += weight;
        unverifiedCount++;
      }

      claimBreakdown.push({
        claim: result.claim,
        status: result.status,
        weight,
      });
    }

    // --- Calculate evidence balance (-1 to 1, positive = more supporting) ---
    const totalWeight = verifiedWeight + disputedWeight + unverifiedWeight;
    const evidenceBalance = totalWeight > 0 ? (verifiedWeight - disputedWeight) / totalWeight : 0;

    // --- Score: 0-1 scale ---
    // Combine evidence balance with platform credibility
    const rawScore = (evidenceBalance + 1) / 2; // Map -1..1 to 0..1
    const score = Math.min(1, Math.max(0, rawScore * 0.7 + platformCredibilityAvg * 0.3));

    // --- Map to verdict ---
    let verdict: NarrativeLegitimacyReport['verdict'];
    if (score >= 0.8) verdict = 'legitimate';
    else if (score >= 0.6) verdict = 'likely_legitimate';
    else if (score >= 0.4) verdict = 'uncertain';
    else if (score >= 0.2) verdict = 'likely_false';
    else verdict = 'false';

    // --- Summary ---
    let summary: string;
    if (results.length === 0) {
      summary = 'No claims to evaluate. Insufficient data for legitimacy assessment.';
    } else {
      const parts: string[] = [
        `Narrative legitimacy: ${verdict.replace('_', ' ')} (score: ${score.toFixed(2)}).`,
      ];
      parts.push(
        `${verifiedCount} verified, ${disputedCount} disputed, ${unverifiedCount} unverified claim(s).`,
      );
      if (evidenceBalance > 0.3) {
        parts.push('Evidence strongly supports the narrative.');
      } else if (evidenceBalance < -0.3) {
        parts.push('Evidence largely contradicts the narrative.');
      } else {
        parts.push('Evidence is mixed or inconclusive.');
      }
      parts.push(`Platform credibility average: ${(platformCredibilityAvg * 100).toFixed(0)}%.`);
      summary = parts.join(' ');
    }

    return {
      score,
      verdict,
      verifiedClaimCount: verifiedCount,
      disputedClaimCount: disputedCount,
      unverifiedClaimCount: unverifiedCount,
      evidenceBalance,
      platformCredibilityAvg,
      claimBreakdown,
      summary,
    };
  }

  private inferPlatformFromResult(
    _result: VerificationResult,
    platforms: Record<string, number>,
  ): string {
    // Use the most common platform as a heuristic
    const entries = Object.entries(platforms);
    if (entries.length === 0) return 'unknown';
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0]?.[0] ?? 'unknown';
  }
}
