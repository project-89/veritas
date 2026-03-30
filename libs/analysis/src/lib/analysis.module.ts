import { Module } from '@nestjs/common';
import { AnalysisController } from './analysis.controller';
import { AnalysisResolver } from './analysis.resolver';
import { ANALYSIS_SERVICE } from './interfaces/analysis-service.interface';

@Module({
  providers: [
    {
      provide: ANALYSIS_SERVICE,
      useValue: null, // TODO: Replace with real AnalysisService implementation
    },
    AnalysisResolver,
  ],
  controllers: [AnalysisController],
  exports: [ANALYSIS_SERVICE],
})
export class AnalysisModule {}
