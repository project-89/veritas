import { ProjectDossierService } from '../../src/lib/services/project-dossier.service';

describe('ProjectDossierService', () => {
  const service = new ProjectDossierService();

  it('builds a durable dossier payload from an investigation and evidence dossier', () => {
    const result = service.buildFromInvestigation(
      {
        _id: 'inv-1',
        id: 'inv-1',
        query: 'Rexas Finance',
        name: 'Rexas Finance',
        createdAt: new Date('2026-04-06T00:00:00Z'),
        updatedAt: new Date('2026-04-06T00:00:00Z'),
        status: 'active',
        settings: { platforms: [], timeRange: '30d', limit: 100 },
        lastSnapshotId: null,
        lastScanId: null,
        linkedProjectDossierId: null,
        evidenceSeeds: [],
        sessionState: null,
      },
      {
        generatedAt: '2026-04-06T00:00:00.000Z',
        totalSeeds: 3,
        processedSeeds: 2,
        entityCounts: { domain: 1, wallet: 1 },
        groupedEntities: {
          domain: [
            {
              type: 'domain',
              value: 'rexas.example',
              displayValue: 'rexas.example',
              sourceCount: 2,
              occurrenceCount: 2,
              sources: [],
            },
          ],
        },
        topEntities: [
          {
            type: 'domain',
            value: 'rexas.example',
            displayValue: 'rexas.example',
            sourceCount: 2,
            occurrenceCount: 2,
            sources: [],
          },
        ],
      },
    );

    expect(result.slug).toBe('rexas-finance');
    expect(result.summary?.totalSeeds).toBe(3);
    expect(result.aliases).toContain('Rexas Finance');
  });

  it('scores overlaps based on shared canonical entities', () => {
    const overlaps = service.compareAgainstMany(
      {
        _id: 'd1',
        id: 'd1',
        investigationId: 'inv-1',
        name: 'Rexas Finance',
        slug: 'rexas-finance',
        aliases: ['Rexas Finance'],
        summary: { totalSeeds: 2, processedSeeds: 2, entityCounts: {} },
        groupedEntities: {},
        topEntities: [
          {
            type: 'domain',
            value: 'rexas.example',
            displayValue: 'rexas.example',
            sourceCount: 2,
            occurrenceCount: 2,
            sources: [],
          },
          {
            type: 'wallet',
            value: '0x123',
            displayValue: '0x123',
            sourceCount: 1,
            occurrenceCount: 1,
            sources: [],
          },
        ],
        generatedAt: new Date('2026-04-06T00:00:00Z'),
        createdAt: new Date('2026-04-06T00:00:00Z'),
        updatedAt: new Date('2026-04-06T00:00:00Z'),
      },
      [
        {
          _id: 'd2',
          id: 'd2',
          investigationId: 'inv-2',
          name: 'Other Scam',
          slug: 'other-scam',
          aliases: ['Other Scam'],
          summary: { totalSeeds: 2, processedSeeds: 2, entityCounts: {} },
          groupedEntities: {},
          topEntities: [
            {
              type: 'wallet',
              value: '0x123',
              displayValue: '0x123',
              sourceCount: 3,
              occurrenceCount: 3,
              sources: [],
            },
            {
              type: 'domain',
              value: 'rexas.example',
              displayValue: 'rexas.example',
              sourceCount: 1,
              occurrenceCount: 1,
              sources: [],
            },
          ],
          generatedAt: new Date('2026-04-06T00:00:00Z'),
          createdAt: new Date('2026-04-06T00:00:00Z'),
          updatedAt: new Date('2026-04-06T00:00:00Z'),
        },
      ],
    );

    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]?.matchedTypes).toEqual(expect.arrayContaining(['domain', 'wallet']));
    expect(overlaps[0]?.score).toBeGreaterThan(0);
  });
});
