import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InvestigationController } from '../../src/lib/controllers/investigation.controller';
import { InvestigationRepository } from '../../src/lib/repositories/investigation.repository';
import { InvestigationEvidenceService } from '../../src/lib/services/investigation-evidence.service';
import { ProjectDossierRepository } from '../../src/lib/repositories/project-dossier.repository';
import { MentalModelRepository } from '../../src/lib/repositories/mental-model.repository';
import { ScanJobRepository } from '../../src/lib/repositories/scan-job.repository';
import { AlertRepository } from '../../src/lib/repositories/alert.repository';
import { AnalysisJobRepository } from '../../src/lib/repositories/analysis-job.repository';
import { ProjectDossierService } from '../../src/lib/services/project-dossier.service';
import { OnChainCorrelationService } from '../../src/lib/services/onchain-correlation.service';
import { MentalModelService } from '../../src/lib/services/mental-model.service';

describe('InvestigationController', () => {
  let controller: InvestigationController;
  let mockRepository: any;
  let mockEvidenceService: any;
  let mockProjectDossierRepository: any;
  let mockMentalModelRepository: any;
  let mockProjectDossierService: any;
  let mockOnChainCorrelationService: any;
  let mockMentalModelService: any;
  let mockScanJobRepository: any;
  let mockAlertRepository: any;
  let mockAnalysisJobRepository: any;

  const mockInvestigation = {
    _id: 'inv-1',
    id: 'inv-1',
    query: 'bitcoin regulation',
    name: 'bitcoin regulation',
    status: 'active' as const,
    createdAt: new Date('2026-03-01'),
    updatedAt: new Date('2026-03-15'),
    settings: {
      platforms: ['twitter', 'reddit'],
      timeRange: '7d',
      limit: 50,
    },
    lastSnapshotId: 'snap-1',
    lastScanId: null,
    linkedProjectDossierId: null,
    evidenceSeeds: [],
  };

  const mockProjectDossier = {
    _id: 'dossier-1',
    id: 'dossier-1',
    investigationId: 'inv-1',
    name: 'bitcoin regulation',
    slug: 'bitcoin-regulation',
    aliases: ['bitcoin regulation'],
    summary: {
      totalSeeds: 1,
      processedSeeds: 1,
      entityCounts: { youtube_video: 1 },
    },
    groupedEntities: {
      youtube_video: [
        {
          type: 'youtube_video',
          value: 'abc',
          displayValue: 'abc',
          sourceCount: 1,
          occurrenceCount: 1,
          sources: [
            { seedId: 'seed-1', kind: 'youtube', label: 'Explainer', status: 'processed' },
          ],
        },
      ],
    },
    topEntities: [
      {
        type: 'youtube_video',
        value: 'abc',
        displayValue: 'abc',
        sourceCount: 1,
        occurrenceCount: 1,
        sources: [
          { seedId: 'seed-1', kind: 'youtube', label: 'Explainer', status: 'processed' },
        ],
      },
    ],
    generatedAt: new Date('2026-04-06T00:00:00Z'),
    createdAt: new Date('2026-04-06T00:00:00Z'),
    updatedAt: new Date('2026-04-06T00:00:00Z'),
  };

  const mockMentalModel = {
    _id: 'model-1',
    id: 'model-1',
    investigationId: 'inv-1',
    name: 'bitcoin regulation Mental Model',
    domain: 'Open-source infrastructure and account correlation',
    sourceSummary: {
      totalSeeds: 1,
      processedSeeds: 1,
      seedKinds: ['youtube'],
      evidenceLabels: ['Explainer'],
    },
    theses: ['Anchor judgments to explicit source material before escalating a claim.'],
    heuristics: [
      {
        title: 'Start from pinned evidence',
        description: 'Begin with attached source material before broadening the case.',
        evidence: ['Explainer'],
      },
    ],
    decisionRules: ['Prefer claims supported by multiple processed seeds over single-source assertions.'],
    workflowSteps: ['Review attached evidence and notes for explicit claims or hypotheses.'],
    evidencePreferences: ['Long-form transcript evidence and source walkthroughs'],
    blindSpots: ['This model is only as strong as the attached evidence bundle.'],
    signaturePhrases: ['Follow the wallets before trusting the story.'],
    summary: 'A compact investigative model centered on pinned evidence and reusable entity comparison.',
    status: 'generated' as const,
    modelUsed: 'gemini-2.0-flash',
    generatedAt: new Date('2026-04-06T00:00:00Z'),
    createdAt: new Date('2026-04-06T00:00:00Z'),
    updatedAt: new Date('2026-04-06T00:00:00Z'),
  };

  const mockSnapshot = {
    _id: 'snap-1',
    id: 'snap-1',
    investigationId: 'inv-1',
    timestamp: new Date('2026-03-15'),
    postCount: 25,
    narrativeCount: 0,
    summary: {
      total: 25,
      positive: 10,
      negative: 8,
      neutral: 7,
      byPlatform: { twitter: 15, reddit: 10 },
    },
    posts: [],
    narratives: [],
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockEvidenceService = {
      prepareSeed: jest.fn().mockImplementation(async (seed) => ({
        ...seed,
        status: 'processed',
        metadata: {
          ...(seed.metadata ?? {}),
          videoId: 'abc',
        },
        extractedEntities: [
          ...(seed.extractedEntities ?? []),
          { type: 'youtube_video', value: 'abc' },
        ],
      })),
      buildDossier: jest.fn().mockReturnValue({
        generatedAt: '2026-04-06T00:00:00.000Z',
        totalSeeds: 1,
        processedSeeds: 1,
        entityCounts: { youtube_video: 1 },
        groupedEntities: {
          youtube_video: [
            {
              type: 'youtube_video',
              value: 'abc',
              displayValue: 'abc',
              sourceCount: 1,
              occurrenceCount: 1,
              sources: [
                { seedId: 'seed-1', kind: 'youtube', label: 'Explainer', status: 'processed' },
              ],
            },
          ],
        },
        topEntities: [
          {
            type: 'youtube_video',
            value: 'abc',
            displayValue: 'abc',
            sourceCount: 1,
            occurrenceCount: 1,
            sources: [
              { seedId: 'seed-1', kind: 'youtube', label: 'Explainer', status: 'processed' },
            ],
          },
        ],
      }),
    };

    mockProjectDossierRepository = {
      findByInvestigationId: jest.fn().mockResolvedValue(null),
      findAll: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockResolvedValue(mockProjectDossier),
      deleteByInvestigationId: jest.fn().mockResolvedValue(undefined),
    };

    mockMentalModelRepository = {
      findByInvestigationId: jest.fn().mockResolvedValue(null),
      findAll: jest.fn().mockResolvedValue([mockMentalModel]),
      save: jest.fn().mockResolvedValue(mockMentalModel),
      deleteByInvestigationId: jest.fn().mockResolvedValue(undefined),
    };

    mockScanJobRepository = {
      getJobsByInvestigation: jest.fn().mockResolvedValue([
        { _id: 'scan-1', id: 'scan-1', status: 'running' },
        { _id: 'scan-2', id: 'scan-2', status: 'completed' },
      ]),
      cancelJob: jest.fn().mockResolvedValue(undefined),
      deleteByInvestigationId: jest.fn().mockResolvedValue(1),
    };

    mockAlertRepository = {
      deleteByInvestigationId: jest.fn().mockResolvedValue(undefined),
    };

    mockAnalysisJobRepository = {
      cancelJobsByScan: jest.fn().mockResolvedValue(undefined),
    };

    mockProjectDossierService = {
      extractAddressCandidates: jest.fn().mockReturnValue(['0x123']),
      buildFromInvestigation: jest.fn().mockReturnValue({
        investigationId: 'inv-1',
        name: 'bitcoin regulation',
        slug: 'bitcoin-regulation',
        aliases: ['bitcoin regulation'],
        summary: mockProjectDossier.summary,
        groupedEntities: mockProjectDossier.groupedEntities,
        topEntities: mockProjectDossier.topEntities,
        generatedAt: new Date('2026-04-06T00:00:00Z'),
      }),
      compareAgainstMany: jest.fn().mockReturnValue([
        {
          dossierId: 'dossier-2',
          investigationId: 'inv-2',
          name: 'rexas finance',
          score: 9,
          matchedTypes: ['domain'],
          sharedEntities: [
            { type: 'domain', value: 'rexas.example', sourceCount: 1, weight: 5 },
          ],
        },
      ]),
    };

    mockOnChainCorrelationService = {
      buildSummary: jest.fn().mockResolvedValue({
        status: 'ready',
        analyzedAddresses: ['0x123'],
        addressSummaries: [],
        commonCounterparties: [],
        tokenContracts: [],
        note: null,
      }),
    };

    mockMentalModelService = {
      buildFromInvestigation: jest.fn().mockResolvedValue({
        investigationId: 'inv-1',
        name: 'bitcoin regulation Mental Model',
        domain: mockMentalModel.domain,
        sourceSummary: mockMentalModel.sourceSummary,
        theses: mockMentalModel.theses,
        heuristics: mockMentalModel.heuristics,
        decisionRules: mockMentalModel.decisionRules,
        workflowSteps: mockMentalModel.workflowSteps,
        evidencePreferences: mockMentalModel.evidencePreferences,
        blindSpots: mockMentalModel.blindSpots,
        signaturePhrases: mockMentalModel.signaturePhrases,
        summary: mockMentalModel.summary,
        status: mockMentalModel.status,
        modelUsed: mockMentalModel.modelUsed,
        generatedAt: mockMentalModel.generatedAt,
      }),
    };

    mockRepository = {
      findAll: jest.fn().mockResolvedValue([mockInvestigation]),
      findById: jest.fn().mockResolvedValue(mockInvestigation),
      findOrCreateByQuery: jest.fn().mockResolvedValue(mockInvestigation),
      createInvestigation: jest.fn().mockResolvedValue({
        ...mockInvestigation,
        query: 'rexas finance',
        name: 'Rexas Finance Scam Investigation',
      }),
      update: jest.fn().mockResolvedValue(mockInvestigation),
      archive: jest.fn().mockResolvedValue(undefined),
      deletePermanent: jest.fn().mockResolvedValue(undefined),
      addSnapshot: jest.fn().mockResolvedValue(mockSnapshot),
      getSnapshots: jest.fn().mockResolvedValue([mockSnapshot]),
      getLatestSnapshot: jest.fn().mockResolvedValue(mockSnapshot),
      getSnapshotById: jest.fn().mockResolvedValue(mockSnapshot),
      addEvidenceSeed: jest.fn().mockResolvedValue({
        ...mockInvestigation,
        evidenceSeeds: [
          {
            id: 'seed-1',
            kind: 'youtube',
            value: 'https://www.youtube.com/watch?v=abc',
            label: 'Explainer',
            status: 'processed',
            notes: null,
            metadata: { videoId: 'abc' },
            extractedEntities: [{ type: 'youtube_video', value: 'abc' }],
            createdAt: new Date('2026-04-06'),
            updatedAt: new Date('2026-04-06'),
          },
        ],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvestigationController],
      providers: [
        {
          provide: InvestigationRepository,
          useValue: mockRepository,
        },
        {
          provide: InvestigationEvidenceService,
          useValue: mockEvidenceService,
        },
        {
          provide: ProjectDossierRepository,
          useValue: mockProjectDossierRepository,
        },
        {
          provide: MentalModelRepository,
          useValue: mockMentalModelRepository,
        },
        {
          provide: ScanJobRepository,
          useValue: mockScanJobRepository,
        },
        {
          provide: AlertRepository,
          useValue: mockAlertRepository,
        },
        {
          provide: AnalysisJobRepository,
          useValue: mockAnalysisJobRepository,
        },
        {
          provide: ProjectDossierService,
          useValue: mockProjectDossierService,
        },
        {
          provide: OnChainCorrelationService,
          useValue: mockOnChainCorrelationService,
        },
        {
          provide: MentalModelService,
          useValue: mockMentalModelService,
        },
      ],
    }).compile();

    controller = module.get<InvestigationController>(InvestigationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('listInvestigations', () => {
    it('should return all investigations', async () => {
      const result = await controller.listInvestigations();

      expect(mockRepository.findAll).toHaveBeenCalledWith({
        status: undefined,
        limit: undefined,
        skip: undefined,
      });
      expect(result).toEqual([mockInvestigation]);
    });

    it('should pass status filter', async () => {
      await controller.listInvestigations('active');

      expect(mockRepository.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'active' })
      );
    });

    it('should parse pagination from strings', async () => {
      await controller.listInvestigations(undefined, '10', '20');

      expect(mockRepository.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10, skip: 20 })
      );
    });
  });

  describe('listAtlasLenses', () => {
    it('should return saved mental models with their backing investigations', async () => {
      mockProjectDossierRepository.findByInvestigationId.mockResolvedValueOnce(mockProjectDossier);

      const result = await controller.listAtlasLenses('10', '5');

      expect(mockMentalModelRepository.findAll).toHaveBeenCalledWith({
        limit: 10,
        skip: 5,
      });
      expect(mockRepository.findById).toHaveBeenCalledWith('inv-1');
      expect(mockProjectDossierRepository.findByInvestigationId).toHaveBeenCalledWith('inv-1');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        investigation: expect.objectContaining({
          _id: 'inv-1',
          evidenceDossier: expect.objectContaining({
            totalSeeds: mockProjectDossier.summary.totalSeeds,
          }),
        }),
        mentalModel: expect.objectContaining({
          _id: 'model-1',
          investigationId: 'inv-1',
        }),
      });
    });
  });

  describe('createOrGet', () => {
    it('should create a titled investigation when name is provided', async () => {
      const result = await controller.createOrGet({
        query: 'rexas finance',
        name: 'Rexas Finance Scam Investigation',
        platforms: ['twitter', 'youtube'],
        timeRange: '30d',
        limit: 250,
      });

      expect(mockRepository.createInvestigation).toHaveBeenCalledWith({
        query: 'rexas finance',
        name: 'Rexas Finance Scam Investigation',
        settings: {
          platforms: ['twitter', 'youtube'],
          timeRange: '30d',
          limit: 250,
        },
      });
      expect(mockRepository.findOrCreateByQuery).not.toHaveBeenCalled();
      expect(result.name).toBe('Rexas Finance Scam Investigation');
    });

    it('should use query lookup when no title is provided', async () => {
      await controller.createOrGet({
        query: 'rexas finance',
        platforms: ['rss'],
        timeRange: '7d',
        limit: 100,
      });

      expect(mockRepository.findOrCreateByQuery).toHaveBeenCalledWith('rexas finance', {
        platforms: ['rss'],
        timeRange: '7d',
        limit: 100,
      });
      expect(mockRepository.createInvestigation).not.toHaveBeenCalled();
    });
  });

  describe('getInvestigation', () => {
    it('should return investigation with latest snapshot', async () => {
      const result = await controller.getInvestigation('inv-1');

      expect(result.investigation).toMatchObject(mockInvestigation);
      expect(result.investigation.evidenceDossier).toBeDefined();
      expect(result.latestSnapshot).toEqual(mockSnapshot);
      expect(result.projectDossier).toBeNull();
      expect(result.mentalModel).toBeNull();
      expect(result.dossierOverlaps).toEqual([]);
      expect(mockRepository.findById).toHaveBeenCalledWith('inv-1');
      expect(mockRepository.getLatestSnapshot).toHaveBeenCalledWith('inv-1');
    });

    it('should throw NotFoundException when not found', async () => {
      mockRepository.findById.mockResolvedValueOnce(null);

      await expect(
        controller.getInvestigation('nonexistent')
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateInvestigation', () => {
    it('should update and return the investigation', async () => {
      const updatedInvestigation = {
        ...mockInvestigation,
        name: 'New Name',
      };
      mockRepository.update.mockResolvedValueOnce(updatedInvestigation);

      const result = await controller.updateInvestigation('inv-1', {
        name: 'New Name',
      });

      expect(mockRepository.update).toHaveBeenCalledWith('inv-1', {
        name: 'New Name',
      });
      expect(result.name).toBe('New Name');
    });

    it('should throw NotFoundException when not found', async () => {
      mockRepository.findById.mockResolvedValueOnce(null);

      await expect(
        controller.updateInvestigation('nonexistent', { name: 'test' })
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('archiveInvestigation', () => {
    it('should archive and return success', async () => {
      const result = await controller.archiveInvestigation('inv-1');

      expect(mockRepository.archive).toHaveBeenCalledWith('inv-1');
      expect(result).toEqual({ success: true });
    });

    it('should throw NotFoundException when not found', async () => {
      mockRepository.findById.mockResolvedValueOnce(null);

      await expect(
        controller.archiveInvestigation('nonexistent')
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteInvestigationPermanent', () => {
    it('should delete related records and the investigation', async () => {
      const result = await controller.deleteInvestigationPermanent('inv-1');

      expect(mockScanJobRepository.getJobsByInvestigation).toHaveBeenCalledWith('inv-1', 200);
      expect(mockScanJobRepository.cancelJob).toHaveBeenCalledWith('scan-1');
      expect(mockAnalysisJobRepository.cancelJobsByScan).toHaveBeenCalledWith('scan-1');
      expect(mockAnalysisJobRepository.cancelJobsByScan).toHaveBeenCalledWith('scan-2');
      expect(mockProjectDossierRepository.deleteByInvestigationId).toHaveBeenCalledWith('inv-1');
      expect(mockMentalModelRepository.deleteByInvestigationId).toHaveBeenCalledWith('inv-1');
      expect(mockScanJobRepository.deleteByInvestigationId).toHaveBeenCalledWith('inv-1');
      expect(mockAlertRepository.deleteByInvestigationId).toHaveBeenCalledWith('inv-1');
      expect(mockRepository.deletePermanent).toHaveBeenCalledWith('inv-1');
      expect(result).toEqual({ success: true });
    });

    it('should throw NotFoundException when the investigation does not exist', async () => {
      mockRepository.findById.mockResolvedValueOnce(null);

      await expect(controller.deleteInvestigationPermanent('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listSnapshots', () => {
    it('should return snapshots for an investigation', async () => {
      const result = await controller.listSnapshots('inv-1');

      expect(mockRepository.getSnapshots).toHaveBeenCalledWith('inv-1', {
        limit: undefined,
      });
      expect(result).toEqual([mockSnapshot]);
    });

    it('should parse limit from string', async () => {
      await controller.listSnapshots('inv-1', '5');

      expect(mockRepository.getSnapshots).toHaveBeenCalledWith('inv-1', {
        limit: 5,
      });
    });

    it('should throw NotFoundException when investigation not found', async () => {
      mockRepository.findById.mockResolvedValueOnce(null);

      await expect(
        controller.listSnapshots('nonexistent')
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getSnapshot', () => {
    it('should return a specific snapshot', async () => {
      const result = await controller.getSnapshot('inv-1', 'snap-1');

      expect(mockRepository.getSnapshotById).toHaveBeenCalledWith('snap-1');
      expect(result).toEqual(mockSnapshot);
    });

    it('should throw NotFoundException when snapshot not found', async () => {
      mockRepository.getSnapshotById.mockResolvedValueOnce(null);

      await expect(
        controller.getSnapshot('inv-1', 'nonexistent')
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when snapshot belongs to different investigation', async () => {
      const wrongSnapshot = {
        ...mockSnapshot,
        investigationId: 'inv-other',
      };
      mockRepository.getSnapshotById.mockResolvedValueOnce(wrongSnapshot);

      await expect(
        controller.getSnapshot('inv-1', 'snap-1')
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('addEvidenceSeed', () => {
    it('should append a typed evidence seed to the investigation', async () => {
      const result = await controller.addEvidenceSeed('inv-1', {
        kind: 'youtube',
        value: 'https://www.youtube.com/watch?v=abc',
        label: 'Explainer',
      });

      expect(mockRepository.addEvidenceSeed).toHaveBeenCalledWith(
        'inv-1',
        expect.objectContaining({
          kind: 'youtube',
          value: 'https://www.youtube.com/watch?v=abc',
          label: 'Explainer',
          status: 'processed',
          extractedEntities: [{ type: 'youtube_video', value: 'abc' }],
        }),
      );
      expect(mockEvidenceService.prepareSeed).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.investigation.evidenceSeeds).toHaveLength(1);
      expect(result.investigation.evidenceDossier).toBeDefined();
    });

    it('should reject empty evidence payloads', async () => {
      await expect(
        controller.addEvidenceSeed('inv-1', {
          kind: 'youtube',
          value: '',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('project dossier endpoints', () => {
    it('should build a project dossier and return overlaps', async () => {
      mockRepository.update.mockResolvedValueOnce({
        ...mockInvestigation,
        linkedProjectDossierId: 'dossier-1',
      });
      mockProjectDossierRepository.findAll.mockResolvedValue([mockProjectDossier]);

      const result = await controller.buildProjectDossier('inv-1');

      expect(mockProjectDossierService.buildFromInvestigation).toHaveBeenCalled();
      expect(mockOnChainCorrelationService.buildSummary).toHaveBeenCalled();
      expect(mockProjectDossierRepository.save).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.projectDossier.id).toBe('dossier-1');
      expect(result.dossierOverlaps).toHaveLength(1);
      expect(result.investigation.linkedProjectDossierId).toBe('dossier-1');
    });

    it('should return the existing project dossier for an investigation', async () => {
      mockProjectDossierRepository.findByInvestigationId.mockResolvedValueOnce(mockProjectDossier);
      mockProjectDossierRepository.findAll.mockResolvedValueOnce([mockProjectDossier]);

      const result = await controller.getProjectDossier('inv-1');

      expect(result.projectDossier?.id).toBe('dossier-1');
      expect(result.dossierOverlaps).toHaveLength(1);
    });
  });

  describe('mental model endpoints', () => {
    it('should build a mental model and return it', async () => {
      const result = await controller.buildMentalModel('inv-1');

      expect(mockMentalModelService.buildFromInvestigation).toHaveBeenCalled();
      expect(mockMentalModelRepository.save).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.mentalModel.id).toBe('model-1');
      expect(result.mentalModel.heuristics).toHaveLength(1);
    });

    it('should return the existing mental model for an investigation', async () => {
      mockMentalModelRepository.findByInvestigationId.mockResolvedValueOnce(mockMentalModel);

      const result = await controller.getMentalModel('inv-1');

      expect(result.mentalModel?.id).toBe('model-1');
      expect(result.mentalModel?.domain).toBe(mockMentalModel.domain);
    });
  });
});
