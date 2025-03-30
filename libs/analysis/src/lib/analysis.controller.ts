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
// import { AnalysisService } from "../../services/analysis.service";
import { z } from 'zod';

const TimeFrameSchema = z.object({
  start: z.date(),
  end: z.date(),
});

type TimeFrame = z.infer<typeof TimeFrameSchema>;

@ApiTags('analysis')
@Controller('analysis')
export class AnalysisController {
  constructor(
    @Inject('AnalysisService') private readonly analysisService: any
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
  async analyzeContent(@Body() content: any) {
    // TODO: Implement content analysis
    return { status: 'Analysis completed' };
  }
}
