import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService, Repository } from '@veritas/database';
import {
  MentalModel,
  MentalModelModel,
} from '../schemas/mental-model.schema';

@Injectable()
export class MentalModelRepository implements OnModuleInit {
  private readonly logger = new Logger(MentalModelRepository.name);
  private repo!: Repository<MentalModel>;
  private initialized = false;

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit() {
    this.initializeRepositories();
  }

  private initializeRepositories() {
    try {
      try {
        this.databaseService.registerModel('MentalModel', MentalModelModel);
      } catch {
        // already registered
      }

      this.repo = this.databaseService.getRepository<MentalModel>('MentalModel');
      this.initialized = true;
      this.logger.log('MentalModel repository initialized');
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Failed to initialize: ${err.message}`, err.stack);
    }
  }

  private ensureInitialized() {
    if (!this.initialized) {
      this.initializeRepositories();
    }
    if (!this.initialized) {
      throw new Error('MentalModelRepository not initialized');
    }
  }

  async findByInvestigationId(investigationId: string): Promise<MentalModel | null> {
    this.ensureInitialized();
    return this.repo.findOne({ investigationId } as Record<string, unknown>);
  }

  async findAll(options?: { limit?: number; skip?: number }): Promise<MentalModel[]> {
    this.ensureInitialized();
    return this.repo.find(
      {},
      {
        limit: options?.limit,
        skip: options?.skip,
        sort: { updatedAt: -1 },
      },
    );
  }

  async save(data: Partial<MentalModel>): Promise<MentalModel> {
    this.ensureInitialized();

    const existing = data.investigationId
      ? await this.findByInvestigationId(data.investigationId)
      : null;

    if (existing) {
      const id = existing._id?.toString() ?? existing.id;
      const updated = await this.repo.updateById(id, data);
      if (!updated) {
        throw new Error(`Mental model not found after update: ${id}`);
      }
      return updated;
    }

    return this.repo.create(data);
  }

  async deleteByInvestigationId(investigationId: string): Promise<void> {
    this.ensureInitialized();
    await this.repo.deleteMany({ investigationId } as Record<string, unknown>);
  }
}
