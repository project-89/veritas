import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import neo4j, { Driver, Session } from 'neo4j-driver';

/**
 * Standalone graph database service wrapping Memgraph via the Neo4j driver.
 *
 * Designed for **graceful degradation**: if Memgraph is unreachable the service
 * stays alive and `isAvailable` returns `false`. All query methods return empty
 * results when the connection is down so callers never need to guard against
 * null drivers themselves.
 */
@Injectable()
export class GraphDatabaseService implements OnModuleInit, OnModuleDestroy {
  private driver: Driver | null = null;
  private readonly logger = new Logger(GraphDatabaseService.name);
  private mageWarningLogged = false;

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  async onModuleInit(): Promise<void> {
    const host = process.env['MEMGRAPH_HOST'] || 'localhost';
    const port = process.env['MEMGRAPH_PORT'] || '7687';
    const uri = process.env['MEMGRAPH_URI'] || `bolt://${host}:${port}`;

    const username = process.env['MEMGRAPH_USERNAME'];
    const password = process.env['MEMGRAPH_PASSWORD'];

    try {
      const auth = username && password ? neo4j.auth.basic(username, password) : undefined;

      this.driver = neo4j.driver(uri, auth, {
        maxConnectionLifetime: 60 * 1000,
        connectionTimeout: 5_000,
      });

      await this.driver.verifyConnectivity();
      this.logger.log(`Connected to Memgraph at ${uri}`);

      // Ensure indexes for common lookup patterns
      await this.ensureIndexes();
    } catch (err) {
      const error = err as Error;
      this.logger.warn(
        `Memgraph not available at ${uri} — graph features disabled (${error.message})`,
      );
      // Close the driver if it was partially created
      if (this.driver) {
        try {
          await this.driver.close();
        } catch {
          // ignore
        }
      }
      this.driver = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.driver) {
      try {
        await this.driver.close();
        this.logger.log('Memgraph connection closed');
      } catch (err) {
        const error = err as Error;
        this.logger.warn(`Error closing Memgraph: ${error.message}`);
      }
      this.driver = null;
    }
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /** Whether Memgraph is connected and usable. */
  get isAvailable(): boolean {
    return this.driver !== null;
  }

  /**
   * Execute an arbitrary Cypher query. Returns an empty array when the graph
   * database is not available — callers get graceful degradation for free.
   */
  async runQuery(
    cypher: string,
    params?: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    if (!this.driver) return [];

    let session: Session | null = null;
    try {
      session = this.driver.session();
      const result = await session.run(cypher, params);
      return result.records.map((r) => r.toObject());
    } catch (err) {
      const error = err as Error;
      const msg = error.message ?? '';
      // Expected when MAGE algorithms aren't installed — log once, then suppress
      if (msg.includes('no procedure named') || msg.includes('There is no procedure')) {
        if (!this.mageWarningLogged) {
          this.mageWarningLogged = true;
          this.logger.log(
            'Memgraph MAGE not installed — graph algorithms (pagerank, betweenness, community detection) unavailable. ' +
              'Use memgraph/memgraph-mage Docker image to enable. System continues with heuristic scoring.',
          );
        }
      } else {
        this.logger.error(`Cypher query failed: ${msg}`);
      }
      return [];
    } finally {
      if (session) {
        await session.close();
      }
    }
  }

  // --------------------------------------------------------------------------
  // Graph operations for narrative intelligence
  // --------------------------------------------------------------------------

  /**
   * Create or update a user node in the graph.
   */
  async upsertUser(
    handle: string,
    platform: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const props = { handle, platform, ...metadata };
    await this.runQuery(
      `MERGE (u:User {handle: $handle, platform: $platform})
       SET u += $props, u.updatedAt = timestamp()`,
      { handle, platform, props },
    );
  }

  /**
   * Create or update a narrative node.
   */
  async upsertNarrative(
    narrativeId: string,
    summary: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const props = { narrativeId, summary, ...metadata };
    await this.runQuery(
      `MERGE (n:Narrative {narrativeId: $narrativeId})
       SET n += $props, n.updatedAt = timestamp()`,
      { narrativeId, props },
    );
  }

  /**
   * Add a typed edge between two user nodes.
   * Edge types: REPLIED_TO, REPOSTED, CO_TIMED, CO_NARRATIVE
   */
  async addEdge(
    fromHandle: string,
    fromPlatform: string,
    toHandle: string,
    toPlatform: string,
    type: string,
    properties?: Record<string, unknown>,
  ): Promise<void> {
    const props = properties ?? {};
    // Cypher doesn't allow parameterized relationship types, so we use APOC-style or
    // fixed types via CASE. For Memgraph compatibility, we use separate queries per type.
    const cypher = `
      MATCH (a:User {handle: $fromHandle, platform: $fromPlatform})
      MATCH (b:User {handle: $toHandle, platform: $toPlatform})
      MERGE (a)-[r:${this.sanitizeRelType(type)}]->(b)
      SET r += $props, r.updatedAt = timestamp()
    `;
    await this.runQuery(cypher, { fromHandle, fromPlatform, toHandle, toPlatform, props });
  }

  /**
   * Record that a user amplified a narrative at a given time.
   */
  async recordAmplification(
    handle: string,
    platform: string,
    narrativeId: string,
    timestamp: string,
  ): Promise<void> {
    await this.runQuery(
      `MATCH (u:User {handle: $handle, platform: $platform})
       MATCH (n:Narrative {narrativeId: $narrativeId})
       MERGE (u)-[r:AMPLIFIED]->(n)
       SET r.timestamp = $timestamp, r.updatedAt = timestamp()`,
      { handle, platform, narrativeId, timestamp },
    );
  }

  /**
   * Get PageRank scores for all users connected to a narrative.
   * Memgraph has built-in MAGE PageRank.
   */
  async getPageRankForNarrative(narrativeId: string): Promise<Map<string, number>> {
    const records = await this.runQuery(
      `MATCH (u:User)-[:AMPLIFIED]->(n:Narrative {narrativeId: $narrativeId})
       WITH COLLECT(u) AS users
       CALL pagerank.get(10, 0.85) YIELD node, rank
       WITH node, rank, users
       WHERE node IN users
       RETURN node.handle AS handle, node.platform AS platform, rank`,
      { narrativeId },
    );

    const scores = new Map<string, number>();
    for (const rec of records) {
      scores.set(String(rec['handle']), Number(rec['rank']) || 0);
    }
    return scores;
  }

  /**
   * Get betweenness centrality for users in the narrative subgraph.
   */
  async getBetweennessForNarrative(narrativeId: string): Promise<Map<string, number>> {
    const records = await this.runQuery(
      `MATCH (u:User)-[:AMPLIFIED]->(n:Narrative {narrativeId: $narrativeId})
       WITH COLLECT(u) AS users
       CALL betweenness_centrality.get(FALSE, FALSE) YIELD node, betweenness_centrality
       WITH node, betweenness_centrality, users
       WHERE node IN users
       RETURN node.handle AS handle, node.platform AS platform, betweenness_centrality AS betweenness`,
      { narrativeId },
    );

    const scores = new Map<string, number>();
    for (const rec of records) {
      scores.set(String(rec['handle']), Number(rec['betweenness']) || 0);
    }
    return scores;
  }

  /**
   * Detect communities using Memgraph's built-in community detection.
   * Returns a map of handle -> communityId.
   */
  async detectCommunities(narrativeId: string): Promise<Map<string, number>> {
    const records = await this.runQuery(
      `MATCH (u:User)-[:AMPLIFIED]->(n:Narrative {narrativeId: $narrativeId})
       WITH COLLECT(u) AS users
       CALL community_detection.get() YIELD node, community_id
       WITH node, community_id, users
       WHERE node IN users
       RETURN node.handle AS handle, node.platform AS platform, community_id`,
      { narrativeId },
    );

    const communities = new Map<string, number>();
    for (const rec of records) {
      communities.set(String(rec['handle']), Number(rec['community_id']) || 0);
    }
    return communities;
  }

  /**
   * Find structural patterns: stars, chains, cliques.
   */
  async detectStarPatterns(minSpokes = 5): Promise<Array<{ center: string; spokeCount: number }>> {
    const records = await this.runQuery(
      `MATCH (center:User)<-[r]-(spoke:User)
       WITH center, COUNT(DISTINCT spoke) AS spokeCount
       WHERE spokeCount >= $minSpokes
       RETURN center.handle AS center, spokeCount
       ORDER BY spokeCount DESC`,
      { minSpokes },
    );

    return records.map((r) => ({
      center: String(r['center']),
      spokeCount: Number(r['spokeCount']),
    }));
  }

  /**
   * Detect chain patterns: linear amplification paths.
   */
  async detectChainPatterns(minLength = 3): Promise<Array<{ chain: string[]; length: number }>> {
    const records = await this.runQuery(
      `MATCH path = (start:User)-[:REPOSTED|CO_TIMED*${minLength}..6]->(end:User)
       WHERE start <> end
       AND ALL(n IN nodes(path) WHERE SINGLE(m IN nodes(path) WHERE m = n))
       RETURN [n IN nodes(path) | n.handle] AS chain, length(path) AS length
       ORDER BY length DESC
       LIMIT 20`,
      {},
    );

    return records.map((r) => ({
      chain: r['chain'] as string[],
      length: Number(r['length']),
    }));
  }

  /**
   * Detect clique patterns: fully-connected subgraphs.
   */
  async detectCliquePatterns(minSize = 3): Promise<Array<{ members: string[] }>> {
    // Find triangles as a proxy for cliques (exact clique finding is expensive)
    const records = await this.runQuery(
      `MATCH (a:User)-[r1]->(b:User)-[r2]->(c:User)-[r3]->(a)
       WHERE a.handle < b.handle AND b.handle < c.handle
       RETURN COLLECT(DISTINCT [a.handle, b.handle, c.handle]) AS cliques
       LIMIT 50`,
      {},
    );

    if (records.length === 0) return [];

    const cliques = records[0]?.['cliques'];
    if (!Array.isArray(cliques)) return [];

    return cliques
      .filter((c: unknown) => Array.isArray(c) && c.length >= minSize)
      .map((c: string[]) => ({ members: c }));
  }

  // --------------------------------------------------------------------------
  // Social graph intelligence operations
  // --------------------------------------------------------------------------

  /**
   * Upsert an INTERACTS_WITH edge that accumulates across investigations.
   * Increments interactionCount, appends new interaction types, updates
   * lastSeen, appends investigationId, and recalculates weight.
   */
  async upsertInteraction(
    fromHandle: string,
    fromPlatform: string,
    toHandle: string,
    toPlatform: string,
    interactionType: string,
    metadata?: { investigationId?: string; sentiment?: number },
  ): Promise<void> {
    const now = new Date().toISOString();
    const investigationId = metadata?.investigationId ?? '';
    const sentiment = metadata?.sentiment ?? 0;

    await this.runQuery(
      `MERGE (a:User {handle: $fromHandle, platform: $fromPlatform})
       MERGE (b:User {handle: $toHandle, platform: $toPlatform})
       MERGE (a)-[r:INTERACTS_WITH]->(b)
       ON CREATE SET
         r.interactionCount = 1,
         r.interactionTypes = [$interactionType],
         r.investigationIds = CASE WHEN $investigationId = '' THEN [] ELSE [$investigationId] END,
         r.sentimentSum = $sentiment,
         r.firstSeen = $now,
         r.lastSeen = $now
       ON MATCH SET
         r.interactionCount = r.interactionCount + 1,
         r.interactionTypes = CASE
           WHEN $interactionType IN r.interactionTypes THEN r.interactionTypes
           ELSE r.interactionTypes + $interactionType
         END,
         r.investigationIds = CASE
           WHEN $investigationId = '' OR $investigationId IN r.investigationIds THEN r.investigationIds
           ELSE r.investigationIds + $investigationId
         END,
         r.sentimentSum = r.sentimentSum + $sentiment,
         r.lastSeen = $now`,
      {
        fromHandle,
        fromPlatform,
        toHandle,
        toPlatform,
        interactionType,
        investigationId,
        sentiment,
        now,
      },
    );
  }

  /**
   * Find the shortest path between two users via INTERACTS_WITH edges.
   */
  async findShortestPath(
    handleA: string,
    platformA: string,
    handleB: string,
    platformB: string,
  ): Promise<{ path: string[]; hops: number } | null> {
    const records = await this.runQuery(
      `MATCH (a:User {handle: $handleA, platform: $platformA}),
            (b:User {handle: $handleB, platform: $platformB})
       MATCH p = allShortestPaths((a)-[:INTERACTS_WITH*..10]-(b))
       RETURN [n IN nodes(p) | n.handle] AS path, length(p) AS hops
       LIMIT 1`,
      { handleA, platformA, handleB, platformB },
    );

    const rec = records[0];
    if (!rec) return null;

    return {
      path: rec['path'] as string[],
      hops: Number(rec['hops']),
    };
  }

  /**
   * Get neighbors of a user by tier, ordered by weight descending.
   */
  async getNeighborsByTier(
    handle: string,
    platform: string,
    maxTier: number,
    limit: number,
  ): Promise<Array<{ handle: string; platform: string; weight: number; tier: number }>> {
    const records = await this.runQuery(
      `MATCH (u:User {handle: $handle, platform: $platform})-[r:INTERACTS_WITH]-(neighbor:User)
       WHERE r.tier IS NOT NULL AND r.tier <= $maxTier
       RETURN neighbor.handle AS handle, neighbor.platform AS platform,
              COALESCE(r.weight, 0) AS weight, r.tier AS tier
       ORDER BY weight DESC
       LIMIT $limit`,
      { handle, platform, maxTier, limit },
    );

    return records.map((r) => ({
      handle: String(r['handle']),
      platform: String(r['platform']),
      weight: Number(r['weight']),
      tier: Number(r['tier']),
    }));
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  /**
   * Sanitize a relationship type name for safe Cypher interpolation.
   * Only allows uppercase letters, digits, and underscores.
   */
  private sanitizeRelType(type: string): string {
    return type.replace(/[^A-Z0-9_]/gi, '_').toUpperCase();
  }

  private async ensureIndexes(): Promise<void> {
    try {
      await this.runQuery('CREATE INDEX ON :User(handle)');
      await this.runQuery('CREATE INDEX ON :User(platform)');
      await this.runQuery('CREATE INDEX ON :Narrative(narrativeId)');
    } catch {
      // Indexes may already exist — that's fine
    }
  }
}
