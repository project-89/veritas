import { Body, Controller, HttpException, HttpStatus, Logger, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { BotDetectionResult, SourceCredibilityScore } from '@veritas/analysis';
import {
  CrossPlatformIdentityService,
  DeepInvestigationResult,
  DeepInvestigationService,
  GraphBotDetectionService,
  SocialGraphIntelligenceService,
  SourceCredibilityService,
  UserPost,
} from '@veritas/analysis';
import { IdentityRecordRepository, IngestionService } from '@veritas/ingestion';

// ---------------------------------------------------------------------------
// Request DTO
// ---------------------------------------------------------------------------

interface InvestigateRequestBody {
  /** The narrative topic / query being investigated */
  query: string;
  /** Author handles to investigate (e.g. ["@elonmusk", "u/spez"]) */
  userHandles: string[];
  /** Platforms to search (defaults to all registered connectors) */
  platforms?: string[];
  /**
   * Topic posts the client already has from the search results.
   * Avoids re-searching -- the client sends the posts it already fetched.
   */
  topicPosts?: RawPostDto[];
}

/** Matches the RawPost shape the client sends (from api.ts) */
interface RawPostDto {
  id: string;
  text: string;
  platform: string;
  authorName: string;
  authorHandle: string;
  url: string;
  timestamp: string;
  sentiment: { score: number; label: string; confidence?: number };
  themes?: string[];
  engagement: {
    likes: number;
    shares: number;
    comments: number;
    reach?: number;
    viralityScore?: number;
  };
}

interface AuthorDetailsSnapshot {
  platform: string;
  followersCount: number | null;
  followingCount: number | null;
  tweetsCount: number | null;
  isVerified: boolean;
  name: string;
  description: string;
  url: string;
  avatar: string | null;
  banner: string | null;
}

type SocialGraphResult = Awaited<ReturnType<SocialGraphIntelligenceService['enrichRelationships']>>;
type BotDetectionSummary = {
  summary: string;
  structuralPatterns: BotDetectionResult['structuralPatterns'];
  graphEnhanced: boolean;
};
type InvestigationResultWithEnrichment = DeepInvestigationResult & {
  botDetection?: BotDetectionSummary | null;
  socialGraph?: SocialGraphResult | null;
};

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a client-side RawPostDto into the UserPost shape the investigation service expects. */
function toUserPost(dto: RawPostDto): UserPost {
  return {
    text: dto.text,
    timestamp: dto.timestamp,
    platform: dto.platform,
    url: dto.url || undefined,
    engagement: {
      likes: dto.engagement?.likes ?? 0,
      comments: dto.engagement?.comments ?? 0,
      shares: dto.engagement?.shares ?? 0,
    },
    sentiment: {
      score: dto.sentiment?.score ?? 0,
      label: dto.sentiment?.label ?? 'neutral',
    },
  };
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

/**
 * Orchestration controller for deep narrative investigations.
 *
 * Lives in the API app (not in a library) because it needs to wire together
 * services from two separate NestJS modules:
 *   - IngestionService  (from @veritas/ingestion) -- connector access
 *   - DeepInvestigationService (from @veritas/analysis) -- LLM analysis
 */
@Controller('investigate')
export class InvestigationController {
  private readonly logger = new Logger(InvestigationController.name);

  constructor(
    private readonly ingestionService: IngestionService,
    private readonly deepInvestigationService: DeepInvestigationService,
    private readonly crossPlatformIdentity: CrossPlatformIdentityService,
    private readonly sourceCredibility: SourceCredibilityService,
    private readonly graphBotDetection: GraphBotDetectionService,
    private readonly socialGraph: SocialGraphIntelligenceService,
    private readonly identityRecordRepo: IdentityRecordRepository,
  ) {}

  /**
   * POST /investigate
   *
   * For each user handle the client provides:
   *   1. Filter the supplied topicPosts to get that user's topic-relevant posts
   *   2. Fetch the user's broader timeline via the platform connector (getUserTimeline)
   *   3. Convert both sets into UserPost format
   *   4. Pass everything to DeepInvestigationService.investigate()
   */
  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async investigate(@Body() body: InvestigateRequestBody): Promise<DeepInvestigationResult> {
    const { query, userHandles, platforms, topicPosts } = body;

    if (!query?.trim()) {
      throw new HttpException('query is required', HttpStatus.BAD_REQUEST);
    }
    if (query.length > 500) {
      throw new HttpException('query must be at most 500 characters', HttpStatus.BAD_REQUEST);
    }
    if (!userHandles || userHandles.length === 0) {
      throw new HttpException(
        'userHandles must contain at least one handle',
        HttpStatus.BAD_REQUEST,
      );
    }
    // Each handle triggers a timeline fetch + LLM profiling — bound the fan-out
    if (userHandles.length > 25) {
      throw new HttpException(
        'userHandles must contain at most 25 handles per request',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (topicPosts && topicPosts.length > 5000) {
      throw new HttpException(
        'topicPosts must contain at most 5000 posts',
        HttpStatus.BAD_REQUEST,
      );
    }

    this.logger.log(
      `Investigation request: "${query}" — ${userHandles.length} users, platforms=${platforms?.join(',') ?? 'all'}`,
    );

    // Index supplied topic posts by author handle for quick lookup
    const topicPostsByHandle = new Map<string, RawPostDto[]>();
    if (topicPosts) {
      for (const post of topicPosts) {
        const handle = (post.authorHandle ?? '').toLowerCase();
        if (!topicPostsByHandle.has(handle)) {
          topicPostsByHandle.set(handle, []);
        }
        topicPostsByHandle.get(handle)?.push(post);
      }
    }

    // Build the user timelines map that DeepInvestigationService expects
    const userTimelines = new Map<
      string,
      { topicPosts: UserPost[]; historicalPosts: UserPost[] }
    >();

    // Author profile data (followers, following, etc.) keyed by handle
    const authorProfileMap = new Map<string, AuthorDetailsSnapshot>();

    // Process each user handle concurrently (bounded by 5)
    const CONCURRENCY = 5;
    for (let i = 0; i < userHandles.length; i += CONCURRENCY) {
      const batch = userHandles.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (rawHandle) => {
          const handle = rawHandle.replace(/^@/, '').toLowerCase();

          // 1. Get topic posts for this user from the supplied data
          const userTopicDtos = topicPostsByHandle.get(handle) ?? [];
          const userTopicPosts = userTopicDtos.map(toUserPost);

          // 2. Determine the platform(s) to query for this user's timeline
          //    If the user has topic posts, use the platform from the first post.
          //    Otherwise try each requested platform.
          let platformsToTry = this.resolvePlatforms(handle, userTopicDtos, platforms);

          // 2b. Cross-platform discovery via Sherlock (with 15s timeout)
          //     Find this user's accounts on other platforms we can fetch from
          let identityTimeout: NodeJS.Timeout | undefined;
          try {
            const identity = await Promise.race([
              this.crossPlatformIdentity.resolveIdentity(handle),
              new Promise<{
                queriedUsername: string;
                accounts: never[];
                actionableAccounts: never[];
                corroboratingAccounts: never[];
                extendedAccounts: never[];
                relevantAccounts: never[];
                totalFound: 0;
                searchDuration: 0;
              }>((resolve) => {
                identityTimeout = setTimeout(
                  () =>
                    resolve({
                      queriedUsername: handle,
                      accounts: [],
                      actionableAccounts: [],
                      corroboratingAccounts: [],
                      extendedAccounts: [],
                      relevantAccounts: [],
                      totalFound: 0 as const,
                      searchDuration: 0 as const,
                    }),
                  15_000,
                );
                identityTimeout.unref?.();
              }),
            ]);
            if (identity.actionableAccounts.length > 0) {
              const discoveredPlatforms = identity.actionableAccounts
                .map((a) => a.platform)
                .filter((p) => !platformsToTry.includes(p));
              if (discoveredPlatforms.length > 0) {
                this.logger.log(
                  `Sherlock actionable matches for @${handle}: ${discoveredPlatforms.join(', ')}`,
                );
                platformsToTry = [...platformsToTry, ...discoveredPlatforms];
              }
            }
          } catch (err) {
            this.logger.debug(`Sherlock lookup skipped for @${handle}: ${err}`);
          } finally {
            if (identityTimeout) {
              clearTimeout(identityTimeout);
            }
          }

          // 3. Fetch historical timeline from connectors that support it
          const historicalPosts = await this.fetchTimeline(handle, platformsToTry);

          // 4. Fetch author profile details (followers, following, etc.)
          const authorDetails = await this.fetchAuthorDetails(handle, platformsToTry);
          if (authorDetails) {
            authorProfileMap.set(handle, authorDetails);
          }

          userTimelines.set(handle, {
            topicPosts: userTopicPosts,
            historicalPosts,
          });
        }),
      );
    }

    this.logger.log(
      `Timelines built for ${userTimelines.size} users — handing off to DeepInvestigationService`,
    );

    const investigationResult = (await this.deepInvestigationService.investigate(
      query,
      userTimelines,
    )) as InvestigationResultWithEnrichment;

    // --- Source credibility scoring ---
    const credibilityUsers = investigationResult.users.map((u) => ({
      handle: u.user.handle,
      platform: u.user.platform,
      posts: [...u.user.topicPosts, ...u.user.historicalPosts],
      crossPlatformAccounts: u.user.profile.patterns.platformPresence,
    }));

    let credibilityScores: SourceCredibilityScore[] = [];
    try {
      credibilityScores = await this.sourceCredibility.scoreMultipleSources(credibilityUsers);

      // Build the graph for this investigation
      // Use query as both narrativeId and investigationId — they're the natural key
      await this.sourceCredibility.buildRelationshipGraph(
        credibilityUsers.map((u) => ({
          handle: u.handle,
          platform: u.platform,
          posts: u.posts,
        })),
        query,
        query,
      );
    } catch (err) {
      this.logger.warn(`Credibility scoring failed: ${err}`);
    }

    // --- Graph-based bot detection ---
    let botDetection: BotDetectionResult | null = null;
    try {
      botDetection = await this.graphBotDetection.detectBots(
        credibilityUsers.map((u) => ({
          handle: u.handle,
          platform: u.platform,
          posts: u.posts,
        })),
        { narrativeId: query, investigationId: query },
      );
    } catch (err) {
      this.logger.warn(`Bot detection failed: ${err}`);
    }

    // Attach credibility and bot scores to user results
    const credibilityMap = new Map(credibilityScores.map((s) => [s.handle, s]));
    const botScoreMap = new Map((botDetection?.scores ?? []).map((s) => [s.handle, s]));

    for (const userResult of investigationResult.users) {
      const cred = credibilityMap.get(userResult.user.handle);
      const bot = botScoreMap.get(userResult.user.handle);

      // Extend the result object with credibility, bot data, and profile details
      (userResult as unknown as Record<string, unknown>).credibility = cred ?? null;
      (userResult as unknown as Record<string, unknown>).botScore = bot ?? null;

      // Attach author profile (followers, following, etc.) if available
      const profile = authorProfileMap.get(userResult.user.handle);
      if (profile) {
        (userResult as unknown as Record<string, unknown>).authorProfile = profile;
      }

      // Add credibility flags to the existing flags array
      if (cred) {
        userResult.flags.push(...cred.flags.filter((f) => !userResult.flags.includes(f)));
      }
      // botProbability is null when detection abstained (insufficient data) —
      // only flag on a real score above threshold.
      if (bot && bot.botProbability !== null && bot.botProbability > 0.5) {
        userResult.flags.push(`Bot probability: ${Math.round(bot.botProbability * 100)}%`);
        userResult.flags.push(...bot.detectedPatterns.filter((p) => !userResult.flags.includes(p)));
      }
    }

    // Attach bot detection summary and structural patterns to the result
    investigationResult.botDetection = botDetection
      ? {
          summary: botDetection.summary,
          structuralPatterns: botDetection.structuralPatterns,
          graphEnhanced: botDetection.graphEnhanced,
        }
      : null;

    // --- Social Graph Enrichment ---
    try {
      const graphUsers = investigationResult.users.map((userResult) => ({
        handle: userResult.user.handle,
        platform: userResult.user.platform,
        posts: [...(userResult.user.topicPosts ?? []), ...(userResult.user.historicalPosts ?? [])],
      }));
      const graphResult = await this.socialGraph.enrichRelationships(graphUsers, query);
      this.logger.log(
        `Social graph: ${graphResult.edgesCreated} edges, ${graphResult.communitiesDetected} communities`,
      );
      investigationResult.socialGraph = graphResult;
    } catch (err) {
      this.logger.warn(`Social graph enrichment failed: ${err}`);
    }

    // --- Upsert Identity Records ---
    try {
      for (const userResult of investigationResult.users) {
        const cred = credibilityMap.get(userResult.user.handle);
        const bot = botScoreMap.get(userResult.user.handle);
        const profile = authorProfileMap.get(userResult.user.handle);

        await this.identityRecordRepo.upsertFromInvestigation({
          handle: userResult.user.handle,
          platform: userResult.user.platform,
          displayName: profile?.name ?? userResult.user.name,
          snapshot: {
            query,
            timestamp: new Date(),
            postCount: userResult.user.topicPosts.length + userResult.user.historicalPosts.length,
            platforms: userResult.user.profile.patterns.platformPresence,
            credibilityScore: cred?.overallScore ?? null,
            botProbability: bot?.botProbability ?? null,
            flags: userResult.flags,
            influenceScore: userResult.influenceScore,
          },
          authorProfile: profile
            ? {
                followersCount: profile.followersCount ?? null,
                followingCount: profile.followingCount ?? null,
                postsCount: profile.tweetsCount ?? null,
                isVerified: profile.isVerified ?? false,
                bio: profile.description ?? null,
              }
            : null,
          profileImageUrl: profile?.avatar ?? null,
          bannerImageUrl: profile?.banner ?? null,
          credibilityScore: cred?.overallScore ?? null,
          botProbability: bot?.botProbability ?? null,
          flags: userResult.flags,
          observedPosts: [
            ...(userResult.user.topicPosts ?? []),
            ...(userResult.user.historicalPosts ?? []),
          ].map((post: UserPost) => ({
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
      this.logger.log(`Upserted ${investigationResult.users.length} identity records`);
    } catch (err) {
      this.logger.warn(`Identity record upsert failed: ${err}`);
    }

    return investigationResult;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Determine which platforms to try for a given user's timeline fetch.
   */
  private resolvePlatforms(
    _handle: string,
    userTopicDtos: RawPostDto[],
    requestedPlatforms?: string[],
  ): string[] {
    // Deduplicate platforms the user already appeared on
    const seenPlatforms = new Set(userTopicDtos.map((p) => p.platform.toLowerCase()));

    if (seenPlatforms.size > 0) {
      return Array.from(seenPlatforms);
    }

    // Fallback: try all requested platforms, or twitter + reddit as defaults
    if (requestedPlatforms && requestedPlatforms.length > 0) {
      return requestedPlatforms.map((p) => p.toLowerCase());
    }

    return ['twitter', 'reddit'];
  }

  /**
   * Attempt to fetch a user's timeline from the first connector that
   * supports `getUserTimeline`.
   */
  private async fetchTimeline(handle: string, platformsToTry: string[]): Promise<UserPost[]> {
    for (const platform of platformsToTry) {
      const connector = this.ingestionService.getConnector(platform);
      if (!connector) {
        this.logger.debug(`No connector registered for platform "${platform}"`);
        continue;
      }

      // getUserTimeline is not on the DataConnector interface — it's specific
      // to TwitterFreeConnector and RedditFreeConnector
      const connectorWithTimeline = connector as unknown as Record<string, unknown>;
      if (typeof connectorWithTimeline.getUserTimeline !== 'function') {
        this.logger.debug(`Connector for "${platform}" does not support getUserTimeline`);
        continue;
      }

      try {
        this.logger.debug(`Fetching timeline for @${handle} from ${platform}...`);
        const timelinePosts = await (
          connectorWithTimeline.getUserTimeline as (
            username: string,
            options?: { limit?: number },
          ) => Promise<
            Array<{
              id: string;
              text: string;
              timestamp: Date;
              platform: string;
              url?: string;
              engagementMetrics: {
                likes: number;
                shares: number;
                comments: number;
              };
            }>
          >
        ).call(connector, handle, { limit: 50 });

        // Convert SocialMediaPost[] to UserPost[]
        return timelinePosts.map((post) => ({
          text: post.text,
          timestamp:
            post.timestamp instanceof Date ? post.timestamp.toISOString() : String(post.timestamp),
          platform: post.platform,
          url: post.url,
          engagement: {
            likes: post.engagementMetrics?.likes ?? 0,
            comments: post.engagementMetrics?.comments ?? 0,
            shares: post.engagementMetrics?.shares ?? 0,
          },
          sentiment: { score: 0, label: 'neutral' },
        }));
      } catch (err) {
        const error = err as Error;
        this.logger.warn(
          `Failed to fetch timeline for @${handle} from ${platform}: ${error.message}`,
        );
      }
    }

    // No timeline available — investigation will work with topic posts only
    this.logger.debug(
      `No timeline data available for @${handle} — proceeding with topic posts only`,
    );
    return [];
  }

  /**
   * Fetch author profile details (followers, following, etc.) from connectors.
   */
  private async fetchAuthorDetails(
    handle: string,
    platformsToTry: string[],
  ): Promise<AuthorDetailsSnapshot | null> {
    for (const platform of platformsToTry) {
      const connector = this.ingestionService.getConnector(platform);
      if (!connector) continue;

      const connectorAny = connector as unknown as Record<string, unknown>;
      if (typeof connectorAny.getAuthorDetails !== 'function') continue;

      try {
        const details = await (
          connectorAny.getAuthorDetails as (handle: string) => Promise<Record<string, unknown>>
        ).call(connector, handle);

        if (details) {
          const metadata = (details.metadata ?? {}) as Record<string, unknown>;
          return {
            platform,
            followersCount: asNullableNumber(metadata.followersCount),
            followingCount: asNullableNumber(metadata.followingCount),
            tweetsCount: asNullableNumber(metadata.tweetsCount),
            isVerified: details.verificationStatus === 'verified',
            name: asNullableString(details.name) ?? handle,
            description: asNullableString(details.description) ?? '',
            url: asNullableString(details.url) ?? '',
            avatar: asNullableString(metadata.avatar),
            banner: asNullableString(metadata.banner),
          };
        }
      } catch (err) {
        this.logger.debug(`Author details fetch failed for @${handle} on ${platform}: ${err}`);
      }
    }
    return null;
  }
}
