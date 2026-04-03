import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService, Repository } from '@veritas/database';
import {
  AnalysisJobModel,
  type AnalysisJob,
  type AnalysisJobType,
  type AnalysisJobInput,
} from '../schemas/analysis-job.schema';

@Injectable()
export class AnalysisJobRepository implements OnModuleInit {
  private readonly logger = new Logger(AnalysisJobRepository.name);
  private repo!: Repository<AnalysisJob>;
  private initialized = false;

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit() {
    this.initializeRepositories();
  }

  private initializeRepositories() {
    try {
      try {
        this.databaseService.registerModel('AnalysisJob', AnalysisJobModel);
      } catch {
        this.logger.warn('AnalysisJob model already registered');
      }
      this.repo = this.databaseService.getRepository<AnalysisJob>('AnalysisJob');
      this.initialized = true;
      this.logger.log('AnalysisJob repository initialized');
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Failed to initialize: ${err.message}`, err.stack);
    }
  }

  private ensureInitialized() {
    if (!this.initialized) {
      try { this.initializeRepositories(); } catch { /* swallow */ }
    }
    if (!this.initialized) {
      throw new Error('AnalysisJobRepository not initialized — is MongoDB connected?');
    }
  }

  async createJob(params: {
    scanId: string;
    type: AnalysisJobType;
    narrativeIds: string[];
    input: AnalysisJobInput;
  }): Promise<AnalysisJob> {
    this.ensureInitialized();
    const job = await this.repo.create({
      scanId: params.scanId,
      type: params.type,
      status: 'pending',
      narrativeIds: params.narrativeIds,
      input: params.input,
      result: null,
      startedAt: null,
      completedAt: null,
      duration: null,
      error: null,
    } as Partial<AnalysisJob>);
    this.logger.log(`Created analysis job ${job._id} [${params.type}] for scan ${params.scanId}`);
    return job;
  }

  async getJob(id: string): Promise<AnalysisJob | null> {
    this.ensureInitialized();
    try {
      return await this.repo.findById(id);
    } catch {
      return null;
    }
  }

  async getJobsByScan(scanId: string): Promise<AnalysisJob[]> {
    this.ensureInitialized();
    return this.repo.find(
      { scanId } as Record<string, unknown>,
      { sort: { createdAt: -1 } },
    );
  }

  async updateStatus(
    id: string,
    update: Partial<Pick<AnalysisJob, 'status' | 'startedAt' | 'completedAt' | 'duration' | 'error' | 'result'>>,
  ): Promise<void> {
    this.ensureInitialized();
    await this.repo.updateById(id, update as Partial<AnalysisJob>);
  }

  async cancelJob(id: string): Promise<void> {
    this.ensureInitialized();
    const job = await this.repo.findById(id);
    if (!job) throw new Error(`Analysis job not found: ${id}`);
    if (job.status === 'completed' || job.status === 'cancelled') return;
    await this.repo.updateById(id, {
      status: 'cancelled',
      completedAt: new Date(),
    } as Partial<AnalysisJob>);
    this.logger.log(`Cancelled analysis job: ${id}`);
  }
}
