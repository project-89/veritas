import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Inject, Optional } from '@nestjs/common';
import { Job } from 'bullmq';
import { AnalysisJobRepository } from '../repositories/analysis-job.repository';
import { ScanJobRepository } from '../repositories/scan-job.repository';
import { IngestionService } from '../services/ingestion.service';
import type { AnalysisJobType } from '../schemas/analysis-job.schema';

// Analysis service tokens — injected via forwardRef from app module
export const PROPAGANDA_SERVICE = Symbol('PROPAGANDA_SERVICE');
export const CLAIM_VERIFICATION_SERVICE = Symbol('CLAIM_VERIFICATION_SERVICE');
export const DOWNSTREAM_EFFECTS_SERVICE = Symbol('DOWNSTREAM_EFFECTS_SERVICE');
export const DEEP_INVESTIGATION_SERVICE = Symbol('DEEP_INVESTIGATION_SERVICE');
export const CROSS_PLATFORM_SERVICE = Symbol('CROSS_PLATFORM_SERVICE');
export const SOURCE_CREDIBILITY_SERVICE = Symbol('SOURCE_CREDIBILITY_SERVICE');
export const GRAPH_BOT_DETECTION_SERVICE = Symbol('GRAPH_BOT_DETECTION_SERVICE');

export interface AnalysisJobData {
  analysisJobId: string;
  scanId: string;
  type: AnalysisJobType;
}

interface UserPost {
  text: string;
  timestamp: string;
  platform: string;
  url?: string;
  engagement: { likes: number; comments: number; shares: number };
  sentiment: { score: number; label: string };
}

