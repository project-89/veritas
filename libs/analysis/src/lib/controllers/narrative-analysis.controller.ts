import { BadRequestException, Body, Controller, Logger, Post } from '@nestjs/common';
import type { ClaimVerificationBatchResult } from '../services/claim-verification.service';
import { ClaimVerificationService } from '../services/claim-verification.service';
import type {
  NarrativeComparison,
  PlatformComparison,
  TimePeriodComparison,
} from '../services/comparison.service';
import { ComparisonService } from '../services/comparison.service';
import { CoverageProbeService, type CoverageReport } from '../services/coverage-probe.service';
import type {
  DeepInvestigationResult,
  UserInvestigationResult,
} from '../services/deep-investigation.service';
import type { DeviationResponse, RawPost } from '../services/deviation.service';
import { DeviationService } from '../services/deviation.service';
import type { DownstreamEffectsResult, MyceliumData } from '../services/downstream-effects.service';
import { DownstreamEffectsService } from '../services/downstream-effects.service';
import type { EntityAnalysisResponse, InsightInput } from '../services/entity-analysis.service';
import { EntityAnalysisService } from '../services/entity-analysis.service';
import type { GenealogyResponse, NarrativeSnapshot } from '../services/genealogy.service';
import { NarrativeGenealogyService } from '../services/genealogy.service';
import type {
  BotDetectionResult,
  BotScore,
  StructuralPattern,
} from '../services/graph-bot-detection.service';
import type { IntelligenceReport } from '../services/intelligence-engine.service';
import { IntelligenceEngineService } from '../services/intelligence-engine.service';
import type { AnalyzedNarrative, AnalyzeResult } from '../services/narrative-analysis.service';
import { NarrativeAnalysisService } from '../services/narrative-analysis.service';
import type { ExtractedClaim, PropagandaAnalysisResult } from '../services/propaganda.service';
import { PropagandaAnalysisService } from '../services/propaganda.service';
import type { ReportParams, ReportResult } from '../services/report.service';
import { ReportService } from '../services/report.service';
import type { ExternalSignal } from '../services/signal-adapters/signal-adapter.interface';
import type { GlobalEvent } from '../types/global-event';

interface AnalyzeRequestPost {
  text: string;
  platform: string;
  authorName: string;
  authorHandle: string;
  timestamp: string;
  sentiment?: { score: number; label: string };
  engagement?: { likes: number; comments: number; shares: number };
}

type AssessmentType = 'campaign' | 'manipulation' | 'crisis' | 'influence' | 'legitimacy';

interface VerifyClaimsRequest {
  claims: ExtractedClaim[];
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function coerceBotScores(value: unknown): BotScore[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((score): score is Record<string, unknown> => score != null && typeof score === 'object')
    .map((score) => {
      // Preserve null botProbability (insufficient data) — do not coerce to 0.
      const rawProb = score['botProbability'];
      const botProbability = typeof rawProb === 'number' ? rawProb : null;
      const sufficiency = score['dataSufficiency'];
      return {
        handle: asString(score['handle']),
        platform: asString(score['platform']),
        botProbability,
        structuralScore: asNumber(score['structuralScore']),
        temporalScore: asNumber(score['temporalScore']),
        behavioralScore: asNumber(score['behavioralScore']),
        detectedPatterns: Array.isArray(score['detectedPatterns'])
          ? score['detectedPatterns'].filter(
              (pattern): pattern is string => typeof pattern === 'string',
            )
          : [],
        postsAnalyzed: asNumber(score['postsAnalyzed']),
        dataSufficiency:
          sufficiency === 'sufficient' || sufficiency === 'insufficient'
            ? sufficiency
            : botProbability === null
              ? ('insufficient' as const)
              : ('sufficient' as const),
        confidence: asNumber(score['confidence']),
      };
    });
}

function asStructuralPatternType(value: unknown): StructuralPattern['type'] {
  return value === 'star' || value === 'chain' || value === 'clique' ? value : 'chain';
}

function coerceStructuralPatterns(value: unknown): StructuralPattern[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (pattern): pattern is Record<string, unknown> =>
        pattern != null && typeof pattern === 'object',
    )
    .map((pattern) => ({
      type: asStructuralPatternType(pattern['type']),
      description: asString(pattern['description']),
      members: Array.isArray(pattern['members'])
        ? pattern['members'].filter((member): member is string => typeof member === 'string')
        : [],
      confidence: asNumber(pattern['confidence']),
    }));
}

