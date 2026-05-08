import { Injectable } from '@nestjs/common';
import { MemgraphProvider } from '@veritas/database';
import { ContentNode, SourceNode } from '@veritas/shared';
import { SourceValidationService } from '../services/source-validation.service';

/**
 * Extended Memgraph service interface with graph-specific methods
 */
interface MemgraphService {
  createNode(label: string, properties: Record<string, unknown>): Promise<SourceNode>;
  executeQuery(
    query: string,
    params?: Record<string, unknown>,
  ): Promise<Array<Record<string, unknown>>>;
}

interface SourceRow {
  s?: SourceNode;
  deleted?: number;
  aggregateScore?: number;
}

interface ContentRow {
  c?: ContentNode;
}

export interface SourceCreateInput {
  name: string;
  platform: 'twitter' | 'facebook' | 'reddit' | 'other';
  credibilityScore?: number;
  verificationStatus?: 'verified' | 'unverified' | 'disputed';
  metadata?: Record<string, unknown>;
}

export interface SourceUpdateInput {
  name?: string;
  credibilityScore?: number;
  verificationStatus?: 'verified' | 'unverified' | 'disputed';
  metadata?: Record<string, unknown>;
}

export interface SourceSearchParams {
  query?: string;
  platform?: string;
  verificationStatus?: 'verified' | 'unverified' | 'disputed';
  minCredibilityScore?: number;
  limit?: number;
  offset?: number;
}

@Injectable()
export class SourceService {
  constructor(
    private readonly memgraphService: MemgraphProvider & MemgraphService,
    private readonly validationService: SourceValidationService,
  ) {}

  async createSource(input: SourceCreateInput): Promise<SourceNode> {
    // Validate input
    await this.validationService.validateSourceInput(input);

    // Create source node
    const sourceNode = await this.memgraphService.createNode('Source', {
      ...input,
      credibilityScore: input.credibilityScore || 0.5,
      verificationStatus: input.verificationStatus || 'unverified',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return sourceNode;
  }

  async updateSource(id: string, input: SourceUpdateInput): Promise<SourceNode> {
    // Validate update input
    await this.validationService.validateSourceUpdate(input);

    // Get existing source
    const existingSource = await this.getSourceById(id);
    if (!existingSource) {
      throw new Error('Source not found');
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

    return (result[0] as SourceRow | undefined)?.s as SourceNode;
  }

  async getSourceById(id: string): Promise<SourceNode | null> {
    const query = `
      MATCH (s:Source)
      WHERE s.id = $id
      RETURN s
    `;

    const result = await this.memgraphService.executeQuery(query, { id });
    return (result[0] as SourceRow | undefined)?.s ?? null;
  }

  async searchSources(params: SourceSearchParams): Promise<SourceNode[]> {
    let query = `
      MATCH (s:Source)
      WHERE 1=1
    `;

    const queryParams: Record<string, unknown> = {};

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
    return result
      .map((row) => (row as SourceRow).s)
      .filter((source): source is SourceNode => source !== undefined);
  }

  async deleteSource(id: string): Promise<boolean> {
    const query = `
      MATCH (s:Source)
      WHERE s.id = $id
      DETACH DELETE s
      RETURN count(s) as deleted
    `;

    const result = await this.memgraphService.executeQuery(query, { id });
    return (((result[0] as SourceRow | undefined)?.deleted ?? 0) as number) > 0;
  }

  async getSourceContent(id: string, limit = 10): Promise<ContentNode[]> {
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
    return result
      .map((row) => (row as ContentRow).c)
      .filter((content): content is ContentNode => content !== undefined);
  }

  async updateCredibilityScore(id: string, score: number): Promise<SourceNode> {
    if (score < 0 || score > 1) {
      throw new Error('Credibility score must be between 0 and 1');
    }

    const existingSource = await this.getSourceById(id);
    if (!existingSource) {
      throw new Error('Source not found');
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

    return (result[0] as SourceRow | undefined)?.s as SourceNode;
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
    return (result[0] as SourceRow | undefined)?.aggregateScore ?? 0.5;
  }
}
