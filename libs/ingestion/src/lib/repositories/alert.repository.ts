import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService, Repository } from '@veritas/database';
import { Alert, AlertModel, MonitorConfig, MonitorConfigModel } from '../schemas/alert.schema';

/**
 * Repository for managing alerts and monitor configs.
 * Uses MongoDB via DatabaseService. Defers initialization to onModuleInit
 * to ensure DatabaseService has connected first.
 */
@Injectable()
export class AlertRepository implements OnModuleInit {
  private readonly logger = new Logger(AlertRepository.name);
  private alertRepo!: Repository<Alert>;
  private configRepo!: Repository<MonitorConfig>;
  private initialized = false;

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit() {
    this.initializeRepositories();
  }

  private initializeRepositories() {
    try {
      try {
        this.databaseService.registerModel('Alert', AlertModel);
        this.databaseService.registerModel('MonitorConfig', MonitorConfigModel);
      } catch (error) {
        this.logger.warn('Models already registered or error registering models', error);
      }

      this.alertRepo = this.databaseService.getRepository<Alert>('Alert');
      this.configRepo = this.databaseService.getRepository<MonitorConfig>('MonitorConfig');

      this.initialized = true;
      this.logger.log('Alert repository initialized');
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Failed to initialize repositories: ${err.message}`, err.stack);
    }
  }

  private ensureInitialized() {
    if (!this.initialized) {
      this.initializeRepositories();
    }
  }

  // ---------------------------------------------------------------------------
  // Alerts
  // ---------------------------------------------------------------------------

  async saveAlert(alert: Partial<Alert>): Promise<Alert> {
    this.ensureInitialized();
    try {
      return await this.alertRepo.create(alert);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in saveAlert: ${err.message}`, err.stack);
      throw error;
    }
  }

  async saveAlerts(alerts: Partial<Alert>[]): Promise<Alert[]> {
    this.ensureInitialized();
    try {
      const saved: Alert[] = [];
      for (const alert of alerts) {
        saved.push(await this.alertRepo.create(alert));
      }
      return saved;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in saveAlerts: ${err.message}`, err.stack);
      throw error;
    }
  }

  async getAlerts(
    investigationId?: string,
    options?: { unreadOnly?: boolean; limit?: number; skip?: number },
  ): Promise<Alert[]> {
    this.ensureInitialized();
    try {
      const filter: Record<string, unknown> = {};
      if (investigationId) {
        filter['investigationId'] = investigationId;
      }
      if (options?.unreadOnly) {
        filter['read'] = false;
      }

      return await this.alertRepo.find(filter, {
        limit: options?.limit,
        skip: options?.skip,
        sort: { createdAt: -1 },
      });
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in getAlerts: ${err.message}`, err.stack);
      throw error;
    }
  }

  async markAsRead(alertId: string): Promise<Alert | null> {
    this.ensureInitialized();
    try {
      return await this.alertRepo.updateById(alertId, {
        read: true,
      } as Partial<Alert>);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in markAsRead: ${err.message}`, err.stack);
      throw error;
    }
  }

  async markAllRead(investigationId?: string): Promise<number> {
    this.ensureInitialized();
    try {
      const filter: Record<string, unknown> = { read: false };
      if (investigationId) {
        filter['investigationId'] = investigationId;
      }

      // Get unread alerts and update each one
      const unreadAlerts = await this.alertRepo.find(filter);
      let count = 0;
      for (const alert of unreadAlerts) {
        const id =
          alert._id?.toString() ?? ((alert as unknown as Record<string, unknown>)['id'] as string);
        await this.alertRepo.updateById(id, { read: true } as Partial<Alert>);
        count++;
      }
      return count;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in markAllRead: ${err.message}`, err.stack);
      throw error;
    }
  }

  async getUnreadCount(investigationId?: string): Promise<number> {
    this.ensureInitialized();
    try {
      const filter: Record<string, unknown> = { read: false };
      if (investigationId) {
        filter['investigationId'] = investigationId;
      }
      const alerts = await this.alertRepo.find(filter);
      return alerts.length;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in getUnreadCount: ${err.message}`, err.stack);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Monitor configs
  // ---------------------------------------------------------------------------

  async getConfig(investigationId: string): Promise<MonitorConfig | null> {
    this.ensureInitialized();
    try {
      return await this.configRepo.findOne({
        investigationId,
      });
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in getConfig: ${err.message}`, err.stack);
      throw error;
    }
  }

  async upsertConfig(
    investigationId: string,
    data: Partial<MonitorConfig>,
  ): Promise<MonitorConfig> {
    this.ensureInitialized();
    try {
      const existing = await this.configRepo.findOne({ investigationId });

      if (existing) {
        const id =
          existing._id?.toString() ??
          ((existing as unknown as Record<string, unknown>)['id'] as string);
        const updated = await this.configRepo.updateById(id, data);
        if (!updated) {
          throw new Error(`MonitorConfig not found after update: ${id}`);
        }
        return updated;
      }

      return await this.configRepo.create({
        investigationId,
        enabled: false,
        intervalMinutes: 60,
        alertThresholds: {
          velocityMultiplier: 2.0,
          sentimentShift: 0.3,
          minNewNarrativePosts: 3,
        },
        lastRunAt: null,
        nextRunAt: null,
        ...data,
      } as Partial<MonitorConfig>);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in upsertConfig: ${err.message}`, err.stack);
      throw error;
    }
  }

  async getAllEnabledConfigs(): Promise<MonitorConfig[]> {
    this.ensureInitialized();
    try {
      return await this.configRepo.find({ enabled: true });
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in getAllEnabledConfigs: ${err.message}`, err.stack);
      throw error;
    }
  }

  async deleteByInvestigationId(investigationId: string): Promise<void> {
    this.ensureInitialized();
    try {
      await this.alertRepo.deleteMany({ investigationId } as Record<string, unknown>);
      await this.configRepo.deleteMany({ investigationId } as Record<string, unknown>);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in deleteByInvestigationId: ${err.message}`, err.stack);
      throw error;
    }
  }
}
