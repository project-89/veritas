import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Optional,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import {
  ContentService,
  ContentSearchParams,
  ExtendedContentNode,
} from '../services/content.service';
import {
  ContentCreateInput,
  ContentUpdateInput,
} from '../services/content-validation.service';

@ApiTags('content')
@Controller('content')
export class ContentController {
  constructor(@Optional() private readonly contentService: ContentService) {}

  /**
   * Private helper to check if content service is available
   * @private
   */
  private ensureContentService(): void {
    if (!this.contentService) {
      throw new HttpException(
        'Content service not available - use ContentClassificationModule.forRoot() with databaseProvider',
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
  }

  @Post()
  @ApiOperation({ summary: 'Create new content' })
  @ApiResponse({
    status: 201,
    description: 'The content has been successfully created.',
  })
  async createContent(
    @Body() input: ContentCreateInput
  ): Promise<ExtendedContentNode> {
    this.ensureContentService();
    return this.contentService.createContent(input);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get content by ID' })
  @ApiResponse({
    status: 200,
    description: 'The content has been successfully retrieved.',
  })
  async getContent(
    @Param('id') id: string
  ): Promise<ExtendedContentNode | null> {
    this.ensureContentService();
    return this.contentService.getContentById(id);
  }

  @Get()
  @ApiOperation({ summary: 'Search content' })
  @ApiResponse({
    status: 200,
    description: 'The content has been successfully retrieved.',
  })
  async searchContent(
    @Query() params: ContentSearchParams
  ): Promise<ExtendedContentNode[]> {
    this.ensureContentService();
    return this.contentService.searchContent(params);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update content' })
  @ApiResponse({
    status: 200,
    description: 'The content has been successfully updated.',
  })
  async updateContent(
    @Param('id') id: string,
    @Body() input: ContentUpdateInput
  ): Promise<ExtendedContentNode> {
    this.ensureContentService();
    return this.contentService.updateContent(id, input);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete content' })
  @ApiResponse({
    status: 200,
    description: 'The content has been successfully deleted.',
  })
  async deleteContent(@Param('id') id: string): Promise<boolean> {
    this.ensureContentService();
    return this.contentService.deleteContent(id);
  }

  @Get(':id/related')
  @ApiOperation({ summary: 'Get related content' })
  @ApiResponse({
    status: 200,
    description: 'Related content has been successfully retrieved.',
  })
  async getRelatedContent(
    @Param('id') id: string,
    @Query('limit') limit?: number
  ): Promise<ExtendedContentNode[]> {
    this.ensureContentService();
    return this.contentService.getRelatedContent(id, limit);
  }

  @Put(':id/engagement')
  @ApiOperation({ summary: 'Update engagement metrics' })
  @ApiResponse({
    status: 200,
    description: 'Engagement metrics have been successfully updated.',
  })
  async updateEngagementMetrics(
    @Param('id') id: string,
    @Body() metrics: ContentUpdateInput['engagementMetrics']
  ): Promise<ExtendedContentNode> {
    this.ensureContentService();
    return this.contentService.updateContent(id, {
      engagementMetrics: metrics,
    });
  }

  @Get('semantic/search')
  @ApiOperation({ summary: 'Semantic search using embeddings' })
  @ApiResponse({
    status: 200,
    description:
      'The semantically similar content has been successfully retrieved.',
  })
  @ApiQuery({
    name: 'semanticQuery',
    required: true,
    description: 'The semantic search query',
  })
  @ApiQuery({
    name: 'minScore',
    required: false,
    description: 'Minimum similarity score (0-1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Maximum number of results',
  })
  async semanticSearchContent(
    @Query('semanticQuery') semanticQuery: string,
    @Query('minScore') minScore?: number,
    @Query('limit') limit?: number,
    @Query() params?: ContentSearchParams
  ): Promise<ExtendedContentNode[]> {
    this.ensureContentService();

    return this.contentService.semanticSearchContent(
      {
        ...params,
        semanticQuery,
        minScore: minScore !== undefined ? Number(minScore) : undefined,
        limit: limit !== undefined ? Number(limit) : undefined,
      },
      true // use embeddings for semantic search
    );
  }

  @Get(':id/similar')
  @ApiOperation({ summary: 'Find similar content' })
  @ApiResponse({
    status: 200,
    description: 'Similar content has been successfully retrieved.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Maximum number of results',
  })
  @ApiQuery({
    name: 'minScore',
    required: false,
    description: 'Minimum similarity score (0-1)',
  })
  @ApiQuery({
    name: 'useExistingEmbedding',
    required: false,
    description: 'Whether to use existing embedding if available',
  })
  async getSimilarContent(
    @Param('id') id: string,
    @Query('limit') limit?: number,
    @Query('minScore') minScore?: number,
    @Query('useExistingEmbedding') useExistingEmbedding?: string
  ): Promise<ExtendedContentNode[]> {
    this.ensureContentService();

    const results = await this.contentService.findSimilarContent(id, {
      limit: limit !== undefined ? Number(limit) : undefined,
      minScore: minScore !== undefined ? Number(minScore) : undefined,
      useExistingEmbedding: useExistingEmbedding === 'true',
    });

    // Return just the content objects without the scores
    return results.map((result) => result.content);
  }

  @Post(':id/embedding')
  @ApiOperation({ summary: 'Generate embedding for content' })
  @ApiResponse({
    status: 200,
    description: 'Embedding has been successfully generated.',
  })
  async generateEmbedding(
    @Param('id') id: string
  ): Promise<ExtendedContentNode> {
    this.ensureContentService();

    const result = await this.contentService.generateEmbedding(id);
    if (!result) {
      throw new HttpException(
        `Content with ID ${id} not found`,
        HttpStatus.NOT_FOUND
      );
    }

    return result;
  }

  @Post('embeddings/generate-all')
  @ApiOperation({ summary: 'Generate embeddings for all content' })
  @ApiResponse({
    status: 200,
    description: 'Embeddings generation process has been initiated.',
  })
  @ApiQuery({
    name: 'batchSize',
    required: false,
    description: 'Number of items to process in each batch',
  })
  async generateAllEmbeddings(
    @Query('batchSize') batchSize?: number
  ): Promise<{ processedCount: number }> {
    this.ensureContentService();

    const count = await this.contentService.generateAllEmbeddings(
      batchSize !== undefined ? Number(batchSize) : undefined
    );

    return { processedCount: count };
  }
}
