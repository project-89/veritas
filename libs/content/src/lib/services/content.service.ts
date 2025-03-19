import { Injectable } from '@nestjs/common';
import { MemgraphService } from '@/database';
import { ContentNode, SourceNode } from '@veritas/shared';
import { ContentValidationService } from '../services/content-validation.service';
import { ContentClassificationService } from '../services/content-classification.service';

export interface ContentCreateInput {
  text: string;
  timestamp: Date;
  platform: string;
  sourceId: string;
  metadata?: Record<string, any>;
}

export interface ContentUpdateInput {
  text?: string;
  metadata?: Record<string, any>;
  engagementMetrics?: {
    likes?: number;
    shares?: number;
    comments?: number;
    reach?: number;
  };
}

export interface ContentSearchParams {
  query?: string;
  platform?: string;
  startDate?: Date;
  endDate?: Date;
  sourceId?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class ContentService {
  constructor(
    private readonly memgraphService: MemgraphService,
    private readonly validationService: ContentValidationService,
    private readonly classificationService: ContentClassificationService
  ) {}

  async createContent(input: ContentCreateInput): Promise<ContentNode> {
    // Validate input
    await this.validationService.validateContentInput(input);

    // Classify content
    const classification = await this.classificationService.classifyContent(
      input.text
    );

    // Create content node
    const contentNode = await this.memgraphService.createNode('Content', {
      ...input,
      classification,
      engagementMetrics: {
        likes: 0,
        shares: 0,
        comments: 0,
        reach: 0,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create relationship with source
    await this.memgraphService.createRelationship(
      input.sourceId,
      contentNode.id,
      'PUBLISHED',
      { timestamp: input.timestamp }
    );

    return contentNode;
  }

  async updateContent(
    id: string,
    input: ContentUpdateInput
  ): Promise<ContentNode> {
    // Validate update input
    await this.validationService.validateContentUpdate(input);

    // Get existing content
    const existingContent = await this.getContentById(id);
    if (!existingContent) {
      throw new Error('Content not found');
    }

    // If text is updated, reclassify
    let classification = existingContent.classification;
    if (input.text) {
      classification = await this.classificationService.classifyContent(
        input.text
      );
    }

    // Update content node
    const query = `
      MATCH (c:Content)
      WHERE c.id = $id
      SET c += $updates, c.updatedAt = datetime()
      RETURN c
    `;

    const result = await this.memgraphService.executeQuery(query, {
      id,
      updates: {
        ...input,
        classification,
      },
    });

    return result[0]?.c;
  }

  async getContentById(id: string): Promise<ContentNode | null> {
    const query = `
      MATCH (c:Content)
      WHERE c.id = $id
      RETURN c
    `;

    const result = await this.memgraphService.executeQuery(query, { id });
    return result[0]?.c || null;
  }

  async searchContent(params: ContentSearchParams): Promise<ContentNode[]> {
    let query = `
      MATCH (c:Content)
      WHERE 1=1
    `;

    const queryParams: Record<string, any> = {};

    if (params.platform) {
      query += ` AND c.platform = $platform`;
      queryParams.platform = params.platform;
    }

    if (params.startDate) {
      query += ` AND c.timestamp >= $startDate`;
      queryParams.startDate = params.startDate.toISOString();
    }

    if (params.endDate) {
      query += ` AND c.timestamp <= $endDate`;
      queryParams.endDate = params.endDate.toISOString();
    }

    if (params.sourceId) {
      query += ` AND EXISTS {
        MATCH (s:Source)-[:PUBLISHED]->(c)
        WHERE s.id = $sourceId
      }`;
      queryParams.sourceId = params.sourceId;
    }

    if (params.query) {
      query += ` AND c.text CONTAINS $query`;
      queryParams.query = params.query;
    }

    query += ` RETURN c`;

    if (params.limit) {
      query += ` LIMIT $limit`;
      queryParams.limit = params.limit;
    }

    if (params.offset) {
      query += ` SKIP $offset`;
      queryParams.offset = params.offset;
    }

    const result = await this.memgraphService.executeQuery(query, queryParams);
    return result.map((row) => row.c);
  }

  async deleteContent(id: string): Promise<boolean> {
    const query = `
      MATCH (c:Content)
      WHERE c.id = $id
      DETACH DELETE c
      RETURN count(*) as deleted
    `;

    const result = await this.memgraphService.executeQuery(query, { id });
    return result[0]?.deleted > 0;
  }

  async getRelatedContent(id: string, limit = 10): Promise<ContentNode[]> {
    const query = `
      MATCH (c:Content)-[:HAS_TOPIC]->(t:Topic)<-[:HAS_TOPIC]-(related:Content)
      WHERE c.id = $id AND related.id <> $id
      RETURN DISTINCT related
      LIMIT $limit
    `;

    const result = await this.memgraphService.executeQuery(query, {
      id,
      limit,
    });
    return result.map((row) => row.related);
  }

  async updateEngagementMetrics(
    id: string,
    metrics: ContentUpdateInput['engagementMetrics']
  ): Promise<ContentNode> {
    const query = `
      MATCH (c:Content)
      WHERE c.id = $id
      SET c.engagementMetrics = $metrics, c.updatedAt = datetime()
      RETURN c
    `;

    const result = await this.memgraphService.executeQuery(query, {
      id,
      metrics,
    });

    return result[0]?.c;
  }
}