function coerceBotDetectionResult(value: unknown): BotDetectionResult {
  const source =
    value != null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    scores: coerceBotScores(source['scores']),
    structuralPatterns: coerceStructuralPatterns(source['structuralPatterns']),
    graphEnhanced: typeof source['graphEnhanced'] === 'boolean' ? source['graphEnhanced'] : false,
    summary: asString(source['summary']),
  };
}

function coerceBenefits(value: unknown): DeepInvestigationResult['cuiBono']['beneficiaries'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => item != null && typeof item === 'object')
    .map((item) => ({
      entity: asString(item['entity']),
      howTheyBenefit: asString(item['howTheyBenefit']),
      confidence: asNumber(item['confidence']),
    }));
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function coerceUserInvestigations(value: unknown): UserInvestigationResult[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is UserInvestigationResult =>
      item != null &&
      typeof item === 'object' &&
      'user' in item &&
      item.user != null &&
      typeof item.user === 'object' &&
      'handle' in item.user &&
      typeof item.user.handle === 'string' &&
      'platform' in item.user &&
      typeof item.user.platform === 'string',
  );
}

function coerceInvestigation(value: unknown): DeepInvestigationResult {
  const source =
    value != null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const originSource =
    source['originAnalysis'] != null && typeof source['originAnalysis'] === 'object'
      ? (source['originAnalysis'] as Record<string, unknown>)
      : {};
  const cuiBonoSource =
    source['cuiBono'] != null && typeof source['cuiBono'] === 'object'
      ? (source['cuiBono'] as Record<string, unknown>)
      : {};
  const coordinationSource =
    source['coordination'] != null && typeof source['coordination'] === 'object'
      ? (source['coordination'] as Record<string, unknown>)
      : {};

  return {
    topic: asString(source['topic']),
    users: coerceUserInvestigations(source['users']),
    originAnalysis: {
      firstMover: asString(originSource['firstMover']),
      firstPlatform: asString(originSource['firstPlatform']),
      firstTimestamp: asString(originSource['firstTimestamp']),
      propagationChain: Array.isArray(originSource['propagationChain'])
        ? originSource['propagationChain'].filter(
            (item): item is DeepInvestigationResult['originAnalysis']['propagationChain'][number] =>
              item != null && typeof item === 'object',
          )
        : [],
    },
    cuiBono: {
      beneficiaries: coerceBenefits(cuiBonoSource['beneficiaries']),
      agendas: coerceStringArray(cuiBonoSource['agendas']),
      summary: asString(cuiBonoSource['summary']),
    },
    coordination: {
      clusters: Array.isArray(coordinationSource['clusters'])
        ? coordinationSource['clusters'].filter(
            (item): item is DeepInvestigationResult['coordination']['clusters'][number] =>
              item != null && typeof item === 'object',
          )
        : [],
      summary: asString(coordinationSource['summary']),
    },
  };
}

function coerceSignals(value: unknown): ExternalSignal[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (signal): signal is ExternalSignal =>
      signal != null &&
      typeof signal === 'object' &&
      'id' in signal &&
      typeof signal.id === 'string' &&
      'domain' in signal &&
      typeof signal.domain === 'string' &&
      'title' in signal &&
      typeof signal.title === 'string',
  );
}

function coerceGlobalEvents(value: unknown): GlobalEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (event): event is GlobalEvent =>
      event != null &&
      typeof event === 'object' &&
      'id' in event &&
      typeof event.id === 'string' &&
      'category' in event &&
      typeof event.category === 'string' &&
      'timestamp' in event &&
      typeof event.timestamp === 'string',
  );
}

@Controller('narratives')
export class NarrativeAnalysisController {
  private readonly logger = new Logger(NarrativeAnalysisController.name);

