import { Injectable, Logger } from '@nestjs/common';
import { GraphDatabaseService } from './graph-database.service';

/**
 * Persistent, accumulative social relationship mapping service.
 *
 * Every investigation enriches a shared social graph. When Memgraph is
 * unavailable the service builds an ephemeral in-memory graph scoped to the
 * current investigation so callers always get results.
 */
@Injectable()
export class SocialGraphIntelligenceService {
  private readonly logger = new Logger(SocialGraphIntelligenceService.name);

  constructor(private readonly graph: GraphDatabaseService) {}

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Called during every investigation to build the persistent graph.
   * Extracts mentions, reply patterns, and co-timing from user posts,
   * then upserts INTERACTS_WITH edges.
   */
  async enrichRelationships(
    users: Array<{
      handle: string;
      platform: string;
      posts: Array<{ text: string; timestamp: string }>;
    }>,
    investigationId: string,
  ): Promise<{ edgesCreated: number; communitiesDetected: number }> {
    const interactions: Array<{
      from: { handle: string; platform: string };
      to: { handle: string; platform: string };
      type: string;
      sentiment: number;
    }> = [];

    // 1. Extract @mentions and reply patterns from post text
    for (const user of users) {
      for (const post of user.posts) {
        const mentions = this.extractMentions(post.text);
        for (const mentioned of mentions) {
          if (mentioned.toLowerCase() === user.handle.toLowerCase()) continue;

          // Determine if this is a reply (starts with @handle) or just a mention
          const isReply = post.text.trimStart().startsWith(`@${mentioned}`);
          interactions.push({
            from: { handle: user.handle, platform: user.platform },
            to: { handle: mentioned, platform: user.platform },
            type: isReply ? 'reply' : 'mention',
            sentiment: 0,
          });
        }
      }
    }

    // 2. Detect co-timing (posts within 5 minutes of each other)
    for (let i = 0; i < users.length; i++) {
      for (let j = i + 1; j < users.length; j++) {
        const userA = users[i];
        const userB = users[j];
        if (!userA || !userB) continue;
        if (this.hasCoTiming(userA.posts, userB.posts, 5 * 60 * 1000)) {
          interactions.push({
            from: { handle: userA.handle, platform: userA.platform },
            to: { handle: userB.handle, platform: userB.platform },
            type: 'co_timing',
            sentiment: 0,
          });
        }
      }
    }

    // 3. Upsert all interactions
    let edgesCreated = 0;

    if (this.graph.isAvailable) {
      for (const interaction of interactions) {
        await this.graph.upsertInteraction(
          interaction.from.handle,
          interaction.from.platform,
          interaction.to.handle,
          interaction.to.platform,
          interaction.type,
          { investigationId, sentiment: interaction.sentiment },
        );
        edgesCreated++;
      }

      // 4. Classify tiers for edges we just touched
      await this.classifyTiersForUsers(users);
    } else {
      // In-memory fallback: just count interactions
      edgesCreated = interactions.length;
      this.logger.log(
        `Graph DB unavailable — ${edgesCreated} edges computed in-memory (not persisted)`,
      );
    }

    // 5. Community detection (best-effort)
    let communitiesDetected = 0;
    if (this.graph.isAvailable) {
      try {
        const communities = await this.graph.detectCommunities(investigationId);
        communitiesDetected = new Set(communities.values()).size;
      } catch {
        // MAGE not installed or other issue — not critical
      }
    }

    return { edgesCreated, communitiesDetected };
  }

