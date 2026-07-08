import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, Optional } from '@nestjs/common';
import type {
  BotDetectionResult,
  BotScore,
  ClaimVerificationBatchResult,
  DeepInvestigationResult,
  DownstreamEffectsResult,
  ExtractedClaim,
  MyceliumData,
  PropagandaAnalysisResult,
  SourceCredibilityScore,
  UserInvestigationResult,
} from '@veritas/analysis';
import { Job } from 'bullmq';
import { AnalysisJobRepository } from '../repositories/analysis-job.repository';
import { IdentityRecordRepository } from '../repositories/identity-record.repository';
import { ScanJobRepository } from '../repositories/scan-job.repository';
import type { AnalysisJobType, PsychologicalProfileMode } from '../schemas/analysis-job.schema';
import type { PsychologicalProfile } from '../schemas/identity-record.schema';
import { IngestionService } from '../services/ingestion.service';
import { ScanEventsService } from '../services/scan-events.service';

// Analysis service tokens — injected via forwardRef from app module
export const PROPAGANDA_SERVICE = Symbol('PROPAGANDA_SERVICE');
export const CLAIM_VERIFICATION_SERVICE = Symbol('CLAIM_VERIFICATION_SERVICE');
export const DOWNSTREAM_EFFECTS_SERVICE = Symbol('DOWNSTREAM_EFFECTS_SERVICE');
export const DEEP_INVESTIGATION_SERVICE = Symbol('DEEP_INVESTIGATION_SERVICE');
export const CROSS_PLATFORM_SERVICE = Symbol('CROSS_PLATFORM_SERVICE');
export const SOURCE_CREDIBILITY_SERVICE = Symbol('SOURCE_CREDIBILITY_SERVICE');
export const GRAPH_BOT_DETECTION_SERVICE = Symbol('GRAPH_BOT_DETECTION_SERVICE');
export const PSYCHOLOGICAL_PROFILER_SERVICE = Symbol('PSYCHOLOGICAL_PROFILER_SERVICE');

