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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
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

  @Post()
  @ApiOperation({ summary: 'Create new content' })
  @ApiResponse({
    status: 201,
    description: 'The content has been successfully created.',
  })
  async createContent(
    @Body() input: ContentCreateInput
  ): Promise<ExtendedContentNode> {
    if (!this.contentService) {
      throw new Error(
        'Content service not available - use ContentClassificationModule.forRoot() with databaseProvider'
      );
    }
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
    if (!this.contentService) {
      throw new Error(
        'Content service not available - use ContentClassificationModule.forRoot() with databaseProvider'
      );
    }
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
    if (!this.contentService) {
      throw new Error(
        'Content service not available - use ContentClassificationModule.forRoot() with databaseProvider'
      );
    }
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
    if (!this.contentService) {
      throw new Error(
        'Content service not available - use ContentClassificationModule.forRoot() with databaseProvider'
      );
    }
    return this.contentService.updateContent(id, input);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete content' })
  @ApiResponse({
    status: 200,
    description: 'The content has been successfully deleted.',
  })
  async deleteContent(@Param('id') id: string): Promise<boolean> {
    if (!this.contentService) {
      throw new Error(
        'Content service not available - use ContentClassificationModule.forRoot() with databaseProvider'
      );
    }
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
    if (!this.contentService) {
      throw new Error(
        'Content service not available - use ContentClassificationModule.forRoot() with databaseProvider'
      );
    }
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
    if (!this.contentService) {
      throw new Error(
        'Content service not available - use ContentClassificationModule.forRoot() with databaseProvider'
      );
    }
    return this.contentService.updateContent(id, {
      engagementMetrics: metrics,
    });
  }
}
