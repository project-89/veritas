import type { RawPost } from './deviation.service';
import { DownstreamEffectsService } from './downstream-effects.service';
import type { AnalyzedNarrative } from './narrative-analysis.service';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeNarrative(overrides: Partial<AnalyzedNarrative> & { id: string }): AnalyzedNarrative {
  return {
    summary: overrides.summary ?? `Summary for ${overrides.id}`,
    postIndices: overrides.postIndices ?? [0, 1],
    avgSentiment: overrides.avgSentiment ?? 0,
    sentimentTrajectory: overrides.sentimentTrajectory ?? [],
    platforms: overrides.platforms ?? { twitter: 2 },
    authors: overrides.authors ?? [{ name: 'Alice', handle: 'alice', postCount: 1 }],
    firstSeen: overrides.firstSeen ?? '2025-06-01T00:00:00Z',
    lastSeen: overrides.lastSeen ?? '2025-06-07T00:00:00Z',
    totalEngagement: overrides.totalEngagement ?? 100,
    velocity: overrides.velocity ?? {
      postsPerHour: 1,
      acceleration: 0,
      trend: 'steady',
    },
    centroidEmbedding: overrides.centroidEmbedding ?? [1, 0, 0],
    ...overrides,
  };
}

function makePost(index: number, overrides?: Partial<RawPost>): RawPost {
  return {
    id: `post-${index}`,
    text: `Post about economic sanctions and oil prices ${index}`,
    platform: overrides?.platform ?? 'twitter',
    authorName: overrides?.authorName ?? `Author ${index}`,
    authorHandle: overrides?.authorHandle ?? `author${index}`,
    timestamp: overrides?.timestamp ?? new Date(Date.now() - (10 - index) * 3600000).toISOString(),
    engagement: overrides?.engagement ?? { likes: 10, shares: 2, comments: 3 },
  };
}

