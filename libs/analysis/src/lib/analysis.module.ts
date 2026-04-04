import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AnalysisController } from './analysis.controller';
import { NarrativeAnalysisController } from './controllers/narrative-analysis.controller';
import { AnalysisResolver } from './analysis.resolver';
import { AnalysisService } from './services/analysis.service';
import { NarrativeAnalysisService } from './services/narrative-analysis.service';
import { DeviationService } from './services/deviation.service';
import { MonitorService } from './services/monitor.service';
import { DeepInvestigationService } from './services/deep-investigation.service';
import { CrossPlatformIdentityService } from './services/cross-platform-identity.service';
import { ReportService } from './services/report.service';
import { PropagandaAnalysisService } from './services/propaganda.service';
import { ComparisonService } from './services/comparison.service';
import { EntityAnalysisService } from './services/entity-analysis.service';
import { NarrativeGenealogyService } from './services/genealogy.service';
import { DownstreamEffectsService, CAUSAL_REASONING_SERVICE } from './services/downstream-effects.service';
import { CausalReasoningService } from './services/causal-reasoning.service';
import { GraphDatabaseService } from './services/graph-database.service';
import { SourceCredibilityService } from './services/source-credibility.service';
import { GraphBotDetectionService } from './services/graph-bot-detection.service';
import { ClaimVerificationService } from './services/claim-verification.service';
import { PsychologicalProfilerService } from './services/psychological-profiler.service';
import { PlatformCredibilityService } from './services/platform-credibility.service';
import { SocialGraphIntelligenceService } from './services/social-graph-intelligence.service';
import { SaturationMetricsService } from './services/saturation-metrics.service';
import { ANALYSIS_SERVICE } from './interfaces/analysis-service.interface';

@Module({
  imports: [ConfigModule],
  providers: [
    AnalysisService,
    NarrativeAnalysisService,
    DeviationService,
    MonitorService,
    DeepInvestigationService,
    CrossPlatformIdentityService,
    ReportService,
    PropagandaAnalysisService,
    ComparisonService,
    EntityAnalysisService,
    NarrativeGenealogyService,
    DownstreamEffectsService,
    CausalReasoningService,
    {
      provide: CAUSAL_REASONING_SERVICE,
      useExisting: CausalReasoningService,
    },
    GraphDatabaseService,
    SourceCredibilityService,
    GraphBotDetectionService,
    ClaimVerificationService,
    PsychologicalProfilerService,
    PlatformCredibilityService,
    SocialGraphIntelligenceService,
    SaturationMetricsService,
    {
      provide: ANALYSIS_SERVICE,
      useExisting: AnalysisService,
    },
    AnalysisResolver,
  ],
  controllers: [AnalysisController, NarrativeAnalysisController],
  exports: [ANALYSIS_SERVICE, AnalysisService, NarrativeAnalysisService, MonitorService, DeviationService, DeepInvestigationService, CrossPlatformIdentityService, ReportService, PropagandaAnalysisService, ComparisonService, EntityAnalysisService, NarrativeGenealogyService, DownstreamEffectsService, CausalReasoningService, GraphDatabaseService, SourceCredibilityService, GraphBotDetectionService, ClaimVerificationService, PsychologicalProfilerService, PlatformCredibilityService, SocialGraphIntelligenceService, SaturationMetricsService],
})
export class AnalysisModule {}
