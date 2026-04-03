import { Test, TestingModule } from '@nestjs/testing';
import { SchedulerService } from '../../src/app/services/scheduler.service';
import { RefreshService } from '../../src/app/services/refresh.service';
import { AlertRepository } from '@veritas/ingestion';
import { MonitorService } from '@veritas/analysis';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function makeConfig(overrides: {
  investigationId?: string;
  enabled?: boolean;
  intervalMinutes?: number;
  nextRunAt?: Date | null;
  lastRunAt?: Date | null;
} = {}) {
  return {
    _id: `config-${overrides.investigationId ?? 'inv-1'}`,
    investigationId: overrides.investigationId ?? 'inv-1',
    enabled: overrides.enabled ?? true,
    intervalMinutes: overrides.intervalMinutes ?? 60,
    nextRunAt: overrides.nextRunAt ?? new Date(Date.now() - 60_000), // 1 min ago = due
    lastRunAt: overrides.lastRunAt ?? null,
    alertThresholds: {
      velocityMultiplier: 2.0,
      sentimentShift: 0.3,
      minNewNarrativePosts: 3,
    },
  };
}

describe('SchedulerService', () => {
  let service: SchedulerService;
  let alertRepository: {
    getAllEnabledConfigs: jest.Mock;
    upsertConfig: jest.Mock;
  };
  let monitorService: { getDueConfigs: jest.Mock };
  let refreshService: { refresh: jest.Mock };

  beforeEach(async () => {
    alertRepository = {
      getAllEnabledConfigs: jest.fn().mockResolvedValue([]),
      upsertConfig: jest.fn().mockResolvedValue({}),
    };

    monitorService = {
      getDueConfigs: jest.fn().mockReturnValue([]),
    };

    refreshService = {
      refresh: jest.fn().mockResolvedValue({ alerts: [], snapshotId: 'snap-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulerService,
        { provide: AlertRepository, useValue: alertRepository },
        { provide: MonitorService, useValue: monitorService },
        { provide: RefreshService, useValue: refreshService },
      ],
    }).compile();

    service = module.get<SchedulerService>(SchedulerService);
  });

  // -------------------------------------------------------------------------
  // Concurrency guard
  // -------------------------------------------------------------------------

  it('should not run tick when already running (concurrency guard)', async () => {
    // Set up a config that is due so tick does real work
    const config = makeConfig({ investigationId: 'inv-1' });
    alertRepository.getAllEnabledConfigs.mockResolvedValue([config]);
    monitorService.getDueConfigs.mockReturnValue([config]);

    // Make refresh take a while by using a deferred promise
    let resolveRefresh!: () => void;
    refreshService.refresh.mockReturnValue(
      new Promise<{ alerts: never[]; snapshotId: string }>((resolve) => {
        resolveRefresh = () => resolve({ alerts: [], snapshotId: 'snap-1' });
      }),
    );

    // Start first tick (it will be "running" until resolveRefresh is called)
    const tick1 = service.tick();

    // Start second tick — should bail out immediately
    const tick2 = service.tick();
    await tick2;

    // The second tick should not have triggered any additional calls
    // (getAllEnabledConfigs is called once from tick1 only)
    expect(alertRepository.getAllEnabledConfigs).toHaveBeenCalledTimes(1);

    // Clean up: resolve the first tick
    resolveRefresh();
    await tick1;
  });

  // -------------------------------------------------------------------------
  // Due configs
  // -------------------------------------------------------------------------

  it('should call refreshService.refresh for each due config', async () => {
    const config1 = makeConfig({ investigationId: 'inv-1' });
    const config2 = makeConfig({ investigationId: 'inv-2' });
    alertRepository.getAllEnabledConfigs.mockResolvedValue([config1, config2]);
    monitorService.getDueConfigs.mockReturnValue([config1, config2]);

    await service.tick();

    expect(refreshService.refresh).toHaveBeenCalledTimes(2);
    expect(refreshService.refresh).toHaveBeenCalledWith('inv-1');
    expect(refreshService.refresh).toHaveBeenCalledWith('inv-2');
  });

  it('should skip when no configs are due', async () => {
    alertRepository.getAllEnabledConfigs.mockResolvedValue([
      makeConfig({ investigationId: 'inv-1' }),
    ]);
    monitorService.getDueConfigs.mockReturnValue([]); // none due

    await service.tick();

    expect(refreshService.refresh).not.toHaveBeenCalled();
    expect(alertRepository.upsertConfig).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Post-refresh updates
  // -------------------------------------------------------------------------

  it('should update nextRunAt after successful refresh', async () => {
    const config = makeConfig({
      investigationId: 'inv-1',
      intervalMinutes: 30,
    });
    alertRepository.getAllEnabledConfigs.mockResolvedValue([config]);
    monitorService.getDueConfigs.mockReturnValue([config]);

    const before = Date.now();
    await service.tick();
    const after = Date.now();

    expect(alertRepository.upsertConfig).toHaveBeenCalledTimes(1);
    const call = alertRepository.upsertConfig.mock.calls[0];
    expect(call[0]).toBe('inv-1');

    const updatedConfig = call[1] as { lastRunAt: Date; nextRunAt: Date };
    expect(updatedConfig.lastRunAt).toBeInstanceOf(Date);
    expect(updatedConfig.nextRunAt).toBeInstanceOf(Date);

    // nextRunAt should be roughly now + 30 minutes
    const expectedMin = before + 30 * 60_000;
    const expectedMax = after + 30 * 60_000;
    const nextRunMs = updatedConfig.nextRunAt.getTime();
    expect(nextRunMs).toBeGreaterThanOrEqual(expectedMin);
    expect(nextRunMs).toBeLessThanOrEqual(expectedMax);
  });

  // -------------------------------------------------------------------------
  // Error resilience
  // -------------------------------------------------------------------------

  it('should continue processing other investigations when one fails', async () => {
    const config1 = makeConfig({ investigationId: 'inv-fail' });
    const config2 = makeConfig({ investigationId: 'inv-ok' });
    alertRepository.getAllEnabledConfigs.mockResolvedValue([config1, config2]);
    monitorService.getDueConfigs.mockReturnValue([config1, config2]);

    refreshService.refresh
      .mockRejectedValueOnce(new Error('Search API down'))
      .mockResolvedValueOnce({ alerts: [], snapshotId: 'snap-2' });

    await service.tick();

    // Both should have been attempted
    expect(refreshService.refresh).toHaveBeenCalledTimes(2);
    expect(refreshService.refresh).toHaveBeenCalledWith('inv-fail');
    expect(refreshService.refresh).toHaveBeenCalledWith('inv-ok');

    // upsertConfig should only have been called for the successful one
    expect(alertRepository.upsertConfig).toHaveBeenCalledTimes(1);
    expect(alertRepository.upsertConfig).toHaveBeenCalledWith(
      'inv-ok',
      expect.objectContaining({
        lastRunAt: expect.any(Date),
        nextRunAt: expect.any(Date),
      }),
    );
  });

  it('should handle getAllEnabledConfigs failure gracefully', async () => {
    alertRepository.getAllEnabledConfigs.mockRejectedValue(
      new Error('DB connection lost'),
    );

    // Should not throw
    await expect(service.tick()).resolves.toBeUndefined();
    expect(refreshService.refresh).not.toHaveBeenCalled();
  });

  it('should reset running flag even after top-level error', async () => {
    alertRepository.getAllEnabledConfigs.mockRejectedValue(
      new Error('DB connection lost'),
    );

    await service.tick();

    // Running flag should be reset — a subsequent tick should proceed
    const config = makeConfig({ investigationId: 'inv-1' });
    alertRepository.getAllEnabledConfigs.mockResolvedValue([config]);
    monitorService.getDueConfigs.mockReturnValue([config]);

    await service.tick();

    expect(refreshService.refresh).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  it('should clear interval on destroy', () => {
    // Manually call onModuleInit so the interval exists
    service.onModuleInit();
    expect(service['intervalHandle']).not.toBeNull();

    service.onModuleDestroy();
    expect(service['intervalHandle']).toBeNull();
  });
});
