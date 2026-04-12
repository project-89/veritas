import { Test, TestingModule } from '@nestjs/testing';
import { InvestigationRepository } from '../../src/lib/repositories/investigation.repository';
import { DatabaseService } from '@veritas/database';

describe('InvestigationRepository', () => {
  let repository: InvestigationRepository;
  let mockDatabaseService: any;
  let mockInvestigationRepo: any;
  let mockSnapshotRepo: any;

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
    lastSnapshotId: null,
    lastScanId: null,
    evidenceSeeds: [],
  };

  const mockSnapshot = {
    _id: 'snap-1',
    id: 'snap-1',
    investigationId: 'inv-1',
    scanId: null,
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
    posts: [{ id: 'post-1', text: 'test post' }],
    narratives: [],
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockInvestigationRepo = {
      find: jest.fn().mockResolvedValue([mockInvestigation]),
      findById: jest.fn().mockResolvedValue(mockInvestigation),
      findOne: jest.fn().mockResolvedValue(null),
      count: jest.fn(),
      create: jest.fn().mockResolvedValue(mockInvestigation),
      createMany: jest.fn(),
      updateById: jest.fn().mockResolvedValue(mockInvestigation),
      updateMany: jest.fn(),
      deleteById: jest.fn(),
      deleteMany: jest.fn(),
    };

    mockSnapshotRepo = {
      find: jest.fn().mockResolvedValue([mockSnapshot]),
      findById: jest.fn().mockResolvedValue(mockSnapshot),
      findOne: jest.fn(),
      count: jest.fn(),
      create: jest.fn().mockResolvedValue(mockSnapshot),
      createMany: jest.fn(),
      updateById: jest.fn(),
      updateMany: jest.fn(),
      deleteById: jest.fn(),
      deleteMany: jest.fn(),
    };

    mockDatabaseService = {
      getRepository: jest.fn((name: string) => {
        if (name === 'Investigation') return mockInvestigationRepo;
        if (name === 'Snapshot') return mockSnapshotRepo;
        return mockInvestigationRepo;
      }),
      connect: jest.fn(),
      disconnect: jest.fn(),
      isConnected: jest.fn(),
      registerModel: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvestigationRepository,
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
      ],
    }).compile();

    repository = module.get<InvestigationRepository>(InvestigationRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  it('should register Investigation and Snapshot models on init', async () => {
    // onModuleInit triggers initialization
    await repository.onModuleInit();
    expect(mockDatabaseService.registerModel).toHaveBeenCalledWith(
      'Investigation',
      expect.anything()
    );
    expect(mockDatabaseService.registerModel).toHaveBeenCalledWith(
      'Snapshot',
      expect.anything()
    );
  });

  describe('findOrCreateByQuery', () => {
    it('should return existing investigation if query matches', async () => {
      mockInvestigationRepo.findOne.mockResolvedValueOnce(mockInvestigation);

      const result = await repository.findOrCreateByQuery('bitcoin regulation');

      expect(mockInvestigationRepo.findOne).toHaveBeenCalledWith({
        query: 'bitcoin regulation',
      });
      expect(mockInvestigationRepo.create).not.toHaveBeenCalled();
      expect(result).toEqual(mockInvestigation);
    });

    it('should create a new investigation if none exists', async () => {
      mockInvestigationRepo.findOne.mockResolvedValueOnce(null);

      const result = await repository.findOrCreateByQuery(
        'bitcoin regulation',
        { platforms: ['twitter'], limit: 30 }
      );

      expect(mockInvestigationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'bitcoin regulation',
          name: 'bitcoin regulation',
          status: 'active',
          settings: expect.objectContaining({
            platforms: ['twitter'],
            limit: 30,
          }),
          lastSnapshotId: null,
          lastScanId: null,
          evidenceSeeds: [],
        })
      );
      expect(result).toEqual(mockInvestigation);
    });

    it('should use default settings when none provided', async () => {
      mockInvestigationRepo.findOne.mockResolvedValueOnce(null);

      await repository.findOrCreateByQuery('bitcoin regulation');

      expect(mockInvestigationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            platforms: [],
            timeRange: '7d',
            limit: 50,
          }),
        })
      );
    });
  });

  describe('findAll', () => {
    it('should return all investigations sorted by updatedAt desc', async () => {
      const result = await repository.findAll();

      expect(mockInvestigationRepo.find).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ sort: { updatedAt: -1 } })
      );
      expect(result).toEqual([mockInvestigation]);
    });

    it('should filter by status when provided', async () => {
      await repository.findAll({ status: 'archived' });

      expect(mockInvestigationRepo.find).toHaveBeenCalledWith(
        { status: 'archived' },
        expect.anything()
      );
    });

    it('should apply pagination options', async () => {
      await repository.findAll({ limit: 10, skip: 5 });

      expect(mockInvestigationRepo.find).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ limit: 10, skip: 5 })
      );
    });
  });

  describe('findById', () => {
    it('should return investigation by id', async () => {
      const result = await repository.findById('inv-1');

      expect(mockInvestigationRepo.findById).toHaveBeenCalledWith('inv-1');
      expect(result).toEqual(mockInvestigation);
    });

    it('should return null when not found', async () => {
      mockInvestigationRepo.findById.mockResolvedValueOnce(null);

      const result = await repository.findById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update an investigation', async () => {
      const updatedInvestigation = {
        ...mockInvestigation,
        name: 'Renamed Investigation',
      };
      mockInvestigationRepo.updateById.mockResolvedValueOnce(
        updatedInvestigation
      );

      const result = await repository.update('inv-1', {
        name: 'Renamed Investigation',
      } as any);

      expect(mockInvestigationRepo.updateById).toHaveBeenCalledWith('inv-1', {
        name: 'Renamed Investigation',
      });
      expect(result.name).toBe('Renamed Investigation');
    });

    it('should throw when investigation not found', async () => {
      mockInvestigationRepo.updateById.mockResolvedValueOnce(null);

      await expect(
        repository.update('nonexistent', { name: 'test' } as any)
      ).rejects.toThrow('Investigation not found: nonexistent');
    });
  });

  describe('archive', () => {
    it('should set status to archived', async () => {
      await repository.archive('inv-1');

      expect(mockInvestigationRepo.updateById).toHaveBeenCalledWith(
        'inv-1',
        expect.objectContaining({ status: 'archived' })
      );
    });
  });

  describe('deletePermanent', () => {
    it('should delete snapshots and the investigation', async () => {
      await repository.deletePermanent('inv-1');

      expect(mockSnapshotRepo.deleteMany).toHaveBeenCalledWith({ investigationId: 'inv-1' });
      expect(mockInvestigationRepo.deleteById).toHaveBeenCalledWith('inv-1');
    });
  });

  describe('upsertSnapshotForScan', () => {
    it('creates a snapshot when no scan snapshot exists yet', async () => {
      mockSnapshotRepo.find.mockResolvedValueOnce([]);

      const result = await repository.upsertSnapshotForScan('inv-1', 'scan-1', {
        posts: [{ id: 'p-1' }],
        narratives: [{ id: 'n-1' }],
        summary: mockSnapshot.summary,
      });

      expect(mockSnapshotRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          investigationId: 'inv-1',
          scanId: 'scan-1',
          postCount: 1,
          narrativeCount: 1,
        }),
      );
      expect(result).toEqual(mockSnapshot);
    });

    it('updates the existing snapshot when scanId already exists', async () => {
      mockSnapshotRepo.find.mockResolvedValueOnce([mockSnapshot]);
      mockSnapshotRepo.updateById.mockResolvedValueOnce({
        ...mockSnapshot,
        scanId: 'scan-1',
        posts: [{ id: 'p-2' }],
      });

      const result = await repository.upsertSnapshotForScan('inv-1', 'scan-1', {
        posts: [{ id: 'p-2' }],
        narratives: [],
        summary: mockSnapshot.summary,
      });

      expect(mockSnapshotRepo.updateById).toHaveBeenCalledWith(
        'snap-1',
        expect.objectContaining({
          postCount: 1,
          narrativeCount: 0,
          posts: [{ id: 'p-2' }],
        }),
      );
      expect(mockInvestigationRepo.updateById).toHaveBeenCalledWith(
        'inv-1',
        expect.objectContaining({ lastSnapshotId: 'snap-1' }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          scanId: 'scan-1',
          posts: [{ id: 'p-2' }],
        }),
      );
    });
  });

  describe('addEvidenceSeed', () => {
    it('should append a new evidence seed and persist the updated investigation', async () => {
      const seed = {
        id: 'seed-1',
        kind: 'youtube' as const,
        value: 'https://www.youtube.com/watch?v=abc',
        label: 'Explainer',
        status: 'pending' as const,
        notes: null,
        metadata: {},
        extractedEntities: [],
        createdAt: new Date('2026-04-06'),
        updatedAt: new Date('2026-04-06'),
      };

      await repository.addEvidenceSeed('inv-1', seed as any);

      expect(mockInvestigationRepo.updateById).toHaveBeenCalledWith(
        'inv-1',
        expect.objectContaining({
          evidenceSeeds: [seed],
        }),
      );
    });
  });

  describe('addSnapshot', () => {
    it('should create a snapshot and update lastSnapshotId', async () => {
      const snapshotData = {
        posts: [{ id: 'post-1', text: 'test post' }],
        narratives: [],
        summary: {
          total: 25,
          positive: 10,
          negative: 8,
          neutral: 7,
          byPlatform: { twitter: 15, reddit: 10 },
        },
      };

      const result = await repository.addSnapshot('inv-1', snapshotData);

      expect(mockSnapshotRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          investigationId: 'inv-1',
          postCount: 1,
          narrativeCount: 0,
          summary: snapshotData.summary,
          posts: snapshotData.posts,
          narratives: snapshotData.narratives,
        })
      );
      expect(mockInvestigationRepo.updateById).toHaveBeenCalledWith(
        'inv-1',
        expect.objectContaining({ lastSnapshotId: 'snap-1' })
      );
      expect(result).toEqual(mockSnapshot);
    });
  });

  describe('getSnapshots', () => {
    it('should return snapshots sorted by timestamp desc', async () => {
      const result = await repository.getSnapshots('inv-1');

      expect(mockSnapshotRepo.find).toHaveBeenCalledWith(
        { investigationId: 'inv-1' },
        expect.objectContaining({ sort: { timestamp: -1 } })
      );
      expect(result).toEqual([mockSnapshot]);
    });

    it('should apply limit option', async () => {
      await repository.getSnapshots('inv-1', { limit: 5 });

      expect(mockSnapshotRepo.find).toHaveBeenCalledWith(
        { investigationId: 'inv-1' },
        expect.objectContaining({ limit: 5 })
      );
    });
  });

  describe('getLatestSnapshot', () => {
    it('should return the most recent snapshot', async () => {
      const result = await repository.getLatestSnapshot('inv-1');

      expect(mockSnapshotRepo.find).toHaveBeenCalledWith(
        { investigationId: 'inv-1' },
        expect.objectContaining({ limit: 5, sort: { timestamp: -1 } })
      );
      expect(result).toEqual(mockSnapshot);
    });

    it('should return null when no snapshots exist', async () => {
      mockSnapshotRepo.find.mockResolvedValueOnce([]);

      const result = await repository.getLatestSnapshot('inv-1');
      expect(result).toBeNull();
    });
  });

  describe('getSnapshotById', () => {
    it('should return a specific snapshot', async () => {
      const result = await repository.getSnapshotById('snap-1');

      expect(mockSnapshotRepo.findById).toHaveBeenCalledWith('snap-1');
      expect(result).toEqual(mockSnapshot);
    });

    it('should return null when not found', async () => {
      mockSnapshotRepo.findById.mockResolvedValueOnce(null);

      const result = await repository.getSnapshotById('nonexistent');
      expect(result).toBeNull();
    });
  });
});