/** Create service without Gemini key (fallback mode). */
function createService(): DownstreamEffectsService {
  const mockConfigService = {
    get: () => undefined,
  };
  return new DownstreamEffectsService(mockConfigService as never);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DownstreamEffectsService', () => {
  let service: DownstreamEffectsService;

  // createService() mocks ConfigService to return no key, but the service falls
  // back to process.env['GEMINI_API_KEY']. Clear it so the fallback-mode tests
  // are genuinely key-less and never make a real (slow, non-deterministic) LLM
  // call. Restored afterwards.
  let savedGeminiKey: string | undefined;
  beforeAll(() => {
    savedGeminiKey = process.env['GEMINI_API_KEY'];
    delete process.env['GEMINI_API_KEY'];
  });
  afterAll(() => {
    if (savedGeminiKey !== undefined) process.env['GEMINI_API_KEY'] = savedGeminiKey;
  });

  beforeEach(() => {
    service = createService();
  });

  // -------------------------------------------------------------------------
  // Empty / edge cases
  // -------------------------------------------------------------------------

  describe('analyze()', () => {
    it('returns empty result for empty narratives', async () => {
      const result = await service.analyze([], []);
      expect(result.narrativeCorrelations).toEqual([]);
      expect(result.externalSignals).toEqual([]);
      expect(result.summary).toBe('No narratives to analyze.');
    });

    it('returns correlations for a single narrative (fallback mode)', async () => {
      const narratives = [makeNarrative({ id: 'n-0', summary: 'Oil supply fears rising' })];
      const posts = [makePost(0), makePost(1)];

      const result = await service.analyze(narratives, posts);

      expect(result.narrativeCorrelations).toHaveLength(1);
      expect(result.narrativeCorrelations[0]!.narrativeId).toBe('n-0');
      expect(result.externalSignals.length).toBeGreaterThan(0);
      expect(result.summary.length).toBeGreaterThan(0);
    }, 60_000);

    it('handles multiple narratives', async () => {
      const narratives = [
        makeNarrative({ id: 'n-0', summary: 'Oil supply fears' }),
        makeNarrative({ id: 'n-1', summary: 'Election misinformation spreading' }),
      ];
      const posts = [makePost(0), makePost(1), makePost(2)];

      const result = await service.analyze(narratives, posts);

      expect(result.narrativeCorrelations).toHaveLength(2);
      expect(result.narrativeCorrelations[0]!.narrativeId).toBe('n-0');
      expect(result.narrativeCorrelations[1]!.narrativeId).toBe('n-1');
    }, 60_000);
  });

  // -------------------------------------------------------------------------
  // Keyword extraction
  // -------------------------------------------------------------------------

  describe('extractKeywords()', () => {
    it('extracts keywords from narrative summaries and posts', () => {
      const narratives = [makeNarrative({ id: 'n-0', summary: 'Oil prices surge amid sanctions' })];
      const posts = [
        makePost(0, { text: 'Oil prices are going through the roof' } as never),
        makePost(1, { text: 'Sanctions hitting hard on energy markets' } as never),
      ];

      const keywords = service.extractKeywords(narratives, posts);

      expect(keywords.length).toBeGreaterThan(0);
      expect(keywords).toContain('oil');
      expect(keywords).toContain('prices');
    });

    it('filters out stop words', () => {
      const narratives = [makeNarrative({ id: 'n-0', summary: 'The oil is at a very high price' })];
      const keywords = service.extractKeywords(narratives, []);

      expect(keywords).not.toContain('the');
      expect(keywords).not.toContain('is');
      expect(keywords).not.toContain('very');
    });

    it('returns empty array for empty input', () => {
      const keywords = service.extractKeywords([], []);
      expect(keywords).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Time range computation
  // -------------------------------------------------------------------------

  describe('computeTimeRange()', () => {
    it('extends +-7 days around narrative time span', () => {
      const narratives = [
        makeNarrative({
          id: 'n-0',
          firstSeen: '2025-06-10T00:00:00Z',
          lastSeen: '2025-06-15T00:00:00Z',
        }),
      ];

      const { startDate, endDate } = service.computeTimeRange(narratives);

      const start = new Date(startDate);
      const end = new Date(endDate);

      // Start should be ~June 3
      expect(start.getUTCDate()).toBe(3);
      // End should be ~June 22
      expect(end.getUTCDate()).toBe(22);
    });

    it('handles multiple narratives with different ranges', () => {
      const narratives = [
        makeNarrative({
          id: 'n-0',
          firstSeen: '2025-06-01T00:00:00Z',
          lastSeen: '2025-06-05T00:00:00Z',
        }),
        makeNarrative({
          id: 'n-1',
          firstSeen: '2025-06-10T00:00:00Z',
          lastSeen: '2025-06-20T00:00:00Z',
        }),
      ];

      const { startDate, endDate } = service.computeTimeRange(narratives);

      const start = new Date(startDate);
      const end = new Date(endDate);

      // Start should extend before first narrative (June 1 - 7 days = May 25)
      expect(start.getUTCMonth()).toBe(4); // May = 4
      // End should extend after last narrative (June 20 + 7 days = June 27)
      expect(end.getUTCDate()).toBe(27);
    });
  });

  // -------------------------------------------------------------------------
  // Correlation engine
  // -------------------------------------------------------------------------

  describe('correlateSignals()', () => {
    it('correlates signals with narratives by temporal + keyword overlap', () => {
      const narratives = [
        makeNarrative({
          id: 'n-0',
          summary: 'Oil prices surge',
          firstSeen: '2025-06-01T00:00:00Z',
          lastSeen: '2025-06-07T00:00:00Z',
        }),
      ];

      const signals = [
        {
          id: 'sig-0',
          domain: 'economic' as const,
          source: 'Yahoo Finance',
          title: 'Oil futures rise 5%',
          description: 'Oil prices surge on supply concerns',
          timestamp: '2025-06-04T00:00:00Z',
          magnitude: 0.7,
          metadata: {},
        },
        {
          id: 'sig-1',
          domain: 'political' as const,
          source: 'Reuters',
          title: 'New sanctions announced',
          description: 'Political sanctions on energy exports',
          timestamp: '2025-06-20T00:00:00Z', // far from narrative
          magnitude: 0.5,
          metadata: {},
        },
      ];

      const correlations = service.correlateSignals(narratives, signals);

      expect(correlations).toHaveLength(1);
      expect(correlations[0]!.correlatedSignals.length).toBeGreaterThan(0);

      // First signal should have higher correlation (closer in time + keyword match)
      const sorted = correlations[0]!.correlatedSignals;
      const firstSignal = sorted.find((cs) => cs.signal.id === 'sig-0');
      const secondSignal = sorted.find((cs) => cs.signal.id === 'sig-1');

      if (firstSignal && secondSignal) {
        expect(firstSignal.correlationStrength).toBeGreaterThan(secondSignal.correlationStrength);
      }
    });

    it('returns empty correlatedSignals when no signals match', () => {
      const narratives = [
        makeNarrative({
          id: 'n-0',
          summary: 'Cat videos trending',
          firstSeen: '2025-01-01T00:00:00Z',
          lastSeen: '2025-01-02T00:00:00Z',
        }),
      ];

      const signals = [
        {
          id: 'sig-far',
          domain: 'economic' as const,
          source: 'Test',
          title: 'Unrelated',
          description: 'Completely different topic from years ago',
          timestamp: '2020-01-01T00:00:00Z',
          magnitude: 0.1,
          metadata: {},
        },
      ];

      const correlations = service.correlateSignals(narratives, signals);
      // Signal should be filtered out (below 0.1 threshold) due to time distance
      expect(correlations[0]!.correlatedSignals.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Transmission chain structure (fallback)
  // -------------------------------------------------------------------------

  describe('generateTransmissionChains()', () => {
    it('generates fallback chains when no LLM available', async () => {
      const narratives = [makeNarrative({ id: 'n-0', summary: 'Oil supply fears' })];
      const signals = [
        {
          id: 'sig-0',
          domain: 'economic' as const,
          source: 'Test',
          title: 'Economic impact',
          description: 'Economic consequences',
          timestamp: '2025-06-04T00:00:00Z',
          magnitude: 0.6,
          metadata: {},
        },
      ];

      const correlations = service.correlateSignals(narratives, signals);

      await service.generateTransmissionChains(correlations, [makePost(0)]);

      const chains = correlations[0]!.transmissionChains;
      expect(chains.length).toBeGreaterThan(0);

      // Each chain should have at least 2 nodes
      for (const chain of chains) {
        expect(chain.chain.length).toBeGreaterThanOrEqual(2);
        expect(chain.overallConfidence).toBeGreaterThan(0);
        expect(chain.overallConfidence).toBeLessThanOrEqual(1);
        expect(chain.narrativeId).toBe('n-0');

        // Each node should have required fields
        for (const node of chain.chain) {
          expect(node.node).toBeTruthy();
          expect(['narrative', 'economic', 'political', 'social', 'market']).toContain(node.type);
          expect(node.confidence).toBeGreaterThanOrEqual(0);
          expect(node.confidence).toBeLessThanOrEqual(1);
        }
      }
    });

    it('handles correlations with no signals gracefully', async () => {
      const correlations = [
        {
          narrativeId: 'n-0',
          narrativeSummary: 'Test',
          correlatedSignals: [],
          transmissionChains: [],
        },
      ];

      await service.generateTransmissionChains(correlations, []);

      expect(correlations[0]!.transmissionChains).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Mycelium data transformation
  // -------------------------------------------------------------------------

  describe('toMyceliumData()', () => {
    it('creates valid mycelium structure from narratives and correlations', () => {
      const narratives = [
        makeNarrative({ id: 'n-0', summary: 'Oil fears' }),
        makeNarrative({ id: 'n-1', summary: 'Political unrest' }),
      ];

      const correlations = [
        {
          narrativeId: 'n-0',
          narrativeSummary: 'Oil fears',
          correlatedSignals: [
            {
              signal: {
                id: 'sig-0',
                domain: 'economic' as const,
                source: 'Test',
                title: 'Market drop',
                description: 'Stocks fell',
                timestamp: '2025-06-04T00:00:00Z',
                magnitude: 0.7,
                metadata: {},
              },
              correlationStrength: 0.6,
              temporalOffset: '+2 days',
              possibleRelationship: 'caused' as const,
            },
          ],
          transmissionChains: [
            {
              narrativeId: 'n-0',
              narrativeSummary: 'Oil fears',
              chain: [
                {
                  node: 'Oil fears',
                  type: 'narrative' as const,
                  description: 'Origin',
                  confidence: 0.8,
                },
                {
                  node: 'Supply chain worry',
                  type: 'economic' as const,
                  description: 'Companies react',
                  confidence: 0.6,
                },
                {
                  node: 'Market drop',
                  type: 'market' as const,
                  description: 'Stocks fell',
                  confidence: 0.5,
                },
              ],
              overallConfidence: 0.6,
            },
          ],
        },
        {
          narrativeId: 'n-1',
          narrativeSummary: 'Political unrest',
          correlatedSignals: [],
          transmissionChains: [],
        },
      ];

      const myceliumData = service.toMyceliumData(narratives, correlations);

      // Should have nodes
      expect(myceliumData.nodes.length).toBeGreaterThan(0);

      // Should have root nodes for each narrative
      const rootNodes = myceliumData.nodes.filter((n) => n.type === 'root');
      expect(rootNodes).toHaveLength(2);

      // Should have branches connecting nodes
      expect(myceliumData.branches.length).toBeGreaterThan(0);

      // Should have clusters for each narrative
      expect(myceliumData.clusters).toHaveLength(2);

      // Metadata should be valid
      expect(myceliumData.metadata.dominantClusterId).toBeTruthy();
      expect(myceliumData.metadata.timestamp).toBeInstanceOf(Date);
      expect(myceliumData.metadata.timeframe.start).toBeInstanceOf(Date);
      expect(myceliumData.metadata.timeframe.end).toBeInstanceOf(Date);
      expect(myceliumData.metadata.totalStrength).toBeGreaterThan(0);

      // Chain nodes should appear as branch/leaf nodes
      const chainNodes = myceliumData.nodes.filter((n) => n.type === 'branch' || n.type === 'leaf');
      // The first chain node (narrative type) is skipped, so we should have 2 chain nodes
      expect(chainNodes.length).toBeGreaterThanOrEqual(2);
    });

    it('handles empty correlations', () => {
      const narratives = [makeNarrative({ id: 'n-0', summary: 'Test' })];
      const myceliumData = service.toMyceliumData(narratives, []);

      expect(myceliumData.nodes).toHaveLength(1); // Just the root
      expect(myceliumData.branches).toHaveLength(0);
      expect(myceliumData.clusters).toHaveLength(1);
    });

    it('handles empty narratives', () => {
      const myceliumData = service.toMyceliumData([], []);

      expect(myceliumData.nodes).toHaveLength(0);
      expect(myceliumData.branches).toHaveLength(0);
      expect(myceliumData.clusters).toHaveLength(0);
    });

    it('creates cross-cluster branches for shared signal domains', () => {
      const narratives = [
        makeNarrative({ id: 'n-0', summary: 'Narrative A' }),
        makeNarrative({ id: 'n-1', summary: 'Narrative B' }),
      ];

      const sharedSignal = {
        id: 'sig-shared',
        domain: 'economic' as const,
        source: 'Test',
        title: 'Shared economic effect',
        description: 'Both narratives affect economy',
        timestamp: '2025-06-04T00:00:00Z',
        magnitude: 0.5,
        metadata: {},
      };

      const correlations = [
        {
          narrativeId: 'n-0',
          narrativeSummary: 'Narrative A',
          correlatedSignals: [
            {
              signal: sharedSignal,
              correlationStrength: 0.5,
              temporalOffset: '+1 days',
              possibleRelationship: 'caused' as const,
            },
          ],
          transmissionChains: [],
        },
        {
          narrativeId: 'n-1',
          narrativeSummary: 'Narrative B',
          correlatedSignals: [
            {
              signal: { ...sharedSignal, id: 'sig-shared-2' },
              correlationStrength: 0.4,
              temporalOffset: '+2 days',
              possibleRelationship: 'caused' as const,
            },
          ],
          transmissionChains: [],
        },
      ];

      const myceliumData = service.toMyceliumData(narratives, correlations);

      // Should have cross-cluster branch
      const crossBranches = myceliumData.branches.filter((b) => b.id.startsWith('cross-'));
      expect(crossBranches.length).toBeGreaterThan(0);
    });

    it('all nodes have valid connections referenced in branches', () => {
      const narratives = [makeNarrative({ id: 'n-0', summary: 'Test narrative' })];

      const correlations = [
        {
          narrativeId: 'n-0',
          narrativeSummary: 'Test narrative',
          correlatedSignals: [],
          transmissionChains: [
            {
              narrativeId: 'n-0',
              narrativeSummary: 'Test narrative',
              chain: [
                {
                  node: 'Test narrative',
                  type: 'narrative' as const,
                  description: 'Origin',
                  confidence: 0.8,
                },
                {
                  node: 'Public reaction',
                  type: 'social' as const,
                  description: 'Social effect',
                  confidence: 0.6,
                },
                {
                  node: 'Policy change',
                  type: 'political' as const,
                  description: 'Policy result',
                  confidence: 0.4,
                },
              ],
              overallConfidence: 0.5,
            },
          ],
        },
      ];

      const myceliumData = service.toMyceliumData(narratives, correlations);
      const nodeIds = new Set(myceliumData.nodes.map((n) => n.id));

      // Every branch should reference existing nodes
      for (const branch of myceliumData.branches) {
        expect(nodeIds.has(branch.sourceId)).toBe(true);
        expect(nodeIds.has(branch.targetId)).toBe(true);
      }
    });
  });
});
