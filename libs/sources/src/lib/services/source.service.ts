import { Injectable } from "@nestjs/common";
import { MemgraphService } from "@/database";
import { SourceNode } from "@/schemas/base.schema";
import { SourceValidationService } from "../services/source-validation.service";

export interface SourceCreateInput {
  name: string;
  platform: "twitter" | "facebook" | "reddit" | "other";
  credibilityScore?: number;
  verificationStatus?: "verified" | "unverified" | "disputed";
  metadata?: Record<string, any>;
}

export interface SourceUpdateInput {
  name?: string;
  credibilityScore?: number;
  verificationStatus?: "verified" | "unverified" | "disputed";
  metadata?: Record<string, any>;
}

export interface SourceSearchParams {
  query?: string;
  platform?: string;
  verificationStatus?: "verified" | "unverified" | "disputed";
  minCredibilityScore?: number;
  limit?: number;
  offset?: number;
}

@Injectable()
export class SourceService {
  constructor(
    private readonly memgraphService: MemgraphService,
    private readonly validationService: SourceValidationService
  ) {}

  async createSource(input: SourceCreateInput): Promise<SourceNode> {
    // Validate input
    await this.validationService.validateSourceInput(input);

    // Create source node
    const sourceNode = await this.memgraphService.createNode("Source", {
      ...input,
      credibilityScore: input.credibilityScore || 0.5,
      verificationStatus: input.verificationStatus || "unverified",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return sourceNode;
  }

  async updateSource(
    id: string,
    input: SourceUpdateInput
  ): Promise<SourceNode> {
    // Validate update input
    await this.validationService.validateSourceUpdate(input);

    // Get existing source
    const existingSource = await this.getSourceById(id);
    if (!existingSource) {
      throw new Error("Source not found");
    }

    // Update source node
    const query = `
      MATCH (s:Source)
      WHERE s.id = $id
      SET s += $updates, s.updatedAt = datetime()
      RETURN s
    `;

    const result = await this.memgraphService.executeQuery(query, {
      id,
      updates: input,
    });

    return result[0]?.s;
  }

  async getSourceById(id: string): Promise<SourceNode | null> {
    const query = `
      MATCH (s:Source)
      WHERE s.id = $id
      RETURN s
    `;

    const result = await this.memgraphService.executeQuery(query, { id });
    return result[0]?.s || null;
  }

  async searchSources(params: SourceSearchParams): Promise<SourceNode[]> {
    let query = `
      MATCH (s:Source)
      WHERE 1=1
    `;

    const queryParams: Record<string, any> = {};

    if (params.platform) {
      query += ` AND s.platform = $platform`;
      queryParams.platform = params.platform;
    }

    if (params.verificationStatus) {
      query += ` AND s.verificationStatus = $verificationStatus`;
      queryParams.verificationStatus = params.verificationStatus;
    }

    if (params.minCredibilityScore !== undefined) {
      query += ` AND s.credibilityScore >= $minCredibilityScore`;
      queryParams.minCredibilityScore = params.minCredibilityScore;
    }

    if (params.query) {
      query += ` AND s.name CONTAINS $query`;
      queryParams.query = params.query;
    }

    query += `
      RETURN s
      ORDER BY s.credibilityScore DESC
      SKIP $offset
      LIMIT $limit
    `;

    queryParams.offset = params.offset || 0;
    queryParams.limit = params.limit || 50;

    const result = await this.memgraphService.executeQuery(query, queryParams);
    return result.map((row) => row.s);
  }

  async deleteSource(id: string): Promise<boolean> {
    const query = `
      MATCH (s:Source)
      WHERE s.id = $id
      DETACH DELETE s
      RETURN count(s) as deleted
    `;

    const result = await this.memgraphService.executeQuery(query, { id });
    return result[0]?.deleted > 0;
  }

  async getSourceContent(id: string, limit: number = 10): Promise<any[]> {
    const query = `
      MATCH (s:Source { id: $id })-[:PUBLISHED]->(c:Content)
      RETURN c
      ORDER BY c.timestamp DESC
      LIMIT $limit
    `;

    const result = await this.memgraphService.executeQuery(query, {
      id,
      limit,
    });
    return result.map((row) => row.c);
  }

  async updateCredibilityScore(id: string, score: number): Promise<SourceNode> {
    if (score < 0 || score > 1) {
      throw new Error("Credibility score must be between 0 and 1");
    }

    const existingSource = await this.getSourceById(id);
    if (!existingSource) {
      throw new Error("Source not found");
    }

    const query = `
      MATCH (s:Source)
      WHERE s.id = $id
      SET s.credibilityScore = $score,
          s.updatedAt = datetime()
      RETURN s
    `;

    const result = await this.memgraphService.executeQuery(query, {
      id,
      score,
    });

    return result[0]?.s;
  }

  async calculateAggregateCredibility(id: string): Promise<number> {
    const query = `
      MATCH (s:Source { id: $id })-[:PUBLISHED]->(c:Content)
      WITH s, 
           count(c) as contentCount,
           avg(c.engagementMetrics.viralityScore) as avgVirality,
           sum(case when c.classification.sentiment = 'positive' then 1 else 0 end) * 1.0 / count(c) as positiveSentimentRatio
      RETURN 
        (s.credibilityScore * 0.4 + 
         coalesce(avgVirality, 0) * 0.3 + 
         coalesce(positiveSentimentRatio, 0.5) * 0.3) as aggregateScore
    `;

    const result = await this.memgraphService.executeQuery(query, { id });
    return result[0]?.aggregateScore || 0.5;
  }
}
