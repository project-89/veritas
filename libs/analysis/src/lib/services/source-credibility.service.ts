import { Injectable, Logger, Optional } from '@nestjs/common';
import type { UserPost } from './deep-investigation.service';
import { GraphDatabaseService } from './graph-database.service';
import { PlatformCredibilityService } from './platform-credibility.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceCredibilityScore {
  handle: string;
  platform: string;
  overallScore: number; // 0-1
  signals: {
    accountAge: number; // 0-1
    postingConsistency: number; // 0-1
    engagementRatio: number; // 0-1
    contentDiversity: number; // 0-1
    crossPlatformPresence: number; // 0-1
    // Graph signals (null if Memgraph unavailable)
    pageRank: number | null;
    betweenness: number | null;
    communityCount: number | null;
  };
  flags: string[];
}

export interface BridgeNodeResult {
  handle: string;
  betweenness: number;
  communitiesConnected: string[];
  amplificationScore: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class SourceCredibilityService {
  private readonly logger = new Logger(SourceCredibilityService.name);

  constructor(
    private readonly graph: GraphDatabaseService,
    @Optional() private readonly platformCredibility?: PlatformCredibilityService,
  ) {}

  /**
   * Score a source's credibility based on multiple signals.
   * Uses Memgraph for graph-based metrics when available,
   * falls back to heuristic scoring when not.
   */
  async scoreSource(
    handle: string,
    platform: string,
    posts: UserPost[],
    crossPlatformAccounts?: string[],
  ): Promise<SourceCredibilityScore> {
    // ------ Heuristic signals (always available) ------

    const accountAge = this.computeAccountAge(posts);
    const postingConsistency = this.computePostingConsistency(posts);
    const engagementRatio = this.computeEngagementRatio(posts);
    const contentDiversity = this.computeContentDiversity(posts);
    const crossPlatformPresence = this.computeCrossPlatformPresence(posts, crossPlatformAccounts);

    // ------ Graph signals (when Memgraph available) ------

    let pageRank: number | null = null;
    let betweenness: number | null = null;
    let communityCount: number | null = null;

    if (this.graph.isAvailable) {
      try {
        // Fetch graph centrality scores for this user
        const prRecords = await this.graph.runQuery(
          `MATCH (u:User {handle: $handle, platform: $platform})
           CALL pagerank.get(10, 0.85) YIELD node, rank
           WITH node, rank, u
           WHERE node = u
           RETURN rank`,
          { handle, platform },
        );
        if (prRecords.length > 0) {
          pageRank = Number(prRecords[0]?.['rank']) || 0;
        }

        const btRecords = await this.graph.runQuery(
          `MATCH (u:User {handle: $handle, platform: $platform})
           CALL betweenness_centrality.get(FALSE, FALSE) YIELD node, betweenness_centrality
           WITH node, betweenness_centrality, u
           WHERE node = u
           RETURN betweenness_centrality AS betweenness`,
          { handle, platform },
        );
        if (btRecords.length > 0) {
          betweenness = Number(btRecords[0]?.['betweenness']) || 0;
        }

        const commRecords = await this.graph.runQuery(
          `MATCH (u:User {handle: $handle, platform: $platform})-[:AMPLIFIED]->(n:Narrative)
           WITH COLLECT(DISTINCT n.narrativeId) AS narrs
           RETURN SIZE(narrs) AS communityCount`,
          { handle, platform },
        );
        if (commRecords.length > 0) {
          communityCount = Number(commRecords[0]?.['communityCount']) || 0;
        }
      } catch (err) {
        this.logger.debug(`Graph signals unavailable for @${handle}: ${err}`);
      }
    }

    // ------ Compute flags ------

    const flags = this.computeFlags(handle, posts, {
      accountAge,
      postingConsistency,
      engagementRatio,
      contentDiversity,
    });

    // ------ Overall score ------

    const heuristicScore = this.weightedAverage([
      { value: accountAge, weight: 0.2 },
      { value: postingConsistency, weight: 0.2 },
      { value: engagementRatio, weight: 0.2 },
      { value: contentDiversity, weight: 0.2 },
      { value: crossPlatformPresence, weight: 0.2 },
    ]);

    // If graph signals are available, blend them in (30% graph, 70% heuristic)
    let overallScore = heuristicScore;
    if (pageRank !== null && betweenness !== null) {
      // Normalize pageRank and betweenness to 0-1 range (heuristic normalization)
      const normalizedPR = Math.min(1, pageRank * 100); // PageRank values are typically small
      const normalizedBT = Math.min(1, betweenness / 0.5); // Betweenness > 0.5 is very central
      const graphScore = (normalizedPR + normalizedBT) / 2;
      overallScore = heuristicScore * 0.7 + graphScore * 0.3;
    }

    // Penalize for flags
    const flagPenalty = Math.min(0.3, flags.length * 0.1);
    overallScore = Math.max(0, overallScore - flagPenalty);

    // Apply platform credibility multiplier if available
    if (this.platformCredibility) {
      const platformMultiplier = this.platformCredibility.getCredibilityMultiplier(platform);
      overallScore = overallScore * platformMultiplier;
    }

    return {
      handle,
      platform,
      overallScore: Math.round(overallScore * 1000) / 1000,
      signals: {
        accountAge,
        postingConsistency,
        engagementRatio,
        contentDiversity,
        crossPlatformPresence,
        pageRank,
        betweenness,
        communityCount,
      },
      flags,
    };
  }

  /**
   * Score multiple sources at once. Calls scoreSource for each user.
   */
  async scoreMultipleSources(
    users: Array<{
      handle: string;
      platform: string;
      posts: UserPost[];
      crossPlatformAccounts?: string[];
    }>,
  ): Promise<SourceCredibilityScore[]> {
    return Promise.all(
      users.map((u) => this.scoreSource(u.handle, u.platform, u.posts, u.crossPlatformAccounts)),
    );
  }

  /**
   * Populate the graph with user relationships from investigation data.
   * Call this during deep investigation to build the graph.
   */
  async buildRelationshipGraph(
    users: Array<{ handle: string; platform: string; posts: UserPost[] }>,
    narrativeId: string,
    investigationId?: string,
  ): Promise<void> {
    if (!this.graph.isAvailable) {
      this.logger.debug('Memgraph not available — skipping graph build');
      return;
    }

    // Upsert narrative node with investigation pointer
    await this.graph.upsertNarrative(narrativeId, narrativeId, {
      ...(investigationId ? { investigationId } : {}),
    });

    // Upsert each user and link them to the narrative
    for (const user of users) {
      await this.graph.upsertUser(user.handle, user.platform, {
        postCount: user.posts.length,
      });

      const firstPost = user.posts[0];
      if (firstPost) {
        await this.graph.recordAmplification(
          user.handle,
          user.platform,
          narrativeId,
          firstPost.timestamp,
        );
      }
    }

    // Build co-timing edges: users who posted within 5 minutes of each other
    const WINDOW_MS = 5 * 60 * 1000;
    for (let i = 0; i < users.length; i++) {
      for (let j = i + 1; j < users.length; j++) {
        const userA = users[i];
        const userB = users[j];
        if (!userA || !userB) {
          continue;
        }

        const hasCoTiming = userA.posts.some((postA) =>
          userB.posts.some((postB) => {
            const delta = Math.abs(
              new Date(postA.timestamp).getTime() - new Date(postB.timestamp).getTime(),
            );
            return delta <= WINDOW_MS;
          }),
        );

        const edgeMeta = {
          narrativeId,
          ...(investigationId ? { investigationId } : {}),
        };

        if (hasCoTiming) {
          await this.graph.addEdge(
            userA.handle,
            userA.platform,
            userB.handle,
            userB.platform,
            'CO_TIMED',
            edgeMeta,
          );
        }

        // Always add CO_NARRATIVE edge since they share the same narrative
        await this.graph.addEdge(
          userA.handle,
          userA.platform,
          userB.handle,
          userB.platform,
          'CO_NARRATIVE',
          edgeMeta,
        );
      }
    }

    this.logger.log(
      `Built relationship graph for narrative "${narrativeId}" with ${users.length} users`,
    );
  }

  /**
   * Detect bridge nodes -- accounts that connect otherwise separate communities.
   * These are key amplification vectors per the BotSim research.
   */
  async detectBridgeNodes(narrativeId: string): Promise<BridgeNodeResult[]> {
    if (!this.graph.isAvailable) {
      return [];
    }

    const betweennessScores = await this.graph.getBetweennessForNarrative(narrativeId);
    const communities = await this.graph.detectCommunities(narrativeId);

    if (betweennessScores.size === 0) return [];

    // Build community sets for each user
    const userCommunities = new Map<string, Set<number>>();
    for (const [handle, communityId] of communities) {
      let communitySet = userCommunities.get(handle);
      if (!communitySet) {
        communitySet = new Set();
        userCommunities.set(handle, communitySet);
      }
      communitySet.add(communityId);
    }

    // Find bridge nodes: high betweenness + connected to multiple communities
    const results: BridgeNodeResult[] = [];
    const sortedByBetweenness = Array.from(betweennessScores.entries()).sort((a, b) => b[1] - a[1]);

    for (const [handle, bt] of sortedByBetweenness) {
      const comms = userCommunities.get(handle);
      const commIds = comms ? Array.from(comms) : [];

      // Only flag as bridge node if betweenness is significant
      if (bt > 0.01 || commIds.length > 1) {
        // Get amplification count
        const ampRecords = await this.graph.runQuery(
          `MATCH (u:User {handle: $handle})-[r:AMPLIFIED]->(n:Narrative)
           RETURN COUNT(r) AS ampCount`,
          { handle },
        );
        const ampCount = Number(ampRecords[0]?.['ampCount']) || 0;

        results.push({
          handle,
          betweenness: bt,
          communitiesConnected: commIds.map(String),
          amplificationScore: Math.min(1, ampCount / 10),
        });
      }
    }

    return results.slice(0, 20); // Top 20 bridge nodes
  }

  // --------------------------------------------------------------------------
  // Heuristic signal computation (works without Memgraph)
  // --------------------------------------------------------------------------

  /**
   * Account age proxy: score based on the time span of known posts.
   * NOTE: This only measures the span of posts we fetched (~50 most recent),
   * NOT the actual account creation date. A low score may just mean we only
   * got recent data from an active account.
   */
  computeAccountAge(posts: UserPost[]): number {
    if (posts.length < 2) return 0.3; // Can't determine — give benefit of doubt

    const timestamps = posts.map((p) => new Date(p.timestamp).getTime()).sort((a, b) => a - b);

    const firstTimestamp = timestamps[0];
    const lastTimestamp = timestamps[timestamps.length - 1];
    if (firstTimestamp === undefined || lastTimestamp === undefined) {
      return 0.3;
    }

    const spanDays = (lastTimestamp - firstTimestamp) / (1000 * 60 * 60 * 24);

    // Higher floor (0.3) since we only see a sample — don't penalize established accounts
    // Score: 0 days = 0.3, 30 days = 0.6, 180+ days = 1.0
    if (spanDays >= 180) return 1.0;
    if (spanDays >= 30) return 0.6 + (spanDays - 30) * (0.4 / 150);
    return 0.3 + spanDays * (0.3 / 30);
  }

  /**
   * Posting consistency: regular posters score higher than burst posters.
   * Measures coefficient of variation in inter-post intervals.
   */
  computePostingConsistency(posts: UserPost[]): number {
    if (posts.length < 3) return 0.5; // Not enough data

    const timestamps = posts.map((p) => new Date(p.timestamp).getTime()).sort((a, b) => a - b);

    // Compute inter-post intervals
    const intervals: number[] = [];
    for (let i = 1; i < timestamps.length; i++) {
      const previous = timestamps[i - 1];
      const current = timestamps[i];
      if (previous === undefined || current === undefined) {
        continue;
      }
      intervals.push(current - previous);
    }

    const mean = intervals.reduce((s, v) => s + v, 0) / intervals.length;
    if (mean === 0) return 0.1; // All posts at same time = suspicious

    const variance = intervals.reduce((s, v) => s + (v - mean) ** 2, 0) / intervals.length;
    const cv = Math.sqrt(variance) / mean; // Coefficient of variation

    // Low CV = consistent = higher score. CV > 2 = very bursty = low score
    if (cv <= 0.5) return 1.0;
    if (cv <= 1.0) return 0.8;
    if (cv <= 2.0) return 0.5;
    return 0.2;
  }

  /**
   * Engagement ratio: average engagement per post, normalized.
   * Higher engagement per post generally indicates a real audience.
   */
  computeEngagementRatio(posts: UserPost[]): number {
    if (posts.length === 0) return 0;

    const totalEngagement = posts.reduce(
      (s, p) => s + (p.engagement.likes + p.engagement.comments + p.engagement.shares),
      0,
    );
    const avgEngagement = totalEngagement / posts.length;

    // Normalize: 0 engagement = 0, 100+ avg = 1.0
    return Math.min(1, Math.log10(avgEngagement + 1) / 2);
  }

  /**
   * Content diversity: how varied are the topics/texts.
   * Uses a simple unique-bigram-ratio as proxy for topic diversity.
   */
  computeContentDiversity(posts: UserPost[]): number {
    if (posts.length <= 1) return 0.5;

    // Extract bigrams from all posts
    const allBigrams = new Set<string>();
    const totalBigramCount = { value: 0 };

    for (const post of posts) {
      const words = post.text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 2);

      for (let i = 0; i < words.length - 1; i++) {
        allBigrams.add(`${words[i]} ${words[i + 1]}`);
        totalBigramCount.value++;
      }
    }

    if (totalBigramCount.value === 0) return 0.5;

    // Ratio of unique bigrams to total bigrams
    const uniqueRatio = allBigrams.size / totalBigramCount.value;

    // Also check for near-duplicate posts
    const uniqueTexts = new Set(posts.map((p) => p.text.toLowerCase().trim().slice(0, 100)));
    const textUniqueness = uniqueTexts.size / posts.length;

    // Combine both signals
    const diversity = uniqueRatio * 0.5 + textUniqueness * 0.5;
    return Math.min(1, diversity);
  }

