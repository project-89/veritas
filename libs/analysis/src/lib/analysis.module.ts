import { type DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AnalysisController } from './analysis.controller';
import { NarrativeAnalysisController } from './controllers/narrative-analysis.controller';
import { ANALYSIS_SERVICE } from './interfaces/analysis-service.interface';
import { AnalysisService } from './services/analysis.service';
import { CausalReasoningService } from './services/causal-reasoning.service';
import { ClaimVerificationService } from './services/claim-verification.service';
import { ComparisonService } from './services/comparison.service';
import { CoverageProbeService } from './services/coverage-probe.service';
import { CrossPlatformIdentityService } from './services/cross-platform-identity.service';
import { DeepInvestigationService } from './services/deep-investigation.service';
import { DeviationService } from './services/deviation.service';
import {
  CAUSAL_REASONING_SERVICE,
  DownstreamEffectsService,
} from './services/downstream-effects.service';
import { MongoEmbeddingCacheStore } from './services/embedding-cache.store';
import { EntityAnalysisService } from './services/entity-analysis.service';
import { NarrativeGenealogyService } from './services/genealogy.service';
import {
  GLOBAL_EVENT_RSS_FEEDS,
  GlobalEventAggregationService,
  type RssFeedEntry,
} from './services/global-event-aggregation.service';
import { GraphBotDetectionService } from './services/graph-bot-detection.service';
import { GraphDatabaseService } from './services/graph-database.service';
import { IntelligenceEngineService } from './services/intelligence-engine.service';
import { MonitorService } from './services/monitor.service';
import {
  EMBEDDING_CACHE_STORE,
  NarrativeAnalysisService,
} from './services/narrative-analysis.service';
import { FailureExampleService } from './services/failure-example.service';
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
    // Wire the previously-dead embedding cache so runs stop re-embedding every
    // post at full Gemini cost.
    MongoEmbeddingCacheStore,
    {
      provide: EMBEDDING_CACHE_STORE,
      useExisting: MongoEmbeddingCacheStore,
    },
    DeviationService,
    MonitorService,
    DeepInvestigationService,
    CrossPlatformIdentityService,
    ReportService,
    PropagandaAnalysisService,
    ComparisonService,
    CoverageProbeService,
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
    FailureExampleService,
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
    CoverageProbeService,
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
    FailureExampleService,
  ],
})
export class AnalysisModule {
  /**
   * Supplies the world-map RSS feed catalog to the aggregation service. The
   * catalog lives in @veritas/ingestion, which already depends on
   * @veritas/analysis — importing it here would be circular, so the app (which
   * imports both) passes it in. Without this the service's @Optional() feed
   * injection silently defaults to [] and no RSS events are ever produced.
   */
  static forRoot(options: { rssFeeds?: RssFeedEntry[] } = {}): DynamicModule {
    return {
      module: AnalysisModule,
      providers: [{ provide: GLOBAL_EVENT_RSS_FEEDS, useValue: options.rssFeeds ?? [] }],
      exports: [GLOBAL_EVENT_RSS_FEEDS],
    };
  }
}
