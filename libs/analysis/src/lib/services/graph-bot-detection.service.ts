import { Injectable, Logger } from '@nestjs/common';
import type { UserPost } from './deep-investigation.service';
import { GraphDatabaseService } from './graph-database.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BotScore {
  handle: string;
  platform: string;
  /**
   * Combined bot probability 0-1 (higher = more likely bot), or `null` when
   * there was too little data to assess. NULL IS NOT ZERO: a user with a
   * handful of posts and no graph signal is "unknown", not "clean human".
   */
  botProbability: number | null;
  /** Structural anomaly score from graph patterns */
  structuralScore: number;
  /** Temporal anomaly score from posting behavior */
  temporalScore: number;
  /** Behavioral anomaly score from content patterns */
  behavioralScore: number;
  /** Specific patterns detected */
  detectedPatterns: string[];
  /** Number of posts the score was computed from. */
  postsAnalyzed: number;
  /** Whether there was enough data to produce a meaningful score. */
  dataSufficiency: 'sufficient' | 'insufficient';
  /** 0-1 confidence in `botProbability` (scales with post volume / signals). */
  confidence: number;
}

/**
 * Minimum own-post history for the temporal + behavioral cadence/content
 * signals to carry meaning. Below this, per-user scoring is noise unless the
 * graph supplies a cross-account structural signal.
 */
const MIN_POSTS_FOR_BEHAVIORAL_SCORING = 10;

export interface BotDetectionResult {
  /** Per-user bot scores */
  scores: BotScore[];
  /** Structural patterns found in the graph */
  structuralPatterns: StructuralPattern[];
  /** Overall assessment */
  summary: string;
  /** Whether graph-based detection was used (vs heuristic-only) */
  graphEnhanced: boolean;
}

export interface StructuralPattern {
  type: 'star' | 'chain' | 'clique';
  members: string[];
  description: string;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Graph-based bot detection service.
 *
 * Inspired by BotSim/BotLGT AAAI 2025 research:
 * - Heterogeneous edge types (reply, repost, co-timing, co-narrative)
 * - Structural anomalies (star patterns, chains, cliques)
 * - Temporal-structural convergence
 *
 * Falls back to heuristic-only when Memgraph is unavailable.
 */
@Injectable()
export class GraphBotDetectionService {
  private readonly logger = new Logger(GraphBotDetectionService.name);

  constructor(private readonly graph: GraphDatabaseService) {}

  /**
   * Run bot detection on a set of users.
   */
  async detectBots(
    users: Array<{ handle: string; platform: string; posts: UserPost[] }>,
    options?: { narrativeId?: string; investigationId?: string },
  ): Promise<BotDetectionResult> {
    const graphAvailable = this.graph.isAvailable;

    // Step 1: Build the heterogeneous graph in Memgraph (if available)
    if (graphAvailable) {
      await this.buildHeterogeneousGraph(users, options);
    }

    // Step 2: Compute per-user scores
    const scores: BotScore[] = [];
    for (const user of users) {
      const score = await this.scoreUser(user, graphAvailable);
      scores.push(score);
    }

    // Step 3: Detect structural patterns (graph-only)
    let structuralPatterns: StructuralPattern[] = [];
    if (graphAvailable) {
      structuralPatterns = await this.detectStructuralPatterns();
    } else {
      // Heuristic structural detection without graph
      structuralPatterns = this.detectHeuristicPatterns(users);
    }

    // Step 4: Boost scores for users involved in structural patterns. A user
    // that was previously insufficient (no own-post signal) becomes assessable
    // once a structural pattern implicates it.
    for (const pattern of structuralPatterns) {
      for (const score of scores) {
        if (pattern.members.includes(score.handle)) {
          score.structuralScore = Math.min(1, score.structuralScore + pattern.confidence * 0.3);
          score.detectedPatterns.push(`Part of ${pattern.type} pattern: ${pattern.description}`);
          if (score.dataSufficiency === 'insufficient' && score.structuralScore > 0) {
            score.dataSufficiency = 'sufficient';
            score.confidence = Math.max(score.confidence, 0.3);
          }
        }
      }
    }

    // Recompute combined probability after structural boost
    for (const score of scores) {
      score.botProbability = this.combineProbabilities(score);
    }

    // Sort by bot probability (most suspicious first); abstained (null) users last.
    scores.sort((a, b) => (b.botProbability ?? -1) - (a.botProbability ?? -1));

    // Summary — count only users we could actually assess.
    const assessed = scores.filter((s) => s.botProbability !== null);
    const insufficientCount = scores.length - assessed.length;
    const highProbCount = assessed.filter((s) => (s.botProbability ?? 0) > 0.7).length;
    const medProbCount = assessed.filter(
      (s) => (s.botProbability ?? 0) > 0.4 && (s.botProbability ?? 0) <= 0.7,
    ).length;

    const summary = [
      `Assessed ${assessed.length}/${users.length} users`,
      graphAvailable ? ' with graph-enhanced detection' : ' with heuristic-only detection',
      `— ${highProbCount} high-probability bot(s)`,
      medProbCount > 0 ? `, ${medProbCount} medium-probability` : '',
      insufficientCount > 0 ? `, ${insufficientCount} with insufficient data to score` : '',
      structuralPatterns.length > 0
        ? `, ${structuralPatterns.length} structural pattern(s) found`
        : '',
    ].join('');

    return {
      scores,
      structuralPatterns,
      summary,
      graphEnhanced: graphAvailable,
    };
  }

