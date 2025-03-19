/**
 * Mock implementation of ContentStorageService
 * This avoids external dependencies and provides a simplified version for testing
 */

/**
 * Simplified ContentNode for mock implementation
 */
export interface MockContentNode {
  id: string;
  text: string;
  timestamp: Date;
  platform: string;
  [key: string]: any;
}

/**
 * Simplified SourceNode for mock implementation
 */
export interface MockSourceNode {
  id: string;
  name: string;
  platform: string;
  verificationStatus?: string;
  [key: string]: any;
}

/**
 * Mock implementation of ContentStorageService that doesn't rely on external dependencies
 */
export class MockContentStorageService {
  private readonly kafkaClient: any;
  private readonly memgraphService: any;
  private readonly redisService: any;

  constructor(kafkaClient: any, memgraphService: any, redisService: any) {
    this.kafkaClient = kafkaClient;
    this.memgraphService = memgraphService;
    this.redisService = redisService;
  }

  /**
   * Initialize the service
   */
  async onModuleInit() {
    // Subscribe to topics
    const topics = ['content.created', 'content.updated', 'source.verified'];
    topics.forEach((topic) => this.kafkaClient.subscribeToResponseOf(topic));
    await this.kafkaClient.connect();

    console.warn(
      'WARNING: Using deprecated ContentStorageService. Consider migrating to NarrativeRepository.'
    );
  }

  /**
   * Store content and source in the database
   */
  async ingestContent(content: MockContentNode, source: MockSourceNode) {
    try {
      console.warn(
        'WARNING: Using deprecated method that stores raw data. Consider migrating to transform-on-ingest.'
      );

      // Store in graph database
      const contentNode = await this.memgraphService.createNode(
        'Content',
        content
      );
      const sourceNode = await this.memgraphService.createNode(
        'Source',
        source
      );

      // Create relationship
      await this.memgraphService.createRelationship(
        sourceNode.id,
        contentNode.id,
        'PUBLISHED',
        { timestamp: new Date().toISOString() }
      );

      // Cache as stringified JSON
      await this.redisService.setHash(`content:${content.id}`, {
        data: JSON.stringify({
          ...content,
          sourceId: source.id,
        }),
      });

      // Emit event for analysis
      await this.kafkaClient.emit('content.created', {
        content,
        source,
        timestamp: new Date(),
      });

      return { contentNode, sourceNode };
    } catch (error) {
      console.error('Error ingesting content:', error);
      throw error;
    }
  }

  /**
   * Update content
   */
  async updateContent(contentId: string, updates: Partial<MockContentNode>) {
    try {
      // Update graph database
      const query = `
        MATCH (c:Content)
        WHERE c.id = $contentId
        SET c += $updates
        RETURN c
      `;
      const result = await this.memgraphService.executeQuery(query, {
        contentId,
        updates,
      });

      // Update cache with stringified data
      const cached = await this.redisService.getHash(`content:${contentId}`);
      if (cached?.data) {
        const existingData = JSON.parse(cached.data);
        await this.redisService.setHash(`content:${contentId}`, {
          data: JSON.stringify({
            ...existingData,
            ...updates,
          }),
        });
      }

      // Emit update event
      await this.kafkaClient.emit('content.updated', {
        contentId,
        updates,
        timestamp: new Date(),
      });

      return result[0]?.c;
    } catch (error) {
      console.error('Error updating content:', error);
      throw error;
    }
  }

  /**
   * Verify a source's status
   */
  async verifySource(
    sourceId: string,
    verificationStatus: 'verified' | 'unverified' | 'suspicious'
  ) {
    try {
      // Update graph database
      const query = `
        MATCH (s:Source)
        WHERE s.id = $sourceId
        SET s.verificationStatus = $verificationStatus,
            s.verifiedAt = $timestamp
        RETURN s
      `;
      const result = await this.memgraphService.executeQuery(query, {
        sourceId,
        verificationStatus,
        timestamp: new Date().toISOString(),
      });

      // Emit verification event
      await this.kafkaClient.emit('source.verified', {
        sourceId,
        verificationStatus,
        timestamp: new Date(),
      });

      return result[0]?.s;
    } catch (error) {
      console.error('Error verifying source:', error);
      throw error;
    }
  }
}
