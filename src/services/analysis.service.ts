import { Injectable } from "@nestjs/common";
import { MemgraphService } from "@/database";
import { z } from "zod";
import { ContentNode, SourceNode } from "@/schemas/base.schema";

const DeviationMetricsSchema = z.object({
  baselineScore: z.number().min(0).max(1),
  deviationMagnitude: z.number(),
  propagationVelocity: z.number(),
  crossReferenceScore: z.number(),
  sourceCredibility: z.number().min(0).max(1),
  impactScore: z.number(),
});

const TimeFrameSchema = z.object({
  start: z.date(),
  end: z.date(),
});

const PatternSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["organic", "coordinated", "automated"]),
  confidence: z.number().min(0).max(1),
  nodes: z.array(z.string().uuid()),
  edges: z.array(z.string().uuid()),
  timeframe: TimeFrameSchema,
});

type DeviationMetrics = z.infer<typeof DeviationMetricsSchema>;
type TimeFrame = z.infer<typeof TimeFrameSchema>;
type Pattern = z.infer<typeof PatternSchema>;

interface PropagationMetrics {
  velocity: number;
  reach: number;
  engagement: number;
  crossPlatformSpread: number;
}

interface CrossReferenceMetrics {
  verifiedSourceCount: number;
  contradictionCount: number;
  supportingEvidenceCount: number;
  totalReferences: number;
}

@Injectable()
export class AnalysisService {
  constructor(private readonly memgraphService: MemgraphService) {}

  async measureRealityDeviation(
    narrativeId: string
  ): Promise<DeviationMetrics> {
    // Get narrative content and related data
    const content = await this.getNarrativeContent(narrativeId);
    if (!content) {
      throw new Error(`Narrative content not found for ID: ${narrativeId}`);
    }

    // Calculate baseline metrics
    const sourceId = await this.getContentSourceId(content.id);
    if (!sourceId) {
      throw new Error(`Source not found for content ID: ${content.id}`);
    }

    const sourceCredibility = await this.calculateSourceCredibility(sourceId);
    const propagationMetrics = await this.analyzePropagation(content);
    const crossReferenceMetrics = await this.analyzeCrossReferences(content);
    const temporalPatterns = await this.analyzeTemporalPatterns({
      start: new Date(content.timestamp),
      end: new Date(),
    });

    // Calculate deviation metrics
    const baselineScore = this.calculateBaselineScore(
      sourceCredibility,
      crossReferenceMetrics
    );

    const deviationMagnitude = this.calculateDeviationMagnitude(
      baselineScore,
      propagationMetrics,
      crossReferenceMetrics
    );

    const impactScore = this.calculateImpactScore(
      deviationMagnitude,
      propagationMetrics,
      temporalPatterns
    );

    return {
      baselineScore,
      deviationMagnitude,
      propagationVelocity: propagationMetrics.velocity,
      crossReferenceScore: this.calculateCrossReferenceScore(
        crossReferenceMetrics
      ),
      sourceCredibility,
      impactScore,
    };
  }

  async detectPatterns(timeframe: TimeFrame): Promise<Pattern[]> {
    const patterns: Pattern[] = [];

    // Get all content and interactions within timeframe
    const query = `
      MATCH (n)-[r]->(m)
      WHERE r.timestamp >= $start AND r.timestamp <= $end
      RETURN n, r, m
    `;

    const result = await this.memgraphService.executeQuery(query, {
      start: timeframe.start.toISOString(),
      end: timeframe.end.toISOString(),
    });

    // Group interactions by source and target
    const interactions = this.groupInteractions(result);

    // Detect coordinated patterns
    const coordinatedPatterns = await this.detectCoordinatedPatterns(
      interactions,
      timeframe
    );
    patterns.push(...coordinatedPatterns);

    // Detect automated patterns
    const automatedPatterns = await this.detectAutomatedPatterns(
      interactions,
      timeframe
    );
    patterns.push(...automatedPatterns);

    // Detect organic patterns
    const organicPatterns = await this.detectOrganicPatterns(
      interactions,
      timeframe
    );
    patterns.push(...organicPatterns);

    return patterns;
  }

  private async getNarrativeContent(
    narrativeId: string
  ): Promise<ContentNode | null> {
    const query = `
      MATCH (c:Content)
      WHERE c.id = $narrativeId
      RETURN c
    `;
    const result = await this.memgraphService.executeQuery(query, {
      narrativeId,
    });
    return result[0]?.c || null;
  }

