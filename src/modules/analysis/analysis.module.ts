import { Module } from "@nestjs/common";
import { AnalysisService } from "@/services/analysis.service";
import { AnalysisController } from "./analysis.controller";
import { AnalysisResolver } from "./analysis.resolver";
import { DatabaseModule } from "@/database";

@Module({
  imports: [DatabaseModule],
  providers: [AnalysisService, AnalysisResolver],
  controllers: [AnalysisController],
  exports: [AnalysisService],
})
export class AnalysisModule {}