@Processor('analysis', { concurrency: 2 })
export class AnalysisProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalysisProcessor.name);

  constructor(
    private readonly analysisJobRepo: AnalysisJobRepository,
    private readonly scanJobRepo: ScanJobRepository,
    private readonly ingestionService: IngestionService,
    @Optional() @Inject(PROPAGANDA_SERVICE) private readonly propagandaService?: any,
    @Optional() @Inject(CLAIM_VERIFICATION_SERVICE) private readonly claimService?: any,
    @Optional() @Inject(DOWNSTREAM_EFFECTS_SERVICE) private readonly downstreamService?: any,
    @Optional() @Inject(DEEP_INVESTIGATION_SERVICE) private readonly deepInvestigationService?: any,
    @Optional() @Inject(CROSS_PLATFORM_SERVICE) private readonly crossPlatformService?: any,
    @Optional() @Inject(SOURCE_CREDIBILITY_SERVICE) private readonly credibilityService?: any,
    @Optional() @Inject(GRAPH_BOT_DETECTION_SERVICE) private readonly botDetectionService?: any,
  ) {
    super();
  }

  async process(job: Job<AnalysisJobData>): Promise<Record<string, unknown>> {
    const { analysisJobId, scanId, type } = job.data;
    const startTime = Date.now();

    this.logger.log(`Processing analysis job ${analysisJobId} [${type}] for scan ${scanId}`);

    // Mark as running
    await this.analysisJobRepo.updateStatus(analysisJobId, {
      status: 'running',
      startedAt: new Date(),
    });

    try {
      let result: Record<string, unknown>;

      switch (type) {
        case 'investigation':
          result = await this.runInvestigation(analysisJobId, scanId);
          break;
        case 'propaganda':
          result = await this.runPropaganda(analysisJobId, scanId);
          break;
        case 'claims':
          result = await this.runClaims(analysisJobId, scanId);
          break;
        case 'downstream':
          result = await this.runDownstream(analysisJobId, scanId);
          break;
        default:
          throw new Error(`Unknown analysis type: ${type}`);
      }

      const duration = Date.now() - startTime;
      await this.analysisJobRepo.updateStatus(analysisJobId, {
        status: 'completed',
        completedAt: new Date(),
        duration,
        result,
      });

      this.logger.log(`Analysis job ${analysisJobId} [${type}] completed in ${duration}ms`);
      return result;
    } catch (err) {
      const error = err as Error;
      const duration = Date.now() - startTime;
      await this.analysisJobRepo.updateStatus(analysisJobId, {
        status: 'failed',
        completedAt: new Date(),
        duration,
        error: error.message,
      });
      this.logger.error(`Analysis job ${analysisJobId} [${type}] failed: ${error.message}`);
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Investigation — per-narrative deep dive
  // -------------------------------------------------------------------------

  private async runInvestigation(jobId: string, scanId: string): Promise<Record<string, unknown>> {
    const analysisJob = await this.analysisJobRepo.getJob(jobId);
    if (!analysisJob) throw new Error(`Job not found: ${jobId}`);

    const { query, userHandles } = analysisJob.input;
    if (!userHandles || userHandles.length === 0) {
      return { users: [], summary: 'No user handles to investigate' };
    }

    // Fetch posts from scan job
    const posts = await this.scanJobRepo.getJobPosts(scanId);
    const topicPosts = posts.filter((p: any) => {
      const handle = (p.authorHandle ?? '').toLowerCase();
      return userHandles.some((h) => h.toLowerCase() === handle);
    });

    // Build user timelines map
    const userTimelines = new Map<string, { topicPosts: UserPost[]; historicalPosts: UserPost[] }>();

    for (const handle of userHandles) {
      const userTopicPosts: UserPost[] = topicPosts
        .filter((p: any) => (p.authorHandle ?? '').toLowerCase() === handle.toLowerCase())
        .map((p: any) => ({
          text: p.text ?? '',
          timestamp: p.timestamp ?? new Date().toISOString(),
          platform: p.platform ?? 'unknown',
          url: p.url,
          engagement: p.engagement ?? { likes: 0, comments: 0, shares: 0 },
          sentiment: p.sentiment ?? { score: 0, label: 'neutral' },
        }));

      // Fetch historical timeline
      let historicalPosts: UserPost[] = [];
      try {
        historicalPosts = await this.fetchTimeline(handle);
      } catch {
        this.logger.debug(`Timeline fetch failed for @${handle}`);
      }

      userTimelines.set(handle, { topicPosts: userTopicPosts, historicalPosts });
    }

    // Run deep investigation
    if (!this.deepInvestigationService) {
      return { users: [], summary: 'Deep investigation service not available' };
    }

    const investigationResult = await this.deepInvestigationService.investigate(query, userTimelines);

    // Score credibility + bot detection
    const allUsers = investigationResult.users.map((u: any) => ({
      handle: u.user.handle,
      platform: u.user.platform,
      posts: [...u.user.topicPosts, ...u.user.historicalPosts],
    }));

    if (this.credibilityService) {
      try {
        const credScores = await this.credibilityService.scoreMultipleSources(allUsers);
        const credMap = new Map(credScores.map((s: any) => [s.handle, s]));
        for (const userResult of investigationResult.users as any[]) {
          const cred: any = credMap.get(userResult.user.handle);
          userResult['credibility'] = cred ?? null;
          if (cred?.flags) {
            userResult.flags.push(...cred.flags.filter((f: string) => !userResult.flags.includes(f)));
          }
        }
      } catch (err) {
        this.logger.warn(`Credibility scoring failed: ${err}`);
      }
    }

    if (this.botDetectionService) {
      try {
        const botResult = await this.botDetectionService.detectBots(allUsers, {
          narrativeId: query,
          investigationId: query,
        });
        const botMap = new Map((botResult?.scores ?? []).map((s: any) => [s.handle, s]));
        for (const userResult of investigationResult.users as any[]) {
          const bot: any = botMap.get(userResult.user.handle);
          userResult['botScore'] = bot ?? null;
          if (bot?.botProbability > 0.5) {
            userResult.flags.push(`Bot probability: ${Math.round(bot.botProbability * 100)}%`);
            if (bot.detectedPatterns) {
              userResult.flags.push(
                ...bot.detectedPatterns.filter((p: string) => !userResult.flags.includes(p)),
              );
            }
          }
        }
      } catch (err) {
        this.logger.warn(`Bot detection failed: ${err}`);
      }
    }

    return investigationResult as unknown as Record<string, unknown>;
  }

  // -------------------------------------------------------------------------
  // Propaganda analysis — batch all narratives
  // -------------------------------------------------------------------------

  private async runPropaganda(jobId: string, scanId: string): Promise<Record<string, unknown>> {
    if (!this.propagandaService) {
      return { techniques: [], claims: [], frames: [], overallAssessment: null };
    }

    const analysisJob = await this.analysisJobRepo.getJob(jobId);
    if (!analysisJob) throw new Error(`Job not found: ${jobId}`);

    const posts = await this.scanJobRepo.getJobPosts(scanId);
    const narratives = analysisJob.input.narratives ?? [];

    return await this.propagandaService.analyze(narratives, posts);
  }

  // -------------------------------------------------------------------------
  // Claim verification — batch all claims
  // -------------------------------------------------------------------------

  private async runClaims(jobId: string, _scanId: string): Promise<Record<string, unknown>> {
    if (!this.claimService) {
      return { results: [], summary: 'Claim verification service not available' };
    }

    const analysisJob = await this.analysisJobRepo.getJob(jobId);
    if (!analysisJob) throw new Error(`Job not found: ${jobId}`);

    // Claims are stored in the job input (extracted from propaganda analysis)
    const claims = (analysisJob.result as any)?.claims ?? [];
    if (claims.length === 0) {
      return { results: [], summary: 'No claims to verify', verifiedCount: 0, disputedCount: 0, unverifiedCount: 0 };
    }

    return await this.claimService.verifyBatch(claims);
  }

  // -------------------------------------------------------------------------
  // Downstream effects — batch all narratives
  // -------------------------------------------------------------------------

  private async runDownstream(jobId: string, scanId: string): Promise<Record<string, unknown>> {
    if (!this.downstreamService) {
      return { narrativeCorrelations: [], externalSignals: [], summary: 'Service not available' };
    }

    const analysisJob = await this.analysisJobRepo.getJob(jobId);
    if (!analysisJob) throw new Error(`Job not found: ${jobId}`);

    const posts = await this.scanJobRepo.getJobPosts(scanId);
    const narratives = analysisJob.input.narratives ?? [];

    const dsResult = await this.downstreamService.analyze(narratives, posts);
    const myceliumData = this.downstreamService.toMyceliumData(narratives, dsResult.narrativeCorrelations);

    return { ...dsResult, myceliumData };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async fetchTimeline(handle: string): Promise<UserPost[]> {
    const allConnectors = this.ingestionService.getAllConnectors() as any[];
    for (const { connector } of allConnectors) {
      const connectorAny = connector as unknown as Record<string, unknown>;
      if (typeof connectorAny['getUserTimeline'] !== 'function') continue;

      try {
        const timelinePosts = await (connectorAny['getUserTimeline'] as Function).call(
          connector, handle, { limit: 50 },
        );
        return (timelinePosts as any[]).map((post) => ({
          text: post.text ?? '',
          timestamp: post.timestamp instanceof Date ? post.timestamp.toISOString() : String(post.timestamp),
          platform: post.platform ?? 'unknown',
          url: post.url,
          engagement: {
            likes: post.engagementMetrics?.likes ?? 0,
            comments: post.engagementMetrics?.comments ?? 0,
            shares: post.engagementMetrics?.shares ?? 0,
          },
          sentiment: { score: 0, label: 'neutral' },
        }));
      } catch {
        continue;
      }
    }
    return [];
  }
}
