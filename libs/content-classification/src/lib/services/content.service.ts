import { Injectable } from '@nestjs/common';
import { ContentNode } from '@veritas/shared/types';
import {
  ContentValidationService,
  ContentCreateInput,
  ContentUpdateInput,
} from './content-validation.service';
import {
  ContentClassificationService,
  ContentClassification,
} from './content-classification.service';

export interface ContentSearchParams {
  query?: string;
  platform?: string;
  startDate?: Date;
  endDate?: Date;
  sourceId?: string;
  limit?: number;
  offset?: number;
}

// Extended ContentNode with classification field
export interface ExtendedContentNode extends ContentNode {
  classification?: ContentClassification;
}

// We use an interface because the actual implementation depends on the database module
export interface DatabaseService {
  createNode(label: string, data: any): Promise<any>;
  createRelationship(
    sourceId: string,
    targetId: string,
    type: string,
    data?: any
  ): Promise<any>;
  executeQuery(query: string, params?: Record<string, any>): Promise<any[]>;
}

@Injectable()
export class ContentService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly validationService: ContentValidationService,
    private readonly classificationService: ContentClassificationService
  ) {}

  async createContent(input: ContentCreateInput): Promise<ExtendedContentNode> {
    // Validate input
    await this.validationService.validateContentInput(input);

    // Classify content
    const classification = await this.classificationService.classifyContent(
      input.text
    );

    // Create content node
    const contentNode = await this.dbService.createNode('Content', {
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
    await this.dbService.createRelationship(
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
  ): Promise<ExtendedContentNode> {
    // Validate update input
    await this.validationService.validateContentUpdate(input);

    // Get existing content
    const existingContent = await this.getContentById(id);
    if (!existingContent) {
      throw new Error('Content not found');
    }

    // If text is updated, reclassify
    let classification =
      existingContent.classification ||
      (await this.classificationService.classifyContent(''));
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

    const result = await this.dbService.executeQuery(query, {
      id,
      updates: {
        ...input,
        classification,
      },
    });

    return result[0]?.c;
  }

  async getContentById(id: string): Promise<ExtendedContentNode | null> {
    const query = `
      MATCH (c:Content)
      WHERE c.id = $id
      RETURN c
    `;

    const result = await this.dbService.executeQuery(query, { id });
    return result[0]?.c || null;
  }

  async searchContent(
    params: ContentSearchParams
  ): Promise<ExtendedContentNode[]> {
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

    const result = await this.dbService.executeQuery(query, queryParams);
    return result.map((row) => row.c);
  }

  async deleteContent(id: string): Promise<boolean> {
    const query = `
      MATCH (c:Content)
      WHERE c.id = $id
      DETACH DELETE c
      RETURN count(*) as deleted
    `;

    const result = await this.dbService.executeQuery(query, { id });
    return result[0]?.deleted > 0;
  }

  async getRelatedContent(
    id: string,
    limit = 10
  ): Promise<ExtendedContentNode[]> {
    const query = `
      MATCH (c:Content)-[:HAS_TOPIC]->(t:Topic)<-[:HAS_TOPIC]-(related:Content)
      WHERE c.id = $id AND related.id <> $id
      RETURN DISTINCT related
      LIMIT $limit
    `;

    const result = await this.dbService.executeQuery(query, { id, limit });
    return result.map((row) => row.related);
  }
}
