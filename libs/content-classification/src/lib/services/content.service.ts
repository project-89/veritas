import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import {
  ContentCreateInput,
  ContentUpdateInput,
} from './content-validation.service';
import { ContentModel } from '../schemas/content.schema';
import { DATABASE_PROVIDER_TOKEN } from '../constants';
import {
  EmbeddingsService,
  EmbeddingVector,
  VectorSearchOptions,
} from './embeddings.service';
import { VectorSearchResult } from '../../index';
import { CONTENT_COLLECTION_NAME } from '../models/content.model';

// Use type-only imports to avoid module resolution issues
// This only imports the TypeScript types, not the actual implementation
type DatabaseService = any;
type Repository<T> = any;

// Define ContentClassification interface locally to avoid importing from service with franc-min dependency
interface ContentClassification {
  categories: string[];
  sentiment: {
    score: number;
    label: 'positive' | 'negative' | 'neutral';
    confidence: number;
  };
  toxicity: number;
  subjectivity: number;
  language: string;
  topics: string[];
  entities: Array<{
    text: string;
    type: string;
    confidence: number;
  }>;
}

// Content node with classification data
export interface ExtendedContentNode {
  id: string;
  text: string;
  timestamp: Date;
  platform: string;
  engagementMetrics: {
    likes: number;
    shares: number;
    comments: number;
    reach: number;
  };
  classification: {
    categories: string[];
    sentiment: string;
    toxicity: number;
    subjectivity: number;
    language: string;
    topics: string[];
    entities: Array<{ text: string; type: string; confidence: number }>;
  };
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// Search parameters for content queries
export interface ContentSearchParams {
  query?: string;
  platform?: string;
  startDate?: Date;
  endDate?: Date;
  sourceId?: string;
  limit?: number;
  offset?: number;
  semanticQuery?: string; // For semantic search
  minScore?: number; // For similarity threshold
}

/**
 * Service for content storage and retrieval
 */
@Injectable()
export class ContentService implements OnModuleInit {
  private readonly logger = new Logger(ContentService.name);
  private contentRepository: Repository<ExtendedContentNode>;
  private initialized = false;

  constructor(
    @Inject('ContentClassificationService')
    private readonly classificationService: any,
    @Optional()
    @Inject(DATABASE_PROVIDER_TOKEN)
    private readonly databaseService?: DatabaseService,
    @Optional()
    private readonly embeddingsService?: EmbeddingsService
  ) {}

  /**
   * Initialize the service when the module is loaded
   */
  async onModuleInit(): Promise<void> {
    if (this.databaseService) {
      await this.initialize();
    } else {
      this.logger.warn(
        'No database service provided to ContentService - database operations will not be available'
      );
    }
  }

  /**
   * Initialize the content repository
   */
  private async initialize(): Promise<void> {
    try {
      if (!this.databaseService) {
        throw new Error('Database service required but not provided');
      }

      // Check if the database is connected
      if (!this.databaseService.isConnected()) {
        this.logger.debug('Database not connected, attempting to connect...');
        await this.databaseService.connect();
      }

      // Register the content model with the database
      try {
        this.logger.debug('Registering Content model with database...');
        this.databaseService.registerModel('Content', ContentModel);
        this.logger.debug('Content model registered successfully');
      } catch (error) {
        this.logger.warn(
          'Content model registration issue',
          error instanceof Error ? error.message : String(error)
        );
        // Continue as the model might already be registered
      }

      // Get the repository
      this.contentRepository = this.databaseService.getRepository('Content');
      this.initialized = true;
      this.logger.log('Content repository initialized successfully');
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(
        `Failed to initialize content repository: ${errorMessage}`,
        errorStack
      );
      throw error;
    }
  }

  /**
   * Check if the service is properly initialized with a database connection
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.databaseService) {
      throw new Error(
        'ContentService not initialized with database - use ContentClassificationModule.forRoot() with a database configuration'
      );
    }
  }

  /**
   * Adapt the ContentClassification object to the format expected by ExtendedContentNode
   */
  private adaptClassification(
    classification: ContentClassification
  ): ExtendedContentNode['classification'] {
    return {
      categories: classification.categories,
      sentiment: classification.sentiment.label,
      toxicity: classification.toxicity,
      subjectivity: classification.subjectivity,
      language: classification.language,
      topics: classification.topics,
      entities: classification.entities,
    };
  }

