import { Module } from '@nestjs/common';
import { AnalysisController } from './analysis.controller';
import { AnalysisResolver } from './analysis.resolver';
import { AnalysisService } from './services/analysis.service';
import { ANALYSIS_SERVICE } from './interfaces/analysis-service.interface';

@Module({
  providers: [
    AnalysisService,
    {
      provide: ANALYSIS_SERVICE,
      useExisting: AnalysisService,
    },
    AnalysisResolver,
  ],
  controllers: [AnalysisController],
  exports: [ANALYSIS_SERVICE, AnalysisService],
})
export class AnalysisModule {}
