import { Controller, Get } from '@nestjs/common';
import {
  geminiChatModel,
  geminiReasoningModel,
  GLOBAL_EVENT_SIGNAL_SOURCES,
} from '@veritas/analysis';
import { getAllFeeds, IngestionService, WebSearchService } from '@veritas/ingestion';

/**
 * Runtime capability report — what THIS deployment can actually do.
 *
 * The UI must build its pickers, labels, and status displays from this
 * endpoint instead of hardcoded lists. Every hardcoded capability list the
 * client has carried eventually drifted from reality (offered a disabled
 * Reddit, hid four live connectors, claimed 177 feeds after the catalog
 * changed); this endpoint makes that class of bug structurally impossible.
 */
@Controller('capabilities')
export class CapabilitiesController {
  constructor(
    private readonly ingestionService: IngestionService,
    private readonly webSearch: WebSearchService,
  ) {}

  @Get()
  getCapabilities() {
    const feeds = getAllFeeds();
    const tier1 = feeds.filter((f) => f.tier === 1);
    const llmAvailable = Boolean(process.env['GEMINI_API_KEY']);

    return {
      connectors: this.ingestionService.getConnectorCapability(),
      feeds: {
        total: feeds.length,
        tier1: tier1.length,
        stateMedia: feeds.filter((f) => f.ownership === 'state-media').length,
        publicBroadcaster: feeds.filter((f) => f.ownership === 'public-broadcaster').length,
        domesticAudience: feeds.filter((f) => f.audience === 'domestic').length,
        languages: [...new Set(feeds.map((f) => f.language))].sort(),
      },
      signals: GLOBAL_EVENT_SIGNAL_SOURCES,
      analysis: {
        llm: {
          available: llmAvailable,
          chatModel: llmAvailable ? geminiChatModel() : null,
          reasoningModel: llmAvailable ? geminiReasoningModel() : null,
        },
        // LLM-backed stages degrade to heuristics/abstention without a key —
        // 'semantic' vs 'fallback' tells the UI which mode users will get.
        features: {
          narrativeClustering: llmAvailable ? 'semantic' : 'fallback',
          claimVerification: llmAvailable ? 'llm-grounded' : 'heuristic',
          translation: llmAvailable,
          failureExamples: llmAvailable,
          propagandaDetection: llmAvailable,
          deepInvestigation: llmAvailable,
        },
      },
      webSearch: { providers: this.webSearch.providers },
      searchModes: ['topic', 'claim', 'person'],
      timeRangeFormats: ['<n>h', '<n>d', '<n>m', 'YYYY-MM-DD_YYYY-MM-DD'],
    };
  }
}