  /**
   * Cross-platform presence: accounts that exist on multiple platforms
   * are more likely to be real humans.
   */
  computeCrossPlatformPresence(posts: UserPost[], crossPlatformAccounts?: string[]): number {
    const platformsFromPosts = new Set(posts.map((p) => p.platform));
    const knownAccounts = crossPlatformAccounts?.length ?? 0;

    const totalPlatforms = Math.max(platformsFromPosts.size, knownAccounts);

    // 1 platform = 0.2, 2 = 0.5, 3+ = 1.0
    if (totalPlatforms >= 3) return 1.0;
    if (totalPlatforms === 2) return 0.5;
    return 0.2;
  }

  // --------------------------------------------------------------------------
  // Flag computation
  // --------------------------------------------------------------------------

  private computeFlags(
    _handle: string,
    posts: UserPost[],
    signals: {
      accountAge: number;
      postingConsistency: number;
      engagementRatio: number;
      contentDiversity: number;
    },
  ): string[] {
    const flags: string[] = [];

    // Account age is estimated from the span of fetched posts, not actual account creation.
    // Only flag if we have enough posts AND they all fall within a very short window.
    if (posts.length >= 10) {
      const timestamps = posts.map((p) => new Date(p.timestamp).getTime()).sort((a, b) => a - b);
      const earliestTimestamp = timestamps[0];
      const latestTimestamp = timestamps[timestamps.length - 1];
      if (earliestTimestamp !== undefined && latestTimestamp !== undefined) {
        const spanDays = (latestTimestamp - earliestTimestamp) / (1000 * 60 * 60 * 24);
        if (spanDays < 3) {
          flags.push('Limited history — all sampled posts within 3 days');
        }
      }
    }

    // Bursty posting: only flag if it's genuinely extreme (CV > 3) and looks automated.
    // Normal humans can post in bursts — only flag when combined with other indicators.
    if (signals.postingConsistency < 0.2) {
      flags.push('Irregular posting cadence — long gaps between bursts');
    }

    if (signals.engagementRatio < 0.1 && posts.length > 10) {
      flags.push('Very low engagement despite frequent posting');
    }

    if (signals.contentDiversity < 0.2) {
      flags.push('Low content diversity — repetitive or single-topic posting');
    }

    // Check for posting at inhuman times (no gaps in 24h cycle)
    if (posts.length >= 20) {
      const hours = new Set(posts.map((p) => new Date(p.timestamp).getUTCHours()));
      if (hours.size >= 20) {
        flags.push('Posts across nearly all hours — possible automation');
      }
    }

    return flags;
  }

  // --------------------------------------------------------------------------
  // Utility
  // --------------------------------------------------------------------------

  private weightedAverage(items: Array<{ value: number; weight: number }>): number {
    const totalWeight = items.reduce((s, i) => s + i.weight, 0);
    if (totalWeight === 0) return 0;
    return items.reduce((s, i) => s + i.value * i.weight, 0) / totalWeight;
  }
}