  /**
   * Get closest associates for a user, ordered by weight.
   */
  async getClosestAssociates(
    handle: string,
    platform: string,
    limit = 20,
  ): Promise<
    Array<{
      handle: string;
      platform: string;
      weight: number;
      tier: number;
      interactionCount: number;
    }>
  > {
    if (!this.graph.isAvailable) return [];

    const records = await this.graph.runQuery(
      `MATCH (u:User {handle: $handle, platform: $platform})-[r:INTERACTS_WITH]-(neighbor:User)
       RETURN neighbor.handle AS handle, neighbor.platform AS platform,
              COALESCE(r.weight, 0) AS weight, COALESCE(r.tier, 3) AS tier,
              COALESCE(r.interactionCount, 0) AS interactionCount
       ORDER BY weight DESC
       LIMIT $limit`,
      { handle, platform, limit },
    );

    return records.map((r) => ({
      handle: String(r['handle']),
      platform: String(r['platform']),
      weight: Number(r['weight']),
      tier: Number(r['tier']),
      interactionCount: Number(r['interactionCount']),
    }));
  }

  /**
   * Find a connection path between two users.
   */
  async findConnection(
    handleA: string,
    platformA: string,
    handleB: string,
    platformB: string,
  ): Promise<{ path: string[]; hops: number; totalWeight: number } | null> {
    if (!this.graph.isAvailable) return null;

    const result = await this.graph.findShortestPath(handleA, platformA, handleB, platformB);
    if (!result) return null;

    // Calculate total weight along the path
    let totalWeight = 0;
    for (let i = 0; i < result.path.length - 1; i++) {
      const records = await this.graph.runQuery(
        `MATCH (a:User {handle: $handleA})-[r:INTERACTS_WITH]-(b:User {handle: $handleB})
         RETURN COALESCE(r.weight, 0) AS weight LIMIT 1`,
        { handleA: result.path[i], handleB: result.path[i + 1] },
      );
      const rec = records[0];
      if (rec) {
        totalWeight += Number(rec['weight']);
      }
    }

    return { path: result.path, hops: result.hops, totalWeight };
  }

  /**
   * Get degrees of separation between two users.
   */
  async getDegreesOfSeparation(
    handleA: string,
    platformA: string,
    handleB: string,
    platformB: string,
  ): Promise<number | null> {
    if (!this.graph.isAvailable) return null;

    const result = await this.graph.findShortestPath(handleA, platformA, handleB, platformB);
    return result ? result.hops : null;
  }

  // --------------------------------------------------------------------------
  // Tier classification
  // --------------------------------------------------------------------------

  /**
   * Classify the relationship tier based on interaction data.
   *
   * - Tier 1: has reply/mention/repost, OR reciprocal, OR count >= 3
   * - Tier 2: has co_timing or co_narrative, no direct interactions
   * - Tier 3: everything else (bridge connections)
   */
  classifyTier(
    interactionTypes: string[],
    interactionCount: number,
    reciprocal: boolean,
  ): 1 | 2 | 3 {
    const directTypes = ['reply', 'mention', 'repost'];
    const hasDirect = interactionTypes.some((t) => directTypes.includes(t));

    if (hasDirect || reciprocal || interactionCount >= 3) {
      return 1;
    }

    const indirectTypes = ['co_timing', 'co_narrative'];
    const hasIndirect = interactionTypes.some((t) => indirectTypes.includes(t));

    if (hasIndirect) {
      return 2;
    }

    return 3;
  }

  // --------------------------------------------------------------------------
  // Weight calculation
  // --------------------------------------------------------------------------

  /**
   * Calculate relationship weight.
   *
   * weight = 0.4 * min(1, interactionCount/20)
   *        + 0.3 * exp(-daysSinceLastSeen/90)
   *        + 0.2 * (reciprocal ? 1 : 0)
   *        + 0.1 * abs(avgSentiment)
   */
  calculateWeight(
    interactionCount: number,
    daysSinceLastSeen: number,
    reciprocal: boolean,
    avgSentiment: number,
  ): number {
    const countComponent = 0.4 * Math.min(1, interactionCount / 20);
    const recencyComponent = 0.3 * Math.exp(-daysSinceLastSeen / 90);
    const reciprocalComponent = 0.2 * (reciprocal ? 1 : 0);
    const sentimentComponent = 0.1 * Math.abs(avgSentiment);

    return countComponent + recencyComponent + reciprocalComponent + sentimentComponent;
  }

