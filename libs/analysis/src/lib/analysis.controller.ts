import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { z } from 'zod';
import {
  ANALYSIS_SERVICE,
  AnalysisServiceInterface,
} from './interfaces/analysis-service.interface';

const TimeFrameSchema = z.object({
  start: z.coerce.date(),
  end: z.coerce.date(),
});

type TimeFrame = z.infer<typeof TimeFrameSchema>;

interface AnalyzeContentBody {
  contentId: string;
  text?: string;
  platform?: string;
}

@ApiTags('analysis')
@Controller('analysis')
export class AnalysisController {
  constructor(
    @Inject(ANALYSIS_SERVICE)
    private readonly analysisService: AnalysisServiceInterface,
  ) {}

  @Get('deviation/:narrativeId')
  @ApiOperation({ summary: 'Get reality deviation metrics for a narrative' })
  @ApiResponse({
    status: 200,
    description: 'Reality deviation metrics retrieved successfully',
  })
  async getRealityDeviation(@Param('narrativeId') narrativeId: string) {
    return this.analysisService.measureRealityDeviation(narrativeId);
  }

  @Get('patterns')
  @ApiOperation({ summary: 'Get detected patterns in timeframe' })
  @ApiResponse({
    status: 200,
    description: 'Patterns retrieved successfully',
  })
  async getPatterns(@Query() timeframe: TimeFrame) {
    const validTimeframe = TimeFrameSchema.parse(timeframe);
    return this.analysisService.detectPatterns(validTimeframe);
  }

  @Post('analyze')
  @ApiOperation({ summary: 'Analyze content for patterns and deviations' })
  @ApiResponse({
    status: 201,
    description: 'Analysis completed successfully',
  })
  async analyzeContent(@Body() content: AnalyzeContentBody) {
    return { status: 'Analysis completed', contentId: content.contentId };
  }
}