  private async analyzePropagation(
    content: ContentNode
  ): Promise<PropagationMetrics> {
    const query = `
      MATCH (c:Content {id: $contentId})<-[r]-(a)
      WITH c, r, a, duration.between(c.timestamp, r.timestamp) as timeDiff
      RETURN 
        count(r) as shareCount,
        sum(r.reach) as totalReach,
        sum(r.engagement) as totalEngagement,
        count(DISTINCT a.platform) as platformCount,
        min(timeDiff) as firstShare,
        max(timeDiff) as lastShare
    `;

    const result = await this.memgraphService.executeQuery(query, {
      contentId: content.id,
    });

    const data = result[0];
    const timeSpan = data.lastShare - data.firstShare;
    const velocity = timeSpan > 0 ? data.shareCount / timeSpan : 0;

    return {
      velocity,
      reach: data.totalReach || 0,
      engagement: data.totalEngagement || 0,
      crossPlatformSpread: data.platformCount || 1,
    };
  }

  private async analyzeCrossReferences(
    content: ContentNode
  ): Promise<CrossReferenceMetrics> {
    const query = `
      MATCH (c:Content {id: $contentId})-[r:REFERENCED_BY]->(ref:Content)
      WITH c, ref, r
      MATCH (ref)<-[:PUBLISHED]-(s:Source)
      RETURN 
        count(DISTINCT CASE WHEN s.verificationStatus = 'verified' THEN s END) as verifiedSources,
        count(DISTINCT CASE WHEN r.type = 'contradiction' THEN ref END) as contradictions,
        count(DISTINCT CASE WHEN r.type = 'support' THEN ref END) as supporting,
        count(DISTINCT ref) as total
    `;

    const result = await this.memgraphService.executeQuery(query, {
      contentId: content.id,
    });

    const data = result[0];
    return {
      verifiedSourceCount: data.verifiedSources || 0,
      contradictionCount: data.contradictions || 0,
      supportingEvidenceCount: data.supporting || 0,
      totalReferences: data.total || 0,
    };
  }

  private async detectCoordinatedPatterns(
    interactions: any[],
    timeframe: TimeFrame
  ): Promise<Pattern[]> {
    const patterns: Pattern[] = [];
    const timeWindows = this.createTimeWindows(timeframe, 3600000); // 1-hour windows

    for (const window of timeWindows) {
      const windowInteractions = interactions.filter(
        (i) => i.timestamp >= window.start && i.timestamp <= window.end
      );

      const clusters = this.findInteractionClusters(windowInteractions);

      for (const cluster of clusters) {
        if (this.isCoordinatedPattern(cluster)) {
          patterns.push({
            id: crypto.randomUUID(),
            type: "coordinated",
            confidence: this.calculatePatternConfidence(cluster),
            nodes: cluster.nodes,
            edges: cluster.edges,
            timeframe: window,
          });
        }
      }
    }

    return patterns;
  }

  private async detectAutomatedPatterns(
    interactions: any[],
    timeframe: TimeFrame
  ): Promise<Pattern[]> {
    const patterns: Pattern[] = [];
    const accounts = this.extractUniqueAccounts(interactions);

    for (const account of accounts) {
      const accountInteractions = interactions.filter(
        (i) => i.source === account || i.target === account
      );

      if (this.isAutomatedBehavior(accountInteractions)) {
        patterns.push({
          id: crypto.randomUUID(),
          type: "automated",
          confidence: this.calculateAutomationConfidence(accountInteractions),
          nodes: [account],
          edges: accountInteractions.map((i) => i.id),
          timeframe,
        });
      }
    }

    return patterns;
  }

  private async detectOrganicPatterns(
    interactions: any[],
    timeframe: TimeFrame
  ): Promise<Pattern[]> {
    const patterns: Pattern[] = [];
    const contentGroups = this.groupInteractionsByContent(interactions);

    for (const [contentId, group] of contentGroups.entries()) {
      if (this.isOrganicSpread(group)) {
        patterns.push({
          id: crypto.randomUUID(),
          type: "organic",
          confidence: this.calculateOrganicConfidence(group),
          nodes: this.extractNodesFromGroup(group),
          edges: group.map((i) => i.id),
          timeframe,
        });
      }
    }

    return patterns;
  }

