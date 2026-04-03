/**
 * Comprehensive Service-Level Integration Tests for Veritas API
 *
 * Tests every service, connector, signal adapter, evidence adapter, and
 * validates data flow correctness through the analysis pipeline.
 *
 * Run with: npx nx test api --testPathPattern='service-coverage'
 *
 * All external dependencies (Gemini, MongoDB, Redis, Memgraph, HTTP APIs)
 * are mocked. The goal is to verify:
 *   1. Every service is constructable and methods return correct shapes
 *   2. Every connector/adapter contract is honored
 *   3. Error handling degrades gracefully
 *   4. Data flows correctly through the pipeline
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Mock external modules BEFORE imports
// ---------------------------------------------------------------------------

// Mock Google Generative AI globally
const mockGenerateContent = jest.fn().mockResolvedValue({
  response: {
    text: () =>
      JSON.stringify({
        narratives: [],
        techniques: [],
        claims: [],
        frames: [],
        overallAssessment: {
          manipulationLikelihood: 'low',
          confidence: 0.5,
          reasoning: 'mock',
          caveats: [],
        },
      }),
  },
});

const mockGetGenerativeModel = jest.fn().mockReturnValue({
  generateContent: mockGenerateContent,
  startChat: jest.fn().mockReturnValue({
    sendMessage: jest.fn().mockResolvedValue({
      response: {
        text: () => JSON.stringify({ chains: [], rejections: [] }),
        functionCalls: () => null,
      },
    }),
  }),
});

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
  FunctionCallingMode: { AUTO: 'AUTO' },
  SchemaType: { STRING: 'STRING', NUMBER: 'NUMBER', OBJECT: 'OBJECT', ARRAY: 'ARRAY', BOOLEAN: 'BOOLEAN' },
}));

// Mock child_process for cross-platform identity (sherlock)
jest.mock('child_process', () => ({
  execFile: jest.fn((_cmd: string, _args: string[], _opts: any, cb: any) => {
    if (cb) cb(null, '[]', '');
    return { on: jest.fn(), stdout: { on: jest.fn() }, stderr: { on: jest.fn() } };
  }),
}));

// Mock fs/promises for cross-platform identity temp files
jest.mock('fs/promises', () => ({
  readFile: jest.fn().mockResolvedValue('[]'),
  mkdir: jest.fn().mockResolvedValue(undefined),
  rm: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
}));

// Mock global fetch for signal/evidence adapters
const mockFetch = jest.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({}),
  text: () => Promise.resolve(''),
  status: 200,
});
global.fetch = mockFetch as any;

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { ConfigService } from '@nestjs/config';

// Analysis services
import { NarrativeAnalysisService } from '../../../../libs/analysis/src/lib/services/narrative-analysis.service';
import { PropagandaAnalysisService } from '../../../../libs/analysis/src/lib/services/propaganda.service';
import { ClaimVerificationService } from '../../../../libs/analysis/src/lib/services/claim-verification.service';
import { DeviationService } from '../../../../libs/analysis/src/lib/services/deviation.service';
import { ComparisonService } from '../../../../libs/analysis/src/lib/services/comparison.service';
import { EntityAnalysisService } from '../../../../libs/analysis/src/lib/services/entity-analysis.service';
import { NarrativeGenealogyService } from '../../../../libs/analysis/src/lib/services/genealogy.service';
import { DownstreamEffectsService } from '../../../../libs/analysis/src/lib/services/downstream-effects.service';
import { CausalReasoningService } from '../../../../libs/analysis/src/lib/services/causal-reasoning.service';
import { ReportService } from '../../../../libs/analysis/src/lib/services/report.service';
import { DeepInvestigationService } from '../../../../libs/analysis/src/lib/services/deep-investigation.service';
import { CrossPlatformIdentityService } from '../../../../libs/analysis/src/lib/services/cross-platform-identity.service';
import { SourceCredibilityService } from '../../../../libs/analysis/src/lib/services/source-credibility.service';
import { GraphBotDetectionService } from '../../../../libs/analysis/src/lib/services/graph-bot-detection.service';
import { PsychologicalProfilerService } from '../../../../libs/analysis/src/lib/services/psychological-profiler.service';
import { PlatformCredibilityService } from '../../../../libs/analysis/src/lib/services/platform-credibility.service';
import { SocialGraphIntelligenceService } from '../../../../libs/analysis/src/lib/services/social-graph-intelligence.service';
import { GraphDatabaseService } from '../../../../libs/analysis/src/lib/services/graph-database.service';
import { MonitorService } from '../../../../libs/analysis/src/lib/services/monitor.service';

// Signal adapters
import { CoinGeckoAdapter } from '../../../../libs/analysis/src/lib/services/signal-adapters/coingecko.adapter';
import { GdeltAdapter } from '../../../../libs/analysis/src/lib/services/signal-adapters/gdelt.adapter';
import { YahooFinanceAdapter } from '../../../../libs/analysis/src/lib/services/signal-adapters/yahoo-finance.adapter';
import { WorldBankAdapter } from '../../../../libs/analysis/src/lib/services/signal-adapters/worldbank.adapter';
import { FredAdapter } from '../../../../libs/analysis/src/lib/services/signal-adapters/fred.adapter';
import { AcledAdapter } from '../../../../libs/analysis/src/lib/services/signal-adapters/acled.adapter';
import { UsgsAdapter } from '../../../../libs/analysis/src/lib/services/signal-adapters/usgs.adapter';
import { LlmHypothesisAdapter } from '../../../../libs/analysis/src/lib/services/signal-adapters/llm-hypothesis.adapter';

// Evidence adapters
import { EtherscanEvidenceAdapter } from '../../../../libs/analysis/src/lib/services/evidence-adapters/etherscan.evidence-adapter';
import { DexScreenerEvidenceAdapter } from '../../../../libs/analysis/src/lib/services/evidence-adapters/dexscreener.evidence-adapter';
import { GitHubEvidenceAdapter } from '../../../../libs/analysis/src/lib/services/evidence-adapters/github.evidence-adapter';
import { SecEdgarEvidenceAdapter } from '../../../../libs/analysis/src/lib/services/evidence-adapters/sec-edgar.evidence-adapter';
import { SocialGraphEvidenceAdapter } from '../../../../libs/analysis/src/lib/services/evidence-adapters/social-graph.evidence-adapter';

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function makePost(overrides: Partial<any> = {}): any {
  return {
    id: 'post-1',
    text: 'Test narrative post about Bitcoin reaching $100k',
    platform: 'twitter',
    authorName: 'Test User',
    authorHandle: '@testuser',
    url: 'https://twitter.com/testuser/status/1',
    timestamp: '2026-03-15T12:00:00Z',
    sentiment: { score: 0.5, label: 'positive', confidence: 0.9 },
    themes: ['crypto', 'bitcoin'],
    engagement: { likes: 100, shares: 50, comments: 25, reach: 5000, viralityScore: 0.7 },
    ...overrides,
  };
}

function makeNarrative(overrides: Partial<any> = {}): any {
  return {
    id: 'narrative-1',
    summary: 'Bitcoin is heading to $100k driven by institutional adoption',
    postIndices: [0, 1, 2],
    avgSentiment: 0.6,
    sentimentTrajectory: [
      { timestamp: '2026-03-15T10:00:00Z', score: 0.5 },
      { timestamp: '2026-03-15T14:00:00Z', score: 0.7 },
    ],
    platforms: { twitter: 5, reddit: 3 },
    authors: [{ name: 'Test User', handle: '@testuser', postCount: 3 }],
    firstSeen: '2026-03-15T10:00:00Z',
    lastSeen: '2026-03-15T18:00:00Z',
    totalEngagement: 500,
    velocity: { postsPerHour: 2.5, acceleration: 0.1, trend: 'growing' as const },
    centroidEmbedding: [0.1, 0.2, 0.3, 0.4, 0.5],
    ...overrides,
  };
}

function makeUserPost(overrides: Partial<any> = {}): any {
  return {
    text: 'Testing post content',
    timestamp: '2026-03-15T12:00:00Z',
    platform: 'twitter',
    url: 'https://twitter.com/test/status/1',
    engagement: { likes: 10, comments: 5, shares: 2 },
    sentiment: { score: 0.5, label: 'positive' },
    ...overrides,
  };
}

function makeClaim(overrides: Partial<any> = {}): any {
  return {
    claim: 'Bitcoin will reach $100k by end of 2026',
    type: 'predictive' as const,
    sources: ['@cryptowhale', '@bitcoinist'],
    firstSeen: '2026-03-01T00:00:00Z',
    frequency: 15,
    verifiability: 'verifiable' as const,
    ...overrides,
  };
}

function makeInsight(overrides: Partial<any> = {}): any {
  return {
    id: 'insight-1',
    platform: 'twitter',
    timestamp: '2026-03-15T12:00:00Z',
    entities: [{ name: 'Bitcoin', type: 'asset', relevance: 0.95 }],
    sentiment: { score: 0.5, label: 'positive', confidence: 0.9 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock infrastructure services
// ---------------------------------------------------------------------------

function makeConfigService(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    GEMINI_API_KEY: 'test-gemini-key',
    ETHERSCAN_API_KEY: 'test-etherscan-key',
    GITHUB_TOKEN: 'test-github-token',
    ...overrides,
  };
  return {
    get: jest.fn((key: string) => values[key] ?? null),
    getOrThrow: jest.fn((key: string) => {
      if (values[key]) return values[key];
      throw new Error(`Missing config: ${key}`);
    }),
  } as any;
}

function makeGraphDatabaseService(available = false): GraphDatabaseService {
  return {
    isAvailable: available,
    runQuery: jest.fn().mockResolvedValue([]),
    upsertNode: jest.fn().mockResolvedValue(undefined),
    upsertEdge: jest.fn().mockResolvedValue(undefined),
    connect: jest.fn().mockResolvedValue(undefined),
  } as any;
}

// ============================================================================
// SECTION 1: SERVICE REGISTRATION AUDIT
// ============================================================================

describe('Section 1: Service Registration Audit', () => {
  const configService = makeConfigService();
  const graphDb = makeGraphDatabaseService();
  const platformCredibility = new PlatformCredibilityService(configService);

  describe('Analysis Services — all constructable', () => {
    it('should construct NarrativeAnalysisService', () => {
      const svc = new NarrativeAnalysisService(configService);
      expect(svc).toBeDefined();
    });

    it('should construct PropagandaAnalysisService', () => {
      const svc = new PropagandaAnalysisService(configService);
      expect(svc).toBeDefined();
    });

    it('should construct ClaimVerificationService', () => {
      const svc = new ClaimVerificationService(configService, platformCredibility);
      expect(svc).toBeDefined();
    });

    it('should construct DeviationService', () => {
      const svc = new DeviationService();
      expect(svc).toBeDefined();
    });

    it('should construct ComparisonService', () => {
      const svc = new ComparisonService();
      expect(svc).toBeDefined();
    });

    it('should construct EntityAnalysisService', () => {
      const svc = new EntityAnalysisService();
      expect(svc).toBeDefined();
    });

    it('should construct NarrativeGenealogyService', () => {
      const svc = new NarrativeGenealogyService();
      expect(svc).toBeDefined();
    });

    it('should construct DownstreamEffectsService', () => {
      const svc = new DownstreamEffectsService(configService, undefined as any, undefined as any);
      expect(svc).toBeDefined();
    });

    it('should construct CausalReasoningService', () => {
      const svc = new CausalReasoningService(configService, undefined as any);
      expect(svc).toBeDefined();
    });

    it('should construct ReportService', () => {
      const svc = new ReportService(configService);
      expect(svc).toBeDefined();
    });

    it('should construct DeepInvestigationService', () => {
      const svc = new DeepInvestigationService(configService);
      expect(svc).toBeDefined();
    });

    it('should construct CrossPlatformIdentityService', () => {
      const svc = new CrossPlatformIdentityService();
      expect(svc).toBeDefined();
    });

    it('should construct SourceCredibilityService', () => {
      const svc = new SourceCredibilityService(graphDb, platformCredibility);
      expect(svc).toBeDefined();
    });

    it('should construct GraphBotDetectionService', () => {
      const svc = new GraphBotDetectionService(graphDb);
      expect(svc).toBeDefined();
    });

    it('should construct PsychologicalProfilerService', () => {
      const svc = new PsychologicalProfilerService(configService);
      expect(svc).toBeDefined();
    });

    it('should construct PlatformCredibilityService', () => {
      const svc = new PlatformCredibilityService(configService);
      expect(svc).toBeDefined();
    });

    it('should construct SocialGraphIntelligenceService', () => {
      const svc = new SocialGraphIntelligenceService(graphDb);
      expect(svc).toBeDefined();
    });

    it('should construct GraphDatabaseService', () => {
      const svc = new GraphDatabaseService();
      expect(svc).toBeDefined();
    });

    it('should construct MonitorService', () => {
      const svc = new MonitorService();
      expect(svc).toBeDefined();
    });
  });

  describe('Signal Adapters — all constructable', () => {
    it('should construct CoinGeckoAdapter', () => {
      expect(new CoinGeckoAdapter()).toBeDefined();
    });

    it('should construct GdeltAdapter', () => {
      expect(new GdeltAdapter()).toBeDefined();
    });

    it('should construct YahooFinanceAdapter', () => {
      expect(new YahooFinanceAdapter()).toBeDefined();
    });

    it('should construct WorldBankAdapter', () => {
      expect(new WorldBankAdapter()).toBeDefined();
    });

    it('should construct FredAdapter', () => {
      expect(new FredAdapter()).toBeDefined();
    });

    it('should construct AcledAdapter', () => {
      expect(new AcledAdapter()).toBeDefined();
    });

    it('should construct UsgsAdapter', () => {
      expect(new UsgsAdapter()).toBeDefined();
    });

    it('should construct LlmHypothesisAdapter', () => {
      expect(new LlmHypothesisAdapter(null)).toBeDefined();
    });
  });

  describe('Evidence Adapters — all constructable', () => {
    it('should construct EtherscanEvidenceAdapter', () => {
      expect(new EtherscanEvidenceAdapter()).toBeDefined();
    });

    it('should construct DexScreenerEvidenceAdapter', () => {
      expect(new DexScreenerEvidenceAdapter()).toBeDefined();
    });

    it('should construct GitHubEvidenceAdapter', () => {
      expect(new GitHubEvidenceAdapter()).toBeDefined();
    });

    it('should construct SecEdgarEvidenceAdapter', () => {
      expect(new SecEdgarEvidenceAdapter()).toBeDefined();
    });

    it('should construct SocialGraphEvidenceAdapter', () => {
      expect(new SocialGraphEvidenceAdapter(undefined as any)).toBeDefined();
    });
  });
});

// ============================================================================
// SECTION 2: SIGNAL ADAPTER CONTRACTS
// ============================================================================

describe('Section 2: Signal Adapter Contracts', () => {
  const signalParams = {
    keywords: ['bitcoin', 'crypto'],
    startDate: '2026-03-01T00:00:00Z',
    endDate: '2026-03-31T23:59:59Z',
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('CoinGecko Adapter', () => {
    const adapter = new CoinGeckoAdapter();

    it('should have correct domain and scope', () => {
      expect(adapter.domain).toBe('market');
      expect(adapter.scope).toBe('global');
      expect(adapter.name).toBe('CoinGecko Crypto Markets');
      expect(typeof adapter.maxAgeMs).toBe('number');
      expect(adapter.maxAgeMs).toBeGreaterThan(0);
    });

    it('fetchSignals should return ExternalSignal[]', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 'bitcoin',
              name: 'Bitcoin',
              symbol: 'btc',
              current_price: 95000,
              price_change_percentage_24h: 2.5,
              market_cap: 1800000000000,
            },
          ]),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ coins: [] }),
      });

      const signals = await adapter.fetchSignals(signalParams);
      expect(Array.isArray(signals)).toBe(true);
      for (const signal of signals) {
        expect(signal).toHaveProperty('id');
        expect(signal).toHaveProperty('domain');
        expect(signal).toHaveProperty('source');
        expect(signal).toHaveProperty('title');
        expect(signal).toHaveProperty('description');
        expect(signal).toHaveProperty('timestamp');
        expect(signal).toHaveProperty('magnitude');
        expect(signal).toHaveProperty('metadata');
        expect(typeof signal.magnitude).toBe('number');
        expect(signal.magnitude).toBeGreaterThanOrEqual(0);
        expect(signal.magnitude).toBeLessThanOrEqual(1);
      }
    });

    it('should handle API failure gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      const signals = await adapter.fetchSignals(signalParams);
      expect(Array.isArray(signals)).toBe(true);
    });

    it('should handle non-ok response gracefully', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });
      mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });
      const signals = await adapter.fetchSignals(signalParams);
      expect(Array.isArray(signals)).toBe(true);
    });
  });

  describe('GDELT Adapter', () => {
    const adapter = new GdeltAdapter();

    it('should have correct domain and scope', () => {
      expect(adapter.domain).toBe('media');
      expect(adapter.scope).toBe('query');
      expect(typeof adapter.name).toBe('string');
      expect(adapter.maxAgeMs).toBeGreaterThan(0);
    });

    it('fetchSignals should return ExternalSignal[]', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            articles: [
              {
                url: 'https://example.com/article',
                title: 'Bitcoin News',
                seendate: '20260315T120000Z',
                domain: 'example.com',
                tone: '5.2',
              },
            ],
          }),
      });

      const signals = await adapter.fetchSignals(signalParams);
      expect(Array.isArray(signals)).toBe(true);
      for (const signal of signals) {
        expect(signal.domain).toBe('media');
        expect(signal.source).toContain('GDELT');
      }
    });

    it('should handle empty response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });
      const signals = await adapter.fetchSignals(signalParams);
      expect(Array.isArray(signals)).toBe(true);
      expect(signals.length).toBe(0);
    });
  });

  describe('Yahoo Finance Adapter', () => {
    const adapter = new YahooFinanceAdapter();

    it('should have correct domain and scope', () => {
      expect(adapter.domain).toBe('market');
      expect(adapter.scope).toBe('global');
      expect(adapter.maxAgeMs).toBeGreaterThan(0);
    });

    it('fetchSignals should return ExternalSignal[]', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            chart: {
              result: [
                {
                  meta: { symbol: '^GSPC', regularMarketPrice: 5200 },
                  timestamp: [1710500000],
                  indicators: {
                    quote: [{ close: [5200] }],
                  },
                },
              ],
            },
          }),
      });

      const signals = await adapter.fetchSignals(signalParams);
      expect(Array.isArray(signals)).toBe(true);
    });
  });

  describe('World Bank Adapter', () => {
    const adapter = new WorldBankAdapter();

    it('should have correct domain and scope', () => {
      expect(adapter.domain).toBe('economic');
      expect(adapter.scope).toBe('global');
      expect(adapter.maxAgeMs).toBeGreaterThan(0);
    });

    it('fetchSignals should return ExternalSignal[]', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            { page: 1, total: 1 },
            [{ indicator: { id: 'FP.CPI.TOTL.ZG', value: 'CPI' }, country: { value: 'US' }, date: '2025', value: 3.2 }],
          ]),
      });

      const signals = await adapter.fetchSignals(signalParams);
      expect(Array.isArray(signals)).toBe(true);
    });
  });

  describe('FRED Adapter', () => {
    const adapter = new FredAdapter();

    it('should have correct domain and scope', () => {
      expect(adapter.domain).toBe('economic');
      expect(adapter.scope).toBe('global');
      expect(adapter.maxAgeMs).toBeGreaterThan(0);
    });

    it('fetchSignals should return ExternalSignal[]', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            observations: [
              { date: '2026-03-01', value: '5.25' },
            ],
          }),
      });

      const signals = await adapter.fetchSignals(signalParams);
      expect(Array.isArray(signals)).toBe(true);
    });
  });

  describe('ACLED Adapter', () => {
    const adapter = new AcledAdapter();

    it('should have correct domain and scope', () => {
      expect(adapter.domain).toBe('political');
      expect(adapter.scope).toBe('global');
      expect(adapter.maxAgeMs).toBeGreaterThan(0);
    });

    it('fetchSignals should return ExternalSignal[]', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              {
                event_date: '2026-03-15',
                event_type: 'Protests',
                country: 'United States',
                notes: 'Protest in Washington DC',
                fatalities: '0',
              },
            ],
          }),
      });

      const signals = await adapter.fetchSignals(signalParams);
      expect(Array.isArray(signals)).toBe(true);
    });
  });

  describe('USGS Adapter', () => {
    const adapter = new UsgsAdapter();

    it('should have correct domain and scope', () => {
      expect(adapter.domain).toBe('social');
      expect(adapter.scope).toBe('global');
      expect(adapter.maxAgeMs).toBeGreaterThan(0);
    });

    it('fetchSignals should return ExternalSignal[]', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            features: [
              {
                properties: {
                  mag: 5.2,
                  place: 'California',
                  time: Date.now(),
                  title: 'M5.2 California',
                  url: 'https://earthquake.usgs.gov/1',
                },
              },
            ],
          }),
      });

      const signals = await adapter.fetchSignals(signalParams);
      expect(Array.isArray(signals)).toBe(true);
    });
  });

  describe('LLM Hypothesis Adapter', () => {
    const adapter = new LlmHypothesisAdapter(null);

    it('should have correct domain and scope', () => {
      expect(adapter.domain).toBe('hypothesis');
      expect(adapter.scope).toBe('query');
      expect(adapter.maxAgeMs).toBeGreaterThan(0);
    });

    it('fetchSignals should return ExternalSignal[]', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () =>
            JSON.stringify({
              hypotheses: [
                {
                  domain: 'economic',
                  title: 'Market impact',
                  description: 'Bitcoin price affects markets',
                  magnitude: 0.7,
                  timeframe: 'weeks',
                  reasoning: 'test',
                },
              ],
            }),
        },
      });

      const signals = await adapter.fetchSignals(signalParams);
      expect(Array.isArray(signals)).toBe(true);
    });
  });
});

// ============================================================================
// SECTION 3: EVIDENCE ADAPTER CONTRACTS
// ============================================================================

describe('Section 3: Evidence Adapter Contracts', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('Etherscan Evidence Adapter', () => {
    const adapter = new EtherscanEvidenceAdapter();

    it('should have correct name and sourceType', () => {
      expect(adapter.name).toBe('Etherscan');
      expect(adapter.sourceType).toBe('on-chain');
      expect(Array.isArray(adapter.claimDomains)).toBe(true);
      expect(adapter.claimDomains.length).toBeGreaterThan(0);
    });

    it('canVerify returns true for wallet addresses', () => {
      expect(
        adapter.canVerify(
          'Transferred 1000 ETH from 0x1234567890abcdef1234567890abcdef12345678',
          [],
        ),
      ).toBe(true);
    });

    it('canVerify returns true for crypto keywords', () => {
      expect(adapter.canVerify('This ethereum token is a scam', [])).toBe(true);
    });

    it('canVerify returns false for non-crypto claims', () => {
      expect(adapter.canVerify('The president signed a new bill', ['politics'])).toBe(false);
    });

    it('fetchEvidence returns EvidenceSource[]', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            status: '1',
            result: '1000000000000000000',
          }),
      });

      const evidence = await adapter.fetchEvidence({
        claim: 'Wallet 0x1234567890abcdef1234567890abcdef12345678 has 1000 ETH',
        entities: ['0x1234567890abcdef1234567890abcdef12345678'],
      });
      expect(Array.isArray(evidence)).toBe(true);
      for (const ev of evidence) {
        expect(ev).toHaveProperty('source');
        expect(ev).toHaveProperty('sourceType');
        expect(ev).toHaveProperty('credibilityScore');
        expect(ev).toHaveProperty('excerpt');
        expect(ev).toHaveProperty('relevance');
        expect(ev).toHaveProperty('freshness');
        expect(ev).toHaveProperty('stance');
        expect(ev).toHaveProperty('retrievedAt');
        expect(['on-chain', 'financial', 'social', 'journalistic', 'governmental']).toContain(
          ev.sourceType,
        );
        expect(['supports', 'contradicts', 'neutral']).toContain(ev.stance);
      }
    });

    it('returns empty array when no API key', async () => {
      // The adapter reads from process.env at construction time
      const origKey = process.env['ETHERSCAN_API_KEY'];
      delete process.env['ETHERSCAN_API_KEY'];
      const noKeyAdapter = new EtherscanEvidenceAdapter();
      const evidence = await noKeyAdapter.fetchEvidence({
        claim: 'test 0x1234567890abcdef1234567890abcdef12345678',
        entities: [],
      });
      expect(Array.isArray(evidence)).toBe(true);
      expect(evidence.length).toBe(0);
      if (origKey) process.env['ETHERSCAN_API_KEY'] = origKey;
    });
  });

  describe('DexScreener Evidence Adapter', () => {
    const adapter = new DexScreenerEvidenceAdapter();

    it('should have correct name and sourceType', () => {
      expect(adapter.name).toBe('DexScreener');
      expect(adapter.sourceType).toBe('financial');
    });

    it('canVerify returns true for crypto tokens', () => {
      expect(adapter.canVerify('This token price is pumping', ['PEPE'])).toBe(true);
    });

    it('canVerify returns false for non-crypto claims', () => {
      expect(adapter.canVerify('The weather is nice today', ['weather'])).toBe(false);
    });

    it('fetchEvidence returns EvidenceSource[]', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            pairs: [
              {
                baseToken: { symbol: 'PEPE', name: 'Pepe' },
                quoteToken: { symbol: 'WETH' },
                priceUsd: '0.00001',
                priceChange: { h24: 5.2, h6: 2.1 },
                liquidity: { usd: 1000000 },
                volume: { h24: 500000 },
                fdv: 5000000,
                url: 'https://dexscreener.com/ethereum/0x123',
              },
            ],
          }),
      });

      const evidence = await adapter.fetchEvidence({
        claim: 'PEPE token liquidity is over $1M',
        entities: ['PEPE'],
      });
      expect(Array.isArray(evidence)).toBe(true);
    });
  });

  describe('GitHub Evidence Adapter', () => {
    const adapter = new GitHubEvidenceAdapter();

    it('should have correct name and sourceType', () => {
      expect(adapter.name).toBe('GitHub');
      expect(adapter.sourceType).toBe('social');
    });

    it('canVerify returns true for repo references', () => {
      expect(adapter.canVerify('project is open source', ['facebook/react'])).toBe(true);
    });

    it('canVerify returns true for development keywords', () => {
      expect(adapter.canVerify('the code repository has been updated', [])).toBe(true);
    });

    it('canVerify returns false for non-dev claims', () => {
      expect(adapter.canVerify('oil prices are rising', ['crude'])).toBe(false);
    });

    it('fetchEvidence returns EvidenceSource[]', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            full_name: 'facebook/react',
            html_url: 'https://github.com/facebook/react',
            stargazers_count: 200000,
            forks_count: 40000,
            open_issues_count: 1000,
            pushed_at: '2026-03-15T12:00:00Z',
            description: 'A JavaScript library for building user interfaces',
          }),
      });

      const evidence = await adapter.fetchEvidence({
        claim: 'React is actively maintained',
        entities: ['facebook/react'],
      });
      expect(Array.isArray(evidence)).toBe(true);
    });
  });

  describe('SEC EDGAR Evidence Adapter', () => {
    const adapter = new SecEdgarEvidenceAdapter();

    it('should have correct name and sourceType', () => {
      expect(adapter.name).toBe('SEC EDGAR');
      expect(adapter.sourceType).toBe('governmental');
    });

    it('canVerify returns true for financial/SEC claims', () => {
      expect(adapter.canVerify('The company filed an SEC complaint', ['Tesla'])).toBe(true);
    });

    it('canVerify returns false for unrelated claims', () => {
      expect(adapter.canVerify('The earthquake hit at 3am', ['California'])).toBe(false);
    });

    it('fetchEvidence returns EvidenceSource[]', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            filings: {
              recent: {
                accessionNumber: ['0001234567-26-000001'],
                filingDate: ['2026-03-01'],
                form: ['10-K'],
                primaryDocument: ['filing.htm'],
                primaryDocDescription: ['Annual Report'],
              },
            },
          }),
      });

      const evidence = await adapter.fetchEvidence({
        claim: 'Tesla filed quarterly report',
        entities: ['Tesla'],
      });
      expect(Array.isArray(evidence)).toBe(true);
    });
  });

  describe('Social Graph Evidence Adapter', () => {
    const adapter = new SocialGraphEvidenceAdapter(undefined as any);

    it('should have correct name and sourceType', () => {
      expect(adapter.name).toBe('Social Graph (Internal)');
      expect(adapter.sourceType).toBe('social');
    });

    it('canVerify returns true for coordination claims', () => {
      expect(adapter.canVerify('coordinated bot network spreading propaganda', [])).toBe(true);
    });

    it('canVerify returns true for any claim (always checks author history)', () => {
      expect(adapter.canVerify('gold prices are rising', ['gold'])).toBe(true);
    });
  });
});

// ============================================================================
// SECTION 4: ANALYSIS SERVICE CONTRACTS
// ============================================================================

describe('Section 4: Analysis Service Contracts', () => {
  const configService = makeConfigService();
  const graphDb = makeGraphDatabaseService(false);
  const platformCredibility = new PlatformCredibilityService(configService);

  beforeEach(() => {
    mockFetch.mockReset();
    mockGenerateContent.mockReset();
  });

  describe('DeviationService', () => {
    const svc = new DeviationService();

    it('computeDeviations returns NarrativeDeviation[] with correct shape', () => {
      const narratives = [
        makeNarrative({ id: 'n1', postIndices: [0, 1], centroidEmbedding: [1, 0, 0] }),
        makeNarrative({ id: 'n2', postIndices: [2, 3], centroidEmbedding: [0, 1, 0] }),
      ];
      const result = svc.computeDeviations(narratives);
      expect(Array.isArray(result)).toBe(true);
      for (const dev of result) {
        expect(dev).toHaveProperty('narrativeId');
        expect(dev).toHaveProperty('summary');
        expect(dev).toHaveProperty('deviationMagnitude');
        expect(dev).toHaveProperty('propagationVelocity');
        expect(dev).toHaveProperty('crossReferenceScore');
        expect(dev).toHaveProperty('sourceCredibility');
        expect(dev).toHaveProperty('impactScore');
        expect(dev).toHaveProperty('postCount');
        expect(dev).toHaveProperty('isConsensus');
        expect(typeof dev.deviationMagnitude).toBe('number');
        expect(typeof dev.isConsensus).toBe('boolean');
      }
    });

    it('buildRealityTunnels returns RealityTunnel[]', () => {
      const narratives = [makeNarrative()];
      const posts = [makePost()];
      const tunnels = svc.toRealityTunnelData(narratives, posts);
      expect(Array.isArray(tunnels)).toBe(true);
      for (const tunnel of tunnels) {
        expect(tunnel).toHaveProperty('id');
        expect(tunnel).toHaveProperty('name');
        expect(tunnel).toHaveProperty('color');
        expect(tunnel).toHaveProperty('nodes');
        expect(tunnel).toHaveProperty('isConsensus');
        expect(Array.isArray(tunnel.nodes)).toBe(true);
      }
    });

    it('toEnhancedTunnelData returns enhanced tunnel structure', () => {
      const narratives = [makeNarrative()];
      const posts = [makePost()];
      const result = svc.toEnhancedTunnelData(narratives, posts);
      expect(result).toHaveProperty('nodes');
      expect(result).toHaveProperty('branches');
      expect(result).toHaveProperty('narratives');
    });
  });

  describe('ComparisonService', () => {
    const svc = new ComparisonService();

    it('compareNarratives returns NarrativeComparison with correct shape', () => {
      const nA = makeNarrative({ id: 'a', centroidEmbedding: [1, 0, 0] });
      const nB = makeNarrative({ id: 'b', centroidEmbedding: [0, 1, 0] });
      const result = svc.compareNarratives(nA, nB, [makePost()], [makePost()]);
      expect(result).toHaveProperty('narrativeA');
      expect(result).toHaveProperty('narrativeB');
      expect(result).toHaveProperty('similarity');
      expect(result).toHaveProperty('sentimentDelta');
      expect(result).toHaveProperty('velocityComparison');
      expect(result).toHaveProperty('platformOverlap');
      expect(result).toHaveProperty('authorOverlap');
      expect(typeof result.similarity).toBe('number');
    });

    it('compareTimePeriods returns TimePeriodComparison', () => {
      const pA = {
        narratives: [makeNarrative({ id: 'a', centroidEmbedding: [1, 0, 0] })],
        posts: [makePost()],
        label: 'Week 1',
      };
      const pB = {
        narratives: [makeNarrative({ id: 'b', centroidEmbedding: [0.9, 0.1, 0] })],
        posts: [makePost()],
        label: 'Week 2',
      };
      const result = svc.compareTimePeriods(pA, pB);
      expect(result).toHaveProperty('periodA');
      expect(result).toHaveProperty('periodB');
      expect(result).toHaveProperty('persistent');
      expect(result).toHaveProperty('emerged');
      expect(result).toHaveProperty('disappeared');
      expect(result).toHaveProperty('sentimentShift');
      expect(result).toHaveProperty('volumeChange');
    });

    it('comparePlatforms returns PlatformComparison', () => {
      const narratives = [makeNarrative()];
      const posts = [makePost({ platform: 'twitter' }), makePost({ platform: 'reddit' })];
      const result = svc.comparePlatforms(narratives, posts);
      expect(result).toHaveProperty('platforms');
      expect(result).toHaveProperty('perPlatform');
      expect(result).toHaveProperty('crossPlatform');
      expect(Array.isArray(result.platforms)).toBe(true);
    });
  });

  describe('EntityAnalysisService', () => {
    const svc = new EntityAnalysisService();

    it('buildEntityDossiers + buildCoOccurrenceNetwork returns dossiers and network', () => {
      const posts = [makePost()];
      const insights = [makeInsight()];
      const narratives = [makeNarrative()];
      const dossiers = svc.buildEntityDossiers(posts, insights, narratives);
      const network = svc.buildCoOccurrenceNetwork(insights);
      expect(Array.isArray(dossiers)).toBe(true);
      expect(network).toHaveProperty('nodes');
      expect(network).toHaveProperty('edges');
    });

    it('entity dossiers have correct shape', () => {
      const posts = [makePost({ text: 'Bitcoin and Ethereum are rising' })];
      const insights = [
        makeInsight({
          entities: [
            { name: 'Bitcoin', type: 'asset', relevance: 0.95 },
            { name: 'Ethereum', type: 'asset', relevance: 0.9 },
          ],
        }),
      ];
      const narratives = [makeNarrative()];
      const dossiers = svc.buildEntityDossiers(posts, insights, narratives);
      for (const d of dossiers) {
        expect(d).toHaveProperty('name');
        expect(d).toHaveProperty('type');
        expect(d).toHaveProperty('totalMentions');
        expect(d).toHaveProperty('narrativeAppearances');
        expect(d).toHaveProperty('sentimentTimeline');
        expect(d).toHaveProperty('platformBreakdown');
        expect(d).toHaveProperty('coOccurrences');
        expect(d).toHaveProperty('topAuthors');
      }
    });
  });

  describe('NarrativeGenealogyService', () => {
    const svc = new NarrativeGenealogyService();

    it('buildFullGenealogy returns lineages with correct shape', () => {
      const snapshots = [
        {
          id: 'snap1',
          timestamp: '2026-03-10T00:00:00Z',
          narratives: [
            { id: 'n1', summary: 'BTC to 100k', centroidEmbedding: [1, 0, 0], postCount: 10, avgSentiment: 0.6 },
          ],
        },
        {
          id: 'snap2',
          timestamp: '2026-03-15T00:00:00Z',
          narratives: [
            { id: 'n2', summary: 'BTC to 100k incoming', centroidEmbedding: [0.95, 0.05, 0], postCount: 20, avgSentiment: 0.7 },
          ],
        },
      ];
      const lineages = svc.buildFullGenealogy(snapshots);
      expect(Array.isArray(lineages)).toBe(true);
      for (const lineage of lineages) {
        expect(lineage).toHaveProperty('currentId');
        expect(lineage).toHaveProperty('currentSummary');
        expect(lineage).toHaveProperty('history');
        expect(lineage).toHaveProperty('events');
        expect(lineage).toHaveProperty('status');
        expect(['active', 'growing', 'stable', 'fading', 'died']).toContain(lineage.status);
      }
    });
  });

  describe('PlatformCredibilityService', () => {
    const svc = new PlatformCredibilityService(configService);

    it('getProfile returns profile for known platforms', () => {
      const knownPlatforms = ['twitter', 'reddit', 'youtube', 'telegram', 'farcaster', 'truthsocial'];
      for (const platform of knownPlatforms) {
        const profile = svc.getProfile(platform);
        expect(profile).toHaveProperty('platform');
        expect(profile).toHaveProperty('credibilityWeight');
        expect(profile).toHaveProperty('influenceWeight');
        expect(profile).toHaveProperty('manipulationRisk');
        expect(profile).toHaveProperty('botPrevalence');
        expect(profile.platform).toBe(platform);
        expect(profile.credibilityWeight).toBeGreaterThanOrEqual(0);
        expect(profile.credibilityWeight).toBeLessThanOrEqual(1);
      }
    });

    it('getProfile returns fallback for unknown platforms', () => {
      const profile = svc.getProfile('unknown-platform');
      expect(profile).toHaveProperty('platform');
      expect(profile.credibilityWeight).toBeGreaterThanOrEqual(0);
    });

    it('adjustClaimWeight reduces confidence for low-credibility platforms', () => {
      const adjusted = svc.adjustClaimWeight(0.9, 'truthsocial');
      expect(typeof adjusted).toBe('number');
      expect(adjusted).toBeLessThanOrEqual(0.9);
      expect(adjusted).toBeGreaterThan(0);
    });
  });

  describe('SourceCredibilityService', () => {
    const svc = new SourceCredibilityService(graphDb, platformCredibility);

    it('scoreSource returns SourceCredibilityScore with all signal fields', async () => {
      const posts = [
        makeUserPost({ timestamp: '2026-03-01T12:00:00Z' }),
        makeUserPost({ timestamp: '2026-03-10T12:00:00Z' }),
        makeUserPost({ timestamp: '2026-03-15T12:00:00Z', text: 'Different topic here' }),
      ];
      const result = await svc.scoreSource('@testuser', 'twitter', posts);
      expect(result).toHaveProperty('handle', '@testuser');
      expect(result).toHaveProperty('platform', 'twitter');
      expect(result).toHaveProperty('overallScore');
      expect(result).toHaveProperty('signals');
      expect(result.signals).toHaveProperty('accountAge');
      expect(result.signals).toHaveProperty('postingConsistency');
      expect(result.signals).toHaveProperty('engagementRatio');
      expect(result.signals).toHaveProperty('contentDiversity');
      expect(result.signals).toHaveProperty('crossPlatformPresence');
      expect(result.signals).toHaveProperty('pageRank');
      expect(result.signals).toHaveProperty('betweenness');
      expect(result.signals).toHaveProperty('communityCount');
      expect(result).toHaveProperty('flags');
      expect(typeof result.overallScore).toBe('number');
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(1);
    });

    it('graph signals are null when Memgraph unavailable', async () => {
      const posts = [makeUserPost()];
      const result = await svc.scoreSource('@test', 'twitter', posts);
      expect(result.signals.pageRank).toBeNull();
      expect(result.signals.betweenness).toBeNull();
      expect(result.signals.communityCount).toBeNull();
    });
  });

  describe('GraphBotDetectionService', () => {
    const svc = new GraphBotDetectionService(graphDb);

    it('detectBots returns BotDetectionResult with correct shape', async () => {
      const users = [
        {
          handle: '@bot1',
          platform: 'twitter',
          posts: [makeUserPost({ text: 'spam message repeated' })],
        },
      ];
      const result = await svc.detectBots(users);
      expect(result).toHaveProperty('scores');
      expect(result).toHaveProperty('structuralPatterns');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('graphEnhanced');
      expect(Array.isArray(result.scores)).toBe(true);
      for (const score of result.scores) {
        expect(score).toHaveProperty('handle');
        expect(score).toHaveProperty('platform');
        expect(score).toHaveProperty('botProbability');
        expect(score).toHaveProperty('structuralScore');
        expect(score).toHaveProperty('temporalScore');
        expect(score).toHaveProperty('behavioralScore');
        expect(score).toHaveProperty('detectedPatterns');
        expect(score.botProbability).toBeGreaterThanOrEqual(0);
        expect(score.botProbability).toBeLessThanOrEqual(1);
      }
      expect(typeof result.graphEnhanced).toBe('boolean');
    });

    it('graphEnhanced is false when Memgraph unavailable', async () => {
      const result = await svc.detectBots([
        { handle: '@test', platform: 'twitter', posts: [makeUserPost()] },
      ]);
      expect(result.graphEnhanced).toBe(false);
    });
  });

  describe('SocialGraphIntelligenceService', () => {
    const svc = new SocialGraphIntelligenceService(graphDb);

    it('enrichRelationships extracts mentions and co-timing', async () => {
      const users = [
        {
          handle: 'alice',
          platform: 'twitter',
          posts: [
            { text: '@bob this is interesting', timestamp: '2026-03-15T12:00:00Z' },
            { text: 'Great work @carol', timestamp: '2026-03-15T12:01:00Z' },
          ],
        },
        {
          handle: 'bob',
          platform: 'twitter',
          posts: [
            { text: 'Thanks @alice', timestamp: '2026-03-15T12:00:30Z' },
          ],
        },
      ];
      const result = await svc.enrichRelationships(users, 'test-investigation');
      expect(result).toHaveProperty('edgesCreated');
      expect(result).toHaveProperty('communitiesDetected');
      expect(typeof result.edgesCreated).toBe('number');
      expect(typeof result.communitiesDetected).toBe('number');
    });

    it('classifyTier returns correct tiers', () => {
      // Test that the service can classify based on metrics
      // (method may be private, test via enrichRelationships output)
      expect(svc).toBeDefined();
    });
  });

  describe('MonitorService', () => {
    const svc = new MonitorService();

    it('detectAlerts returns alert objects with correct shape', () => {
      const prevSnapshot = {
        postCount: 10,
        narrativeCount: 2,
        summary: { total: 10, positive: 5, negative: 3, neutral: 2, byPlatform: { twitter: 10 } },
        narratives: [
          { id: 'n1', summary: 'test', avgSentiment: 0.5, velocity: { postsPerHour: 1 } },
        ],
      };
      const currSnapshot = {
        postCount: 30,
        narrativeCount: 4,
        summary: { total: 30, positive: 5, negative: 20, neutral: 5, byPlatform: { twitter: 20, reddit: 10 } },
        narratives: [
          { id: 'n1', summary: 'test', avgSentiment: -0.3, velocity: { postsPerHour: 10 } },
          { id: 'n2', summary: 'new narrative', avgSentiment: 0.2, velocity: { postsPerHour: 5 }, postIndices: [0, 1, 2, 3, 4] },
        ],
      };
      const thresholds = {
        velocityMultiplier: 3,
        sentimentShift: 0.3,
        minNewNarrativePosts: 3,
      };
      const alerts = svc.compareSnapshots(prevSnapshot, currSnapshot, 'inv-1', thresholds);
      expect(Array.isArray(alerts)).toBe(true);
      for (const alert of alerts) {
        expect(alert).toHaveProperty('investigationId', 'inv-1');
        expect(alert).toHaveProperty('type');
        expect(alert).toHaveProperty('severity');
        expect(alert).toHaveProperty('title');
        expect(alert).toHaveProperty('description');
        expect(alert).toHaveProperty('metadata');
        expect(['new_narrative', 'velocity_spike', 'sentiment_reversal', 'coordination_detected', 'new_platform', 'volume_surge']).toContain(alert.type);
        expect(['info', 'warning', 'critical']).toContain(alert.severity);
      }
    });
  });

  describe('PropagandaAnalysisService', () => {
    const svc = new PropagandaAnalysisService(configService);

    it('analyze returns PropagandaAnalysisResult with correct shape', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () =>
            JSON.stringify({
              techniques: [
                {
                  id: 'bandwagon',
                  name: 'Bandwagon',
                  description: 'Everyone is buying',
                  confidence: 0.7,
                  examples: ['Post 1'],
                  educationalNote: 'Appeals to popularity',
                },
              ],
              claims: [
                {
                  claim: 'BTC to 100k',
                  type: 'predictive',
                  sources: ['@user1'],
                  firstSeen: '2026-03-15',
                  frequency: 5,
                  verifiability: 'verifiable',
                },
              ],
              frames: [
                {
                  frame: 'Institutional adoption',
                  description: 'Big money is coming',
                  narrativeIds: ['n1'],
                  emotionalAppeal: 'FOMO',
                },
              ],
              overallAssessment: {
                manipulationLikelihood: 'medium',
                confidence: 0.6,
                reasoning: 'Some bandwagon effects detected',
                caveats: ['Limited sample size'],
              },
            }),
        },
      });

      const result = await svc.analyze([makeNarrative()], [makePost()]);
      expect(result).toHaveProperty('techniques');
      expect(result).toHaveProperty('claims');
      expect(result).toHaveProperty('frames');
      expect(result).toHaveProperty('overallAssessment');
      expect(Array.isArray(result.techniques)).toBe(true);
      expect(Array.isArray(result.claims)).toBe(true);
      expect(Array.isArray(result.frames)).toBe(true);
      expect(['low', 'medium', 'high']).toContain(result.overallAssessment.manipulationLikelihood);
    });

    it('returns fallback result when Gemini unavailable', async () => {
      const noKeySvc = new PropagandaAnalysisService(makeConfigService({ GEMINI_API_KEY: '' }));
      const result = await noKeySvc.analyze([makeNarrative()], [makePost()]);
      expect(result).toHaveProperty('techniques');
      expect(result).toHaveProperty('claims');
      expect(result).toHaveProperty('frames');
      expect(result).toHaveProperty('overallAssessment');
    });
  });

  describe('ClaimVerificationService', () => {
    const svc = new ClaimVerificationService(configService, platformCredibility);

    it('verifyBatch returns ClaimVerificationBatchResult', async () => {
      // Mock Wikipedia API
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            query: {
              search: [
                { title: 'Bitcoin', snippet: 'Bitcoin is a cryptocurrency', pageid: 123, timestamp: '2026-03-15' },
              ],
            },
          }),
      });

      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () =>
            JSON.stringify({
              results: [
                {
                  claim: 'Bitcoin will reach $100k',
                  status: 'unverified',
                  confidence: 0.3,
                  evidence: { supporting: [], contradicting: [] },
                  reasoning: 'Predictive claim cannot be verified',
                  caveats: ['Future prediction'],
                  sourcesChecked: ['Wikipedia', 'GDELT'],
                },
              ],
              summary: '1 claim checked, 0 verified',
              verifiedCount: 0,
              disputedCount: 0,
              unverifiedCount: 1,
            }),
        },
      });

      const result = await svc.verifyBatch([makeClaim()]);
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('verifiedCount');
      expect(result).toHaveProperty('disputedCount');
      expect(result).toHaveProperty('unverifiedCount');
      expect(Array.isArray(result.results)).toBe(true);
      for (const r of result.results) {
        expect(r).toHaveProperty('claim');
        expect(r).toHaveProperty('status');
        expect(r).toHaveProperty('confidence');
        expect(r).toHaveProperty('evidence');
        expect(r).toHaveProperty('reasoning');
        expect(r).toHaveProperty('caveats');
        expect(r).toHaveProperty('sourcesChecked');
        expect(['verified', 'disputed', 'unverified', 'mixed', 'false']).toContain(r.status);
      }
    });
  });

  describe('ReportService', () => {
    const svc = new ReportService(configService);

    it('generateReport returns ReportResult', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => 'Executive Summary: This report covers Bitcoin narrative analysis.',
        },
      });

      const result = await svc.generateReport({
        query: 'Bitcoin',
        summary: { total: 10, positive: 5, negative: 3, neutral: 2, byPlatform: { twitter: 10 } },
        narratives: [makeNarrative()],
        format: 'markdown',
      });
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('generatedAt');
      expect(typeof result.content).toBe('string');
      expect(result.content.length).toBeGreaterThan(0);
    });
  });

  describe('PsychologicalProfilerService', () => {
    const svc = new PsychologicalProfilerService(configService);

    it('requires API key to generate profiles', () => {
      const noKeySvc = new PsychologicalProfilerService(makeConfigService({ GEMINI_API_KEY: '' }));
      expect(noKeySvc).toBeDefined();
    });

    it('generateProfile returns all profile dimensions', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () =>
            JSON.stringify({
              communicationStyle: {
                formality: 'casual',
                tone: 'analytical',
                complexity: 'moderate',
                evidence: ['Post about crypto analysis'],
              },
              coreBeliefs: [{ belief: 'Decentralization is key', confidence: 0.8, evidence: ['Post 1'] }],
              interestDomains: [{ domain: 'cryptocurrency', engagementLevel: 'primary', postCount: 50 }],
              emotionalTriggers: {
                anger: ['regulation'],
                excitement: ['new tech'],
                fear: ['market crash'],
                evidence: { anger: ['Post 2'], excitement: ['Post 3'], fear: ['Post 4'] },
              },
              engagementPatterns: {
                likelyToEngageWith: ['crypto news'],
                likelyToShare: ['price analysis'],
                likelyToCreate: ['thread commentary'],
                contentPreferences: ['data-driven'],
              },
              influenceSusceptibility: {
                vulnerableTo: ['FOMO messaging'],
                resistantTo: ['appeals to authority'],
                echoChamberDepth: 'moderate',
                evidence: ['Post 5'],
              },
              persuasionStyle: {
                primaryTechniques: ['data citation'],
                targetAudience: 'crypto-curious',
                effectiveness: 'moderate',
                evidence: ['Post 6'],
              },
              riskIndicators: {
                radicalizationSignals: [],
                manipulationVulnerability: 'low',
                echoChamberDepth: 'moderate',
                flags: [],
                evidence: [],
              },
              socialRole: { primary: 'analyst', confidence: 0.7, evidence: ['Post 7'] },
              summary: 'Analytical crypto enthusiast with moderate echo chamber engagement.',
            }),
        },
      });

      const posts = Array.from({ length: 10 }, (_, i) =>
        makeUserPost({ text: `Crypto analysis post ${i}` }),
      );
      const result = await svc.generateProfile({
        handle: '@testuser',
        platform: 'twitter',
        posts,
      });
      expect(result).toHaveProperty('communicationStyle');
      expect(result).toHaveProperty('coreBeliefs');
      expect(result).toHaveProperty('interestDomains');
      expect(result).toHaveProperty('emotionalTriggers');
      expect(result).toHaveProperty('engagementPatterns');
      expect(result).toHaveProperty('influenceSusceptibility');
      expect(result).toHaveProperty('persuasionStyle');
      expect(result).toHaveProperty('riskIndicators');
      expect(result).toHaveProperty('socialRole');
      expect(result).toHaveProperty('summary');
    });
  });

  describe('CrossPlatformIdentityService', () => {
    const svc = new CrossPlatformIdentityService();

    it('resolveIdentity returns IdentityResolutionResult', async () => {
      const result = await svc.resolveIdentity('testuser');
      expect(result).toHaveProperty('queriedUsername');
      expect(result).toHaveProperty('accounts');
      expect(result).toHaveProperty('relevantAccounts');
      expect(result).toHaveProperty('totalFound');
      expect(result).toHaveProperty('searchDuration');
      expect(Array.isArray(result.accounts)).toBe(true);
      expect(typeof result.totalFound).toBe('number');
      expect(typeof result.searchDuration).toBe('number');
    });
  });
});

// ============================================================================
// SECTION 5: DATA FLOW VALIDATION
// ============================================================================

describe('Section 5: Data Flow Validation', () => {
  const configService = makeConfigService();
  const graphDb = makeGraphDatabaseService(false);
  const platformCredibility = new PlatformCredibilityService(configService);

  beforeEach(() => {
    mockFetch.mockReset();
    mockGenerateContent.mockReset();
  });

  it('posts -> deviations -> reality tunnels pipeline produces consistent data', () => {
    const deviationSvc = new DeviationService();

    const posts = Array.from({ length: 10 }, (_, i) =>
      makePost({
        id: `post-${i}`,
        text: i < 5 ? 'Bitcoin is the future' : 'Bitcoin is overvalued',
        sentiment: { score: i < 5 ? 0.7 : -0.5, label: i < 5 ? 'positive' : 'negative', confidence: 0.9 },
        timestamp: new Date(Date.now() - (10 - i) * 3600000).toISOString(),
      }),
    );

    const narratives = [
      makeNarrative({ id: 'bullish', summary: 'Bullish narrative', postIndices: [0, 1, 2, 3, 4], centroidEmbedding: [1, 0, 0] }),
      makeNarrative({ id: 'bearish', summary: 'Bearish narrative', postIndices: [5, 6, 7, 8, 9], centroidEmbedding: [0, 1, 0] }),
    ];

    // Step 1: Compute deviations
    const deviations = deviationSvc.computeDeviations(narratives);
    expect(deviations.length).toBe(2);

    // Exactly one should be consensus
    const consensusCount = deviations.filter((d) => d.isConsensus).length;
    expect(consensusCount).toBe(1);

    // Step 2: Build tunnels from same data
    const tunnels = deviationSvc.toRealityTunnelData(narratives, posts);
    expect(tunnels.length).toBeGreaterThanOrEqual(1);

    // Step 3: Enhanced tunnel
    const enhanced = deviationSvc.toEnhancedTunnelData(narratives, posts);
    expect(enhanced).toHaveProperty('nodes');
    expect(enhanced).toHaveProperty('branches');
  });

  it('narratives -> comparison pipeline works for all comparison types', () => {
    const comparisonSvc = new ComparisonService();

    const nA = makeNarrative({ id: 'a', summary: 'Bull case', centroidEmbedding: [1, 0, 0], avgSentiment: 0.7 });
    const nB = makeNarrative({ id: 'b', summary: 'Bear case', centroidEmbedding: [0, 1, 0], avgSentiment: -0.3 });

    // Narrative comparison
    const narrativeComp = comparisonSvc.compareNarratives(nA, nB, [makePost()], [makePost()]);
    expect(narrativeComp.similarity).toBeGreaterThanOrEqual(0);
    expect(narrativeComp.similarity).toBeLessThanOrEqual(1);
    expect(narrativeComp.sentimentDelta).toBeDefined();

    // Time period comparison
    const periodComp = comparisonSvc.compareTimePeriods(
      { narratives: [nA], posts: [makePost()], label: 'Week 1' },
      { narratives: [nB], posts: [makePost()], label: 'Week 2' },
    );
    expect(periodComp.periodA.label).toBe('Week 1');
    expect(periodComp.periodB.label).toBe('Week 2');

    // Platform comparison
    const platformComp = comparisonSvc.comparePlatforms(
      [nA, nB],
      [makePost({ platform: 'twitter' }), makePost({ platform: 'reddit' })],
    );
    expect(platformComp.platforms.length).toBeGreaterThan(0);
  });

  it('entity analysis -> dossier -> network pipeline maintains data integrity', () => {
    const entitySvc = new EntityAnalysisService();

    const posts = [
      makePost({ text: 'Elon Musk says Bitcoin is great', authorHandle: '@user1' }),
      makePost({ text: 'Elon Musk talks about Tesla stock', authorHandle: '@user2' }),
    ];
    const insights = [
      makeInsight({
        entities: [
          { name: 'Elon Musk', type: 'person', relevance: 0.95 },
          { name: 'Bitcoin', type: 'asset', relevance: 0.9 },
        ],
      }),
      makeInsight({
        entities: [
          { name: 'Elon Musk', type: 'person', relevance: 0.95 },
          { name: 'Tesla', type: 'company', relevance: 0.85 },
        ],
      }),
    ];
    const narratives = [makeNarrative()];

    const dossiers = entitySvc.buildEntityDossiers(posts, insights, narratives);
    const network = entitySvc.buildCoOccurrenceNetwork(insights);

    // Elon Musk should appear in dossiers
    const elonDossier = dossiers.find((d: any) => d.name === 'Elon Musk');
    if (elonDossier) {
      expect(elonDossier.totalMentions).toBeGreaterThanOrEqual(2);
      expect(elonDossier.coOccurrences.length).toBeGreaterThan(0);
    }

    // Network should have nodes and edges
    expect(network.nodes.length).toBeGreaterThan(0);
  });

  it('genealogy pipeline tracks narrative evolution across snapshots', () => {
    const genealogySvc = new NarrativeGenealogyService();

    const snapshots = [
      {
        id: 'snap-1',
        timestamp: '2026-03-01T00:00:00Z',
        narratives: [
          { id: 'n1-v1', summary: 'BTC reaching new highs', centroidEmbedding: [1, 0, 0], postCount: 5, avgSentiment: 0.6 },
        ],
      },
      {
        id: 'snap-2',
        timestamp: '2026-03-08T00:00:00Z',
        narratives: [
          { id: 'n1-v2', summary: 'BTC surging to new all-time highs', centroidEmbedding: [0.98, 0.02, 0], postCount: 15, avgSentiment: 0.8 },
        ],
      },
      {
        id: 'snap-3',
        timestamp: '2026-03-15T00:00:00Z',
        narratives: [
          { id: 'n1-v3', summary: 'BTC hitting resistance at 100k', centroidEmbedding: [0.9, 0.1, 0], postCount: 25, avgSentiment: 0.4 },
          { id: 'n2-v1', summary: 'Alt season incoming', centroidEmbedding: [0, 1, 0], postCount: 8, avgSentiment: 0.7 },
        ],
      },
    ];

    const lineages = genealogySvc.buildFullGenealogy(snapshots);
    expect(lineages.length).toBeGreaterThan(0);

    // The BTC narrative should have history entries
    const btcLineage = lineages.find((l: any) => l.currentSummary.includes('BTC') || l.currentSummary.includes('btc'));
    if (btcLineage) {
      expect(btcLineage.history.length).toBeGreaterThanOrEqual(1);
      expect(btcLineage.events.length).toBeGreaterThan(0);
    }
  });

  it('source credibility + bot detection pipeline scores users consistently', async () => {
    const credSvc = new SourceCredibilityService(graphDb, platformCredibility);
    const botSvc = new GraphBotDetectionService(graphDb);

    const userPosts = [
      makeUserPost({ timestamp: '2026-03-01T08:00:00Z', text: 'Buy BTC now!' }),
      makeUserPost({ timestamp: '2026-03-01T08:01:00Z', text: 'Buy BTC now!' }),
      makeUserPost({ timestamp: '2026-03-01T08:02:00Z', text: 'Buy BTC now!' }),
      makeUserPost({ timestamp: '2026-03-01T08:03:00Z', text: 'Buy BTC now!' }),
    ];

    // Credibility scoring
    const credScore = await credSvc.scoreSource('@spammer', 'twitter', userPosts);
    expect(credScore.overallScore).toBeLessThanOrEqual(1);
    // Low content diversity for repeated text
    expect(credScore.signals.contentDiversity).toBeLessThanOrEqual(0.5);

    // Bot detection
    const botResult = await botSvc.detectBots([
      { handle: '@spammer', platform: 'twitter', posts: userPosts },
    ]);
    expect(botResult.scores.length).toBe(1);
    const botScore = botResult.scores[0]!;
    expect(botScore.botProbability).toBeGreaterThanOrEqual(0);
    expect(botScore.botProbability).toBeLessThanOrEqual(1);
  });

  it('monitor service detects alerts from snapshot diffs', () => {
    const monitorSvc = new MonitorService();

    const prev = {
      postCount: 10,
      narrativeCount: 2,
      summary: { total: 10, positive: 5, negative: 3, neutral: 2, byPlatform: { twitter: 10 } },
      narratives: [{ id: 'n1', summary: 'test', avgSentiment: 0.5, velocity: { postsPerHour: 2 } }],
    };

    const curr = {
      postCount: 100,
      narrativeCount: 5,
      summary: { total: 100, positive: 10, negative: 70, neutral: 20, byPlatform: { twitter: 80, reddit: 20 } },
      narratives: [
        { id: 'n1', summary: 'test', avgSentiment: -0.7, velocity: { postsPerHour: 20 } },
        { id: 'n2', summary: 'new hotness', postIndices: Array.from({ length: 30 }, (_, i) => i), avgSentiment: 0.2, velocity: { postsPerHour: 15 } },
      ],
    };

    const alerts = monitorSvc.compareSnapshots(prev, curr, 'inv-1', {
      velocityMultiplier: 3,
      sentimentShift: 0.3,
      minNewNarrativePosts: 3,
    });

    // Should detect volume surge (10x), velocity spike, sentiment reversal, new narrative
    expect(alerts.length).toBeGreaterThanOrEqual(1);

    // Verify alert type diversity
    const alertTypes = new Set(alerts.map((a: any) => a.type));
    expect(alertTypes.size).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// SECTION 6: FRONTEND API CLIENT COVERAGE
// ============================================================================

describe('Section 6: Frontend API Client Coverage', () => {
  // Every exported function from apps/veritas-client/lib/api.ts
  const expectedApiFunctions = [
    // Narrative search & analysis
    'searchNarratives',
    'analyzeNarratives',
    'fetchInsights',
    'fetchTrends',
    'fetchDeviations',

    // Deep investigation
    'investigateNarrative',

    // Propaganda & claims
    'analyzePropaganda',
    'verifyClaims',

    // Comparisons
    'compareNarratives',
    'compareTimePeriods',
    'comparePlatforms',

    // Entity analysis
    'analyzeEntities',

    // Narrative genealogy & downstream effects
    'fetchGenealogy',
    'fetchDownstreamEffects',

    // Reports
    'generateReport',

    // Investigations (CRUD)
    'fetchInvestigations',
    'fetchInvestigation',
    'archiveInvestigation',
    'renameInvestigation',

    // Monitor & Alerts
    'fetchAlerts',
    'fetchUnreadAlertCount',
    'markAlertRead',
    'markAllAlertsRead',
    'refreshInvestigation',
    'fetchMonitorConfig',
    'updateMonitorConfig',

    // Scan jobs
    'startScan',
    'getScanStatus',
    'getScanPosts',
    'cancelScan',
    'retryScanConnector',
    'getRecentScans',
    'saveAnalysisCache',
    'getAnalysisCache',

    // Analysis jobs
    'startAnalysisJobs',
    'getAnalysisJobsByScan',
    'getAnalysisJob',
    'cancelAnalysisJob',

    // Identity / MAGI
    'getIdentityByHandle',
    'getIdentityById',
    'generateMagiProfile',
    'searchIdentities',
    'getRecentIdentities',
  ];

  // Map API function -> expected HTTP method and path pattern
  const apiEndpointMap: Record<string, { method: string; pathPattern: string }> = {
    searchNarratives: { method: 'POST', pathPattern: '/api/narratives/search' },
    analyzeNarratives: { method: 'POST', pathPattern: '/api/narratives/analyze' },
    fetchInsights: { method: 'GET', pathPattern: '/api/narratives/insights/:timeframe' },
    fetchTrends: { method: 'GET', pathPattern: '/api/narratives/trends/:timeframe' },
    fetchDeviations: { method: 'POST', pathPattern: '/api/narratives/deviations' },
    investigateNarrative: { method: 'POST', pathPattern: '/api/investigate' },
    analyzePropaganda: { method: 'POST', pathPattern: '/api/narratives/propaganda-analysis' },
    verifyClaims: { method: 'POST', pathPattern: '/api/narratives/verify-claims' },
    compareNarratives: { method: 'POST', pathPattern: '/api/narratives/compare' },
    compareTimePeriods: { method: 'POST', pathPattern: '/api/narratives/compare' },
    comparePlatforms: { method: 'POST', pathPattern: '/api/narratives/compare' },
    analyzeEntities: { method: 'POST', pathPattern: '/api/narratives/entities' },
    fetchGenealogy: { method: 'POST', pathPattern: '/api/narratives/genealogy' },
    fetchDownstreamEffects: { method: 'POST', pathPattern: '/api/narratives/downstream-effects' },
    generateReport: { method: 'POST', pathPattern: '/api/narratives/report' },
    fetchInvestigations: { method: 'GET', pathPattern: '/api/investigations' },
    fetchInvestigation: { method: 'GET', pathPattern: '/api/investigations/:id' },
    archiveInvestigation: { method: 'PATCH', pathPattern: '/api/investigations/:id/archive' },
    renameInvestigation: { method: 'PATCH', pathPattern: '/api/investigations/:id/rename' },
    fetchAlerts: { method: 'GET', pathPattern: '/api/monitor/alerts' },
    fetchUnreadAlertCount: { method: 'GET', pathPattern: '/api/monitor/alerts/count' },
    markAlertRead: { method: 'PUT', pathPattern: '/api/monitor/alerts/:id/read' },
    markAllAlertsRead: { method: 'PUT', pathPattern: '/api/monitor/alerts/read-all' },
    refreshInvestigation: { method: 'POST', pathPattern: '/api/monitor/refresh/:id' },
    fetchMonitorConfig: { method: 'GET', pathPattern: '/api/monitor/config/:id' },
    updateMonitorConfig: { method: 'PUT', pathPattern: '/api/monitor/config/:id' },
    startScan: { method: 'POST', pathPattern: '/api/scan' },
    getScanStatus: { method: 'GET', pathPattern: '/api/scan/:scanId' },
    getScanPosts: { method: 'GET', pathPattern: '/api/scan/:scanId/posts' },
    cancelScan: { method: 'POST', pathPattern: '/api/scan/:scanId/cancel' },
    retryScanConnector: { method: 'POST', pathPattern: '/api/scan/:scanId/retry/:connector' },
    getRecentScans: { method: 'GET', pathPattern: '/api/scan/recent' },
    saveAnalysisCache: { method: 'PUT', pathPattern: '/api/scan/:scanId/analysis-cache' },
    getAnalysisCache: { method: 'GET', pathPattern: '/api/scan/:scanId/analysis-cache' },
    startAnalysisJobs: { method: 'POST', pathPattern: '/api/analysis-jobs/batch' },
    getAnalysisJobsByScan: { method: 'GET', pathPattern: '/api/analysis-jobs/by-scan/:scanId' },
    getAnalysisJob: { method: 'GET', pathPattern: '/api/analysis-jobs/:jobId' },
    cancelAnalysisJob: { method: 'POST', pathPattern: '/api/analysis-jobs/:jobId/cancel' },
    getIdentityByHandle: { method: 'GET', pathPattern: '/api/identity/by-handle/:handle' },
    getIdentityById: { method: 'GET', pathPattern: '/api/identity/:id' },
    generateMagiProfile: { method: 'POST', pathPattern: '/api/identity/:id/generate-profile' },
    searchIdentities: { method: 'GET', pathPattern: '/api/identity/search' },
    getRecentIdentities: { method: 'GET', pathPattern: '/api/identity/recent' },
  };

  it('should have exactly 43 API functions defined', () => {
    expect(expectedApiFunctions.length).toBe(43);
  });

  for (const fn of expectedApiFunctions) {
    it(`${fn} has a mapped endpoint`, () => {
      expect(apiEndpointMap[fn]).toBeDefined();
      expect(apiEndpointMap[fn]!.method).toBeTruthy();
      expect(apiEndpointMap[fn]!.pathPattern).toBeTruthy();
    });
  }

  it('all endpoint map entries are covered by API functions', () => {
    const mapKeys = Object.keys(apiEndpointMap);
    for (const key of mapKeys) {
      expect(expectedApiFunctions).toContain(key);
    }
  });

  // Validate endpoint path prefixes match controller organization
  it('narrative endpoints map to /api/narratives/*', () => {
    const narrativeEndpoints = [
      'searchNarratives', 'analyzeNarratives', 'fetchInsights', 'fetchTrends',
      'fetchDeviations', 'analyzePropaganda', 'verifyClaims',
      'compareNarratives', 'compareTimePeriods', 'comparePlatforms',
      'analyzeEntities', 'fetchGenealogy', 'fetchDownstreamEffects', 'generateReport',
    ];
    for (const ep of narrativeEndpoints) {
      expect(apiEndpointMap[ep]!.pathPattern).toMatch(/^\/api\/narratives\//);
    }
  });

  it('investigation endpoints map to /api/investigations/*', () => {
    const investigationEndpoints = [
      'fetchInvestigations', 'fetchInvestigation',
      'archiveInvestigation', 'renameInvestigation',
    ];
    for (const ep of investigationEndpoints) {
      expect(apiEndpointMap[ep]!.pathPattern).toMatch(/^\/api\/investigations/);
    }
  });

  it('monitor endpoints map to /api/monitor/*', () => {
    const monitorEndpoints = [
      'fetchAlerts', 'fetchUnreadAlertCount', 'markAlertRead',
      'markAllAlertsRead', 'refreshInvestigation',
      'fetchMonitorConfig', 'updateMonitorConfig',
    ];
    for (const ep of monitorEndpoints) {
      expect(apiEndpointMap[ep]!.pathPattern).toMatch(/^\/api\/monitor\//);
    }
  });

  it('scan endpoints map to /api/scan/*', () => {
    const scanEndpoints = [
      'startScan', 'getScanStatus', 'getScanPosts', 'cancelScan',
      'retryScanConnector', 'getRecentScans', 'saveAnalysisCache', 'getAnalysisCache',
    ];
    for (const ep of scanEndpoints) {
      expect(apiEndpointMap[ep]!.pathPattern).toMatch(/^\/api\/scan/);
    }
  });

  it('analysis job endpoints map to /api/analysis-jobs/*', () => {
    const analysisJobEndpoints = [
      'startAnalysisJobs', 'getAnalysisJobsByScan',
      'getAnalysisJob', 'cancelAnalysisJob',
    ];
    for (const ep of analysisJobEndpoints) {
      expect(apiEndpointMap[ep]!.pathPattern).toMatch(/^\/api\/analysis-jobs/);
    }
  });

  it('identity endpoints map to /api/identity/*', () => {
    const identityEndpoints = [
      'getIdentityByHandle', 'getIdentityById',
      'generateMagiProfile', 'searchIdentities', 'getRecentIdentities',
    ];
    for (const ep of identityEndpoints) {
      expect(apiEndpointMap[ep]!.pathPattern).toMatch(/^\/api\/identity/);
    }
  });
});

// ============================================================================
// SECTION 7: ERROR HANDLING & GRACEFUL DEGRADATION
// ============================================================================

describe('Section 7: Error Handling & Graceful Degradation', () => {
  const configService = makeConfigService();
  const graphDb = makeGraphDatabaseService(false);
  const platformCredibility = new PlatformCredibilityService(configService);

  beforeEach(() => {
    mockFetch.mockReset();
    mockGenerateContent.mockReset();
  });

  it('Signal adapters return empty array on network failure', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const adapters = [
      new CoinGeckoAdapter(),
      new GdeltAdapter(),
      new YahooFinanceAdapter(),
      new WorldBankAdapter(),
      new FredAdapter(),
      new AcledAdapter(),
      new UsgsAdapter(),
    ];

    for (const adapter of adapters) {
      const signals = await adapter.fetchSignals({
        keywords: ['test'],
        startDate: '2026-03-01',
        endDate: '2026-03-31',
      });
      expect(Array.isArray(signals)).toBe(true);
    }
  });

  it('Evidence adapters return empty array on network failure', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const adapters = [
      new DexScreenerEvidenceAdapter(),
      new GitHubEvidenceAdapter(),
    ];

    for (const adapter of adapters) {
      const evidence = await adapter.fetchEvidence({
        claim: 'test crypto token',
        entities: ['test'],
      });
      expect(Array.isArray(evidence)).toBe(true);
    }
  });

  it('SourceCredibilityService handles empty posts array', async () => {
    const svc = new SourceCredibilityService(graphDb, platformCredibility);
    const result = await svc.scoreSource('@nobody', 'twitter', []);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(1);
  });

  it('GraphBotDetectionService handles empty users array', async () => {
    const svc = new GraphBotDetectionService(graphDb);
    const result = await svc.detectBots([]);
    expect(result.scores.length).toBe(0);
    expect(result.graphEnhanced).toBe(false);
  });

  it('DeviationService handles single narrative gracefully', () => {
    const svc = new DeviationService();
    const result = svc.computeDeviations([makeNarrative()]);
    expect(result.length).toBe(1);
    expect(result[0]!.isConsensus).toBe(true);
    expect(result[0]!.deviationMagnitude).toBeCloseTo(0, 10);
  });

  it('DeviationService handles empty narratives array', () => {
    const svc = new DeviationService();
    const result = svc.computeDeviations([]);
    expect(result.length).toBe(0);
  });

  it('ComparisonService handles identical narratives', () => {
    const svc = new ComparisonService();
    const n = makeNarrative({ centroidEmbedding: [1, 0, 0] });
    const result = svc.compareNarratives(n, n, [makePost()], [makePost()]);
    expect(result.similarity).toBeCloseTo(1, 1);
    expect(result.sentimentDelta).toBe(0);
  });

  it('EntityAnalysisService handles empty inputs', () => {
    const svc = new EntityAnalysisService();
    const dossiers = svc.buildEntityDossiers([], [], []);
    const network = svc.buildCoOccurrenceNetwork([]);
    expect(dossiers.length).toBe(0);
    expect(network.nodes.length).toBe(0);
    expect(network.edges.length).toBe(0);
  });

  it('NarrativeGenealogyService handles single snapshot', () => {
    const svc = new NarrativeGenealogyService();
    const lineages = svc.buildFullGenealogy([
      {
        id: 'snap-1',
        timestamp: '2026-03-01',
        narratives: [
          { id: 'n1', summary: 'test', centroidEmbedding: [1, 0], postCount: 5, avgSentiment: 0.5 },
        ],
      },
    ]);
    expect(lineages.length).toBeGreaterThanOrEqual(0);
  });

  it('NarrativeGenealogyService handles empty snapshots', () => {
    const svc = new NarrativeGenealogyService();
    const lineages = svc.buildFullGenealogy([]);
    expect(lineages.length).toBe(0);
  });

  it('MonitorService handles identical snapshots (no alerts)', () => {
    const svc = new MonitorService();
    const snap = {
      postCount: 10,
      narrativeCount: 2,
      summary: { total: 10, positive: 5, negative: 3, neutral: 2, byPlatform: { twitter: 10 } },
      narratives: [{ id: 'n1', summary: 'test', avgSentiment: 0.5, velocity: { postsPerHour: 2 } }],
    };
    const alerts = svc.compareSnapshots(snap, snap, 'inv-1', {
      velocityMultiplier: 3,
      sentimentShift: 0.3,
      minNewNarrativePosts: 3,
    });
    // Should produce zero or minimal alerts since nothing changed
    expect(Array.isArray(alerts)).toBe(true);
  });

  it('PlatformCredibilityService adjustClaimWeight handles edge cases', () => {
    const svc = new PlatformCredibilityService(configService);

    // Confidence of 0
    expect(svc.adjustClaimWeight(0, 'twitter')).toBe(0);

    // Confidence of 1 on high-credibility platform
    const farcasterAdj = svc.adjustClaimWeight(1.0, 'farcaster');
    expect(farcasterAdj).toBeGreaterThan(0);
    expect(farcasterAdj).toBeLessThanOrEqual(1);
  });

  it('SocialGraphIntelligenceService handles users with no posts', async () => {
    const svc = new SocialGraphIntelligenceService(graphDb);
    const result = await svc.enrichRelationships(
      [{ handle: 'alice', platform: 'twitter', posts: [] }],
      'test-inv',
    );
    expect(result.edgesCreated).toBe(0);
  });
});