  constructor(
    private readonly narrativeAnalysis: NarrativeAnalysisService,
    private readonly deviationService: DeviationService,
    private readonly reportService: ReportService,
    private readonly propagandaService: PropagandaAnalysisService,
    private readonly comparisonService: ComparisonService,
    private readonly entityAnalysisService: EntityAnalysisService,
    private readonly genealogyService: NarrativeGenealogyService,
    private readonly downstreamEffectsService: DownstreamEffectsService,
    private readonly claimVerificationService: ClaimVerificationService,
    private readonly intelligenceEngineService: IntelligenceEngineService,
    private readonly coverageProbeService: CoverageProbeService,
  ) {}

  /**
   * Probe when a topic was actually active over time (GDELT volume histogram).
   * Powers the adaptive-window UX: when a scan's window is sparse, the client
   * calls this to learn where the story lives and offer to expand the window.
   */
  @Post('coverage-probe')
  async coverageProbe(@Body() body: { query: string; timespan?: string }): Promise<CoverageReport> {
    const query = (body.query ?? '').trim();
    if (!query) {
      return {
        probed: false,
        reason: 'empty query',
        source: 'gdelt-timelinevol',
        timeline: [],
        totalVolume: 0,
      };
    }
    this.logger.log(`Coverage probe: "${query}"`);
    return this.coverageProbeService.probe(query, body.timespan);
  }

  /**
   * Analyze an array of posts: embed, cluster, summarize, score velocity.
   * Returns semantically grouped narratives with LLM-generated summaries.
   */
  @Post('analyze')
  async analyze(@Body() body: { posts: AnalyzeRequestPost[] }): Promise<AnalyzeResult> {
    this.logger.log(`Analyzing ${body.posts?.length ?? 0} posts`);
    return this.narrativeAnalysis.analyze(body.posts ?? []);
  }

  /**
   * Compute deviation metrics and reality tunnel visualization data
   * from pre-analyzed narratives and their source posts.
   */
  @Post('deviations')
  computeDeviations(
    @Body() body: { narratives: AnalyzedNarrative[]; posts: RawPost[] },
  ): DeviationResponse {
    const narratives = body.narratives ?? [];
    const posts = body.posts ?? [];
    this.logger.log(
      `Computing deviations for ${narratives.length} narratives, ${posts.length} posts`,
    );

    const deviations = this.deviationService.computeDeviations(narratives);
    const realityTunnel = this.deviationService.toRealityTunnelData(narratives, posts);
    const enhancedTunnel = this.deviationService.toEnhancedTunnelData(narratives, posts);

    return { deviations, realityTunnel, enhancedTunnel };
  }

  /**
   * Generate a narrative analysis report from structured data.
   * Accepts narratives, summary stats, and optional investigation results.
   * Returns markdown or HTML content.
   */
  @Post('report')
  async generateReport(@Body() body: ReportParams): Promise<ReportResult> {
    this.logger.log(
      `Generating ${body.format} report for "${body.query}" (${body.narratives?.length ?? 0} narratives)`,
    );
    return this.reportService.generateReport({
      query: body.query ?? '',
      summary: body.summary ?? { total: 0, positive: 0, negative: 0, neutral: 0, byPlatform: {} },
      narratives: body.narratives ?? [],
      investigation: body.investigation,
      format: body.format ?? 'markdown',
    });
  }

  /**
   * Analyze narratives for propaganda techniques, extractable claims,
   * framing patterns, and overall manipulation likelihood.
   */
  @Post('propaganda-analysis')
  async analyzePropaganda(
    @Body() body: { narratives: AnalyzedNarrative[]; posts: RawPost[] },
  ): Promise<PropagandaAnalysisResult> {
    const narratives = body.narratives ?? [];
    const posts = body.posts ?? [];
    this.logger.log(
      `Propaganda analysis for ${narratives.length} narratives, ${posts.length} posts`,
    );
    return this.propagandaService.analyze(narratives, posts);
  }