  // --------------------------------------------------------------------------
  // Graph construction
  // --------------------------------------------------------------------------

  /**
   * Build a heterogeneous graph with multiple edge types:
   * - CO_TIMED: posted within 5 minutes of each other
   * - CO_NARRATIVE: posted about the same topic
   * - SIMILAR_CONTENT: near-identical post text
   */
  private async buildHeterogeneousGraph(
    users: Array<{ handle: string; platform: string; posts: UserPost[] }>,
    options?: { narrativeId?: string; investigationId?: string },
  ): Promise<void> {
    // Upsert all users
    for (const user of users) {
      await this.graph.upsertUser(user.handle, user.platform, {
        postCount: user.posts.length,
      });
    }

    const CO_TIME_WINDOW_MS = 5 * 60 * 1000;

    // Build edges between all user pairs
    for (let i = 0; i < users.length; i++) {
      for (let j = i + 1; j < users.length; j++) {
        const userA = users[i];
        const userB = users[j];
        if (!userA || !userB) {
          continue;
        }

        // CO_TIMED: posts within 5 minutes
        let coTimedCount = 0;
        for (const postA of userA.posts) {
          for (const postB of userB.posts) {
            const delta = Math.abs(
              new Date(postA.timestamp).getTime() - new Date(postB.timestamp).getTime(),
            );
            if (delta <= CO_TIME_WINDOW_MS) {
              coTimedCount++;
            }
          }
        }
        const edgeMeta: Record<string, unknown> = {};
        if (options?.narrativeId) edgeMeta['narrativeId'] = options.narrativeId;
        if (options?.investigationId) edgeMeta['investigationId'] = options.investigationId;

        if (coTimedCount > 0) {
          await this.graph.addEdge(
            userA.handle,
            userA.platform,
            userB.handle,
            userB.platform,
            'CO_TIMED',
            { count: coTimedCount, ...edgeMeta },
          );
        }

        // SIMILAR_CONTENT: posts with very similar text
        const similarCount = this.countSimilarPosts(userA.posts, userB.posts);
        if (similarCount > 0) {
          await this.graph.addEdge(
            userA.handle,
            userA.platform,
            userB.handle,
            userB.platform,
            'SIMILAR_CONTENT',
            { count: similarCount, ...edgeMeta },
          );
        }

        // CO_NARRATIVE: always connected since they're in the same investigation
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
  }

  // --------------------------------------------------------------------------
  // Per-user scoring
  // --------------------------------------------------------------------------

  private async scoreUser(
    user: { handle: string; platform: string; posts: UserPost[] },
    graphAvailable: boolean,
  ): Promise<BotScore> {
    const temporalScore = this.computeTemporalScore(user.posts);
    const behavioralScore = this.computeBehavioralScore(user.posts);

    let structuralScore = 0;
    if (graphAvailable) {
      structuralScore = await this.computeGraphStructuralScore(user.handle, user.platform);
    }

    const detectedPatterns: string[] = [];

    // Temporal patterns
    if (temporalScore > 0.6) {
      const specifics = this.getTemporalPatternDetails(user.posts);
      detectedPatterns.push(...specifics);
    }

    // Behavioral patterns
    if (behavioralScore > 0.6) {
      const specifics = this.getBehavioralPatternDetails(user.posts);
      detectedPatterns.push(...specifics);
    }

    const postsAnalyzed = user.posts.length;
    const hasStructuralSignal = structuralScore > 0;
    const enoughPosts = postsAnalyzed >= MIN_POSTS_FOR_BEHAVIORAL_SCORING;
    // Sufficient if we have enough own-post history OR a cross-account graph
    // signal. Otherwise we abstain rather than emit a misleading 0.
    const sufficient = enoughPosts || hasStructuralSignal;

    const score: BotScore = {
      handle: user.handle,
      platform: user.platform,
      botProbability: null,
      structuralScore,
      temporalScore,
      behavioralScore,
      detectedPatterns,
      postsAnalyzed,
      dataSufficiency: sufficient ? 'sufficient' : 'insufficient',
      // Confidence scales with post volume; structural-only evidence is low.
      confidence: sufficient ? (enoughPosts ? Math.min(1, postsAnalyzed / 30) : 0.3) : 0,
    };

    score.botProbability = this.combineProbabilities(score);
    return score;
  }

  // --------------------------------------------------------------------------
  // Temporal analysis (heuristic, no graph needed)
  // --------------------------------------------------------------------------

  /**
   * Compute temporal anomaly score.
   * Measures: burst patterns, regularity, 24h coverage, inter-post intervals.
   */
  computeTemporalScore(posts: UserPost[]): number {
    if (posts.length < 3) return 0;

    let score = 0;
    const timestamps = posts.map((p) => new Date(p.timestamp).getTime()).sort((a, b) => a - b);

    // 1. Burst detection: many posts in a very short window
    const burstScore = this.detectBurstiness(timestamps);
    score += burstScore * 0.3;

    // 2. Regularity: machine-like fixed intervals
    const regularityScore = this.detectMachineRegularity(timestamps);
    score += regularityScore * 0.3;

    // 3. 24h coverage: posting at all hours (no sleep)
    const hourCoverage = this.detect24hCoverage(posts);
    score += hourCoverage * 0.2;

    // 4. Weekend/weekday uniformity (bots don't rest)
    const weekendScore = this.detectWeekendActivity(posts);
    score += weekendScore * 0.2;

    return Math.min(1, score);
  }

  private detectBurstiness(timestamps: number[]): number {
    if (timestamps.length < 5) return 0;

    let burstCount = 0;
    for (let i = 0; i < timestamps.length - 4; i++) {
      const start = timestamps[i];
      const end = timestamps[i + 4];
      if (start === undefined || end === undefined) {
        continue;
      }
      const windowMinutes = (end - start) / (1000 * 60);
      if (windowMinutes < 2) {
        burstCount++;
      }
    }

    return Math.min(1, burstCount / 3);
  }

  private detectMachineRegularity(timestamps: number[]): number {
    if (timestamps.length < 5) return 0;

    const intervals: number[] = [];
    for (let i = 1; i < timestamps.length; i++) {
      const previous = timestamps[i - 1];
      const current = timestamps[i];
      if (previous === undefined || current === undefined) {
        continue;
      }
      intervals.push(current - previous);
    }

    // Check if intervals are suspiciously uniform
    const mean = intervals.reduce((s, v) => s + v, 0) / intervals.length;
    if (mean === 0) return 1; // All at same time = very suspicious

    const deviations = intervals.map((i) => Math.abs(i - mean) / mean);
    const avgDeviation = deviations.reduce((s, v) => s + v, 0) / deviations.length;

    // Very low deviation = machine-like regularity
    if (avgDeviation < 0.05) return 1.0;
    if (avgDeviation < 0.1) return 0.8;
    if (avgDeviation < 0.2) return 0.5;
    return 0;
  }

  private detect24hCoverage(posts: UserPost[]): number {
    if (posts.length < 10) return 0;

    const hours = new Set(posts.map((p) => new Date(p.timestamp).getUTCHours()));
    // 24 hours covered = very suspicious
    const coverage = hours.size / 24;
    if (coverage > 0.85) return 1.0;
    if (coverage > 0.7) return 0.5;
    return 0;
  }

  private detectWeekendActivity(posts: UserPost[]): number {
    if (posts.length < 10) return 0;

    let weekendCount = 0;

    for (const post of posts) {
      const day = new Date(post.timestamp).getUTCDay();
      if (day === 0 || day === 6) {
        weekendCount++;
      }
    }

    // Expected ratio: ~2/5 weekend, ~5/7 weekday
    const expectedWeekendRatio = 2 / 7;
    const actualWeekendRatio = weekendCount / posts.length;

    // If weekend activity is nearly identical to weekday = suspicious uniformity
    const deviation = Math.abs(actualWeekendRatio - expectedWeekendRatio);
    if (deviation < 0.02 && posts.length >= 20) return 0.8;
    return 0;
  }

  // --------------------------------------------------------------------------
  // Behavioral analysis (heuristic, no graph needed)
  // --------------------------------------------------------------------------

  /**
   * Compute behavioral anomaly score.
   * Measures: content repetition, engagement anomalies, sentiment uniformity.
   */
  computeBehavioralScore(posts: UserPost[]): number {
    if (posts.length < 3) return 0;

    let score = 0;

    // 1. Content repetition
    const repetitionScore = this.detectContentRepetition(posts);
    score += repetitionScore * 0.4;

    // 2. Engagement anomalies (zero engagement on many posts)
    const engagementScore = this.detectEngagementAnomalies(posts);
    score += engagementScore * 0.3;

    // 3. Sentiment uniformity (real humans vary more)
    const sentimentScore = this.detectSentimentUniformity(posts);
    score += sentimentScore * 0.3;

    return Math.min(1, score);
  }

  private detectContentRepetition(posts: UserPost[]): number {
    const normalizedTexts = posts.map((p) => p.text.toLowerCase().trim().slice(0, 100));
    const uniqueTexts = new Set(normalizedTexts);
    const uniqueRatio = uniqueTexts.size / normalizedTexts.length;

    // Less than 50% unique = very repetitive
    if (uniqueRatio < 0.3) return 1.0;
    if (uniqueRatio < 0.5) return 0.7;
    if (uniqueRatio < 0.7) return 0.3;
    return 0;
  }

  private detectEngagementAnomalies(posts: UserPost[]): number {
    const zeroEngagement = posts.filter(
      (p) => p.engagement.likes === 0 && p.engagement.comments === 0 && p.engagement.shares === 0,
    ).length;

    const zeroRatio = zeroEngagement / posts.length;
    if (zeroRatio > 0.8) return 0.8;
    if (zeroRatio > 0.5) return 0.4;
    return 0;
  }

  private detectSentimentUniformity(posts: UserPost[]): number {
    if (posts.length < 5) return 0;

    const sentiments = posts.map((p) => p.sentiment.score);
    const mean = sentiments.reduce((s, v) => s + v, 0) / sentiments.length;
    const variance = sentiments.reduce((s, v) => s + (v - mean) ** 2, 0) / sentiments.length;

    // Very low variance in sentiment = possible automation
    if (variance < 0.01) return 0.7;
    if (variance < 0.05) return 0.3;
    return 0;
  }

  // --------------------------------------------------------------------------
  // Graph-based structural scoring
  // --------------------------------------------------------------------------

  private async computeGraphStructuralScore(handle: string, platform: string): Promise<number> {
    // Count how many CO_TIMED and SIMILAR_CONTENT edges this user has
    const records = await this.graph.runQuery(
      `MATCH (u:User {handle: $handle, platform: $platform})-[r:CO_TIMED|SIMILAR_CONTENT]-(other:User)
       RETURN type(r) AS relType, COUNT(other) AS cnt`,
      { handle, platform },
    );

    let score = 0;
    for (const rec of records) {
      const relType = String(rec['relType']);
      const count = Number(rec['cnt']);

      if (relType === 'CO_TIMED') {
        // Many co-timed connections = suspicious
        score += Math.min(0.5, count * 0.1);
      }
      if (relType === 'SIMILAR_CONTENT') {
        // Sharing similar content with many users = suspicious
        score += Math.min(0.5, count * 0.15);
      }
    }

    return Math.min(1, score);
  }

  // --------------------------------------------------------------------------
  // Structural pattern detection
  // --------------------------------------------------------------------------

  private async detectStructuralPatterns(): Promise<StructuralPattern[]> {
    const patterns: StructuralPattern[] = [];

    // Star patterns
    const stars = await this.graph.detectStarPatterns(4);
    for (const star of stars) {
      patterns.push({
        type: 'star',
        members: [star.center],
        description: `@${star.center} is connected to ${star.spokeCount} other users (star hub)`,
        confidence: Math.min(0.9, star.spokeCount / 10),
      });
    }

    // Chain patterns
    const chains = await this.graph.detectChainPatterns(3);
    for (const chain of chains) {
      patterns.push({
        type: 'chain',
        members: chain.chain,
        description: `Linear amplification chain of ${chain.length} users: ${chain.chain.join(' -> ')}`,
        confidence: Math.min(0.8, chain.length / 5),
      });
    }

    // Clique patterns
    const cliques = await this.graph.detectCliquePatterns(3);
    for (const clique of cliques) {
      patterns.push({
        type: 'clique',
        members: clique.members,
        description: `Fully connected group of ${clique.members.length} users: ${clique.members.join(', ')}`,
        confidence: Math.min(0.9, clique.members.length / 5),
      });
    }

    return patterns;
  }

  /**
   * Heuristic structural detection without the graph database.
   * Detects coordination based on temporal and content signals only.
   */
  private detectHeuristicPatterns(
    users: Array<{ handle: string; platform: string; posts: UserPost[] }>,
  ): StructuralPattern[] {
    const patterns: StructuralPattern[] = [];
    const CO_TIME_WINDOW_MS = 5 * 60 * 1000;

    // Build co-timing matrix
    const coTimedPairs: Array<[string, string, number]> = [];
    for (let i = 0; i < users.length; i++) {
      for (let j = i + 1; j < users.length; j++) {
        const userA = users[i];
        const userB = users[j];
        if (!userA || !userB) {
          continue;
        }

        let coTimedCount = 0;
        for (const postA of userA.posts) {
          for (const postB of userB.posts) {
            const delta = Math.abs(
              new Date(postA.timestamp).getTime() - new Date(postB.timestamp).getTime(),
            );
            if (delta <= CO_TIME_WINDOW_MS) {
              coTimedCount++;
            }
          }
        }
        if (coTimedCount >= 2) {
          coTimedPairs.push([userA.handle, userB.handle, coTimedCount]);
        }
      }
    }

    // Find users with many co-timed connections (star-like pattern)
    const connectionCounts = new Map<string, number>();
    for (const [a, b] of coTimedPairs) {
      connectionCounts.set(a, (connectionCounts.get(a) ?? 0) + 1);
      connectionCounts.set(b, (connectionCounts.get(b) ?? 0) + 1);
    }

    for (const [handle, count] of connectionCounts) {
      if (count >= 3) {
        patterns.push({
          type: 'star',
          members: [handle],
          description: `@${handle} posted within 5min of ${count} other users (possible coordination hub)`,
          confidence: Math.min(0.7, count / 8),
        });
      }
    }

    // Find groups of users all co-timed with each other (clique-like)
    if (coTimedPairs.length >= 3) {
      const allHandlesInPairs = new Set(coTimedPairs.flatMap(([a, b]) => [a, b]));
      if (allHandlesInPairs.size >= 3 && allHandlesInPairs.size <= 8) {
        patterns.push({
          type: 'clique',
          members: Array.from(allHandlesInPairs),
          description: `${allHandlesInPairs.size} users with overlapping posting times (possible coordinated group)`,
          confidence: Math.min(0.6, allHandlesInPairs.size / 10),
        });
      }
    }

    // Detect similar content without graph
    for (let i = 0; i < users.length; i++) {
      for (let j = i + 1; j < users.length; j++) {
        const userA = users[i];
        const userB = users[j];
        if (!userA || !userB) {
          continue;
        }

        const similar = this.countSimilarPosts(userA.posts, userB.posts);
        if (similar >= 2) {
          patterns.push({
            type: 'chain',
            members: [userA.handle, userB.handle],
            description: `@${userA.handle} and @${userB.handle} share ${similar} near-identical posts`,
            confidence: Math.min(0.8, similar / 5),
          });
        }
      }
    }

    return patterns;
  }

  // --------------------------------------------------------------------------
  // Pattern detail helpers
  // --------------------------------------------------------------------------

  private getTemporalPatternDetails(posts: UserPost[]): string[] {
    const details: string[] = [];
    const timestamps = posts.map((p) => new Date(p.timestamp).getTime()).sort((a, b) => a - b);

    // Check for bursts
    for (let i = 0; i < timestamps.length - 4; i++) {
      const start = timestamps[i];
      const end = timestamps[i + 4];
      if (start === undefined || end === undefined) {
        continue;
      }
      const windowMinutes = (end - start) / (1000 * 60);
      if (windowMinutes < 2) {
        details.push('5+ posts within 2 minutes detected');
        break;
      }
    }

    // Check for 24h coverage
    const hours = new Set(posts.map((p) => new Date(p.timestamp).getUTCHours()));
    if (hours.size >= 20) {
      details.push(`Posts span ${hours.size}/24 hours — no apparent sleep cycle`);
    }

    return details;
  }

  private getBehavioralPatternDetails(posts: UserPost[]): string[] {
    const details: string[] = [];

    const normalizedTexts = posts.map((p) => p.text.toLowerCase().trim().slice(0, 100));
    const uniqueTexts = new Set(normalizedTexts);
    if (uniqueTexts.size < normalizedTexts.length * 0.5) {
      details.push(`Only ${uniqueTexts.size}/${normalizedTexts.length} unique post texts`);
    }

    const zeroEngagement = posts.filter(
      (p) => p.engagement.likes === 0 && p.engagement.comments === 0 && p.engagement.shares === 0,
    ).length;
    if (zeroEngagement > posts.length * 0.5) {
      details.push(`${zeroEngagement}/${posts.length} posts have zero engagement`);
    }

    return details;
  }

  // --------------------------------------------------------------------------
  // Utility
  // --------------------------------------------------------------------------

  /**
   * Count near-identical posts between two users.
   * Uses simple normalized text comparison.
   */
  private countSimilarPosts(postsA: UserPost[], postsB: UserPost[]): number {
    let count = 0;
    const normalizedA = postsA.map((p) =>
      p.text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
        .slice(0, 100),
    );
    const normalizedB = new Set(
      postsB.map((p) =>
        p.text
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .trim()
          .slice(0, 100),
      ),
    );

    for (const textA of normalizedA) {
      if (textA.length > 20 && normalizedB.has(textA)) {
        count++;
      }
    }

    return count;
  }

  private combineProbabilities(score: BotScore): number | null {
    // Abstain when there wasn't enough data — never launder "unknown" into 0.
    if (score.dataSufficiency === 'insufficient') {
      return null;
    }
    // Weighted combination: structural gets more weight when graph is available
    const hasGraph = score.structuralScore > 0;
    if (hasGraph) {
      return score.temporalScore * 0.3 + score.behavioralScore * 0.3 + score.structuralScore * 0.4;
    }
    return score.temporalScore * 0.5 + score.behavioralScore * 0.5;
  }
}
