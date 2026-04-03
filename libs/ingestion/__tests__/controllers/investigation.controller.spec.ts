import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { InvestigationController } from '../../src/lib/controllers/investigation.controller';
import { InvestigationRepository } from '../../src/lib/repositories/investigation.repository';

describe('InvestigationController', () => {
  let controller: InvestigationController;
  let mockRepository: any;

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

    mockRepository = {
      findAll: jest.fn().mockResolvedValue([mockInvestigation]),
      findById: jest.fn().mockResolvedValue(mockInvestigation),
      findOrCreateByQuery: jest.fn().mockResolvedValue(mockInvestigation),
      update: jest.fn().mockResolvedValue(mockInvestigation),
      archive: jest.fn().mockResolvedValue(undefined),
      addSnapshot: jest.fn().mockResolvedValue(mockSnapshot),
      getSnapshots: jest.fn().mockResolvedValue([mockSnapshot]),
      getLatestSnapshot: jest.fn().mockResolvedValue(mockSnapshot),
      getSnapshotById: jest.fn().mockResolvedValue(mockSnapshot),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvestigationController],
      providers: [
        {
          provide: InvestigationRepository,
          useValue: mockRepository,
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

  describe('getInvestigation', () => {
    it('should return investigation with latest snapshot', async () => {
      const result = await controller.getInvestigation('inv-1');

      expect(result.investigation).toEqual(mockInvestigation);
      expect(result.latestSnapshot).toEqual(mockSnapshot);
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
});
