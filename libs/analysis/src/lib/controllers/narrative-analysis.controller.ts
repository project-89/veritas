import { Controller, Post, Body, Logger } from '@nestjs/common';
import { NarrativeAnalysisService } from '../services/narrative-analysis.service';
import type { AnalyzeResult, AnalyzedNarrative } from '../services/narrative-analysis.service';
import type { SaturationReport } from '../services/saturation-metrics.service';
import { DeviationService } from '../services/deviation.service';
import type { DeviationResponse, RawPost } from '../services/deviation.service';
import { ReportService } from '../services/report.service';
import type { ReportParams, ReportResult } from '../services/report.service';
import { PropagandaAnalysisService } from '../services/propaganda.service';
import type { PropagandaAnalysisResult, ExtractedClaim } from '../services/propaganda.service';
import { ComparisonService } from '../services/comparison.service';
import type { NarrativeComparison, TimePeriodComparison, PlatformComparison } from '../services/comparison.service';
import { EntityAnalysisService } from '../services/entity-analysis.service';
import type { EntityAnalysisResponse, InsightInput } from '../services/entity-analysis.service';
import { NarrativeGenealogyService } from '../services/genealogy.service';
import type { GenealogyResponse, NarrativeSnapshot } from '../services/genealogy.service';
import { DownstreamEffectsService } from '../services/downstream-effects.service';
import type { DownstreamEffectsResult, MyceliumData } from '../services/downstream-effects.service';
import { ClaimVerificationService } from '../services/claim-verification.service';
import type { ClaimVerificationBatchResult } from '../services/claim-verification.service';

interface AnalyzeRequestPost {
  text: string;
  platform: string;
  authorName: string;
  authorHandle: string;
  timestamp: string;
  sentiment?: { score: number; label: string };
  engagement?: { likes: number; comments: number; shares: number };
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
  ) {}

  /**
   * Analyze an array of posts: embed, cluster, summarize, score velocity.
   * Returns semantically grouped narratives with LLM-generated summaries.
   */
  @Post('analyze')
  async analyze(
    @Body() body: { posts: AnalyzeRequestPost[] },
  ): Promise<AnalyzeResult> {
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
  async generateReport(
    @Body() body: ReportParams,
  ): Promise<ReportResult> {
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
          throw new Error('narrativeA and narrativeB are required for narrative comparison');
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
          throw new Error('periodA and periodB are required for period comparison');
        }
        return this.comparisonService.compareTimePeriods(body.periodA, body.periodB);
      }
      case 'platform': {
        return this.comparisonService.comparePlatforms(
          body.narratives ?? [],
          body.posts ?? [],
        );
      }
      default:
        throw new Error(`Unknown comparison type: ${body.type}`);
    }
  }

  /**
   * Build entity dossiers and co-occurrence network from posts, insights, and narratives.
   */
  @Post('entities')
  analyzeEntities(
    @Body()
    body: {
      posts: RawPost[];
      insights: InsightInput[];
      narratives: AnalyzedNarrative[];
    },
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
  buildGenealogy(
    @Body() body: { snapshots: NarrativeSnapshot[] },
  ): GenealogyResponse {
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
    this.logger.log(
      `Downstream effects: ${narratives.length} narratives, ${posts.length} posts`,
    );

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
  async verifyClaims(
    @Body() body: { claims: ExtractedClaim[] },
  ): Promise<ClaimVerificationBatchResult> {
    const claims = body.claims ?? [];
    this.logger.log(`Claim verification: ${claims.length} claims`);
    return this.claimVerificationService.verifyBatch(claims);
  }
}
