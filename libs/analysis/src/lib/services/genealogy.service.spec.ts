import {
  NarrativeGenealogyService,
  NarrativeSnapshot,
  SnapshotNarrative,
} from './genealogy.service';

function makeSnapshotNarrative(
  overrides: Partial<SnapshotNarrative> & { id: string },
): SnapshotNarrative {
  return {
    summary: overrides.summary ?? `Summary for ${overrides.id}`,
    centroidEmbedding: overrides.centroidEmbedding ?? [1, 0, 0],
    postCount: overrides.postCount ?? 10,
    avgSentiment: overrides.avgSentiment ?? 0,
    ...overrides,
  };
}

describe('NarrativeGenealogyService', () => {
  let service: NarrativeGenealogyService;

  beforeEach(() => {
    service = new NarrativeGenealogyService();
  });

  // -------------------------------------------------------------------------
  // cosineSimilarity
  // -------------------------------------------------------------------------

  describe('cosineSimilarity', () => {
    it('returns 1 for identical vectors', () => {
      expect(service.cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 5);
    });

    it('returns 0 for orthogonal vectors', () => {
      expect(service.cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 5);
    });

    it('returns 0 for empty vectors', () => {
      expect(service.cosineSimilarity([], [])).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // traceLineage (two-snapshot comparison)
  // -------------------------------------------------------------------------

  describe('traceLineage', () => {
    it('detects matching narratives with high similarity', () => {
      const prev = [
        makeSnapshotNarrative({ id: 'prev-0', centroidEmbedding: [1, 0, 0], postCount: 10 }),
      ];
      const curr = [
        makeSnapshotNarrative({ id: 'curr-0', centroidEmbedding: [0.95, 0.05, 0], postCount: 15 }),
      ];

      const lineages = service.traceLineage(prev, curr, '2025-06-02T00:00:00Z');

      expect(lineages.length).toBe(1);
      expect(lineages[0]!.currentId).toBe('curr-0');
      expect(lineages[0]!.history.length).toBe(1);
      expect(lineages[0]!.history[0]!.narrativeId).toBe('prev-0');
      expect(lineages[0]!.history[0]!.similarity).toBeGreaterThan(0.7);
    });

    it('detects new narratives (no match in previous)', () => {
      const prev = [makeSnapshotNarrative({ id: 'prev-0', centroidEmbedding: [1, 0, 0] })];
      const curr = [makeSnapshotNarrative({ id: 'curr-0', centroidEmbedding: [0, 1, 0] })];

      const lineages = service.traceLineage(prev, curr, '2025-06-02T00:00:00Z');

      // curr-0 is new (orthogonal), prev-0 is died
      const newLineage = lineages.find((l) => l.currentId === 'curr-0');
      expect(newLineage).toBeDefined();
      expect(newLineage!.events.some((e) => e.type === 'emerged')).toBe(true);

      const diedLineage = lineages.find((l) => l.currentId === 'prev-0');
      expect(diedLineage).toBeDefined();
      expect(diedLineage!.status).toBe('died');
      expect(diedLineage!.events.some((e) => e.type === 'died')).toBe(true);
    });

    it('detects growing narratives', () => {
      const prev = [
        makeSnapshotNarrative({
          id: 'prev-0',
          centroidEmbedding: [1, 0, 0],
          postCount: 10,
        }),
      ];
      const curr = [
        makeSnapshotNarrative({
          id: 'curr-0',
          centroidEmbedding: [1, 0, 0],
          postCount: 20,
        }),
      ];

      const lineages = service.traceLineage(prev, curr, '2025-06-02T00:00:00Z');
      expect(lineages[0]!.status).toBe('growing');
      expect(lineages[0]!.events.some((e) => e.type === 'grew')).toBe(true);
    });

    it('detects shrinking narratives', () => {
      const prev = [
        makeSnapshotNarrative({
          id: 'prev-0',
          centroidEmbedding: [1, 0, 0],
          postCount: 20,
        }),
      ];
      const curr = [
        makeSnapshotNarrative({
          id: 'curr-0',
          centroidEmbedding: [1, 0, 0],
          postCount: 5,
        }),
      ];

      const lineages = service.traceLineage(prev, curr, '2025-06-02T00:00:00Z');
      expect(lineages[0]!.events.some((e) => e.type === 'shrank')).toBe(true);
      expect(lineages[0]!.status).toBe('fading');
    });

    it('detects splits (moderate similarity 0.4-0.7)', () => {
      // Create vectors with similarity between 0.4 and 0.7
      // cos(60 degrees) ~ 0.5
      const prev = [
        makeSnapshotNarrative({
          id: 'prev-0',
          centroidEmbedding: [1, 0, 0],
        }),
      ];
      const curr = [
        makeSnapshotNarrative({
          id: 'curr-0',
          centroidEmbedding: [0.5, 0.866, 0], // ~60 degrees from [1,0,0]
        }),
      ];

      const lineages = service.traceLineage(prev, curr, '2025-06-02T00:00:00Z');
      const currLineage = lineages.find((l) => l.currentId === 'curr-0');
      expect(currLineage).toBeDefined();
      expect(currLineage!.events.some((e) => e.type === 'split')).toBe(true);
    });

    it('handles empty previous (all new)', () => {
      const curr = [
        makeSnapshotNarrative({ id: 'curr-0', centroidEmbedding: [1, 0, 0] }),
        makeSnapshotNarrative({ id: 'curr-1', centroidEmbedding: [0, 1, 0] }),
      ];

      const lineages = service.traceLineage([], curr, '2025-06-02T00:00:00Z');
      expect(lineages.length).toBe(2);
      expect(lineages.every((l) => l.events.some((e) => e.type === 'emerged'))).toBe(true);
    });

    it('handles empty current (all died)', () => {
      const prev = [makeSnapshotNarrative({ id: 'prev-0', centroidEmbedding: [1, 0, 0] })];

      const lineages = service.traceLineage(prev, [], '2025-06-02T00:00:00Z');
      expect(lineages.length).toBe(1);
      expect(lineages[0]!.status).toBe('died');
    });
  });

  // -------------------------------------------------------------------------
  // buildFullGenealogy (multi-snapshot)
  // -------------------------------------------------------------------------

  describe('buildFullGenealogy', () => {
    it('returns empty for no snapshots', () => {
      const result = service.buildFullGenealogy([]);
      expect(result).toEqual([]);
    });

    it('handles single snapshot (all emerged)', () => {
      const snapshots: NarrativeSnapshot[] = [
        {
          id: 'snap-0',
          timestamp: '2025-06-01T00:00:00Z',
          narratives: [
            makeSnapshotNarrative({ id: 'n-0', centroidEmbedding: [1, 0, 0] }),
            makeSnapshotNarrative({ id: 'n-1', centroidEmbedding: [0, 1, 0] }),
          ],
        },
      ];

      const result = service.buildFullGenealogy(snapshots);
      expect(result.length).toBe(2);
      expect(result.every((l) => l.events.some((e) => e.type === 'emerged'))).toBe(true);
      expect(result.every((l) => l.history.length === 1)).toBe(true);
    });

    it('traces lineage across two snapshots', () => {
      const snapshots: NarrativeSnapshot[] = [
        {
          id: 'snap-0',
          timestamp: '2025-06-01T00:00:00Z',
          narratives: [
            makeSnapshotNarrative({ id: 'n-0', centroidEmbedding: [1, 0, 0], postCount: 10 }),
          ],
        },
        {
          id: 'snap-1',
          timestamp: '2025-06-02T00:00:00Z',
          narratives: [
            makeSnapshotNarrative({
              id: 'n-0-v2',
              centroidEmbedding: [0.98, 0.02, 0],
              postCount: 15,
            }),
          ],
        },
      ];

      const result = service.buildFullGenealogy(snapshots);
      expect(result.length).toBe(1);
      expect(result[0]!.currentId).toBe('n-0-v2');
      // History should have entries from both snapshots
      expect(result[0]!.history.length).toBe(2);
    });

    it('traces lineage across three snapshots', () => {
      const snapshots: NarrativeSnapshot[] = [
        {
          id: 'snap-0',
          timestamp: '2025-06-01T00:00:00Z',
          narratives: [
            makeSnapshotNarrative({ id: 'n-0', centroidEmbedding: [1, 0, 0], postCount: 5 }),
          ],
        },
        {
          id: 'snap-1',
          timestamp: '2025-06-02T00:00:00Z',
          narratives: [
            makeSnapshotNarrative({
              id: 'n-0-v2',
              centroidEmbedding: [0.99, 0.01, 0],
              postCount: 10,
            }),
          ],
        },
        {
          id: 'snap-2',
          timestamp: '2025-06-03T00:00:00Z',
          narratives: [
            makeSnapshotNarrative({
              id: 'n-0-v3',
              centroidEmbedding: [0.98, 0.02, 0],
              postCount: 20,
            }),
          ],
        },
      ];

      const result = service.buildFullGenealogy(snapshots);
      expect(result.length).toBe(1);
      expect(result[0]!.currentId).toBe('n-0-v3');
      expect(result[0]!.history.length).toBe(3);
    });

    it('detects new narratives appearing in later snapshots', () => {
      const snapshots: NarrativeSnapshot[] = [
        {
          id: 'snap-0',
          timestamp: '2025-06-01T00:00:00Z',
          narratives: [makeSnapshotNarrative({ id: 'n-0', centroidEmbedding: [1, 0, 0] })],
        },
        {
          id: 'snap-1',
          timestamp: '2025-06-02T00:00:00Z',
          narratives: [
            makeSnapshotNarrative({ id: 'n-0-v2', centroidEmbedding: [1, 0, 0] }),
            makeSnapshotNarrative({ id: 'n-new', centroidEmbedding: [0, 1, 0] }),
          ],
        },
      ];

      const result = service.buildFullGenealogy(snapshots);
      expect(result.length).toBe(2);
      const newLineage = result.find((l) => l.currentId === 'n-new');
      expect(newLineage).toBeDefined();
      expect(newLineage!.events.some((e) => e.type === 'emerged')).toBe(true);
    });

    it('detects died narratives in the final snapshot', () => {
      const snapshots: NarrativeSnapshot[] = [
        {
          id: 'snap-0',
          timestamp: '2025-06-01T00:00:00Z',
          narratives: [
            makeSnapshotNarrative({ id: 'n-0', centroidEmbedding: [1, 0, 0] }),
            makeSnapshotNarrative({ id: 'n-1', centroidEmbedding: [0, 1, 0] }),
          ],
        },
        {
          id: 'snap-1',
          timestamp: '2025-06-02T00:00:00Z',
          narratives: [
            makeSnapshotNarrative({ id: 'n-0-v2', centroidEmbedding: [1, 0, 0] }),
            // n-1 is gone
          ],
        },
      ];

      const result = service.buildFullGenealogy(snapshots);
      const diedLineage = result.find((l) => l.status === 'died');
      expect(diedLineage).toBeDefined();
      expect(diedLineage!.events.some((e) => e.type === 'died')).toBe(true);
    });

    it('sorts snapshots chronologically regardless of input order', () => {
      const snapshots: NarrativeSnapshot[] = [
        {
          id: 'snap-1',
          timestamp: '2025-06-02T00:00:00Z',
          narratives: [
            makeSnapshotNarrative({ id: 'n-0-v2', centroidEmbedding: [1, 0, 0], postCount: 20 }),
          ],
        },
        {
          id: 'snap-0',
          timestamp: '2025-06-01T00:00:00Z',
          narratives: [
            makeSnapshotNarrative({ id: 'n-0', centroidEmbedding: [1, 0, 0], postCount: 10 }),
          ],
        },
      ];

      const result = service.buildFullGenealogy(snapshots);
      expect(result.length).toBe(1);
      // Should detect growth (10 -> 20)
      expect(result[0]!.events.some((e) => e.type === 'grew')).toBe(true);
    });

    it('handles complex scenario: emerge, grow, split, die across 3 snapshots', () => {
      const snapshots: NarrativeSnapshot[] = [
        {
          id: 'snap-0',
          timestamp: '2025-06-01T00:00:00Z',
          narratives: [
            makeSnapshotNarrative({ id: 'n-0', centroidEmbedding: [1, 0, 0], postCount: 10 }),
          ],
        },
        {
          id: 'snap-1',
          timestamp: '2025-06-02T00:00:00Z',
          narratives: [
            makeSnapshotNarrative({ id: 'n-0-v2', centroidEmbedding: [1, 0, 0], postCount: 20 }),
            makeSnapshotNarrative({ id: 'n-1', centroidEmbedding: [0, 0, 1], postCount: 5 }),
          ],
        },
        {
          id: 'snap-2',
          timestamp: '2025-06-03T00:00:00Z',
          narratives: [
            makeSnapshotNarrative({
              id: 'n-0-v3',
              centroidEmbedding: [0.99, 0.01, 0],
              postCount: 25,
            }),
            // n-1 died
            makeSnapshotNarrative({ id: 'n-2', centroidEmbedding: [0, 1, 0], postCount: 3 }),
          ],
        },
      ];

      const result = service.buildFullGenealogy(snapshots);

      // n-0 lineage continues through all 3 snapshots
      const n0Lineage = result.find((l) => l.currentId === 'n-0-v3');
      expect(n0Lineage).toBeDefined();
      expect(n0Lineage!.history.length).toBe(3);

      // n-1 should be died
      const diedLineage = result.find((l) => l.status === 'died');
      expect(diedLineage).toBeDefined();

      // n-2 is newly emerged
      const n2Lineage = result.find((l) => l.currentId === 'n-2');
      expect(n2Lineage).toBeDefined();
      expect(n2Lineage!.events.some((e) => e.type === 'emerged')).toBe(true);
    });
  });
});