  private calculateBaselineScore(
    sourceCredibility: number,
    crossReferenceMetrics: CrossReferenceMetrics
  ): number {
    const {
      verifiedSourceCount,
      contradictionCount,
      supportingEvidenceCount,
      totalReferences,
    } = crossReferenceMetrics;

    if (totalReferences === 0) return sourceCredibility;

    const verifiedRatio = verifiedSourceCount / totalReferences;
    const contradictionRatio = contradictionCount / totalReferences;
    const supportRatio = supportingEvidenceCount / totalReferences;

    return (
      sourceCredibility * 0.4 +
      verifiedRatio * 0.3 +
      (1 - contradictionRatio) * 0.2 +
      supportRatio * 0.1
    );
  }

  private calculateDeviationMagnitude(
    baselineScore: number,
    propagationMetrics: PropagationMetrics,
    crossReferenceMetrics: CrossReferenceMetrics
  ): number {
    const propagationFactor = Math.min(
      1,
      (propagationMetrics.velocity * propagationMetrics.crossPlatformSpread) /
        100
    );

    const contradictionImpact =
      crossReferenceMetrics.contradictionCount /
      (crossReferenceMetrics.totalReferences || 1);

    return (
      (Math.abs(1 - baselineScore) *
        (propagationFactor + contradictionImpact)) /
      2
    );
  }

  private calculateCrossReferenceScore(metrics: CrossReferenceMetrics): number {
    if (metrics.totalReferences === 0) return 0;

    const verifiedRatio = metrics.verifiedSourceCount / metrics.totalReferences;
    const contradictionRatio =
      metrics.contradictionCount / metrics.totalReferences;
    const supportRatio =
      metrics.supportingEvidenceCount / metrics.totalReferences;

    return (
      verifiedRatio * 0.4 + (1 - contradictionRatio) * 0.4 + supportRatio * 0.2
    );
  }

  private calculateImpactScore(
    deviationMagnitude: number,
    propagationMetrics: PropagationMetrics,
    temporalPatterns: Map<string, number>
  ): number {
    const reachFactor = Math.min(1, propagationMetrics.reach / 1000000);
    const engagementFactor = Math.min(1, propagationMetrics.engagement / 10000);
    const spreadFactor = Math.min(
      1,
      propagationMetrics.crossPlatformSpread / 5
    );

    const temporalImpact =
      Array.from(temporalPatterns.values()).reduce(
        (sum, value) => sum + value,
        0
      ) / temporalPatterns.size;

    return (
      deviationMagnitude * 0.3 +
      reachFactor * 0.25 +
      engagementFactor * 0.25 +
      spreadFactor * 0.1 +
      temporalImpact * 0.1
    );
  }

  private isCoordinatedPattern(cluster: any): boolean {
    const timeThreshold = 300000; // 5 minutes
    const minActions = 5;
    const minAccounts = 3;

    return (
      cluster.actions.length >= minActions &&
      cluster.accounts.size >= minAccounts &&
      this.calculateTimeSpread(cluster.actions) <= timeThreshold
    );
  }

  private isAutomatedBehavior(interactions: any[]): boolean {
    const regularityScore = this.calculateInteractionRegularity(interactions);
    const velocityScore = this.calculateInteractionVelocity(interactions);
    const contentVarietyScore = this.calculateContentVariety(interactions);

    return (
      regularityScore > 0.8 || velocityScore > 0.9 || contentVarietyScore < 0.2
    );
  }

  private isOrganicSpread(interactions: any[]): boolean {
    const timeSpread = this.calculateTimeSpread(interactions);
    const accountDiversity = this.calculateAccountDiversity(interactions);
    const engagementDistribution =
      this.calculateEngagementDistribution(interactions);

    return (
      timeSpread > 3600000 && // More than 1 hour
      accountDiversity > 0.7 &&
      engagementDistribution > 0.6
    );
  }

  private calculatePatternConfidence(cluster: any): number {
    const timeScore = Math.min(
      1,
      300000 / this.calculateTimeSpread(cluster.actions)
    );
    const accountScore = Math.min(1, cluster.accounts.size / 10);
    const actionScore = Math.min(1, cluster.actions.length / 20);

    return (timeScore + accountScore + actionScore) / 3;
  }

