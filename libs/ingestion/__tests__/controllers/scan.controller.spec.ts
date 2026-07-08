import { getQueueToken } from '@nestjs/bullmq';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { firstValueFrom } from 'rxjs';
import { ScanController } from '../../src/lib/controllers/scan.controller';
import { InvestigationRepository } from '../../src/lib/repositories/investigation.repository';
import { ScanJobRepository } from '../../src/lib/repositories/scan-job.repository';
import { IngestionService } from '../../src/lib/services/ingestion.service';
import { ScanEventsService } from '../../src/lib/services/scan-events.service';

describe('ScanController', () => {
  let controller: ScanController;
  let scanJobRepo: ScanJobRepository;
  let scanEvents: ScanEventsService;
  let investigationRepo: {
    findOrCreateByQuery: jest.Mock;
    findById: jest.Mock;
    update: jest.Mock;
    setLastScanId: jest.Mock;
    upsertSnapshotForScan: jest.Mock;
  };
  let scanJobRepositoryMock: {
    createJob: jest.Mock;
    getJob: jest.Mock;
    getJobPosts: jest.Mock;
    updateAnalysisCache: jest.Mock;
    cancelJob: jest.Mock;
    resetConnector: jest.Mock;
    getActiveJobs: jest.Mock;
    getRecentJobs: jest.Mock;
    getJobsByInvestigation: jest.Mock;
  };
  let scanQueue: { add: jest.Mock; getJobs: jest.Mock };

  const mockScanJob = {
    _id: 'scan-123',
    id: 'scan-123',
    query: 'test query',
    investigationId: 'inv-456',
    status: 'running' as const,
    settings: {
      platforms: ['reddit', 'twitter'],
      timeRange: '7d',
      limit: 100,
      searchMode: 'topic' as const,
    },
    connectors: {
      reddit: {
        status: 'done' as const,
        postCount: 50,
        insightCount: 50,
        startedAt: null,
        completedAt: null,
        error: null,
        duration: null,
      },
      twitter: {
        status: 'running' as const,
        postCount: 0,
        insightCount: 0,
        startedAt: null,
        completedAt: null,
        error: null,
        duration: null,
      },
    },
    totalPosts: 50,
    totalInsights: 50,
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
  };

  beforeEach(async () => {
    investigationRepo = {
      findOrCreateByQuery: jest
        .fn()
        .mockResolvedValue({ _id: 'inv-456', id: 'inv-456', query: 'test query' }),
      findById: jest.fn().mockResolvedValue({
        _id: 'inv-existing',
        id: 'inv-existing',
        query: 'rexas finance',
        settings: {
          platforms: ['reddit'],
          timeRange: '30d',
          limit: 25,
          searchMode: 'topic',
        },
      }),
      update: jest.fn().mockResolvedValue(undefined),
      setLastScanId: jest.fn().mockResolvedValue(undefined),
      upsertSnapshotForScan: jest.fn().mockResolvedValue({ id: 'snap-1' }),
    };

    scanQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
      getJobs: jest.fn().mockResolvedValue([]),
    };

    scanJobRepositoryMock = {
      createJob: jest.fn().mockResolvedValue(mockScanJob),
      getJob: jest.fn().mockResolvedValue(mockScanJob),
      getJobPosts: jest.fn().mockResolvedValue([]),
      updateAnalysisCache: jest.fn().mockResolvedValue(undefined),
      cancelJob: jest.fn().mockResolvedValue(undefined),
      resetConnector: jest.fn().mockResolvedValue(undefined),
      getActiveJobs: jest.fn().mockResolvedValue([mockScanJob]),
      getRecentJobs: jest.fn().mockResolvedValue([mockScanJob]),
      getJobsByInvestigation: jest.fn().mockResolvedValue([mockScanJob]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScanController],
      providers: [
        {
          provide: ScanJobRepository,
          useValue: scanJobRepositoryMock,
        },
        {
          provide: InvestigationRepository,
          useValue: investigationRepo,
        },
        {
          provide: IngestionService,
          useValue: {
            getAllConnectors: jest
              .fn()
              .mockReturnValue([{ platform: 'reddit' }, { platform: 'twitter' }]),
          },
        },
        {
          provide: getQueueToken('scan'),
          useValue: scanQueue,
        },
        ScanEventsService,
      ],
    }).compile();

    controller = module.get<ScanController>(ScanController);
    scanJobRepo = module.get<ScanJobRepository>(ScanJobRepository);
    scanEvents = module.get<ScanEventsService>(ScanEventsService);
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
        searchMode: 'claim',
      });

      expect(result).toHaveProperty('scanId');
      expect(investigationRepo.findById).toHaveBeenCalledWith('inv-existing');
      expect(investigationRepo.update).toHaveBeenCalledWith('inv-existing', {
        settings: {
          platforms: ['twitter'],
          timeRange: '90d',
          limit: 250,
          searchMode: 'claim',
        },
      });
      expect(investigationRepo.findOrCreateByQuery).not.toHaveBeenCalled();
      expect(scanJobRepo.createJob).toHaveBeenCalledWith(
        'rexas finance team',
        'inv-existing',
        ['twitter'],
        { timeRange: '90d', limit: 250, searchMode: 'claim' },
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

  describe('GET /scan/:id/stream (SSE)', () => {
    it('should throw 404 for an unknown scan', async () => {
      (scanJobRepo.getJob as jest.Mock).mockResolvedValue(null);
      await expect(controller.streamScanProgress('unknown')).rejects.toThrow(NotFoundException);
    });

    it('should stream progress events for the scan as MessageEvents', async () => {
      const stream$ = await controller.streamScanProgress('scan-123');

      const firstMessage = firstValueFrom(stream$);
      scanEvents.emit({
        kind: 'scan-status',
        scanId: 'scan-123',
        connector: 'reddit',
        status: 'done',
        postCount: 50,
        timestamp: new Date().toISOString(),
      });

      const message = await firstMessage;
      expect(message.type).toBe('scan-status');
      expect(message.data).toMatchObject({
        kind: 'scan-status',
        scanId: 'scan-123',
        connector: 'reddit',
        status: 'done',
        postCount: 50,
      });
    });

    it('should not deliver events from other scans', async () => {
      const stream$ = await controller.streamScanProgress('scan-123');

      const received: unknown[] = [];
      const subscription = stream$.subscribe((message) => received.push(message));
      scanEvents.emit({
        kind: 'scan-status',
        scanId: 'other-scan',
        connector: 'reddit',
        status: 'done',
        timestamp: new Date().toISOString(),
      });
      subscription.unsubscribe();

      expect(received).toHaveLength(0);
    });
  });

  describe('GET /scan/:id/posts', () => {
    it('should return posts', async () => {
      (scanJobRepo.getJobPosts as jest.Mock).mockResolvedValue([
        { id: '1', text: 'test', platform: 'reddit' },
      ]);
      const result = await controller.getScanPosts('scan-123');
      expect(result.posts).toHaveLength(1);
      expect(result.totalPosts).toBe(1);
      expect(scanJobRepo.getJobPosts).toHaveBeenCalledWith('scan-123');
    });
  });

  describe('POST /scan/:id/cancel', () => {
    it('should cancel a scan', async () => {
      const result = await controller.cancelScan('scan-123');
      expect(result).toEqual({ success: true });
      expect(scanJobRepo.cancelJob).toHaveBeenCalledWith('scan-123');
    });

    it('should treat cancel for a deleted scan as a no-op success', async () => {
      (scanJobRepo.getJob as jest.Mock).mockResolvedValueOnce(null);

      const result = await controller.cancelScan('scan-missing');

      expect(result).toEqual({ success: true });
      expect(scanJobRepo.cancelJob).not.toHaveBeenCalled();
    });
  });

  describe('analysis cache endpoints', () => {
    it('should ignore analysis-cache writes for deleted scans', async () => {
      (scanJobRepo.getJob as jest.Mock).mockResolvedValueOnce(null);

      const result = await controller.saveAnalysisCache('scan-missing', { narratives: [] });

      expect(result).toEqual({ success: true });
    });

    it('should return null analysis cache for deleted scans', async () => {
      (scanJobRepo.getJob as jest.Mock).mockResolvedValueOnce(null);

      const result = await controller.getAnalysisCache('scan-missing');

      expect(result).toBeNull();
    });

    it('persists a snapshot when narratives are saved to the analysis cache', async () => {
      const scanPosts = [
        {
          id: 'post-1',
          platform: 'reddit',
          sentiment: { label: 'negative' },
        },
      ];
      const jobWithPosts = {
        ...mockScanJob,
        status: 'completed' as const,
        posts: scanPosts,
      };
      (scanJobRepo.getJob as jest.Mock).mockResolvedValueOnce(jobWithPosts);
      (scanJobRepo.getJobPosts as jest.Mock).mockResolvedValueOnce(scanPosts);

      const result = await controller.saveAnalysisCache('scan-123', {
        narratives: [{ id: 'n-1', summary: 'claim' }],
      });

      expect(result).toEqual({ success: true });
      expect(investigationRepo.upsertSnapshotForScan).toHaveBeenCalledWith(
        'inv-456',
        'scan-123',
        expect.objectContaining({
          posts: jobWithPosts.posts,
          narratives: [{ id: 'n-1', summary: 'claim' }],
          summary: expect.objectContaining({
            total: 1,
            negative: 1,
            byPlatform: { reddit: 1 },
          }),
        }),
      );
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

  describe('GET /scan/investigation/:id', () => {
    it('should return scans for a specific investigation', async () => {
      const result = await controller.getInvestigationScans('inv-existing', '25');
      expect(result).toHaveLength(1);
      expect(scanJobRepositoryMock.getJobsByInvestigation).toHaveBeenCalledWith('inv-existing', 25);
    });
  });
});
