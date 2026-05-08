import { ConfigService } from '@nestjs/config';
import { CausalReasoningService } from './causal-reasoning.service';
import type { RawPost } from './deviation.service';
import type { AnalyzedNarrative } from './narrative-analysis.service';
import type { ExternalSignal, SignalAdapter } from './signal-adapters/signal-adapter.interface';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNarrative(overrides: Partial<AnalyzedNarrative> = {}): AnalyzedNarrative {
  return {
    id: 'n1',
    summary: 'Concerns about Project89 token value declining',
    postIndices: [0, 1],
    firstSeen: '2026-03-25T00:00:00Z',
    lastSeen: '2026-03-30T00:00:00Z',
    velocity: { postsPerHour: 2, acceleration: 0, trend: 'steady' as const },
    platforms: { twitter: 3, reddit: 2 },
    totalEngagement: 150,
    sentimentBreakdown: { positive: 1, negative: 3, neutral: 1 },
    ...overrides,
  } as AnalyzedNarrative;
}

function makePost(overrides: Partial<RawPost> = {}): RawPost {
  return {
    id: 'p1',
    text: 'Project89 seems to be losing momentum, the token is barely worth anything now.',
    platform: 'twitter',
    authorName: 'user1',
    authorHandle: '@user1',
    timestamp: '2026-03-27T12:00:00Z',
    engagement: { likes: 5, shares: 2, comments: 1 },
    ...overrides,
  };
}

function makeSignal(overrides: Partial<ExternalSignal> = {}): ExternalSignal {
  return {
    id: 'sig-btc-drop',
    domain: 'market',
    source: 'Yahoo Finance',
    title: 'Bitcoin drops 5%',
    description: 'BTC-USD fell from $68,000 to $64,600 over 3 days.',
    timestamp: '2026-03-28T00:00:00Z',
    magnitude: 0.7,
    metadata: {},
    ...overrides,
  };
}

function makeFredSignal(): ExternalSignal {
  return makeSignal({
    id: 'sig-vix-spike',
    domain: 'economic',
    source: 'FRED',
    title: 'VIX Volatility Index spikes to 28',
    description: 'VIX rose from 18 to 28 over two days, indicating market uncertainty.',
    timestamp: '2026-03-26T00:00:00Z',
    magnitude: 0.6,
  });
}

const mockAdapter: SignalAdapter = {
  domain: 'market',
  name: 'Mock Adapter',
  scope: 'global',
  maxAgeMs: 86400000,
  fetchSignals: jest.fn().mockResolvedValue([]),
};

// ---------------------------------------------------------------------------
// Mock Gemini SDK
// ---------------------------------------------------------------------------

/**
 * Build a mock GoogleGenerativeAI that returns scripted function calls.
 * Each entry in `turns` is one response from the model.
 */
function buildMockGenAI(
  turns: Array<{
    functionCalls?: Array<{ name: string; args: Record<string, unknown> }>;
    text?: string;
  }>,
) {
  let turnIndex = 0;

  const mockChat = {
    sendMessage: jest.fn().mockImplementation(() => {
      const turn = turns[turnIndex] ?? { text: 'No more turns.' };
      turnIndex++;
      return {
        response: {
          functionCalls: () => turn.functionCalls ?? null,
          text: () => turn.text ?? '',
        },
      };
    }),
  };

  const mockModel = {
    startChat: jest.fn().mockReturnValue(mockChat),
  };

  // Patch the private genAI field
  return { mockModel, mockChat };
}