export interface AnalysisJobData {
  analysisJobId: string;
  scanId: string | null;
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

interface ProfileCorpus {
  posts: UserPost[];
  scanPostCount: number;
  timelinePostCount: number;
  platforms: string[];
  startDate: Date | null;
  endDate: Date | null;
}

interface HistoricalBackfillContext {
  investigations: Array<{ query: string; timestamp: Date }>;
}

interface TimelineConnectorPost {
  text?: string | null;
  timestamp?: string | Date | null;
  platform?: string | null;
  url?: string | null;
  engagementMetrics?: {
    likes?: number | null;
    comments?: number | null;
    shares?: number | null;
  } | null;
}

interface TimelineConnector {
  platform?: string;
  getUserTimeline(
    handle: string,
    options: { limit: number },
  ): Promise<TimelineConnectorPost[] | null | undefined>;
}

interface ScanJobPost {
  text?: string | null;
  timestamp?: string | null;
  platform?: string | null;
  url?: string | null;
  authorHandle?: string | null;
  engagement?: UserPost['engagement'] | null;
  sentiment?: UserPost['sentiment'] | null;
}

type InvestigatedUserSummary = {
  handle: string;
  platform: string;
  posts: UserPost[];
  crossPlatformAccounts?: string[];
};

interface PropagandaServiceLike {
  analyze(narratives: unknown[], posts: unknown[]): Promise<PropagandaAnalysisResult>;
}

interface ClaimVerificationServiceLike {
  verifyBatch(claims: ExtractedClaim[]): Promise<ClaimVerificationBatchResult>;
}

interface DownstreamServiceLike {
  analyze(narratives: unknown[], posts: unknown[]): Promise<DownstreamEffectsResult>;
  toMyceliumData(
    narratives: unknown[],
    correlations: DownstreamEffectsResult['narrativeCorrelations'],
  ): MyceliumData;
}

interface DeepInvestigationServiceLike {
  investigate(
    topic: string,
    userTimelines: Map<string, { topicPosts: UserPost[]; historicalPosts: UserPost[] }>,
  ): Promise<DeepInvestigationResult>;
}

interface CredibilityServiceLike {
  scoreMultipleSources(users: InvestigatedUserSummary[]): Promise<SourceCredibilityScore[]>;
}

interface BotDetectionServiceLike {
  detectBots(
    users: InvestigatedUserSummary[],
    options?: { narrativeId?: string; investigationId?: string },
  ): Promise<BotDetectionResult>;
}

interface PsychologicalProfilerServiceLike {
  generateProfile(params: {
    handle: string;
    platform: string;
    posts: UserPost[];
    authorProfile?: {
      followersCount?: number | null;
      followingCount?: number | null;
      postsCount?: number | null;
      isVerified?: boolean;
      bio?: string | null;
    } | null;
    existingProfile?: PsychologicalProfile | null;
    profileMode?: PsychologicalProfileMode;
  }): Promise<PsychologicalProfile>;
}

@Processor('analysis', { concurrency: 2 })
export class AnalysisProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalysisProcessor.name);

  constructor(
    private readonly analysisJobRepo: AnalysisJobRepository,
    private readonly scanJobRepo: ScanJobRepository,
    private readonly identityRepo: IdentityRecordRepository,
    private readonly ingestionService: IngestionService,
    @Optional()
    @Inject(PROPAGANDA_SERVICE)
    private readonly propagandaService?: PropagandaServiceLike,
    @Optional()
    @Inject(CLAIM_VERIFICATION_SERVICE)
    private readonly claimService?: ClaimVerificationServiceLike,
    @Optional()
    @Inject(DOWNSTREAM_EFFECTS_SERVICE)
    private readonly downstreamService?: DownstreamServiceLike,
    @Optional()
    @Inject(DEEP_INVESTIGATION_SERVICE)
    private readonly deepInvestigationService?: DeepInvestigationServiceLike,
    @Optional() @Inject(CROSS_PLATFORM_SERVICE) private readonly crossPlatformService?: unknown,
    @Optional()
    @Inject(SOURCE_CREDIBILITY_SERVICE)
    private readonly credibilityService?: CredibilityServiceLike,
    @Optional()
    @Inject(GRAPH_BOT_DETECTION_SERVICE)
    private readonly botDetectionService?: BotDetectionServiceLike,
    @Optional()
    @Inject(PSYCHOLOGICAL_PROFILER_SERVICE)
    private readonly profilerService?: PsychologicalProfilerServiceLike,
    @Optional() private readonly scanEvents?: ScanEventsService,
  ) {
    super();
  }

  /** Broadcast a job status transition to SSE listeners of the parent scan. */
  private emitJobStatus(
    scanId: string | null,
    jobId: string,
    jobType: AnalysisJobType,
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled',
    error?: string,
  ): void {
    if (!scanId) return; // No scan to stream against (e.g. psychological-profile)
    this.scanEvents?.emit({
      kind: 'analysis-job',
      scanId,
      jobId,
      jobType,
      status,
      error: error ?? null,
      timestamp: new Date().toISOString(),
    });
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
    this.emitJobStatus(scanId, analysisJobId, type, 'running');

    try {
      let result: Record<string, unknown>;

      switch (type) {
        case 'investigation':
          if (!scanId) throw new Error('Investigation jobs require a scanId');
          result = await this.runInvestigation(analysisJobId, scanId);
          break;
        case 'propaganda':
          if (!scanId) throw new Error('Propaganda jobs require a scanId');
          result = await this.runPropaganda(analysisJobId, scanId);
          break;
        case 'claims':
          if (!scanId) throw new Error('Claims jobs require a scanId');
          result = await this.runClaims(analysisJobId);
          break;
        case 'downstream':
          if (!scanId) throw new Error('Downstream jobs require a scanId');
          result = await this.runDownstream(analysisJobId, scanId);
          break;
        case 'psychological-profile':
          result = await this.runPsychologicalProfile(analysisJobId);
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
      this.emitJobStatus(scanId, analysisJobId, type, 'completed');

      this.logger.log(`Analysis job ${analysisJobId} [${type}] completed in ${duration}ms`);
      return result;
    } catch (err) {
      const error = err as Error;
      const duration = Date.now() - startTime;
      const maxAttempts = typeof job.opts.attempts === 'number' ? job.opts.attempts : 1;
      const isFinalAttempt = job.attemptsMade + 1 >= maxAttempts;
      await this.analysisJobRepo.updateStatus(analysisJobId, {
        status: 'failed',
        completedAt: new Date(),
        duration,
        error: error.message,
      });
      this.emitJobStatus(scanId, analysisJobId, type, 'failed', error.message);
      this.logger.error(`Analysis job ${analysisJobId} [${type}] failed: ${error.message}`);

      // For psychological-profile jobs, also update the identity record status
      if (type === 'psychological-profile' && isFinalAttempt) {
        try {
          const job = await this.analysisJobRepo.getJob(analysisJobId);
          const identityId = job?.narrativeIds?.[0];
          if (identityId) {
            await this.identityRepo.updateProfileStatus(identityId, 'failed');
          }
        } catch {
          /* best effort */
        }
      }

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
    const topicPosts = posts.filter((post) =>
      userHandles.some((handle) => this.scanPostMatchesHandle(post, handle)),
    );

    // Build user timelines map
    const userTimelines = new Map<
      string,
      { topicPosts: UserPost[]; historicalPosts: UserPost[] }
    >();

    for (const handle of userHandles) {
      const userTopicPosts: UserPost[] = topicPosts
        .filter((post) => this.scanPostMatchesHandle(post, handle))
        .map((post) => this.normalizeScanPost(post, 'unknown'));

      // Fetch timeline only for the observed platform unless Sherlock/identity
      // expansion later provides additional platform accounts.
      let historicalPosts: UserPost[] = [];
      try {
        const timeline = await this.fetchTimelineForAccounts(
          handle,
          userTopicPosts[0]?.platform ?? 'unknown',
          [],
        );
        historicalPosts = timeline.posts;
      } catch {
        this.logger.debug(`Timeline fetch failed for @${handle}`);
      }

      userTimelines.set(handle, { topicPosts: userTopicPosts, historicalPosts });
    }

    // Run deep investigation
    if (!this.deepInvestigationService) {
      return { users: [], summary: 'Deep investigation service not available' };
    }

    const investigationResult = await this.deepInvestigationService.investigate(
      query,
      userTimelines,
    );

    // Score credibility + bot detection
    const allUsers: InvestigatedUserSummary[] = investigationResult.users.map((userResult) => ({
      handle: userResult.user.handle,
      platform: userResult.user.platform,
      posts: [...userResult.user.topicPosts, ...userResult.user.historicalPosts],
    }));

    if (this.credibilityService) {
      try {
        const credScores = await this.credibilityService.scoreMultipleSources(allUsers);
        const credMap = new Map(credScores.map((score) => [score.handle, score]));
        for (const userResult of investigationResult.users) {
          const cred = credMap.get(userResult.user.handle);
          userResult['credibility'] = cred ?? null;
          if (cred?.flags) {
            userResult.flags.push(
              ...cred.flags.filter((f: string) => !userResult.flags.includes(f)),
            );
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
        const botMap = new Map((botResult?.scores ?? []).map((score) => [score.handle, score]));
        for (const userResult of investigationResult.users) {
          const bot = botMap.get(userResult.user.handle);
          userResult['botScore'] = bot ?? null;
          if (typeof bot?.botProbability === 'number' && bot.botProbability > 0.5) {
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

    // Upsert identity records for each investigated user
    try {
      for (const userResult of investigationResult.users) {
        const cred = this.getCredibilityScore(userResult);
        const bot = this.getBotScore(userResult);
        await this.identityRepo.upsertFromInvestigation({
          handle: userResult.user.handle,
          platform: userResult.user.platform,
          displayName: userResult.user.name,
          snapshot: {
            query,
            timestamp: new Date(),
            postCount:
              (userResult.user.topicPosts?.length ?? 0) +
              (userResult.user.historicalPosts?.length ?? 0),
            platforms: userResult.user.profile?.patterns?.platformPresence ?? [],
            credibilityScore: cred?.overallScore ?? null,
            botProbability: bot?.botProbability ?? null,
            flags: userResult.flags ?? [],
            influenceScore: userResult.influenceScore ?? 0,
          },
          credibilityScore: cred?.overallScore ?? null,
          botProbability: bot?.botProbability ?? null,
          flags: userResult.flags ?? [],
          observedPosts: [
            ...(userResult.user.topicPosts ?? []),
            ...(userResult.user.historicalPosts ?? []),
          ].map((post) => ({
            text: post.text ?? '',
            timestamp: post.timestamp ?? new Date().toISOString(),
            platform: post.platform ?? userResult.user.platform ?? 'unknown',
            url: post.url ?? null,
            engagement: post.engagement ?? { likes: 0, comments: 0, shares: 0 },
            sentiment: post.sentiment ?? { score: 0, label: 'neutral' },
            investigationQuery: query,
            sourceKind: 'investigation' as const,
            capturedAt: new Date(),
          })),
        });
      }
      this.logger.log(`Upserted ${investigationResult.users.length} identity records from queue`);
    } catch (err) {
      this.logger.warn(`Identity record upsert failed: ${err}`);
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

    return (await this.propagandaService.analyze(narratives, posts)) as unknown as Record<
      string,
      unknown
    >;
  }

  // -------------------------------------------------------------------------
  // Claim verification — batch all claims
  // -------------------------------------------------------------------------

  private async runClaims(jobId: string): Promise<Record<string, unknown>> {
    if (!this.claimService) {
      return { results: [], summary: 'Claim verification service not available' };
    }

    const analysisJob = await this.analysisJobRepo.getJob(jobId);
    if (!analysisJob) throw new Error(`Job not found: ${jobId}`);

    // Claims are stored in the job input (extracted from propaganda analysis)
    const claims = (analysisJob.result as PropagandaAnalysisResult | null)?.claims ?? [];
    if (claims.length === 0) {
      return {
        results: [],
        summary: 'No claims to verify',
        verifiedCount: 0,
        disputedCount: 0,
        unverifiedCount: 0,
      };
    }

    return (await this.claimService.verifyBatch(claims)) as unknown as Record<string, unknown>;
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
    const myceliumData = this.downstreamService.toMyceliumData(
      narratives,
      dsResult.narrativeCorrelations,
    );

    return { ...dsResult, myceliumData };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Psychological profile — per-identity deep analysis
  // -------------------------------------------------------------------------

  private async runPsychologicalProfile(jobId: string): Promise<Record<string, unknown>> {
    if (!this.profilerService) {
      return { error: 'Psychological profiler service not available' };
    }

    const analysisJob = await this.analysisJobRepo.getJob(jobId);
    if (!analysisJob) throw new Error(`Job not found: ${jobId}`);

    // The identity record ID is stored in narrativeIds[0] for this job type
    const identityId = analysisJob.narrativeIds[0];
    if (!identityId) throw new Error('No identity ID in job');

    const identity = await this.identityRepo.findById(identityId);
    if (!identity) throw new Error(`Identity record not found: ${identityId}`);

    // Mark as generating
    await this.identityRepo.updateProfileStatus(identityId, 'generating');

    try {
      const profileMode = analysisJob.input.profileMode ?? 'current-state';
      const profileCorpus = await this.buildProfileCorpus(
        identity.primaryHandle,
        identity.primaryPlatform,
        identity.platformAccounts ?? [],
        analysisJob.scanId,
        identity.observedPosts ?? [],
        { investigations: identity.investigations ?? [] },
        {
          profileMode,
          startDate: analysisJob.input.startDate ?? null,
          endDate: analysisJob.input.endDate ?? null,
        },
      );

      if (profileCorpus.posts.length === 0) {
        await this.identityRepo.updateProfileStatus(identityId, 'failed');
        throw new Error(
          profileMode === 'investigation-window'
            ? `No posts available for profiling @${identity.primaryHandle} inside the selected investigation window`
            : `No posts available for profiling @${identity.primaryHandle} — need timeline data from at least one connector`,
        );
      }

      const generatedProfile = await this.profilerService.generateProfile({
        handle: identity.primaryHandle,
        platform: identity.primaryPlatform,
        posts: profileCorpus.posts,
        authorProfile: identity.authorProfile,
        existingProfile: identity.psychologicalProfile,
        profileMode,
      });

      const profile = {
        ...generatedProfile,
        profileMode,
        scopeLabel: this.buildScopeLabel(
          profileMode,
          profileCorpus.startDate,
          profileCorpus.endDate,
        ),
        scope: {
          investigationId: analysisJob.input.investigationId ?? null,
          scanId: analysisJob.scanId ?? null,
          startDate: profileCorpus.startDate,
          endDate: profileCorpus.endDate,
          platforms: profileCorpus.platforms,
          scanPostCount: profileCorpus.scanPostCount,
          timelinePostCount: profileCorpus.timelinePostCount,
        },
      };

      await this.identityRepo.updatePsychologicalProfile(identityId, profile);
      this.logger.log(
        `MAGI profile generated for @${identity.primaryHandle} — ` +
          `${profile.coreBeliefs?.length ?? 0} beliefs, role: ${profile.socialRole?.primary ?? 'unknown'}`,
      );

      return profile as unknown as Record<string, unknown>;
    } catch (err) {
      await this.identityRepo.updateProfileStatus(identityId, 'failed');
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Max age for cached timelines: 6 hours */
  private static readonly TIMELINE_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
  private static readonly DEFAULT_TIMELINE_LIMIT = 50;
  private static readonly DEEP_HISTORY_TIMELINE_LIMIT = 400;

  private async fetchTimeline(
    handle: string,
    platform: string,
    limit = AnalysisProcessor.DEFAULT_TIMELINE_LIMIT,
  ): Promise<{ posts: UserPost[]; platforms: string[] }> {
    // Check identity record for a cached timeline first
    try {
      const cached = await this.identityRepo.getCachedTimeline(
        handle,
        platform,
        AnalysisProcessor.TIMELINE_CACHE_MAX_AGE_MS,
        limit,
      );
      if (cached && cached.length > 0) {
        this.logger.debug(`Using cached timeline for @${handle}: ${cached.length} posts`);
        return {
          posts: cached,
          platforms: Array.from(new Set(cached.map((post) => post.platform).filter(Boolean))),
        };
      }
    } catch {
      // Cache miss — fetch fresh
    }

    const allConnectors =
      this.ingestionService.getAllConnectors() as unknown as TimelineConnector[];
    const allPosts: UserPost[] = [];
    const platforms: string[] = [];

    for (const connector of allConnectors) {
      if (typeof connector?.getUserTimeline !== 'function') continue;

      try {
        const timelinePosts = await connector.getUserTimeline(handle, { limit });
        if (Array.isArray(timelinePosts) && timelinePosts.length > 0) {
          const connPlatform = connector.platform ?? 'unknown';
          platforms.push(connPlatform);
          this.logger.debug(
            `Fetched ${timelinePosts.length} timeline posts for @${handle} from ${connPlatform}`,
          );
          for (const post of timelinePosts) {
            allPosts.push(this.normalizeTimelinePost(post, connPlatform));
          }
        }
      } catch {
        continue;
      }
    }

    this.logger.debug(
      `Timeline fetch for @${handle}: ${allPosts.length} total posts from ${allConnectors.length} connectors`,
    );

    // Cache the results on the identity record (fire-and-forget)
    if (allPosts.length > 0) {
      this.identityRepo
        .setCachedTimeline(handle, platform, allPosts, platforms)
        .catch(() => undefined);
    }

    return { posts: allPosts, platforms };
  }

  private async fetchTimelineForAccounts(
    primaryHandle: string,
    primaryPlatform: string,
    platformAccounts: Array<{ platform: string; handle: string }> = [],
    limit = AnalysisProcessor.DEFAULT_TIMELINE_LIMIT,
  ): Promise<{ posts: UserPost[]; platforms: string[] }> {
    const normalizedPrimaryHandle = this.normalizeHandleForConnector(primaryHandle);

    // Check identity record cache keyed to the primary platform first.
    try {
      const cached = await this.identityRepo.getCachedTimeline(
        normalizedPrimaryHandle,
        primaryPlatform,
        AnalysisProcessor.TIMELINE_CACHE_MAX_AGE_MS,
        limit,
      );
      if (cached && cached.length > 0) {
        this.logger.debug(
          `Using cached timeline for @${normalizedPrimaryHandle}: ${cached.length} posts`,
        );
        return {
          posts: cached,
          platforms: Array.from(new Set(cached.map((post) => post.platform).filter(Boolean))),
        };
      }
    } catch {
      // Cache miss — fetch fresh
    }

    const targets = this.buildTimelineTargets(primaryHandle, primaryPlatform, platformAccounts);
    const connectorMap = new Map<string, TimelineConnector>();
    for (const connector of this.ingestionService.getAllConnectors() as unknown as TimelineConnector[]) {
      if (typeof connector?.getUserTimeline !== 'function') continue;
      const connectorPlatform = typeof connector?.platform === 'string' ? connector.platform : null;
      if (connectorPlatform) {
        connectorMap.set(connectorPlatform, connector);
      }
    }

    const allPosts: UserPost[] = [];
    const platforms: string[] = [];

    for (const target of targets) {
      const connector = connectorMap.get(target.platform);
      if (!connector) continue;

      try {
        const timelinePosts = await connector.getUserTimeline(target.handle, { limit });
        if (Array.isArray(timelinePosts) && timelinePosts.length > 0) {
          platforms.push(target.platform);
          this.logger.debug(
            `Fetched ${timelinePosts.length} timeline posts for @${target.handle} from ${target.platform}`,
          );
          for (const post of timelinePosts) {
            allPosts.push(this.normalizeTimelinePost(post, target.platform));
          }
        }
      } catch {
        continue;
      }
    }

    this.logger.debug(
      `Timeline fetch for @${normalizedPrimaryHandle}: ${allPosts.length} total posts from ${targets.length} targeted accounts`,
    );

    if (allPosts.length > 0) {
      this.identityRepo
        .setCachedTimeline(normalizedPrimaryHandle, primaryPlatform, allPosts, platforms)
        .catch(() => undefined);
    }

    return { posts: allPosts, platforms };
  }

  private async buildProfileCorpus(
    handle: string,
    platform: string,
    platformAccounts: Array<{ platform: string; handle: string }>,
    scanId: string | null,
    observedPosts: Array<{
      text: string;
      timestamp: string;
      platform: string;
      url?: string | null;
      engagement: { likes: number; comments: number; shares: number };
      sentiment: { score: number; label: string };
    }>,
    history: HistoricalBackfillContext,
    options: {
      profileMode: PsychologicalProfileMode;
      startDate?: Date | string | null;
      endDate?: Date | string | null;
    },
  ): Promise<ProfileCorpus> {
    const windowStart = this.coerceDate(options.startDate);
    const windowEnd = this.coerceDate(options.endDate);

    switch (options.profileMode) {
      case 'investigation-window':
        return this.getInvestigationWindowCorpus(handle, scanId, windowStart, windowEnd);
      case 'historical':
        return this.getHistoricalCorpus(
          handle,
          platform,
          platformAccounts,
          scanId,
          observedPosts,
          history,
          windowStart,
          windowEnd,
        );
      case 'deep-history':
        return this.getDeepHistoryCorpus(
          handle,
          platform,
          platformAccounts,
          scanId,
          observedPosts,
          history,
        );
      case 'current-state':
      default:
        return this.getCurrentStateCorpus(handle, platform, platformAccounts);
    }
  }

  private async getInvestigationWindowCorpus(
    handle: string,
    scanId: string | null,
    startDate: Date | null,
    endDate: Date | null,
  ): Promise<ProfileCorpus> {
    if (!scanId) {
      return {
        posts: [],
        scanPostCount: 0,
        timelinePostCount: 0,
        platforms: [],
        startDate,
        endDate,
      };
    }

    const scanPosts = await this.scanJobRepo.getJobPosts(scanId);
    const normalized = this.normalizeScanPostsForHandle(scanPosts, handle, startDate, endDate);

    return {
      posts: normalized,
      scanPostCount: normalized.length,
      timelinePostCount: 0,
      platforms: Array.from(new Set(normalized.map((post) => post.platform).filter(Boolean))),
      startDate: startDate ?? this.getMinTimestamp(normalized),
      endDate: endDate ?? this.getMaxTimestamp(normalized),
    };
  }

  private async getCurrentStateCorpus(
    handle: string,
    platform: string,
    platformAccounts: Array<{ platform: string; handle: string }> = [],
  ): Promise<ProfileCorpus> {
    const timeline = await this.fetchTimelineForAccounts(
      handle,
      platform,
      platformAccounts,
      AnalysisProcessor.DEFAULT_TIMELINE_LIMIT,
    );
    const posts = this.dedupePosts(timeline.posts);

    return {
      posts,
      scanPostCount: 0,
      timelinePostCount: posts.length,
      platforms: Array.from(
        new Set(timeline.platforms.concat(posts.map((post) => post.platform)).filter(Boolean)),
      ),
      startDate: this.getMinTimestamp(posts),
      endDate: this.getMaxTimestamp(posts),
    };
  }

  private async getHistoricalCorpus(
    handle: string,
    platform: string,
    platformAccounts: Array<{ platform: string; handle: string }> = [],
    scanId: string | null,
    observedPosts: Array<{
      text: string;
      timestamp: string;
      platform: string;
      url?: string | null;
      engagement: { likes: number; comments: number; shares: number };
      sentiment: { score: number; label: string };
    }>,
    history: HistoricalBackfillContext,
    startDate: Date | null,
    endDate: Date | null,
  ): Promise<ProfileCorpus> {
    const scopedScan = await this.getInvestigationWindowCorpus(handle, scanId, startDate, endDate);
    const timeline = await this.fetchTimelineForAccounts(
      handle,
      platform,
      platformAccounts,
      AnalysisProcessor.DEFAULT_TIMELINE_LIMIT,
    );
    const persisted = observedPosts
      .map((post) => ({
        text: post.text ?? '',
        timestamp: post.timestamp ?? new Date().toISOString(),
        platform: post.platform ?? 'unknown',
        url: post.url ?? undefined,
        engagement: post.engagement ?? { likes: 0, comments: 0, shares: 0 },
        sentiment: post.sentiment ?? { score: 0, label: 'neutral' },
      }))
      .filter((post) => this.isWithinWindow(post.timestamp, startDate, endDate));
    const backfilled =
      persisted.length >= 40
        ? []
        : await this.backfillHistoricalPostsFromScans(
            handle,
            history.investigations,
            startDate,
            endDate,
          );
    const posts = this.dedupePosts([
      ...persisted,
      ...backfilled,
      ...scopedScan.posts,
      ...timeline.posts,
    ]);

    return {
      posts,
      scanPostCount: scopedScan.scanPostCount + persisted.length + backfilled.length,
      timelinePostCount: timeline.posts.length,
      platforms: Array.from(
        new Set(
          [
            ...scopedScan.platforms,
            ...timeline.platforms,
            ...persisted.map((post) => post.platform),
            ...backfilled.map((post) => post.platform),
            ...posts.map((post) => post.platform),
          ].filter(Boolean),
        ),
      ),
      startDate: this.getMinTimestamp(posts),
      endDate: this.getMaxTimestamp(posts),
    };
  }

  private async getDeepHistoryCorpus(
    handle: string,
    platform: string,
    platformAccounts: Array<{ platform: string; handle: string }> = [],
    scanId: string | null,
    observedPosts: Array<{
      text: string;
      timestamp: string;
      platform: string;
      url?: string | null;
      engagement: { likes: number; comments: number; shares: number };
      sentiment: { score: number; label: string };
    }>,
    history: HistoricalBackfillContext,
  ): Promise<ProfileCorpus> {
    const scopedScan = await this.getInvestigationWindowCorpus(handle, scanId, null, null);
    const timeline = await this.fetchTimelineForAccounts(
      handle,
      platform,
      platformAccounts,
      AnalysisProcessor.DEEP_HISTORY_TIMELINE_LIMIT,
    );
    const persisted = observedPosts.map((post) => ({
      text: post.text ?? '',
      timestamp: post.timestamp ?? new Date().toISOString(),
      platform: post.platform ?? 'unknown',
      url: post.url ?? undefined,
      engagement: post.engagement ?? { likes: 0, comments: 0, shares: 0 },
      sentiment: post.sentiment ?? { score: 0, label: 'neutral' },
    }));
    const backfilled = await this.backfillHistoricalPostsFromScans(
      handle,
      history.investigations,
      null,
      null,
    );
    const posts = this.dedupePosts([
      ...persisted,
      ...backfilled,
      ...scopedScan.posts,
      ...timeline.posts,
    ]);

    return {
      posts,
      scanPostCount: scopedScan.scanPostCount + persisted.length + backfilled.length,
      timelinePostCount: timeline.posts.length,
      platforms: Array.from(
        new Set(
          [
            ...scopedScan.platforms,
            ...timeline.platforms,
            ...persisted.map((post) => post.platform),
            ...backfilled.map((post) => post.platform),
            ...posts.map((post) => post.platform),
          ].filter(Boolean),
        ),
      ),
      startDate: this.getMinTimestamp(posts),
      endDate: this.getMaxTimestamp(posts),
    };
  }

  private async backfillHistoricalPostsFromScans(
    handle: string,
    investigations: Array<{ query: string; timestamp: Date }>,
    startDate: Date | null,
    endDate: Date | null,
  ): Promise<UserPost[]> {
    const recentQueries = Array.from(
      new Set(
        investigations
          .slice()
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .map((investigation) => investigation.query)
          .filter(Boolean)
          .slice(0, 12),
      ),
    );

    if (recentQueries.length === 0) return [];

    try {
      const scans = await this.scanJobRepo.getCompletedJobsForQueries(recentQueries, 24);
      const posts: UserPost[] = [];
      for (const scan of scans) {
        const scanPosts = Array.isArray(scan.posts) ? scan.posts : [];
        posts.push(...this.normalizeScanPostsForHandle(scanPosts, handle, startDate, endDate));
      }
      return this.dedupePosts(posts);
    } catch (err) {
      this.logger.debug(`Historical scan backfill failed for @${handle}: ${err}`);
      return [];
    }
  }

  private normalizeScanPostsForHandle(
    scanPosts: unknown[],
    handle: string,
    startDate: Date | null,
    endDate: Date | null,
  ): UserPost[] {
    const targetHandle = handle.toLowerCase();

    return (Array.isArray(scanPosts) ? scanPosts : [])
      .filter((post) => this.scanPostMatchesHandle(post, targetHandle))
      .map((post) => this.normalizeScanPost(post, 'unknown'))
      .filter((post) => this.isWithinWindow(post.timestamp, startDate, endDate));
  }

  private scanPostMatchesHandle(post: unknown, handle: string): boolean {
    const scanPost = post as ScanJobPost;
    const authorHandle =
      typeof scanPost?.authorHandle === 'string' ? scanPost.authorHandle.toLowerCase() : '';
    return authorHandle === handle.toLowerCase();
  }

  private normalizeScanPost(post: unknown, fallbackPlatform: string): UserPost {
    const scanPost = post as ScanJobPost;
    return {
      text: typeof scanPost?.text === 'string' ? scanPost.text : '',
      timestamp:
        typeof scanPost?.timestamp === 'string' ? scanPost.timestamp : new Date().toISOString(),
      platform: typeof scanPost?.platform === 'string' ? scanPost.platform : fallbackPlatform,
      url: typeof scanPost?.url === 'string' ? scanPost.url : undefined,
      engagement: scanPost?.engagement ?? { likes: 0, comments: 0, shares: 0 },
      sentiment: scanPost?.sentiment ?? { score: 0, label: 'neutral' },
    };
  }

  private normalizeTimelinePost(post: TimelineConnectorPost, fallbackPlatform: string): UserPost {
    const timestamp =
      post.timestamp instanceof Date
        ? post.timestamp.toISOString()
        : typeof post.timestamp === 'string'
          ? post.timestamp
          : new Date().toISOString();

    return {
      text: post.text ?? '',
      timestamp,
      platform: post.platform ?? fallbackPlatform,
      url: post.url ?? undefined,
      engagement: {
        likes: post.engagementMetrics?.likes ?? 0,
        comments: post.engagementMetrics?.comments ?? 0,
        shares: post.engagementMetrics?.shares ?? 0,
      },
      sentiment: { score: 0, label: 'neutral' },
    };
  }

  private getCredibilityScore(userResult: UserInvestigationResult): SourceCredibilityScore | null {
    const credibility = (
      userResult as UserInvestigationResult & {
        credibility?: SourceCredibilityScore | null;
      }
    ).credibility;
    return credibility ?? null;
  }

  private getBotScore(userResult: UserInvestigationResult): BotScore | null {
    const botScore = (
      userResult as UserInvestigationResult & {
        botScore?: BotScore | null;
      }
    ).botScore;
    return botScore ?? null;
  }

  private dedupePosts(posts: UserPost[]): UserPost[] {
    const seen = new Map<string, UserPost>();
    for (const post of posts) {
      const normalizedText = post.text.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 180);
      const minuteBucket = this.coerceDate(post.timestamp)?.toISOString().slice(0, 16) ?? 'unknown';
      const key = [post.platform ?? 'unknown', post.url ?? '', minuteBucket, normalizedText].join(
        '::',
      );
      if (!seen.has(key)) {
        seen.set(key, post);
      }
    }
    return Array.from(seen.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }

  private buildTimelineTargets(
    primaryHandle: string,
    primaryPlatform: string,
    platformAccounts: Array<{ platform: string; handle: string }> = [],
  ): Array<{ platform: string; handle: string }> {
    const targets = [{ platform: primaryPlatform, handle: primaryHandle }, ...platformAccounts];

    const seen = new Set<string>();
    const normalizedTargets: Array<{ platform: string; handle: string }> = [];

    for (const target of targets) {
      const platform =
        typeof target.platform === 'string' ? target.platform.trim().toLowerCase() : '';
      const handle = this.normalizeHandleForConnector(target.handle);
      if (!platform || !handle) continue;
      if (!this.isValidHandleForPlatform(platform, handle)) continue;

      const key = `${platform}:${handle.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      normalizedTargets.push({ platform, handle });
    }

    return normalizedTargets;
  }

  private normalizeHandleForConnector(handle: string): string {
    return typeof handle === 'string' ? handle.trim().replace(/^@+/, '') : '';
  }

  private isValidHandleForPlatform(platform: string, handle: string): boolean {
    if (platform !== 'bluesky') return true;

    const normalized = handle.trim().toLowerCase();
    if (!normalized) return false;

    // Bluesky actor ids are either DIDs or full domain-style handles
    // like `name.bsky.social`. Plain X-style handles should be skipped.
    return normalized.startsWith('did:') || normalized.includes('.');
  }

  private buildScopeLabel(
    profileMode: PsychologicalProfileMode,
    startDate: Date | null,
    endDate: Date | null,
  ): string {
    switch (profileMode) {
      case 'investigation-window':
        return startDate || endDate
          ? `Investigation window (${this.formatScopeDate(startDate)} to ${this.formatScopeDate(endDate)})`
          : 'Investigation window';
      case 'historical':
        return 'Historical corpus';
      case 'deep-history':
        return 'Deep history';
      case 'current-state':
      default:
        return 'Current state';
    }
  }

  private formatScopeDate(value: Date | null): string {
    if (!value) return 'unknown';
    return value.toISOString().slice(0, 10);
  }

  private coerceDate(value: Date | string | null | undefined): Date | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private isWithinWindow(timestamp: string, startDate: Date | null, endDate: Date | null): boolean {
    const ts = this.coerceDate(timestamp);
    if (!ts) return false;
    if (startDate && ts.getTime() < startDate.getTime()) return false;
    if (endDate && ts.getTime() > endDate.getTime()) return false;
    return true;
  }

  private getMinTimestamp(posts: UserPost[]): Date | null {
    if (posts.length === 0) return null;
    const values = posts
      .map((post) => this.coerceDate(post.timestamp)?.getTime() ?? null)
      .filter((value): value is number => value != null);
    if (values.length === 0) return null;
    return new Date(Math.min(...values));
  }

  private getMaxTimestamp(posts: UserPost[]): Date | null {
    if (posts.length === 0) return null;
    const values = posts
      .map((post) => this.coerceDate(post.timestamp)?.getTime() ?? null)
      .filter((value): value is number => value != null);
    if (values.length === 0) return null;
    return new Date(Math.max(...values));
  }
}