  /**
   * Compare narratives, time periods, or platforms.
   * Routes to the appropriate ComparisonService method based on `type`.
   */
  @Post('compare')
  compare(
    @Body()
    body: {
      type: 'narrative' | 'period' | 'platform';
      narrativeA?: AnalyzedNarrative;
      narrativeB?: AnalyzedNarrative;
      postsA?: RawPost[];
      postsB?: RawPost[];
      periodA?: { narratives: AnalyzedNarrative[]; posts: RawPost[]; label: string };
      periodB?: { narratives: AnalyzedNarrative[]; posts: RawPost[]; label: string };
      narratives?: AnalyzedNarrative[];
      posts?: RawPost[];
    },
  ): NarrativeComparison | TimePeriodComparison | PlatformComparison {
    this.logger.log(`Compare request: type=${body.type}`);

    switch (body.type) {
      case 'narrative': {
        if (!body.narrativeA || !body.narrativeB) {
          throw new BadRequestException(
            'narrativeA and narrativeB are required for narrative comparison',
          );
        }
        return this.comparisonService.compareNarratives(
          body.narrativeA,
          body.narrativeB,
          body.postsA ?? [],
          body.postsB ?? [],
        );
      }
      case 'period': {
        if (!body.periodA || !body.periodB) {
          throw new BadRequestException('periodA and periodB are required for period comparison');
        }
        return this.comparisonService.compareTimePeriods(body.periodA, body.periodB);
      }
      case 'platform': {
        return this.comparisonService.comparePlatforms(body.narratives ?? [], body.posts ?? []);
      }
      default:
        throw new BadRequestException(`Unknown comparison type: ${body.type}`);
    }
  }

  /**
   * Build entity dossiers and co-occurrence network from posts, insights, and narratives.
   */
  @Post('entities')
  analyzeEntities(
    @Body()
    body: { posts: RawPost[]; insights: InsightInput[]; narratives: AnalyzedNarrative[] },
  ): EntityAnalysisResponse {
    const posts = body.posts ?? [];
    const insights = body.insights ?? [];
    const narratives = body.narratives ?? [];
    this.logger.log(
      `Entity analysis: ${posts.length} posts, ${insights.length} insights, ${narratives.length} narratives`,
    );

    const dossiers = this.entityAnalysisService.buildEntityDossiers(posts, insights, narratives);
    const coOccurrenceNetwork = this.entityAnalysisService.buildCoOccurrenceNetwork(insights);

    return { dossiers, coOccurrenceNetwork };
  }

  /**
   * Build narrative genealogy from multiple investigation snapshots.
   */
  @Post('genealogy')
  buildGenealogy(@Body() body: { snapshots: NarrativeSnapshot[] }): GenealogyResponse {
    const snapshots = body.snapshots ?? [];
    this.logger.log(`Genealogy: ${snapshots.length} snapshots`);

    const lineages = this.genealogyService.buildFullGenealogy(snapshots);
    return { lineages };
  }

  /**
   * Analyze downstream effects of narratives — correlate with external signals,
   * generate transmission chains, and produce mycelium visualization data.
   */
  @Post('downstream-effects')
  async analyzeDownstreamEffects(
    @Body() body: { narratives: AnalyzedNarrative[]; posts: RawPost[] },
  ): Promise<DownstreamEffectsResult & { myceliumData: MyceliumData }> {
    const narratives = body.narratives ?? [];
    const posts = body.posts ?? [];
    this.logger.log(`Downstream effects: ${narratives.length} narratives, ${posts.length} posts`);

    const result = await this.downstreamEffectsService.analyze(narratives, posts);
    const myceliumData = this.downstreamEffectsService.toMyceliumData(
      narratives,
      result.narrativeCorrelations,
    );

    return { ...result, myceliumData };
  }

  /**
   * Verify extracted claims by searching for corroborating or contradicting
   * evidence from free public sources (Wikipedia, GDELT) and applying
   * LLM reasoning (or heuristic fallback).
   */
  @Post('verify-claims')
  async verifyClaims(@Body() body: VerifyClaimsRequest): Promise<ClaimVerificationBatchResult> {
    const claims = body.claims ?? [];
    this.logger.log(`Claim verification: ${claims.length} claims`);
    return this.claimVerificationService.verifyBatch(claims);
  }

