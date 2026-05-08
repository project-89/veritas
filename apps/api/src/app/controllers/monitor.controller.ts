import {
  Body,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Alert, AlertRepository, InvestigationRepository, MonitorConfig } from '@veritas/ingestion';
import { RefreshService } from '../services/refresh.service';

/**
 * REST controller for the alerting and monitoring system.
 *
 * Lives in the API app (not in a library) because it wires together
 * services from two separate NestJS modules:
 *   - AlertRepository, InvestigationRepository (from @veritas/ingestion)
 *   - RefreshService (local — encapsulates the full refresh pipeline)
 */
@Controller('monitor')
export class MonitorController {
  private readonly logger = new Logger(MonitorController.name);

  constructor(
    private readonly alertRepository: AlertRepository,
    private readonly investigationRepository: InvestigationRepository,
    private readonly refreshService: RefreshService,
  ) {}

  // ---------------------------------------------------------------------------
  // Alerts
  // ---------------------------------------------------------------------------

  /**
   * GET /monitor/alerts — list alerts with optional filters.
   */
  @Get('alerts')
  async listAlerts(
    @Query('investigationId') investigationId?: string,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ): Promise<Alert[]> {
    this.logger.log('Listing alerts');
    return this.alertRepository.getAlerts(investigationId, {
      unreadOnly: unreadOnly === 'true',
      limit: limit ? Number(limit) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }

  /**
   * GET /monitor/alerts/count — unread alert count.
   */
  @Get('alerts/count')
  async unreadCount(
    @Query('investigationId') investigationId?: string,
  ): Promise<{ count: number }> {
    const count = await this.alertRepository.getUnreadCount(investigationId);
    return { count };
  }

  /**
   * PUT /monitor/alerts/:id/read — mark a single alert as read.
   */
  @Put('alerts/:id/read')
  async markRead(@Param('id') id: string): Promise<{ success: boolean }> {
    this.logger.log(`Marking alert as read: ${id}`);
    const alert = await this.alertRepository.markAsRead(id);
    if (!alert) {
      throw new NotFoundException(`Alert not found: ${id}`);
    }
    return { success: true };
  }

  /**
   * PUT /monitor/alerts/read-all — mark all alerts as read.
   */
  @Put('alerts/read-all')
  async markAllRead(
    @Query('investigationId') investigationId?: string,
  ): Promise<{ count: number }> {
    this.logger.log('Marking all alerts as read');
    const count = await this.alertRepository.markAllRead(investigationId);
    return { count };
  }

  // ---------------------------------------------------------------------------
  // Monitor config
  // ---------------------------------------------------------------------------

  /**
   * GET /monitor/config/:investigationId — get monitor config.
   */
  @Get('config/:investigationId')
  async getConfig(@Param('investigationId') investigationId: string): Promise<MonitorConfig> {
    this.logger.log(`Getting monitor config for: ${investigationId}`);

    const investigation = await this.investigationRepository.findById(investigationId);
    if (!investigation) {
      throw new NotFoundException(`Investigation not found: ${investigationId}`);
    }

    const config = await this.alertRepository.getConfig(investigationId);
    if (config) return config;

    // Create default config
    return this.alertRepository.upsertConfig(investigationId, {});
  }

  /**
   * PUT /monitor/config/:investigationId — update monitor config.
   */
  @Put('config/:investigationId')
  async updateConfig(
    @Param('investigationId') investigationId: string,
    @Body()
    body: Partial<Pick<MonitorConfig, 'enabled' | 'intervalMinutes' | 'alertThresholds'>>,
  ): Promise<MonitorConfig> {
    this.logger.log(`Updating monitor config for: ${investigationId}`);

    const investigation = await this.investigationRepository.findById(investigationId);
    if (!investigation) {
      throw new NotFoundException(`Investigation not found: ${investigationId}`);
    }

    // If enabling monitoring, set the next run time
    const update: Partial<MonitorConfig> = { ...body };
    if (body.enabled && body.intervalMinutes) {
      update.nextRunAt = new Date(Date.now() + body.intervalMinutes * 60 * 1000);
    }

    return this.alertRepository.upsertConfig(investigationId, update);
  }

  // ---------------------------------------------------------------------------
  // Manual refresh
  // ---------------------------------------------------------------------------

  /**
   * POST /monitor/refresh/:investigationId — manually re-scan an investigation.
   * Delegates to RefreshService for the full pipeline.
   */
  @Post('refresh/:investigationId')
  async refresh(
    @Param('investigationId') investigationId: string,
  ): Promise<{ alerts: Alert[]; snapshotId: string }> {
    this.logger.log(`Manual refresh for investigation: ${investigationId}`);

    try {
      return await this.refreshService.refresh(investigationId);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Investigation not found')) {
        throw new NotFoundException(err.message);
      }
      throw err;
    }
  }
}
