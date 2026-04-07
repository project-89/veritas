import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { ScanController } from '../../src/lib/controllers/scan.controller';
import { ScanJobRepository } from '../../src/lib/repositories/scan-job.repository';
import { InvestigationRepository } from '../../src/lib/repositories/investigation.repository';
import { IngestionService } from '../../src/lib/services/ingestion.service';

describe('ScanController', () => {
  let controller: ScanController;
  let scanJobRepo: ScanJobRepository;
  let investigationRepo: {
    findOrCreateByQuery: jest.Mock;
    findById: jest.Mock;
    update: jest.Mock;
    setLastScanId: jest.Mock;
  };
  let scanQueue: { add: jest.Mock; getJobs: jest.Mock };

  const mockScanJob = {
    _id: 'scan-123',
    id: 'scan-123',
    query: 'test query',
    investigationId: 'inv-456',
    status: 'running' as const,
    settings: { platforms: ['reddit', 'twitter'], timeRange: '7d', limit: 100 },
    connectors: {
      reddit: { status: 'done' as const, postCount: 50, insightCount: 50, startedAt: null, completedAt: null, error: null, duration: null },
      twitter: { status: 'running' as const, postCount: 0, insightCount: 0, startedAt: null, completedAt: null, error: null, duration: null },
    },
    totalPosts: 50,
    totalInsights: 50,
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
  };

  beforeEach(async () => {
    investigationRepo = {
      findOrCreateByQuery: jest.fn().mockResolvedValue({ _id: 'inv-456', id: 'inv-456', query: 'test query' }),
      findById: jest.fn().mockResolvedValue({
        _id: 'inv-existing',
        id: 'inv-existing',
        query: 'rexas finance',
        settings: {
          platforms: ['reddit'],
          timeRange: '30d',
          limit: 25,
        },
      }),
      update: jest.fn().mockResolvedValue(undefined),
      setLastScanId: jest.fn().mockResolvedValue(undefined),
    };

    scanQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
      getJobs: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScanController],
      providers: [
        {
          provide: ScanJobRepository,
          useValue: {
            createJob: jest.fn().mockResolvedValue(mockScanJob),
            getJob: jest.fn().mockResolvedValue(mockScanJob),
            getJobPosts: jest.fn().mockResolvedValue([]),
            cancelJob: jest.fn().mockResolvedValue(undefined),
            resetConnector: jest.fn().mockResolvedValue(undefined),
            getActiveJobs: jest.fn().mockResolvedValue([mockScanJob]),
            getRecentJobs: jest.fn().mockResolvedValue([mockScanJob]),
          },
        },
        {
          provide: InvestigationRepository,
          useValue: investigationRepo,
        },
        {
          provide: IngestionService,
          useValue: {
            getAllConnectors: jest.fn().mockReturnValue([
              { platform: 'reddit' },
              { platform: 'twitter' },
            ]),
          },
        },
        {
          provide: getQueueToken('scan'),
          useValue: scanQueue,
        },
      ],
    }).compile();

    controller = module.get<ScanController>(ScanController);
    scanJobRepo = module.get<ScanJobRepository>(ScanJobRepository);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /scan', () => {
    it('should create a scan job and return scanId', async () => {
      const result = await controller.startScan({ query: 'test query' });
      expect(result).toHaveProperty('scanId');
      expect(scanJobRepo.createJob).toHaveBeenCalled();
      expect(investigationRepo.findOrCreateByQuery).toHaveBeenCalledWith('test query', {
        platforms: ['reddit', 'twitter'],
        limit: undefined,
        timeRange: undefined,
      });
      expect(investigationRepo.findById).not.toHaveBeenCalled();
    });

    it('should append a scan to an existing investigation when investigationId is provided', async () => {
      const result = await controller.startScan({
        query: 'rexas finance team',
        investigationId: 'inv-existing',
        platforms: ['twitter'],
        limit: 250,
        timeRange: '90d',
      });

      expect(result).toHaveProperty('scanId');
      expect(investigationRepo.findById).toHaveBeenCalledWith('inv-existing');
      expect(investigationRepo.update).toHaveBeenCalledWith('inv-existing', {
        settings: {
          platforms: ['twitter'],
          timeRange: '90d',
          limit: 250,
        },
      });
      expect(investigationRepo.findOrCreateByQuery).not.toHaveBeenCalled();
      expect(scanJobRepo.createJob).toHaveBeenCalledWith(
        'rexas finance team',
        'inv-existing',
        ['twitter'],
        { timeRange: '90d', limit: 250 },
      );
      expect(investigationRepo.setLastScanId).toHaveBeenCalledWith('inv-existing', 'scan-123');
    });
  });

  describe('GET /scan/:id', () => {
    it('should return scan status', async () => {
      const result = await controller.getScanStatus('scan-123');
      expect(result).toEqual(mockScanJob);
      expect(scanJobRepo.getJob).toHaveBeenCalledWith('scan-123');
    });

    it('should throw 404 for unknown scan', async () => {
      (scanJobRepo.getJob as jest.Mock).mockResolvedValue(null);
      await expect(controller.getScanStatus('unknown')).rejects.toThrow();
    });
  });

  describe('GET /scan/:id/posts', () => {
    it('should return posts', async () => {
      const jobWithPosts = { ...mockScanJob, posts: [{ id: '1', text: 'test', platform: 'reddit' }] };
      (scanJobRepo.getJob as jest.Mock).mockResolvedValue(jobWithPosts);
      const result = await controller.getScanPosts('scan-123');
      expect(result.posts).toHaveLength(1);
      expect(result.totalPosts).toBe(1);
    });
  });

  describe('POST /scan/:id/cancel', () => {
    it('should cancel a scan', async () => {
      const result = await controller.cancelScan('scan-123');
      expect(result).toEqual({ success: true });
      expect(scanJobRepo.cancelJob).toHaveBeenCalledWith('scan-123');
    });
  });

  describe('POST /scan/:id/retry/:connector', () => {
    it('should retry a failed connector', async () => {
      const result = await controller.retryConnector('scan-123', 'reddit');
      expect(result).toEqual({ success: true });
      expect(scanJobRepo.resetConnector).toHaveBeenCalledWith('scan-123', 'reddit');
    });
  });

  describe('GET /scan/active', () => {
    it('should return active scans', async () => {
      const result = await controller.getActiveScans();
      expect(result).toHaveLength(1);
    });
  });

  describe('GET /scan/recent', () => {
    it('should return recent scans', async () => {
      const result = await controller.getRecentScans();
      expect(result).toHaveLength(1);
    });
  });
});
