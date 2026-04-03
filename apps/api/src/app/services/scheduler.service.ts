import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { AlertRepository } from '@veritas/ingestion';
import { MonitorService } from '@veritas/analysis';
import { RefreshService } from './refresh.service';

/**
 * Scheduler that automatically re-runs investigations on their configured intervals.
 *
 * Runs a simple setInterval loop that:
 *   1. Fetches all enabled monitor configs
 *   2. Filters to those whose nextRunAt has passed
 *   3. Sequentially refreshes each due investigation
 *   4. Updates nextRunAt after each successful refresh
 *
 * Resilience:
 *   - A concurrency guard prevents overlapping ticks
 *   - Each investigation is wrapped in its own try/catch so one failure
 *     does not block the others
 *   - All errors are logged but never propagated to crash the app
 */
@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private running = false;

  /** How often (ms) we check for due investigations. */
  static readonly CHECK_INTERVAL_MS = 60_000;

  constructor(
    private readonly alertRepository: AlertRepository,
    private readonly monitorService: MonitorService,
    private readonly refreshService: RefreshService,
  ) {}

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  onModuleInit(): void {
    this.logger.log(
      `Scheduler started — checking for due investigations every ${SchedulerService.CHECK_INTERVAL_MS / 1000}s`,
    );
    this.intervalHandle = setInterval(
      () => void this.tick(),
      SchedulerService.CHECK_INTERVAL_MS,
    );
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.logger.log('Scheduler stopped');
  }

  // ---------------------------------------------------------------------------
  // Core loop
  // ---------------------------------------------------------------------------

  /**
   * Single tick of the scheduler loop.
   * Exposed as a method (rather than inline) so tests can invoke it directly.
   */
  async tick(): Promise<void> {
    if (this.running) {
      this.logger.debug('Tick skipped — previous tick still running');
      return;
    }

    this.running = true;

    try {
      // 1. Get all enabled monitor configs
      const configs = await this.alertRepository.getAllEnabledConfigs();

      // 2. Filter to those that are due
      const dueConfigs = this.monitorService.getDueConfigs(configs);

      if (dueConfigs.length === 0) {
        return;
      }

      this.logger.log(
        `${dueConfigs.length} investigation(s) due for refresh`,
      );

      // 3. Process each due investigation sequentially to avoid overload
      for (const config of dueConfigs) {
        try {
          await this.refreshService.refresh(config.investigationId);

          // Update nextRunAt (RefreshService already updates lastRunAt,
          // but we recalculate nextRunAt based on the config interval
          // to ensure accuracy)
          const nextRun = new Date(
            Date.now() + config.intervalMinutes * 60_000,
          );
          await this.alertRepository.upsertConfig(config.investigationId, {
            lastRunAt: new Date(),
            nextRunAt: nextRun,
          });

          this.logger.log(
            `Refreshed investigation ${config.investigationId}, next run at ${nextRun.toISOString()}`,
          );
        } catch (err) {
          this.logger.error(
            `Failed to refresh investigation ${config.investigationId}: ${err}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(`Scheduler tick error: ${err}`);
    } finally {
      this.running = false;
    }
  }
}
