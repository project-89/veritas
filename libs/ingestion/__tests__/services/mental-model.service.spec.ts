import { MentalModelService } from '../../src/lib/services/mental-model.service';

describe('MentalModelService', () => {
  it('builds a deterministic fallback mental model from investigation evidence', async () => {
    const service = new MentalModelService({
      get: jest.fn().mockReturnValue(undefined),
    } as any);

    const result = await service.buildFromInvestigation({
      investigation: {
        _id: 'inv-1',
        id: 'inv-1',
        query: 'Rexas Finance',
        name: 'Rexas Finance',
        evidenceSeeds: [
          {
            id: 'seed-1',
            kind: 'youtube',
            value: 'https://youtube.com/watch?v=abc',
            label: 'Net Crypto Explainer',
            status: 'processed',
            notes: 'Tracks wallets, domains, and team reuse.',
            metadata: {
              contentPreview: 'The investigator follows wallets, compares sites, and checks repeated infrastructure.',
            },
            extractedEntities: [],
            createdAt: new Date('2026-04-06T00:00:00Z'),
            updatedAt: new Date('2026-04-06T00:00:00Z'),
          },
          {
            id: 'seed-2',
            kind: 'wallet',
            value: '0x123',
            label: 'Deployer Wallet',
            status: 'processed',
            notes: null,
            metadata: {},
            extractedEntities: [{ type: 'wallet', value: '0x123' }],
            createdAt: new Date('2026-04-06T00:00:00Z'),
            updatedAt: new Date('2026-04-06T00:00:00Z'),
          },
        ],
      } as any,
      evidenceDossier: {
        generatedAt: '2026-04-06T00:00:00.000Z',
        totalSeeds: 2,
        processedSeeds: 2,
        entityCounts: {
          wallet: 1,
          domain: 1,
          handle: 1,
        },
        groupedEntities: {},
        topEntities: [],
      },
      projectDossier: null,
    });

    expect(result.status).toBe('fallback');
    expect(result.modelUsed).toBe('deterministic-fallback');
    expect(result.domain).toContain('Crypto');
    expect(result.heuristics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Start from pinned evidence',
        }),
        expect.objectContaining({
          title: 'Follow financial touchpoints',
        }),
      ]),
    );
    expect(result.evidencePreferences).toEqual(
      expect.arrayContaining([
        'Long-form transcript evidence and source walkthroughs',
        'Direct wallet and contract identifiers',
      ]),
    );
  });
});
