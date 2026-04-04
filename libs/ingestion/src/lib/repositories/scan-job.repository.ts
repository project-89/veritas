import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService, Repository } from '@veritas/database';
import {
  ScanJobModel,
  ScanJob,
  ConnectorStatus,
} from '../schemas/scan-job.schema';

/**
 * Repository for managing scan jobs.
 * Uses MongoDB via DatabaseService following the same pattern as InvestigationRepository.
 */
@Injectable()
export class ScanJobRepository implements OnModuleInit {
  private readonly logger = new Logger(ScanJobRepository.name);
  private scanJobRepo!: Repository<ScanJob>;
  private initialized = false;

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit() {
    this.initializeRepositories();
  }

  private initializeRepositories() {
    try {
      try {
        this.databaseService.registerModel('ScanJob', ScanJobModel);
        this.logger.debug('Successfully registered ScanJob model with database service');
      } catch (error) {
        this.logger.warn('ScanJob model already registered or error registering', error);
      }

      this.scanJobRepo = this.databaseService.getRepository<ScanJob>('ScanJob');
      this.initialized = true;
      this.logger.log('ScanJob repository initialized');
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Failed to initialize ScanJob repository: ${err.message}`,
        err.stack,
      );
    }
  }

  private ensureInitialized() {
    if (!this.initialized) {
      try {
        this.initializeRepositories();
      } catch (err) {
        this.logger.warn(`Failed to initialize: ${err}`);
      }
    }
    if (!this.initialized) {
      throw new Error('ScanJobRepository not initialized — is MongoDB connected?');
    }
  }

  /**
   * Create a new scan job.
   */
  async createJob(
    query: string,
    investigationId: string,
    platforms: string[],
    settings: { timeRange?: string; limit?: number },
  ): Promise<ScanJob> {
    this.ensureInitialized();

    const connectors: Record<string, ConnectorStatus> = {};
    for (const platform of platforms) {
      connectors[platform] = {
        status: 'queued',
        postCount: 0,
        insightCount: 0,
        startedAt: null,
        completedAt: null,
        error: null,
        duration: null,
      };
    }

    const job = await this.scanJobRepo.create({
      query,
      investigationId,
      status: 'pending',
      settings: {
        platforms,
        timeRange: settings.timeRange ?? '7d',
        limit: settings.limit ?? 50,
      },
      connectors,
      totalPosts: 0,
      totalInsights: 0,
      posts: [],
      completedAt: null,
    } as Partial<ScanJob>);

    this.logger.log(`Created scan job ${job._id} for query "${query}" with connectors: ${platforms.join(', ')}`);
    return job;
  }

  /**
   * Get a scan job by ID.
   */
  async getJob(scanId: string): Promise<ScanJob | null> {
    this.ensureInitialized();
    try {
      return await this.scanJobRepo.findById(scanId);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in getJob: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Update a connector's status within a scan job.
   */
  async updateConnectorStatus(
    scanId: string,
    connector: string,
    update: Partial<ConnectorStatus>,
  ): Promise<void> {
    this.ensureInitialized();
    try {
      const job = await this.scanJobRepo.findById(scanId);
      if (!job) {
        throw new Error(`Scan job not found: ${scanId}`);
      }

      // Merge the update into the existing connector status
      const existing = job.connectors[connector] ?? {
        status: 'queued',
        postCount: 0,
        insightCount: 0,
        startedAt: null,
        completedAt: null,
        error: null,
        duration: null,
      };

      const updatedConnectors = {
        ...job.connectors,
        [connector]: { ...existing, ...update },
      };

      // Determine overall job status from connector statuses
      const connectorValues = Object.values(updatedConnectors) as ConnectorStatus[];
      const statuses = connectorValues.map((c) => c.status);
      let jobStatus = job.status;

      if (statuses.some((s) => s === 'running')) {
        jobStatus = 'running';
      }

      const allDone = statuses.every((s) => s === 'done' || s === 'failed' || s === 'cancelled');
      if (allDone && statuses.length > 0) {
        const anyDone = statuses.some((s) => s === 'done');
        jobStatus = anyDone ? 'completed' : 'failed';
      }

      // Calculate totals
      const totalPosts = connectorValues.reduce((sum, c) => sum + c.postCount, 0);
      const totalInsights = connectorValues.reduce((sum, c) => sum + c.insightCount, 0);

      await this.scanJobRepo.updateById(scanId, {
        connectors: updatedConnectors,
        status: jobStatus,
        totalPosts,
        totalInsights,
        ...(allDone ? { completedAt: new Date() } : {}),
      } as Partial<ScanJob>);

      this.logger.debug(
        `Updated connector ${connector} status to ${update.status ?? 'unchanged'} for scan ${scanId} (job: ${jobStatus})`,
      );
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in updateConnectorStatus: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Add posts from a connector to the scan job.
   */
  async addConnectorResults(
    scanId: string,
    _connector: string,
    posts: unknown[],
    _insights: unknown[],
  ): Promise<void> {
    this.ensureInitialized();
    try {
      const job = await this.scanJobRepo.findById(scanId);
      if (!job) {
        throw new Error(`Scan job not found: ${scanId}`);
      }

      const existingPosts = Array.isArray(job.posts) ? job.posts : [];
      const allPosts = [...existingPosts, ...posts];

      await this.scanJobRepo.updateById(scanId, {
        posts: allPosts,
        totalPosts: allPosts.length,
      } as Partial<ScanJob>);

      this.logger.debug(`Added ${posts.length} posts to scan ${scanId} (total: ${allPosts.length})`);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in addConnectorResults: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Get all posts from a scan job.
   */
  async getJobPosts(scanId: string): Promise<unknown[]> {
    this.ensureInitialized();
    try {
      const job = await this.scanJobRepo.findById(scanId);
      if (!job) {
        throw new Error(`Scan job not found: ${scanId}`);
      }
      return Array.isArray(job.posts) ? job.posts : [];
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in getJobPosts: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Save analysis results cache to the scan job.
   */
  async updateAnalysisCache(scanId: string, cache: Record<string, unknown>): Promise<void> {
    this.ensureInitialized();
    try {
      // Estimate size — MongoDB has a 16MB BSON document limit.
      // Strip large fields if needed.
      const json = JSON.stringify(cache);
      if (json.length > 14_000_000) {
        this.logger.warn(`Analysis cache too large (${(json.length / 1_000_000).toFixed(1)}MB) — trimming`);
        const inv = cache['investigation'] as Record<string, unknown> | undefined;
        if (inv && Array.isArray(inv['users'])) {
          for (const user of inv['users'] as any[]) {
            if (user?.user?.topicPosts) user.user.topicPosts = [];
            if (user?.user?.historicalPosts) user.user.historicalPosts = [];
          }
        }
        const ds = cache['downstream'] as Record<string, unknown> | undefined;
        if (ds && Array.isArray(ds['externalSignals']) && (ds['externalSignals'] as any[]).length > 50) {
          ds['externalSignals'] = (ds['externalSignals'] as any[]).slice(0, 50);
        }
      }

      await this.scanJobRepo.updateById(scanId, { analysisCache: cache } as Partial<ScanJob>);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Error saving analysis cache: ${err.message}`);
    }
  }

  /**
   * Get normalized text keys from all previous completed scans for the same query.
   * Used for cross-scan deduplication — avoids re-scraping the same posts.
   */
  async getExistingPostKeys(query: string): Promise<string[]> {
    this.ensureInitialized();
    try {
      const scans = await this.scanJobRepo.find(
        { query, status: 'completed' } as Record<string, unknown>,
        { sort: { createdAt: -1 }, limit: 5 }, // Last 5 scans for this query
      );

      const keys: string[] = [];
      for (const scan of scans) {
        const posts = (scan as any).posts ?? [];
        for (const post of posts) {
          const text = (post.text ?? '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 100);
          if (text) keys.push(text);
        }
      }

      return keys;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Error getting existing post keys: ${err.message}`);
      return [];
    }
  }

  /**
   * Cancel a scan job and all its queued/running connectors.
   */
  async cancelJob(scanId: string): Promise<void> {
    this.ensureInitialized();
    try {
      const job = await this.scanJobRepo.findById(scanId);
      if (!job) {
        throw new Error(`Scan job not found: ${scanId}`);
      }

      const updatedConnectors: Record<string, ConnectorStatus> = { ...job.connectors };
      for (const [key, connector] of Object.entries(updatedConnectors) as Array<[string, ConnectorStatus]>) {
        if (connector.status === 'queued' || connector.status === 'running') {
          updatedConnectors[key] = {
            ...connector,
            status: 'cancelled',
            completedAt: new Date().toISOString(),
          };
        }
      }

      await this.scanJobRepo.updateById(scanId, {
        status: 'cancelled',
        connectors: updatedConnectors,
        completedAt: new Date(),
      } as Partial<ScanJob>);

      this.logger.log(`Cancelled scan job: ${scanId}`);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in cancelJob: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Get all active (pending/running) scan jobs.
   */
  async getActiveJobs(): Promise<ScanJob[]> {
    this.ensureInitialized();
    try {
      return await this.scanJobRepo.find(
        { status: { $in: ['pending', 'running'] } } as Record<string, unknown>,
        { sort: { createdAt: -1 } },
      );
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in getActiveJobs: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Get recent scan jobs.
   */
  async getRecentJobs(limit = 20): Promise<ScanJob[]> {
    this.ensureInitialized();
    try {
      return await this.scanJobRepo.find(
        {},
        { limit, sort: { createdAt: -1 } },
      );
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in getRecentJobs: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Reset a specific connector back to queued for retry.
   */
  async resetConnector(scanId: string, connector: string): Promise<void> {
    this.ensureInitialized();
    try {
      const job = await this.scanJobRepo.findById(scanId);
      if (!job) {
        throw new Error(`Scan job not found: ${scanId}`);
      }

      const updatedConnectors = {
        ...job.connectors,
        [connector]: {
          status: 'queued' as const,
          postCount: 0,
          insightCount: 0,
          startedAt: null,
          completedAt: null,
          error: null,
          duration: null,
        },
      };

      // If overall job was completed/failed, set back to running
      const jobStatus = job.status === 'completed' || job.status === 'failed' ? 'running' : job.status;

      await this.scanJobRepo.updateById(scanId, {
        connectors: updatedConnectors,
        status: jobStatus,
        completedAt: null,
      } as Partial<ScanJob>);

      this.logger.log(`Reset connector ${connector} for scan ${scanId}`);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in resetConnector: ${err.message}`, err.stack);
      throw error;
    }
  }
}
