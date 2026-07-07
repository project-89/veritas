import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AnalysisController } from './analysis.controller';
import { NarrativeAnalysisController } from './controllers/narrative-analysis.controller';
import { ANALYSIS_SERVICE } from './interfaces/analysis-service.interface';
import { AnalysisService } from './services/analysis.service';
import { CausalReasoningService } from './services/causal-reasoning.service';
import { ClaimVerificationService } from './services/claim-verification.service';
import { ComparisonService } from './services/comparison.service';
import { CrossPlatformIdentityService } from './services/cross-platform-identity.service';
import { DeepInvestigationService } from './services/deep-investigation.service';
import { DeviationService } from './services/deviation.service';
import {
  CAUSAL_REASONING_SERVICE,
  DownstreamEffectsService,
} from './services/downstream-effects.service';
import { EntityAnalysisService } from './services/entity-analysis.service';
import { NarrativeGenealogyService } from './services/genealogy.service';
import { GlobalEventAggregationService } from './services/global-event-aggregation.service';
import { GraphBotDetectionService } from './services/graph-bot-detection.service';
import { GraphDatabaseService } from './services/graph-database.service';
import { IntelligenceEngineService } from './services/intelligence-engine.service';
import { MonitorService } from './services/monitor.service';
import { NarrativeAnalysisService } from './services/narrative-analysis.service';
import { PlatformCredibilityService } from './services/platform-credibility.service';
import { PropagandaAnalysisService } from './services/propaganda.service';
import { ReportService } from './services/report.service';
import { SaturationMetricsService } from './services/saturation-metrics.service';
import { SocialGraphIntelligenceService } from './services/social-graph-intelligence.service';
import { SourceCredibilityService } from './services/source-credibility.service';

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
    PlatformCredibilityService,
    SocialGraphIntelligenceService,
    SaturationMetricsService,
    GlobalEventAggregationService,
    IntelligenceEngineService,
    {
      provide: ANALYSIS_SERVICE,
      useExisting: AnalysisService,
    },
  ],
  controllers: [AnalysisController, NarrativeAnalysisController],
  exports: [
    ANALYSIS_SERVICE,
    AnalysisService,
    NarrativeAnalysisService,
    MonitorService,
    DeviationService,
    DeepInvestigationService,
    CrossPlatformIdentityService,
    ReportService,
    PropagandaAnalysisService,
    ComparisonService,
    EntityAnalysisService,
    NarrativeGenealogyService,
    DownstreamEffectsService,
    CausalReasoningService,
    GraphDatabaseService,
    SourceCredibilityService,
    GraphBotDetectionService,
    ClaimVerificationService,
    PlatformCredibilityService,
    SocialGraphIntelligenceService,
    SaturationMetricsService,
    GlobalEventAggregationService,
    IntelligenceEngineService,
  ],
})
export class AnalysisModule {}