  private calculateAutomationConfidence(interactions: any[]): number {
    const regularityScore = this.calculateInteractionRegularity(interactions);
    const velocityScore = this.calculateInteractionVelocity(interactions);
    const contentVarietyScore = this.calculateContentVariety(interactions);

    return (
      regularityScore * 0.4 +
      velocityScore * 0.4 +
      (1 - contentVarietyScore) * 0.2
    );
  }

  private calculateOrganicConfidence(interactions: any[]): number {
    const timeSpread = this.calculateTimeSpread(interactions);
    const accountDiversity = this.calculateAccountDiversity(interactions);
    const engagementDistribution =
      this.calculateEngagementDistribution(interactions);

    return (
      Math.min(1, timeSpread / 86400000) * 0.4 + // Normalize to 24 hours
      accountDiversity * 0.3 +
      engagementDistribution * 0.3
    );
  }

  private calculateTimeSpread(interactions: any[]): number {
    const timestamps = interactions.map((i) => new Date(i.timestamp).getTime());
    return Math.max(...timestamps) - Math.min(...timestamps);
  }

  private calculateInteractionRegularity(interactions: any[]): number {
    const intervals = this.calculateInteractionIntervals(interactions);
    const stdDev = this.calculateStandardDeviation(intervals);
    const mean = this.calculateMean(intervals);

    return mean > 0 ? 1 - stdDev / mean : 0;
  }

  private calculateInteractionVelocity(interactions: any[]): number {
    const timeSpread = this.calculateTimeSpread(interactions);
    return timeSpread > 0 ? interactions.length / (timeSpread / 1000) : 0;
  }

  private calculateContentVariety(interactions: any[]): number {
    const uniqueContent = new Set(interactions.map((i) => i.contentId));
    return uniqueContent.size / interactions.length;
  }

  private calculateAccountDiversity(interactions: any[]): number {
    const accounts = new Set(interactions.map((i) => i.accountId));
    return accounts.size / interactions.length;
  }

  private calculateEngagementDistribution(interactions: any[]): number {
    const engagements = interactions.map((i) => i.engagement);
    const stdDev = this.calculateStandardDeviation(engagements);
    const mean = this.calculateMean(engagements);

    return mean > 0 ? 1 - stdDev / mean : 0;
  }

