import { Module } from '@nestjs/common';
// import { AnalysisService } from "@/services/analysis.service";
import { AnalysisController } from './analysis.controller';
import { AnalysisResolver } from './analysis.resolver';
// import { DatabaseModule } from "@/database";

// Create stub implementations
class StubDatabaseModule {}

class StubAnalysisService {
  analyze() {
    return { result: 'analysis completed' };
  }
}

@Module({
  imports: [StubDatabaseModule],
  providers: [
    {
      provide: 'AnalysisService',
      useClass: StubAnalysisService,
    },
    AnalysisResolver,
  ],
  controllers: [AnalysisController],
  exports: ['AnalysisService'],
})
export class AnalysisModule {}