  /**
   * Create new content with classification
   * @param input Content creation input
   */
  async createContent(input: ContentCreateInput): Promise<ExtendedContentNode> {
    this.ensureInitialized();

    try {
      // Classify the content
      this.logger.debug(
        `Classifying content: "${input.text.substring(0, 50)}..."`
      );
      const classification = await this.classificationService.classifyContent(
        input.text
      );

      // Prepare the content object
      const content: Partial<ExtendedContentNode> = {
        text: input.text,
        timestamp: input.timestamp,
        platform: input.platform,
        engagementMetrics: {
          likes: 0,
          shares: 0,
          comments: 0,
          reach: 0,
        },
        classification: this.adaptClassification(classification),
        metadata: input.metadata || {},
      };

      // Save to database
      this.logger.debug('Saving content to database...');
      const createdContent = await this.contentRepository.create(content);
      this.logger.debug(`Created content with ID: ${createdContent.id}`);
      return createdContent;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(`Error creating content: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  /**
   * Get content by ID
   * @param id Content ID
   */
  async getContentById(id: string): Promise<ExtendedContentNode | null> {
    this.ensureInitialized();

    try {
      this.logger.debug(`Finding content by ID: ${id}`);
      const content = await this.contentRepository.findById(id);
      if (!content) {
        this.logger.debug(`Content with ID ${id} not found`);
      }
      return content;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(
        `Error finding content by ID ${id}: ${errorMessage}`,
        errorStack
      );
      throw error;
    }
  }

  /**
   * Search for content based on various parameters
   * @param params Search parameters
   */
  async searchContent(
    params: ContentSearchParams
  ): Promise<ExtendedContentNode[]> {
    this.ensureInitialized();

    try {
      this.logger.debug(
        `Searching content with params: ${JSON.stringify(params)}`
      );
      const filter: Record<string, any> = {};

      // Apply filters based on provided parameters
      if (params.platform) {
        filter.platform = params.platform;
      }

      if (params.sourceId) {
        filter.id = { $regex: new RegExp(`^${params.sourceId}-`) };
      }

      if (params.startDate || params.endDate) {
        filter.timestamp = {};
        if (params.startDate) {
          filter.timestamp.$gte = params.startDate;
        }
        if (params.endDate) {
          filter.timestamp.$lte = params.endDate;
        }
      }

      // Text search is handled differently depending on database
      if (params.query) {
        filter.$text = { $search: params.query };
      }

      const contents = await this.contentRepository.find(filter, {
        skip: params.offset || 0,
        limit: params.limit || 20,
        sort: { timestamp: -1 },
      });

      this.logger.debug(
        `Found ${contents.length} content items matching search criteria`
      );
      return contents;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(`Error searching content: ${errorMessage}`, errorStack);
      throw error;
    }
  }

  /**
   * Update content
   * @param id Content ID
   * @param input Update data
   */
  async updateContent(
    id: string,
    input: ContentUpdateInput
  ): Promise<ExtendedContentNode | null> {
    this.ensureInitialized();

    try {
      this.logger.debug(`Updating content ID: ${id}`);

      // Get existing content to update metrics correctly
      const existingContent = await this.getContentById(id);
      if (!existingContent) {
        this.logger.warn(
          `Attempted to update non-existent content with ID: ${id}`
        );
        return null;
      }

      // If text is updated, reclassify
      let classificationUpdate = undefined;
      if (input.text) {
        this.logger.debug(
          `Reclassifying updated content text: "${input.text.substring(
            0,
            50
          )}..."`
        );
        const classification = await this.classificationService.classifyContent(
          input.text
        );
        classificationUpdate = this.adaptClassification(classification);
      }

      // Prepare the update
      const update: Partial<ExtendedContentNode> = {};

      if (input.text) {
        update.text = input.text;
        update.classification = classificationUpdate;
      }