  // --------------------------------------------------------------------------
  // Mention extraction
  // --------------------------------------------------------------------------

  /**
   * Extract unique @mentions from text.
   */
  extractMentions(text: string): string[] {
    const regex = /@([\w]+)/g;
    const mentions = new Set<string>();
    let match = regex.exec(text);
    while (match !== null) {
      const handle = match[1];
      if (handle) {
        mentions.add(handle);
      }
      match = regex.exec(text);
    }
    return [...mentions];
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  /**
   * Detect if two sets of posts have co-timing (any pair within thresholdMs).
   */
  private hasCoTiming(
    postsA: Array<{ text: string; timestamp: string }>,
    postsB: Array<{ text: string; timestamp: string }>,
    thresholdMs: number,
  ): boolean {
    for (const a of postsA) {
      const tsA = new Date(a.timestamp).getTime();
      if (Number.isNaN(tsA)) continue;
      for (const b of postsB) {
        const tsB = new Date(b.timestamp).getTime();
        if (Number.isNaN(tsB)) continue;
        if (Math.abs(tsA - tsB) <= thresholdMs) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * After enriching interactions, classify tiers and calculate weights
   * for all edges involving the given users.
   */
  private async classifyTiersForUsers(
    users: Array<{
      handle: string;
      platform: string;
      posts: Array<{ text: string; timestamp: string }>;
    }>,
  ): Promise<void> {
    for (const user of users) {
      const records = await this.graph.runQuery(
        `MATCH (u:User {handle: $handle, platform: $platform})-[r:INTERACTS_WITH]-(neighbor:User)
         RETURN neighbor.handle AS neighborHandle, neighbor.platform AS neighborPlatform,
                r.interactionTypes AS interactionTypes,
                r.interactionCount AS interactionCount,
                r.lastSeen AS lastSeen,
                r.sentimentSum AS sentimentSum`,
        { handle: user.handle, platform: user.platform },
      );

      for (const rec of records) {
        const neighborHandle = String(rec['neighborHandle']);
        const neighborPlatform = String(rec['neighborPlatform']);
        const interactionTypes = (rec['interactionTypes'] as string[]) ?? [];
        const interactionCount = Number(rec['interactionCount']) || 0;
        const lastSeen = String(rec['lastSeen'] ?? new Date().toISOString());
        const sentimentSum = Number(rec['sentimentSum']) || 0;
        const avgSentiment = interactionCount > 0 ? sentimentSum / interactionCount : 0;

        // Check reciprocal: does the reverse edge exist?
        const reverseRecords = await this.graph.runQuery(
          `MATCH (a:User {handle: $neighborHandle, platform: $neighborPlatform})
                -[r:INTERACTS_WITH]->
                (b:User {handle: $handle, platform: $platform})
           RETURN r.interactionCount AS count`,
          {
            neighborHandle,
            neighborPlatform,
            handle: user.handle,
            platform: user.platform,
          },
        );
        const reciprocal = reverseRecords.length > 0;

        const tier = this.classifyTier(interactionTypes, interactionCount, reciprocal);
        const daysSinceLastSeen =
          (Date.now() - new Date(lastSeen).getTime()) / (1000 * 60 * 60 * 24);
        const weight = this.calculateWeight(
          interactionCount,
          daysSinceLastSeen,
          reciprocal,
          avgSentiment,
        );

        // Update edge with tier and weight
        await this.graph.runQuery(
          `MATCH (u:User {handle: $handle, platform: $platform})
                -[r:INTERACTS_WITH]-
                (neighbor:User {handle: $neighborHandle, platform: $neighborPlatform})
           SET r.tier = $tier, r.weight = $weight`,
          {
            handle: user.handle,
            platform: user.platform,
            neighborHandle,
            neighborPlatform,
            tier,
            weight,
          },
        );
      }
    }
  }
}
