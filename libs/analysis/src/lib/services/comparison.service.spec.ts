import { ComparisonService } from './comparison.service';
import type { AnalyzedNarrative } from './narrative-analysis.service';
import type { RawPost } from './deviation.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
      { name: 'Bob', handle: 'bob', postCount: 1 },
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

function makePosts(count: number, platform = 'twitter'): RawPost[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `post-${i}`,
    text: `Post text ${i}`,
    platform: platform,
    authorName: `Author ${i}`,
    authorHandle: `author${i}`,
    timestamp: new Date(Date.now() - (count - i) * 3600000).toISOString(),
    engagement: { likes: 10 + i, shares: 2, comments: 3 },
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ComparisonService', () => {
  let service: ComparisonService;

  beforeEach(() => {
    service = new ComparisonService();
  });

  // -------------------------------------------------------------------------
  // compareNarratives
  // -------------------------------------------------------------------------

  describe('compareNarratives', () => {
    it('computes similarity between two identical narratives', () => {
      const nA = makeNarrative({ id: 'a', centroidEmbedding: [1, 0, 0] });
      const nB = makeNarrative({ id: 'b', centroidEmbedding: [1, 0, 0] });
      const result = service.compareNarratives(nA, nB, [], []);
      expect(result.similarity).toBeCloseTo(1, 5);
    });

    it('computes similarity between orthogonal narratives', () => {
      const nA = makeNarrative({ id: 'a', centroidEmbedding: [1, 0, 0] });
      const nB = makeNarrative({ id: 'b', centroidEmbedding: [0, 1, 0] });
      const result = service.compareNarratives(nA, nB, [], []);
      expect(result.similarity).toBeCloseTo(0, 5);
    });

    it('computes sentiment delta (A - B)', () => {
      const nA = makeNarrative({ id: 'a', avgSentiment: 0.8 });
      const nB = makeNarrative({ id: 'b', avgSentiment: -0.2 });
      const result = service.compareNarratives(nA, nB, [], []);
      expect(result.sentimentDelta).toBeCloseTo(1.0, 5);
    });

    it('identifies the faster narrative', () => {
      const nA = makeNarrative({
        id: 'a',
        velocity: { postsPerHour: 5, acceleration: 0, trend: 'growing' },
      });
      const nB = makeNarrative({
        id: 'b',
        velocity: { postsPerHour: 2, acceleration: 0, trend: 'steady' },
      });
      const result = service.compareNarratives(nA, nB, [], []);
      expect(result.velocityComparison.fasterNarrative).toBe('a');
      expect(result.velocityComparison.aPostsPerHour).toBe(5);
      expect(result.velocityComparison.bPostsPerHour).toBe(2);
    });

    it('reports equal velocity when rates are the same', () => {
      const nA = makeNarrative({
        id: 'a',
        velocity: { postsPerHour: 3, acceleration: 0, trend: 'steady' },
      });
      const nB = makeNarrative({
        id: 'b',
        velocity: { postsPerHour: 3, acceleration: 0, trend: 'steady' },
      });
      const result = service.compareNarratives(nA, nB, [], []);
      expect(result.velocityComparison.fasterNarrative).toBe('equal');
    });

    it('detects overlapping authors', () => {
      const nA = makeNarrative({
        id: 'a',
        authors: [
          { name: 'Alice', handle: 'alice', postCount: 2 },
          { name: 'Charlie', handle: 'charlie', postCount: 1 },
        ],
      });
      const nB = makeNarrative({
        id: 'b',
        authors: [
          { name: 'Alice', handle: 'alice', postCount: 3 },
          { name: 'Dave', handle: 'dave', postCount: 1 },
        ],
      });
      const result = service.compareNarratives(nA, nB, [], []);
      expect(result.authorOverlap.shared).toEqual(['alice']);
      expect(result.authorOverlap.onlyA).toEqual(['charlie']);
      expect(result.authorOverlap.onlyB).toEqual(['dave']);
    });

    it('detects overlapping platforms', () => {
      const nA = makeNarrative({
        id: 'a',
        platforms: { twitter: 5, reddit: 3 },
      });
      const nB = makeNarrative({
        id: 'b',
        platforms: { twitter: 2, youtube: 4 },
      });
      const result = service.compareNarratives(nA, nB, [], []);
      expect(result.platformOverlap.shared).toEqual(['twitter']);
      expect(result.platformOverlap.onlyA).toEqual(['reddit']);
      expect(result.platformOverlap.onlyB).toEqual(['youtube']);
    });

    it('handles narratives with no authors', () => {
      const nA = makeNarrative({ id: 'a', authors: [] });
      const nB = makeNarrative({ id: 'b', authors: [] });
      const result = service.compareNarratives(nA, nB, [], []);
      expect(result.authorOverlap.shared).toEqual([]);
      expect(result.authorOverlap.onlyA).toEqual([]);
      expect(result.authorOverlap.onlyB).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // compareTimePeriods
  // -------------------------------------------------------------------------

  describe('compareTimePeriods', () => {
    it('detects persistent narratives across periods', () => {
      const nA = makeNarrative({
        id: 'a-0',
        summary: 'Climate change debate',
        centroidEmbedding: [1, 0, 0],
        postIndices: [0, 1, 2],
        avgSentiment: 0.3,
      });
      const nB = makeNarrative({
        id: 'b-0',
        summary: 'Climate change discussion',
        centroidEmbedding: [0.98, 0.1, 0], // very similar
        postIndices: [0, 1, 2, 3, 4],
        avgSentiment: 0.5,
      });

      const result = service.compareTimePeriods(
        { narratives: [nA], posts: makePosts(3), label: 'Week 1' },
        { narratives: [nB], posts: makePosts(5), label: 'Week 2' },
      );

      expect(result.persistent.length).toBe(1);
      expect(result.persistent[0]!.sentimentShift).toBeCloseTo(0.2, 2);
      expect(result.persistent[0]!.volumeChange).toBeCloseTo(66.67, 0);
      expect(result.emerged.length).toBe(0);
      expect(result.disappeared.length).toBe(0);
    });

    it('detects emerged narratives in period B', () => {
      const nA = makeNarrative({
        id: 'a-0',
        centroidEmbedding: [1, 0, 0],
      });
      const nB1 = makeNarrative({
        id: 'b-0',
        centroidEmbedding: [0.99, 0.05, 0], // matches A
      });
      const nB2 = makeNarrative({
        id: 'b-1',
        summary: 'Brand new topic',
        centroidEmbedding: [0, 1, 0], // orthogonal = new
        postIndices: [5, 6, 7],
      });

      const result = service.compareTimePeriods(
        { narratives: [nA], posts: makePosts(2), label: 'Before' },
        { narratives: [nB1, nB2], posts: makePosts(5), label: 'After' },
      );

      expect(result.emerged.length).toBe(1);
      expect(result.emerged[0]!.summary).toBe('Brand new topic');
    });

    it('detects disappeared narratives from period A', () => {
      const nA1 = makeNarrative({
        id: 'a-0',
        centroidEmbedding: [1, 0, 0],
      });
      const nA2 = makeNarrative({
        id: 'a-1',
        summary: 'Old topic fading',
        centroidEmbedding: [0, 1, 0],
        postIndices: [3, 4],
      });
      const nB = makeNarrative({
        id: 'b-0',
        centroidEmbedding: [0.99, 0.05, 0], // matches a-0 only
      });

      const result = service.compareTimePeriods(
        { narratives: [nA1, nA2], posts: makePosts(5), label: 'Before' },
        { narratives: [nB], posts: makePosts(2), label: 'After' },
      );

      expect(result.disappeared.length).toBe(1);
      expect(result.disappeared[0]!.summary).toBe('Old topic fading');
      expect(result.disappeared[0]!.lastPostCount).toBe(2);
    });

    it('handles empty periods', () => {
      const result = service.compareTimePeriods(
        { narratives: [], posts: [], label: 'Empty A' },
        { narratives: [], posts: [], label: 'Empty B' },
      );

      expect(result.persistent).toEqual([]);
      expect(result.emerged).toEqual([]);
      expect(result.disappeared).toEqual([]);
      expect(result.sentimentShift).toBe(0);
      expect(result.volumeChange).toBe(0);
    });

    it('computes overall volume change', () => {
      const result = service.compareTimePeriods(
        { narratives: [], posts: makePosts(10), label: 'A' },
        { narratives: [], posts: makePosts(20), label: 'B' },
      );

      expect(result.volumeChange).toBeCloseTo(100, 0); // doubled = +100%
    });

    it('handles period A with zero posts gracefully', () => {
      const result = service.compareTimePeriods(
        { narratives: [], posts: [], label: 'Empty' },
        { narratives: [], posts: makePosts(5), label: 'Full' },
      );

      expect(result.volumeChange).toBe(100); // special case: 0 -> N
    });
  });

  // -------------------------------------------------------------------------
  // comparePlatforms
  // -------------------------------------------------------------------------

  describe('comparePlatforms', () => {
    it('identifies platforms from posts', () => {
      const posts: RawPost[] = [
        ...makePosts(3, 'twitter'),
        ...makePosts(2, 'reddit'),
      ];
      const narratives = [
        makeNarrative({
          id: 'n-0',
          platforms: { twitter: 3, reddit: 2 },
          postIndices: [0, 1, 2, 3, 4],
        }),
      ];

      const result = service.comparePlatforms(narratives, posts);
      expect(result.platforms).toEqual(['reddit', 'twitter']);
      expect(result.perPlatform.length).toBe(2);
    });

    it('detects cross-platform narratives', () => {
      const posts: RawPost[] = [
        ...makePosts(3, 'twitter'),
        ...makePosts(2, 'reddit'),
      ];
      const narratives = [
        makeNarrative({
          id: 'n-0',
          summary: 'Cross-platform narrative',
          platforms: { twitter: 3, reddit: 2 },
        }),
      ];

      const result = service.comparePlatforms(narratives, posts);
      expect(result.crossPlatform.length).toBe(1);
      expect(result.crossPlatform[0]!.platforms).toEqual(['reddit', 'twitter']);
    });

    it('detects unique (single-platform) narratives', () => {
      const posts: RawPost[] = [
        ...makePosts(3, 'twitter'),
        ...makePosts(2, 'reddit'),
      ];
      const narratives = [
        makeNarrative({
          id: 'n-0',
          summary: 'Twitter only topic',
          platforms: { twitter: 3 },
        }),
        makeNarrative({
          id: 'n-1',
          summary: 'Reddit only topic',
          platforms: { reddit: 2 },
        }),
      ];

      const result = service.comparePlatforms(narratives, posts);
      const twitterData = result.perPlatform.find((p) => p.platform === 'twitter');
      const redditData = result.perPlatform.find((p) => p.platform === 'reddit');

      expect(twitterData?.uniqueNarratives).toContain('Twitter only topic');
      expect(redditData?.uniqueNarratives).toContain('Reddit only topic');
    });

    it('computes top authors per platform', () => {
      const posts: RawPost[] = [
        { id: '1', text: 'a', platform: 'twitter', authorName: 'Alice', authorHandle: 'alice', timestamp: new Date().toISOString() },
        { id: '2', text: 'b', platform: 'twitter', authorName: 'Alice', authorHandle: 'alice', timestamp: new Date().toISOString() },
        { id: '3', text: 'c', platform: 'twitter', authorName: 'Bob', authorHandle: 'bob', timestamp: new Date().toISOString() },
      ];
      const narratives = [
        makeNarrative({ id: 'n-0', platforms: { twitter: 3 } }),
      ];

      const result = service.comparePlatforms(narratives, posts);
      const twitter = result.perPlatform.find((p) => p.platform === 'twitter');
      expect(twitter?.topAuthors[0]).toBe('alice');
    });

    it('handles single platform gracefully', () => {
      const posts = makePosts(5, 'twitter');
      const narratives = [
        makeNarrative({ id: 'n-0', platforms: { twitter: 5 } }),
      ];

      const result = service.comparePlatforms(narratives, posts);
      expect(result.platforms).toEqual(['twitter']);
      expect(result.perPlatform.length).toBe(1);
      expect(result.crossPlatform.length).toBe(0);
    });

    it('handles no posts or narratives', () => {
      const result = service.comparePlatforms([], []);
      expect(result.platforms).toEqual([]);
      expect(result.perPlatform).toEqual([]);
      expect(result.crossPlatform).toEqual([]);
    });

    it('identifies dominant narrative per platform', () => {
      const posts: RawPost[] = makePosts(5, 'twitter');
      const narratives = [
        makeNarrative({
          id: 'n-0',
          summary: 'Big narrative',
          platforms: { twitter: 10 },
        }),
        makeNarrative({
          id: 'n-1',
          summary: 'Small narrative',
          platforms: { twitter: 2 },
        }),
      ];

      const result = service.comparePlatforms(narratives, posts);
      const twitter = result.perPlatform.find((p) => p.platform === 'twitter');
      expect(twitter?.dominantNarrative).toBe('Big narrative');
    });
  });

  // -------------------------------------------------------------------------
  // cosineSimilarity (exposed for testing)
  // -------------------------------------------------------------------------

  describe('cosineSimilarity', () => {
    it('returns 1 for identical vectors', () => {
      expect(service.cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5);
    });

    it('returns 0 for orthogonal vectors', () => {
      expect(service.cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
    });

    it('returns 0 for empty vectors', () => {
      expect(service.cosineSimilarity([], [])).toBe(0);
    });
  });
});
