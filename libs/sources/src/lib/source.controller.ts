import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  SourceService,
  SourceCreateInput,
  SourceUpdateInput,
  SourceSearchParams,
} from './services/source.service';
import { SourceNode } from '@veritas/shared';

@ApiTags('sources')
@Controller('sources')
export class SourceController {
  constructor(private readonly sourceService: SourceService) {}

  @Post()
  @ApiOperation({ summary: 'Create new source' })
  @ApiResponse({
    status: 201,
    description: 'The source has been successfully created.',
  })
  async createSource(@Body() input: SourceCreateInput): Promise<SourceNode> {
    return this.sourceService.createSource(input);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get source by ID' })
  @ApiResponse({
    status: 200,
    description: 'The source has been successfully retrieved.',
  })
  async getSource(@Param('id') id: string): Promise<SourceNode | null> {
    return this.sourceService.getSourceById(id);
  }

  @Get()
  @ApiOperation({ summary: 'Search sources' })
  @ApiResponse({
    status: 200,
    description: 'The sources have been successfully retrieved.',
  })
  async searchSources(
    @Query() params: SourceSearchParams
  ): Promise<SourceNode[]> {
    return this.sourceService.searchSources(params);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update source' })
  @ApiResponse({
    status: 200,
    description: 'The source has been successfully updated.',
  })
  async updateSource(
    @Param('id') id: string,
    @Body() input: SourceUpdateInput
  ): Promise<SourceNode> {
    return this.sourceService.updateSource(id, input);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete source' })
  @ApiResponse({
    status: 200,
    description: 'The source has been successfully deleted.',
  })
  async deleteSource(@Param('id') id: string): Promise<boolean> {
    return this.sourceService.deleteSource(id);
  }

  @Get(':id/content')
  @ApiOperation({ summary: 'Get source content' })
  @ApiResponse({
    status: 200,
    description: 'The source content has been successfully retrieved.',
  })
  async getSourceContent(
    @Param('id') id: string,
    @Query('limit') limit?: number
  ): Promise<any[]> {
    return this.sourceService.getSourceContent(id, limit);
  }

  @Put(':id/credibility')
  @ApiOperation({ summary: 'Update source credibility score' })
  @ApiResponse({
    status: 200,
    description: 'The source credibility score has been successfully updated.',
  })
  async updateSourceCredibility(
    @Param('id') id: string,
    @Body('score') score: number
  ): Promise<SourceNode> {
    return this.sourceService.updateCredibilityScore(id, score);
  }

  @Get(':id/credibility/calculate')
  @ApiOperation({ summary: 'Calculate source aggregate credibility' })
  @ApiResponse({
    status: 200,
    description:
      'The source aggregate credibility has been successfully calculated.',
  })
  async calculateSourceCredibility(@Param('id') id: string): Promise<number> {
    return this.sourceService.calculateAggregateCredibility(id);
  }
}