      if (input.metadata) {
        update.metadata = { ...existingContent.metadata, ...input.metadata };
      }

      if (input.engagementMetrics) {
        // Create a complete engagementMetrics object by merging with existing values
        update.engagementMetrics = {
          likes:
            input.engagementMetrics.likes ??
            existingContent.engagementMetrics.likes,
          shares:
            input.engagementMetrics.shares ??
            existingContent.engagementMetrics.shares,
          comments:
            input.engagementMetrics.comments ??
            existingContent.engagementMetrics.comments,
          reach:
            input.engagementMetrics.reach ??
            existingContent.engagementMetrics.reach,
        };
      }

      this.logger.debug(`Applying update to content ID: ${id}`);
      const updatedContent = await this.contentRepository.updateById(
        id,
        update
      );
      if (updatedContent) {
        this.logger.debug(`Successfully updated content with ID: ${id}`);
      }
      return updatedContent;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(
        `Error updating content ${id}: ${errorMessage}`,
        errorStack
      );
      throw error;
    }
  }

  /**
   * Delete content by ID
   * @param id Content ID
   */
  async deleteContent(id: string): Promise<boolean> {
    this.ensureInitialized();

    try {
      this.logger.debug(`Deleting content ID: ${id}`);
      const result = await this.contentRepository.deleteById(id);
      if (result) {
        this.logger.debug(`Successfully deleted content with ID: ${id}`);
        return true;
      }
      this.logger.debug(`Content with ID ${id} not found for deletion`);
      return false;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(
        `Error deleting content ${id}: ${errorMessage}`,
        errorStack
      );
      throw error;
    }
  }

  /**
   * Get related content based on classification similarities
   * @param id Content ID
   * @param limit Maximum number of results to return
   */
  async getRelatedContent(
    id: string,
    limit = 5
  ): Promise<ExtendedContentNode[]> {
    this.ensureInitialized();

    try {
      this.logger.debug(`Finding related content for ID: ${id}`);

      // Get the source content
      const content = await this.getContentById(id);
      if (!content) {
        this.logger.warn(
          `Attempted to find related content for non-existent ID: ${id}`
        );
        return [];
      }

      // Get content with similar topics, excluding the source
      const filter: Record<string, any> = {
        id: { $ne: id },
        'classification.topics': { $in: content.classification.topics },
      };

      const relatedContent = await this.contentRepository.find(filter, {
        limit: limit,
        sort: { timestamp: -1 },
      });

      this.logger.debug(
        `Found ${relatedContent.length} related content items for ID: ${id}`
      );
      return relatedContent;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(
        `Error finding related content for ${id}: ${errorMessage}`,
        errorStack
      );
      throw error;
    }
  }

  /**
   * Generate embedding for a content item
   * @param contentId ID of the content to generate embedding for
   * @returns The updated content with embedding
   */
  async generateEmbedding(
    contentId: string
  ): Promise<ExtendedContentNode | null> {
    this.ensureInitialized();

    if (!this.embeddingsService) {
      this.logger.warn(
        'EmbeddingsService not available, cannot generate embeddings'
      );
      return null;
    }

    try {
      // Get content
      const content = await this.getContentById(contentId);
      if (!content) {
        this.logger.warn(`Content with ID ${contentId} not found`);
        return null;
      }

      // Generate embedding
      const embedding = await this.embeddingsService.generateEmbedding(
        content.text
      );

      // Update content with embedding
      return this.updateEmbedding(contentId, embedding);
    } catch (error) {
      this.logger.error(
        `Error generating embedding for content ${contentId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined
      );
      return null;
    }
  }

  /**
   * Update embedding for a content item
   * @param contentId ID of the content to update
   * @param embedding The embedding vector
   * @returns The updated content
   */
  private async updateEmbedding(
    contentId: string,
    embedding: EmbeddingVector
  ): Promise<ExtendedContentNode | null> {
    try {
      // Update directly in the repository to avoid classification logic
      const updated = await this.contentRepository.updateById(contentId, {
        embedding,
      });

      return updated;
    } catch (error) {
      this.logger.error(
        `Error updating embedding for content ${contentId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined
      );
      return null;
    }
  }

  /**
   * Find content items similar to the specified content ID using vector search
   * @param contentId The ID of the content to find similar items for
   * @param options Options for the similarity search
   * @returns Array of similar content items with similarity scores
   */
  async findSimilarContent(
    contentId: string,
    options: {
      limit?: number;
      minScore?: number;
      useExistingEmbedding?: boolean;
    } = {}
  ): Promise<Array<{ content: ExtendedContentNode; score: number }>> {
    try {
      const content = await this.getContentById(contentId);
      if (!content) {
        this.logger.warn(`Content with ID ${contentId} not found`);
        return []; // Return empty array instead of throwing
      }

      // Use existing embedding if available and requested, otherwise generate new one
      let embedding: number[] = (content as any).embedding;
      if (!embedding || !options.useExistingEmbedding) {
        embedding = await this.embeddingsService.generateEmbedding(
          content.text
        );
      }

      // Return empty array if no embedding could be generated
      if (!embedding || embedding.length === 0) {
        this.logger.warn(
          `Unable to generate embedding for content ${contentId}`
        );
        return [];
      }

      // Check if repository has vectorSearch capability
      if (typeof this.contentRepository.vectorSearch === 'function') {
        // Perform vector search using the repository
        const searchResults = await this.contentRepository.vectorSearch(
          'embedding',
          embedding,
          {
            limit: options.limit || 10,
            minScore: options.minScore || 0.7,
            collection: CONTENT_COLLECTION_NAME,
          }
        );

        // Transform results to match expected format with "content" property
        return searchResults.map((result) => ({
          content: result.item || result.document,
          score: result.score,
        }));
      } else {
        // Fallback when vectorSearch is not available
        this.logger.warn(
          'Repository does not support vectorSearch, using manual similarity calculation'
        );

        // Get all content (with a reasonable limit)
        const allContent = await this.contentRepository.find(
          { id: { $ne: contentId } }, // Exclude the source content
          { limit: options.limit || 50 }
        );

        // Filter content items that have embeddings, or generate on the fly
        const contentWithSimilarity: Array<{
          content: ExtendedContentNode;
          score: number;
        }> = [];

        for (const item of allContent) {
          let itemEmbedding = (item as any).embedding;

          // Generate embedding if needed
          if (!itemEmbedding) {
            try {
              itemEmbedding = await this.embeddingsService.generateEmbedding(
                item.text
              );
            } catch (error) {
              this.logger.debug(
                `Error generating embedding for content ${item.id}: ${error.message}`
              );
              continue; // Skip this item
            }
          }

          if (!itemEmbedding || itemEmbedding.length === 0) continue;

          // Calculate similarity
          const score = this.embeddingsService.calculateSimilarity(
            embedding,
            itemEmbedding
          );

          // Add if above threshold
          if (score >= (options.minScore || 0.7)) {
            contentWithSimilarity.push({ content: item, score });
          }
        }

        // Sort by similarity score (descending)
        contentWithSimilarity.sort((a, b) => b.score - a.score);

        // Limit results if needed
        return contentWithSimilarity.slice(0, options.limit || 10);
      }
    } catch (error) {
      this.logger.error(
        `Error finding similar content for ${contentId}: ${error.message}`,
        error.stack
      );
      return []; // Return empty array on error instead of throwing
    }
  }

  /**
   * Semantic search for content using text embeddings
   * @param params Search parameters
   * @param useEmbeddings Whether to use embeddings for search
   * @returns Array of content items matching the search criteria
   */
  async semanticSearchContent(
    params: ContentSearchParams,
    useEmbeddings = true
  ): Promise<ExtendedContentNode[]> {
    try {
      // If embeddings are not enabled or requested, fall back to regular search
      if (!this.embeddingsService || !useEmbeddings) {
        return this.searchContent(params);
      }

      // Use semanticQuery if provided, otherwise use regular query
      const queryText = params.semanticQuery || params.query;
      if (!queryText) {
        this.logger.warn(
          `No query provided for semantic search, falling back to regular search`
        );
        return this.searchContent(params);
      }

      // Generate embedding for the search query text
      const queryEmbedding = await this.embeddingsService.generateEmbedding(
        queryText
      );
      if (!queryEmbedding || queryEmbedding.length === 0) {
        this.logger.warn(
          `Could not generate embedding for search query, falling back to regular search`
        );
        return this.searchContent(params);
      }

      // Check if repository supports vector search
      if (this.contentRepository.vectorSearch) {
        // Perform vector search
        const searchResults = await this.contentRepository.vectorSearch(
          'embedding',
          queryEmbedding,
          {
            limit: params.limit || 20,
            minScore: params.minScore || 0.6, // Lower threshold for search queries
            collection: CONTENT_COLLECTION_NAME,
          }
        );

        // Extract just the documents from the search results
        return searchResults.map((result) => result.item || result.document);
      } else {
        // Fallback: Manual similarity calculation when vectorSearch is not available
        this.logger.warn(
          'Repository does not support vector search, using manual similarity calculation'
        );

        // Get all content (with a reasonable limit)
        const allContent = await this.contentRepository.find(
          {},
          { limit: params.limit || 100 }
        );

        // Calculate similarity for each item
        const contentWithSimilarity: Array<{
          content: ExtendedContentNode;
          score: number;
        }> = [];

        for (const content of allContent) {
          // Skip content without embeddings
          if (!content.embedding) {
            // Try to generate embedding on the fly
            const embedding = await this.embeddingsService.generateEmbedding(
              content.text
            );
            if (!embedding || embedding.length === 0) continue;

            // Calculate similarity
            const score = this.embeddingsService.calculateSimilarity(
              queryEmbedding,
              embedding
            );
            if (score >= (params.minScore || 0.6)) {
              contentWithSimilarity.push({ content, score });
            }
          } else {
            // Calculate similarity
            const score = this.embeddingsService.calculateSimilarity(
              queryEmbedding,
              content.embedding
            );
            if (score >= (params.minScore || 0.6)) {
              contentWithSimilarity.push({ content, score });
            }
          }
        }

        // Sort by score (descending)
        contentWithSimilarity.sort((a, b) => b.score - a.score);

        // Limit results
        const limitedResults = contentWithSimilarity.slice(
          0,
          params.limit || 20
        );

        // Return just the content
        return limitedResults.map((item) => item.content);
      }
    } catch (error) {
      this.logger.error(
        `Error in semantic search: ${error.message}`,
        error.stack
      );
      // Fall back to regular search on error
      return this.searchContent(params);
    }
  }

  /**
   * Generate embeddings for all content without them
   * This is useful for bulk processing existing content
   * @param batchSize Size of batches to process
   * @returns Number of items processed
   */
  async generateAllEmbeddings(batchSize = 50): Promise<number> {
    this.ensureInitialized();

    if (!this.embeddingsService) {
      this.logger.warn(
        'EmbeddingsService not available, cannot generate embeddings'
      );
      return 0;
    }

    try {
      // Find content without embeddings
      const filter = { embedding: { $exists: false } };
      const totalCount = await this.contentRepository.count(filter);

      this.logger.log(`Found ${totalCount} content items without embeddings`);

      if (totalCount === 0) {
        return 0;
      }

      let processedCount = 0;
      let currentOffset = 0;

      // Process in batches
      while (currentOffset < totalCount) {
        // Get batch
        const contentBatch = await this.contentRepository.find(filter, {
          skip: currentOffset,
          limit: batchSize,
        });

        if (contentBatch.length === 0) {
          break;
        }

        // Generate embeddings for batch
        const textBatch = contentBatch.map((item) => item.text);
        const embeddings = await this.embeddingsService.batchGenerateEmbeddings(
          textBatch
        );

        // Update each item with its embedding
        const updatePromises = contentBatch.map((item, index) =>
          this.updateEmbedding(item.id, embeddings[index])
        );

        await Promise.all(updatePromises);

        processedCount += contentBatch.length;
        currentOffset += batchSize;

        this.logger.log(
          `Processed ${processedCount}/${totalCount} content items`
        );
      }

      return processedCount;
    } catch (error) {
      this.logger.error(
        `Error generating all embeddings: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined
      );
      return 0;
    }
  }
}