  /**
   * Run an intelligence assessment of the specified type.
   * Routes to the appropriate IntelligenceEngineService method.
   */
  @Post('intelligence')
  async runIntelligenceAssessment(
    @Body() body: {
      type: AssessmentType;
      narratives: AnalyzedNarrative[];
      posts: RawPost[];
      investigation?: unknown;
      botScores?: unknown;
      claims?: ClaimVerificationBatchResult;
      globalEvents?: unknown;
      signals?: unknown;
    },
  ): Promise<IntelligenceReport> {
    const { type, narratives = [], posts = [] } = body;
    this.logger.log(
      `Intelligence assessment: type=${type}, ${narratives.length} narratives, ${posts.length} posts`,
    );

    switch (type) {
      case 'campaign': {
        const botResult = coerceBotDetectionResult(body.botScores);
        const investigation = coerceInvestigation(body.investigation);
        const report = this.intelligenceEngineService.detectCoordinatedCampaign(
          botResult,
          investigation,
        );
        const hasBots = botResult.scores.length > 0;
        return {
          type: 'campaign',
          report,
          dataSufficiency: {
            sufficient: hasBots,
            missingInputs: hasBots ? [] : ['bot scores'],
            note: hasBots
              ? undefined
              : 'Coordinated-campaign detection relies on bot scoring, which was not provided. Run bot detection first — otherwise a "not detected" result only means there was nothing to analyze.',
          },
        };
      }
      case 'manipulation': {
        const signals = coerceSignals(body.signals);
        const postData = posts.map((post) => ({
          text: post.text,
          authorHandle: typeof post.authorHandle === 'string' ? post.authorHandle : '',
        }));
        const report = this.intelligenceEngineService.detectMarketManipulation(
          narratives,
          signals,
          postData,
        );
        const hasSignals = signals.length > 0;
        return {
          type: 'manipulation',
          report,
          dataSufficiency: {
            sufficient: hasSignals,
            missingInputs: hasSignals ? [] : ['external market/event signals'],
            note: hasSignals
              ? undefined
              : 'No external signals were supplied (run Effects/downstream analysis first). Manipulation scoring then rests on post text alone.',
          },
        };
      }
      case 'crisis': {
        const events = coerceGlobalEvents(body.globalEvents);
        const report = this.intelligenceEngineService.assessCrisisRisk(events, narratives);
        const hasEvents = events.length > 0;
        return {
          type: 'crisis',
          report,
          dataSufficiency: {
            sufficient: hasEvents,
            missingInputs: hasEvents ? [] : ['geolocated global events'],
            note: hasEvents
              ? undefined
              : 'Crisis assessment needs real-world event data (GDELT/ACLED/GDACS), none of which was provided, so this run analyzed 0 events.',
          },
        };
      }
      case 'influence': {
        const botResult = coerceBotDetectionResult(body.botScores);
        const investigation = coerceInvestigation(body.investigation);
        const report = this.intelligenceEngineService.attributeInfluenceOperation(
          investigation,
          botResult,
        );
        const hasBots = botResult.scores.length > 0;
        const hasInvestigation = investigation.users.length > 0;
        const sufficient = hasBots || hasInvestigation;
        const missing: string[] = [];
        if (!hasBots) missing.push('bot scores');
        if (!hasInvestigation) missing.push('actor investigation');
        return {
          type: 'influence',
          report,
          dataSufficiency: {
            sufficient,
            missingInputs: missing,
            note: sufficient
              ? undefined
              : 'Influence attribution needs bot scoring and/or a completed actor investigation; neither was provided.',
          },
        };
      }
      case 'legitimacy': {
        const verification = body.claims ?? {
          analysisMode: 'skipped' as const,
          results: [],
          summary: '',
          verifiedCount: 0,
          disputedCount: 0,
          unverifiedCount: 0,
        };
        const platforms: Record<string, number> = {};
        for (const n of narratives) {
          for (const [p, count] of Object.entries(n.platforms ?? {})) {
            platforms[p] = (platforms[p] ?? 0) + count;
          }
        }
        const report = this.intelligenceEngineService.scoreNarrativeLegitimacy(
          verification,
          platforms,
        );
        const hasClaims = verification.results.length > 0;
        return {
          type: 'legitimacy',
          report,
          dataSufficiency: {
            sufficient: hasClaims,
            missingInputs: hasClaims ? [] : ['verified claims'],
            note: hasClaims
              ? undefined
              : 'Legitimacy scoring is strongest with verified claims; none were provided, so this reflects platform mix only.',
          },
        };
      }
      default:
        throw new BadRequestException(`Unknown intelligence assessment type: ${type}`);
    }
  }
}
