import { EntityAnalysisService, InsightInput } from './entity-analysis.service';
import type { AnalyzedNarrative } from './narrative-analysis.service';
import type { RawPost } from './deviation.service';

function makeInsight(overrides: Partial<InsightInput> & { id: string }): InsightInput {
  return {
    platform: overrides.platform ?? 'twitter',
    timestamp: overrides.timestamp ?? '2025-06-01T12:00:00Z',
    entities: overrides.entities ?? [],
    sentiment: overrides.sentiment ?? { score: 0, label: 'neutral', confidence: 0.9 },
    ...overrides,
  };
}

function makePost(index: number, overrides?: Partial<RawPost>): RawPost {
  return {
    id: `post-${index}`,
    text: `Post text ${index}`,
    platform: overrides?.platform ?? 'twitter',
    authorName: overrides?.authorName ?? `Author ${index}`,
    authorHandle: overrides?.authorHandle ?? `author${index}`,
    timestamp: overrides?.timestamp ?? new Date(Date.now() - (10 - index) * 3600000).toISOString(),
    engagement: overrides?.engagement ?? { likes: 10, shares: 2, comments: 3 },
  };
}

function makeNarrative(
  overrides: Partial<AnalyzedNarrative> & { id: string },
): AnalyzedNarrative {
  return {
    summary: overrides.summary ?? `Summary for ${overrides.id}`,
    postIndices: overrides.postIndices ?? [0, 1],
    avgSentiment: overrides.avgSentiment ?? 0,
    sentimentTrajectory: overrides.sentimentTrajectory ?? [],
    platforms: overrides.platforms ?? { twitter: 2 },
    authors: overrides.authors ?? [
      { name: 'Alice', handle: 'alice', postCount: 1 },
    ],
    firstSeen: overrides.firstSeen ?? '2025-01-01T00:00:00Z',
    lastSeen: overrides.lastSeen ?? '2025-01-02T00:00:00Z',
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

describe('EntityAnalysisService', () => {
  let service: EntityAnalysisService;

  beforeEach(() => {
    service = new EntityAnalysisService();
  });

  // -------------------------------------------------------------------------
  // buildEntityDossiers
  // -------------------------------------------------------------------------

  describe('buildEntityDossiers', () => {
    it('returns empty for no insights', () => {
      const result = service.buildEntityDossiers([], [], []);
      expect(result).toEqual([]);
    });

    it('returns empty for insights without entities', () => {
      const insights = [makeInsight({ id: 'i-0', entities: [] })];
      const posts = [makePost(0)];
      const result = service.buildEntityDossiers(posts, insights, []);
      expect(result).toEqual([]);
    });

    it('builds dossier for a single entity', () => {
      const insights = [
        makeInsight({
          id: 'i-0',
          entities: [{ name: 'Elon Musk', type: 'person', relevance: 0.9 }],
          sentiment: { score: 0.5, label: 'positive', confidence: 0.9 },
        }),
      ];
      const posts = [makePost(0)];
      const narratives = [makeNarrative({ id: 'n-0', postIndices: [0] })];

      const result = service.buildEntityDossiers(posts, insights, narratives);

      expect(result.length).toBe(1);
      expect(result[0]!.name).toBe('Elon Musk');
      expect(result[0]!.type).toBe('person');
      expect(result[0]!.totalMentions).toBe(1);
      expect(result[0]!.narrativeAppearances.length).toBe(1);
      expect(result[0]!.narrativeAppearances[0]!.narrativeId).toBe('n-0');
    });

    it('aggregates mentions across multiple insights', () => {
      const insights = [
        makeInsight({
          id: 'i-0',
          entities: [{ name: 'Tesla', type: 'organization', relevance: 0.8 }],
          timestamp: '2025-06-01T12:00:00Z',
        }),
        makeInsight({
          id: 'i-1',
          entities: [{ name: 'Tesla', type: 'organization', relevance: 0.7 }],
          timestamp: '2025-06-02T12:00:00Z',
        }),
        makeInsight({
          id: 'i-2',
          entities: [{ name: 'Tesla', type: 'organization', relevance: 0.6 }],
          timestamp: '2025-06-02T12:00:00Z',
        }),
      ];
      const posts = [makePost(0), makePost(1), makePost(2)];

      const result = service.buildEntityDossiers(posts, insights, []);
      expect(result.length).toBe(1);
      expect(result[0]!.totalMentions).toBe(3);
    });

    it('deduplicates entities by case-insensitive name', () => {
      const insights = [
        makeInsight({
          id: 'i-0',
          entities: [{ name: 'Bitcoin', type: 'topic', relevance: 0.8 }],
        }),
        makeInsight({
          id: 'i-1',
          entities: [{ name: 'bitcoin', type: 'topic', relevance: 0.7 }],
        }),
        makeInsight({
          id: 'i-2',
          entities: [{ name: 'BITCOIN', type: 'topic', relevance: 0.6 }],
        }),
      ];
      const posts = [makePost(0), makePost(1), makePost(2)];

      const result = service.buildEntityDossiers(posts, insights, []);
      expect(result.length).toBe(1);
      expect(result[0]!.totalMentions).toBe(3);
    });

    it('calculates platform breakdown correctly', () => {
      const insights = [
        makeInsight({
          id: 'i-0',
          platform: 'twitter',
          entities: [{ name: 'AI', type: 'topic', relevance: 0.9 }],
        }),
        makeInsight({
          id: 'i-1',
          platform: 'reddit',
          entities: [{ name: 'AI', type: 'topic', relevance: 0.8 }],
        }),
        makeInsight({
          id: 'i-2',
          platform: 'twitter',
          entities: [{ name: 'AI', type: 'topic', relevance: 0.7 }],
        }),
      ];
      const posts = [
        makePost(0, { platform: 'twitter' }),
        makePost(1, { platform: 'reddit' }),
        makePost(2, { platform: 'twitter' }),
      ];

      const result = service.buildEntityDossiers(posts, insights, []);
      expect(result[0]!.platformBreakdown).toEqual({ twitter: 2, reddit: 1 });
    });

    it('computes sentiment timeline with averaged scores per day', () => {
      const insights = [
        makeInsight({
          id: 'i-0',
          timestamp: '2025-06-01T10:00:00Z',
          entities: [{ name: 'Entity', type: 'topic', relevance: 1 }],
          sentiment: { score: 0.5, label: 'positive', confidence: 0.9 },
        }),
        makeInsight({
          id: 'i-1',
          timestamp: '2025-06-01T14:00:00Z',
          entities: [{ name: 'Entity', type: 'topic', relevance: 1 }],
          sentiment: { score: -0.3, label: 'negative', confidence: 0.9 },
        }),
        makeInsight({
          id: 'i-2',
          timestamp: '2025-06-02T10:00:00Z',
          entities: [{ name: 'Entity', type: 'topic', relevance: 1 }],
          sentiment: { score: 0.8, label: 'positive', confidence: 0.9 },
        }),
      ];
      const posts = [makePost(0), makePost(1), makePost(2)];

      const result = service.buildEntityDossiers(posts, insights, []);
      const timeline = result[0]!.sentimentTimeline;

      expect(timeline.length).toBe(2);
      expect(timeline[0]!.timestamp).toBe('2025-06-01');
      expect(timeline[0]!.score).toBeCloseTo(0.1, 1); // avg of 0.5 and -0.3
      expect(timeline[1]!.timestamp).toBe('2025-06-02');
      expect(timeline[1]!.score).toBeCloseTo(0.8, 1);
    });

    it('computes co-occurrences', () => {
      const insights = [
        makeInsight({
          id: 'i-0',
          entities: [
            { name: 'Elon Musk', type: 'person', relevance: 0.9 },
            { name: 'Tesla', type: 'organization', relevance: 0.8 },
            { name: 'SpaceX', type: 'organization', relevance: 0.7 },
          ],
        }),
        makeInsight({
          id: 'i-1',
          entities: [
            { name: 'Elon Musk', type: 'person', relevance: 0.9 },
            { name: 'Tesla', type: 'organization', relevance: 0.8 },
          ],
        }),
      ];
      const posts = [makePost(0), makePost(1)];

      const result = service.buildEntityDossiers(posts, insights, []);
      const elonDossier = result.find((d) => d.name === 'Elon Musk');
      expect(elonDossier).toBeDefined();
      expect(elonDossier!.coOccurrences.length).toBe(2);

      const teslaCo = elonDossier!.coOccurrences.find((c) => c.entity === 'Tesla');
      expect(teslaCo).toBeDefined();
      expect(teslaCo!.frequency).toBe(2); // appears with Elon in both insights

      const spacexCo = elonDossier!.coOccurrences.find((c) => c.entity === 'SpaceX');
      expect(spacexCo).toBeDefined();
      expect(spacexCo!.frequency).toBe(1);
    });

    it('populates top authors', () => {
      const insights = [
        makeInsight({
          id: 'i-0',
          entities: [{ name: 'Topic', type: 'topic', relevance: 1 }],
        }),
        makeInsight({
          id: 'i-1',
          entities: [{ name: 'Topic', type: 'topic', relevance: 1 }],
        }),
      ];
      const posts = [
        makePost(0, { authorHandle: 'alice', platform: 'twitter' }),
        makePost(1, { authorHandle: 'bob', platform: 'reddit' }),
      ];

      const result = service.buildEntityDossiers(posts, insights, []);
      expect(result[0]!.topAuthors.length).toBe(2);
      expect(result[0]!.topAuthors[0]!.handle).toBe('alice');
    });

    it('sorts dossiers by total mentions descending', () => {
      const insights = [
        makeInsight({
          id: 'i-0',
          entities: [
            { name: 'Popular', type: 'topic', relevance: 1 },
            { name: 'Rare', type: 'topic', relevance: 0.5 },
          ],
        }),
        makeInsight({
          id: 'i-1',
          entities: [{ name: 'Popular', type: 'topic', relevance: 1 }],
        }),
        makeInsight({
          id: 'i-2',
          entities: [{ name: 'Popular', type: 'topic', relevance: 1 }],
        }),
      ];
      const posts = [makePost(0), makePost(1), makePost(2)];

      const result = service.buildEntityDossiers(posts, insights, []);
      expect(result[0]!.name).toBe('Popular');
      expect(result[0]!.totalMentions).toBe(3);
      expect(result[1]!.name).toBe('Rare');
      expect(result[1]!.totalMentions).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // buildCoOccurrenceNetwork
  // -------------------------------------------------------------------------

  describe('buildCoOccurrenceNetwork', () => {
    it('returns empty for no insights', () => {
      const result = service.buildCoOccurrenceNetwork([]);
      expect(result.nodes).toEqual([]);
      expect(result.edges).toEqual([]);
    });

    it('returns empty for insights without entities', () => {
      const insights = [makeInsight({ id: 'i-0', entities: [] })];
      const result = service.buildCoOccurrenceNetwork(insights);
      expect(result.nodes).toEqual([]);
      expect(result.edges).toEqual([]);
    });

    it('returns empty nodes/edges when entities never co-occur', () => {
      const insights = [
        makeInsight({
          id: 'i-0',
          entities: [{ name: 'A', type: 'topic', relevance: 1 }],
        }),
        makeInsight({
          id: 'i-1',
          entities: [{ name: 'B', type: 'topic', relevance: 1 }],
        }),
      ];
      const result = service.buildCoOccurrenceNetwork(insights);
      // No co-occurrences: each entity is alone in its insight
      expect(result.edges).toEqual([]);
      expect(result.nodes).toEqual([]);
    });

    it('creates nodes and edges for co-occurring entities', () => {
      const insights = [
        makeInsight({
          id: 'i-0',
          entities: [
            { name: 'Elon Musk', type: 'person', relevance: 0.9 },
            { name: 'Tesla', type: 'organization', relevance: 0.8 },
          ],
        }),
      ];
      const result = service.buildCoOccurrenceNetwork(insights);
      expect(result.nodes.length).toBe(2);
      expect(result.edges.length).toBe(1);
      expect(result.edges[0]!.type).toBe('co-occurrence');
    });

    it('accumulates edge weight across multiple co-occurrences', () => {
      const insights = [
        makeInsight({
          id: 'i-0',
          entities: [
            { name: 'A', type: 'topic', relevance: 1 },
            { name: 'B', type: 'topic', relevance: 1 },
          ],
        }),
        makeInsight({
          id: 'i-1',
          entities: [
            { name: 'A', type: 'topic', relevance: 1 },
            { name: 'B', type: 'topic', relevance: 1 },
          ],
        }),
        makeInsight({
          id: 'i-2',
          entities: [
            { name: 'A', type: 'topic', relevance: 1 },
            { name: 'B', type: 'topic', relevance: 1 },
          ],
        }),
      ];
      const result = service.buildCoOccurrenceNetwork(insights);
      expect(result.edges.length).toBe(1);
      expect((result.edges[0]!.properties as { frequency: number }).frequency).toBe(3);
    });

    it('handles three entities in one insight creating three edges', () => {
      const insights = [
        makeInsight({
          id: 'i-0',
          entities: [
            { name: 'A', type: 'topic', relevance: 1 },
            { name: 'B', type: 'topic', relevance: 1 },
            { name: 'C', type: 'topic', relevance: 1 },
          ],
        }),
      ];
      const result = service.buildCoOccurrenceNetwork(insights);
      expect(result.nodes.length).toBe(3);
      expect(result.edges.length).toBe(3); // A-B, A-C, B-C
    });

    it('node metrics reflect mention count', () => {
      const insights = [
        makeInsight({
          id: 'i-0',
          entities: [
            { name: 'Popular', type: 'topic', relevance: 1 },
            { name: 'Rare', type: 'topic', relevance: 0.5 },
          ],
        }),
        makeInsight({
          id: 'i-1',
          entities: [
            { name: 'Popular', type: 'topic', relevance: 1 },
            { name: 'Rare', type: 'topic', relevance: 0.5 },
          ],
        }),
      ];
      const result = service.buildCoOccurrenceNetwork(insights);
      const popularNode = result.nodes.find((n) => n.label === 'Popular');
      const rareNode = result.nodes.find((n) => n.label === 'Rare');
      expect(popularNode).toBeDefined();
      expect(rareNode).toBeDefined();
      // Both have the same count here (2), so metrics.size should be equal
      expect(popularNode!.metrics.size).toBe(rareNode!.metrics.size);
    });
  });
});