function createService(
  geminiKey?: string,
  mockGenAI?: { mockModel: unknown },
): CausalReasoningService {
  // Temporarily clear env to prevent real API key from being used
  const savedKey = process.env['GEMINI_API_KEY'];
  delete process.env['GEMINI_API_KEY'];

  const configService = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'GEMINI_API_KEY') return geminiKey;
      return undefined;
    }),
  } as unknown as ConfigService;

  const service = new CausalReasoningService(configService);

  // Restore env
  if (savedKey) process.env['GEMINI_API_KEY'] = savedKey;

  // If we have a mock, inject it
  if (mockGenAI) {
    (service as unknown as { genAI: { getGenerativeModel: jest.Mock } }).genAI = {
      getGenerativeModel: jest.fn().mockReturnValue(mockGenAI.mockModel),
    };
  }

  return service;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CausalReasoningService', () => {
  describe('analyze()', () => {
    it('returns null when no Gemini API key is configured', async () => {
      const service = createService(undefined);
      const result = await service.analyze({
        narratives: [makeNarrative()],
        posts: [makePost()],
        initialSignals: [makeSignal()],
        adapters: [mockAdapter],
        keywords: ['project89'],
      });
      expect(result).toBeNull();
    });

    it('returns null for empty narratives', async () => {
      const service = createService('fake-key');
      const result = await service.analyze({
        narratives: [],
        posts: [],
        initialSignals: [],
        adapters: [],
        keywords: [],
      });
      expect(result).toBeNull();
    });

    it('processes submit_causal_chain and returns correlations', async () => {
      const mock = buildMockGenAI([
        // Turn 1: Agent submits a chain and calls done
        {
          functionCalls: [
            {
              name: 'submit_causal_chain',
              args: {
                narrative_id: 'n1',
                narrative_summary: 'Concerns about Project89 token value declining',
                direction: 'effect_to_narrative',
                chain: [
                  {
                    node: 'Bitcoin market decline',
                    type: 'market',
                    description: 'BTC dropped 5% over 3 days',
                    evidence: 'Yahoo Finance signal sig-btc-drop: BTC-USD fell from $68k to $64.6k',
                    timestamp: '2026-03-28T00:00:00Z',
                    confidence: 0.8,
                  },
                  {
                    node: 'Small-cap tokens follow BTC',
                    type: 'market',
                    description: 'Altcoins typically follow BTC price movements',
                    evidence:
                      'Well-established crypto market pattern — small tokens correlate with BTC',
                    confidence: 0.9,
                  },
                  {
                    node: 'Project89 narrative emerges',
                    type: 'narrative',
                    description: 'Community discussion about declining value',
                    evidence: 'Narrative active 2026-03-25 to 2026-03-30, 5 posts',
                    timestamp: '2026-03-25T00:00:00Z',
                    confidence: 0.7,
                  },
                ],
                overall_confidence: 0.75,
                scale_assessment:
                  'BTC decline (macro) plausibly influenced niche Project89 narrative. Direction: market → narrative.',
              },
            },
            {
              name: 'done',
              args: {
                summary:
                  'The Bitcoin decline likely amplified negative sentiment around Project89, not vice versa.',
              },
            },
          ],
        },
      ]);

      const service = createService('fake-key', mock);
      const result = await service.analyze({
        narratives: [makeNarrative()],
        posts: [makePost()],
        initialSignals: [makeSignal()],
        adapters: [mockAdapter],
        keywords: ['project89'],
      });

      expect(result).not.toBeNull();
      expect(result!.correlations).toHaveLength(1);
      expect(result!.correlations[0]!.transmissionChains).toHaveLength(1);

      const chain = result!.correlations[0]!.transmissionChains[0]!;
      expect(chain.chain).toHaveLength(3);
      expect(chain.overallConfidence).toBe(0.75);

      // Check direction is preserved (extra fields added by causal reasoning)
      expect((chain as unknown as Record<string, unknown>)['direction']).toBe(
        'effect_to_narrative',
      );
      expect((chain as unknown as Record<string, unknown>)['scaleAssessment']).toContain(
        'BTC decline',
      );

      expect(result!.summary).toContain('Bitcoin decline');
      expect(result!.iterationsUsed).toBe(1);
    });

    it('processes reject_correlation and excludes rejected signals', async () => {
      const mock = buildMockGenAI([
        {
          functionCalls: [
            {
              name: 'reject_correlation',
              args: {
                narrative_id: 'n1',
                signal_id: 'sig-btc-drop',
                reason: 'Scale mismatch: 5-post niche narrative cannot move Bitcoin price.',
              },
            },
            {
              name: 'done',
              args: {
                summary: 'No valid causal chains found. BTC correlation is spurious.',
              },
            },
          ],
        },
      ]);

      const service = createService('fake-key', mock);
      const result = await service.analyze({
        narratives: [makeNarrative()],
        posts: [makePost()],
        initialSignals: [makeSignal()],
        adapters: [mockAdapter],
        keywords: ['project89'],
      });

      expect(result).not.toBeNull();
      expect(result!.rejections).toHaveLength(1);
      expect(result!.rejections[0]!.reason).toContain('Scale mismatch');
      expect(result!.correlations[0]!.transmissionChains).toHaveLength(0);
    });

    it('handles fetch_signals tool calls in the loop', async () => {
      const fetchAdapter: SignalAdapter = {
        domain: 'economic',
        name: 'FRED Economic Data',
        scope: 'global',
        maxAgeMs: 86400000,
        fetchSignals: jest.fn().mockResolvedValue([makeFredSignal()]),
      };

      const mock = buildMockGenAI([
        // Turn 1: Agent requests more data
        {
          functionCalls: [
            {
              name: 'fetch_signals',
              args: {
                adapter_name: 'FRED Economic Data',
                start_date: '2026-03-01',
                end_date: '2026-03-30',
              },
            },
          ],
        },
        // Turn 2: Agent evaluates and submits
        {
          functionCalls: [
            {
              name: 'submit_causal_chain',
              args: {
                narrative_id: 'n1',
                narrative_summary: 'Project89 concerns',
                direction: 'effect_to_narrative',
                chain: [
                  {
                    node: 'VIX spike',
                    type: 'economic',
                    description: 'Market uncertainty rose sharply',
                    evidence: 'FRED: VIX rose from 18 to 28',
                    confidence: 0.7,
                  },
                  {
                    node: 'Crypto selloff',
                    type: 'market',
                    description: 'High VIX typically precedes risk-off moves in crypto',
                    evidence: 'Historical pattern: VIX > 25 correlates with crypto drawdowns',
                    confidence: 0.6,
                  },
                ],
                overall_confidence: 0.6,
                scale_assessment:
                  'Macro uncertainty → crypto market → niche token narrative. Plausible.',
              },
            },
            {
              name: 'done',
              args: { summary: 'VIX spike plausibly contributed to crypto selloff and narrative.' },
            },
          ],
        },
      ]);

      const service = createService('fake-key', mock);
      const result = await service.analyze({
        narratives: [makeNarrative()],
        posts: [makePost()],
        initialSignals: [makeSignal()],
        adapters: [fetchAdapter],
        keywords: ['project89'],
      });

      expect(result).not.toBeNull();
      expect(result!.iterationsUsed).toBe(2);
      expect(result!.correlations[0]!.transmissionChains).toHaveLength(1);

      // Verify the adapter was actually called
      expect(fetchAdapter.fetchSignals).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: '2026-03-01',
          endDate: '2026-03-30',
        }),
      );
    });

    it('respects MAX_ITERATIONS cap', async () => {
      // Agent keeps requesting data but never calls done
      const endlessTurns = Array.from({ length: 10 }, () => ({
        functionCalls: [
          {
            name: 'fetch_signals',
            args: {
              adapter_name: 'Mock Adapter',
              start_date: '2026-01-01',
              end_date: '2026-03-30',
            },
          },
        ],
      }));

      const mock = buildMockGenAI(endlessTurns);
      const service = createService('fake-key', mock);
      const result = await service.analyze({
        narratives: [makeNarrative()],
        posts: [makePost()],
        initialSignals: [makeSignal()],
        adapters: [mockAdapter],
        keywords: ['project89'],
      });

      expect(result).not.toBeNull();
      // 1 initial + 5 max iterations = 6 total, but iterationsUsed tracks sendMessage calls
      expect(result!.iterationsUsed).toBeLessThanOrEqual(6);
      expect(result!.summary).toContain('completed');
    });

    it('handles agent error gracefully and returns null', async () => {
      const mock = buildMockGenAI([]);
      // Make sendMessage throw
      mock.mockChat.sendMessage.mockRejectedValue(new Error('Gemini API error'));

      const service = createService('fake-key', mock);
      const result = await service.analyze({
        narratives: [makeNarrative()],
        posts: [makePost()],
        initialSignals: [makeSignal()],
        adapters: [mockAdapter],
        keywords: ['project89'],
      });

      expect(result).toBeNull();
    });

    it('handles text-only response (no function calls) gracefully', async () => {
      const mock = buildMockGenAI([
        {
          text: 'After reviewing the evidence, I find no plausible causal connections.',
        },
      ]);

      const service = createService('fake-key', mock);
      const result = await service.analyze({
        narratives: [makeNarrative()],
        posts: [makePost()],
        initialSignals: [makeSignal()],
        adapters: [mockAdapter],
        keywords: ['project89'],
      });

      expect(result).not.toBeNull();
      expect(result!.correlations[0]!.transmissionChains).toHaveLength(0);
      expect(result!.rejections).toHaveLength(0);
    });
  });
});