  private calculateMean(values: number[]): number {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private calculateStandardDeviation(values: number[]): number {
    const mean = this.calculateMean(values);
    const squareDiffs = values.map((value) => Math.pow(value - mean, 2));
    return Math.sqrt(this.calculateMean(squareDiffs));
  }

  private createTimeWindows(
    timeframe: TimeFrame,
    windowSize: number
  ): TimeFrame[] {
    const windows: TimeFrame[] = [];
    let currentStart = timeframe.start;

    while (currentStart < timeframe.end) {
      const windowEnd = new Date(
        Math.min(currentStart.getTime() + windowSize, timeframe.end.getTime())
      );

      windows.push({
        start: currentStart,
        end: windowEnd,
      });

      currentStart = windowEnd;
    }

    return windows;
  }

  private groupInteractions(queryResult: any[]): any[] {
    return queryResult.map((row) => ({
      id: row.r.id,
      source: row.n.id,
      target: row.m.id,
      type: row.r.type,
      timestamp: new Date(row.r.timestamp),
      properties: row.r.properties,
    }));
  }

  private groupInteractionsByContent(interactions: any[]): Map<string, any[]> {
    const groups = new Map<string, any[]>();

    for (const interaction of interactions) {
      const contentId = interaction.target;
      if (!groups.has(contentId)) {
        groups.set(contentId, []);
      }
      groups.get(contentId)!.push(interaction);
    }

    return groups;
  }

  private extractUniqueAccounts(interactions: any[]): string[] {
    const accounts = new Set<string>();

    for (const interaction of interactions) {
      if (interaction.source.type === "account")
        accounts.add(interaction.source);
      if (interaction.target.type === "account")
        accounts.add(interaction.target);
    }

    return Array.from(accounts);
  }

  private extractNodesFromGroup(group: any[]): string[] {
    const nodes = new Set<string>();

    for (const interaction of group) {
      nodes.add(interaction.source);
      nodes.add(interaction.target);
    }

    return Array.from(nodes);
  }

  private async calculateSourceCredibility(sourceId: string): Promise<number> {
    // TODO: Implement source credibility calculation
    // 1. Historical accuracy analysis
    // 2. Expert verification status
    // 3. Cross-reference frequency
    return 0.9;
  }

  private async analyzeTemporalPatterns(
    timeframe: TimeFrame
  ): Promise<Map<string, number>> {
    const query = `
      MATCH (c:Content)-[r]-(n)
      WHERE r.timestamp >= $start AND r.timestamp <= $end
      WITH c, r, n,
           duration.between(c.timestamp, r.timestamp) as timeDiff,
           datetime($start) as startTime,
           datetime($end) as endTime
      WITH c,
           count(r) as interactionCount,
           avg(timeDiff) as avgTimeDiff,
           stddev(timeDiff) as stdDevTimeDiff
      RETURN c.id as contentId,
             interactionCount,
             avgTimeDiff,
             stdDevTimeDiff
    `;

    const result = await this.memgraphService.executeQuery(query, {
      start: timeframe.start.toISOString(),
      end: timeframe.end.toISOString(),
    });

    const patterns = new Map<string, number>();

    for (const row of result) {
      const temporalScore = this.calculateTemporalScore(
        row.interactionCount,
        row.avgTimeDiff,
        row.stdDevTimeDiff
      );
      patterns.set(row.contentId, temporalScore);
    }

    return patterns;
  }

  private calculateTemporalScore(
    interactionCount: number,
    avgTimeDiff: number,
    stdDevTimeDiff: number
  ): number {
    // Normalize interaction count (assuming 1000 is a high number of interactions)
    const normalizedCount = Math.min(1, interactionCount / 1000);

    // Convert time differences to hours for better scaling
    const avgTimeInHours = avgTimeDiff / (1000 * 60 * 60);
    const stdDevInHours = stdDevTimeDiff / (1000 * 60 * 60);

    // Calculate temporal consistency (lower std dev relative to mean indicates more consistent pattern)
    const consistency =
      avgTimeInHours > 0 ? 1 - stdDevInHours / avgTimeInHours : 0;

    // Calculate temporal density (higher interaction count in shorter time period)
    const density =
      avgTimeInHours > 0 ? normalizedCount / Math.min(24, avgTimeInHours) : 0;

    // Combine metrics with weights
    return (
      normalizedCount * 0.4 +
      Math.max(0, consistency) * 0.3 +
      Math.min(1, density) * 0.3
    );
  }

  private async getContentSourceId(contentId: string): Promise<string | null> {
    const query = `
      MATCH (c:Content {id: $contentId})<-[:PUBLISHED]-(s:Source)
      RETURN s.id as sourceId
    `;
    const result = await this.memgraphService.executeQuery(query, {
      contentId,
    });
    return result[0]?.sourceId || null;
  }

  private findInteractionClusters(interactions: any[]): any[] {
    const clusters: any[] = [];
    const processed = new Set<string>();

    for (const interaction of interactions) {
      if (processed.has(interaction.id)) continue;

      const cluster = {
        actions: [interaction],
        accounts: new Set([interaction.source, interaction.target]),
        nodes: [interaction.source, interaction.target],
        edges: [interaction.id],
      };

      // Find related interactions within time window
      const relatedInteractions = interactions.filter(
        (i) =>
          !processed.has(i.id) &&
          Math.abs(i.timestamp.getTime() - interaction.timestamp.getTime()) <=
            300000 && // 5 minutes
          (i.source === interaction.source ||
            i.target === interaction.target ||
            i.source === interaction.target ||
            i.target === interaction.source)
      );

      for (const related of relatedInteractions) {
        cluster.actions.push(related);
        cluster.accounts.add(related.source);
        cluster.accounts.add(related.target);
        cluster.nodes.push(related.source, related.target);
        cluster.edges.push(related.id);
        processed.add(related.id);
      }

      clusters.push(cluster);
      processed.add(interaction.id);
    }

    return clusters;
  }

  private calculateInteractionIntervals(interactions: any[]): number[] {
    if (interactions.length < 2) return [0];

    const sortedInteractions = [...interactions].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    const intervals: number[] = [];
    for (let i = 1; i < sortedInteractions.length; i++) {
      intervals.push(
        sortedInteractions[i].timestamp.getTime() -
          sortedInteractions[i - 1].timestamp.getTime()
      );
    }

    return intervals;
  }
}
