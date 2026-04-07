import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService, Repository } from '@veritas/database';
import {
  ProjectDossier,
  ProjectDossierModel,
} from '../schemas/project-dossier.schema';

@Injectable()
export class ProjectDossierRepository implements OnModuleInit {
  private readonly logger = new Logger(ProjectDossierRepository.name);
  private repo!: Repository<ProjectDossier>;
  private initialized = false;

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit() {
    this.initializeRepositories();
  }

  private initializeRepositories() {
    try {
      try {
        this.databaseService.registerModel('ProjectDossier', ProjectDossierModel);
      } catch {
        // already registered
      }

      this.repo = this.databaseService.getRepository<ProjectDossier>('ProjectDossier');
      this.initialized = true;
      this.logger.log('ProjectDossier repository initialized');
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
      throw new Error('ProjectDossierRepository not initialized');
    }
  }

  async findById(id: string): Promise<ProjectDossier | null> {
    this.ensureInitialized();
    return this.repo.findById(id);
  }

  async findByInvestigationId(investigationId: string): Promise<ProjectDossier | null> {
    this.ensureInitialized();
    return this.repo.findOne({ investigationId } as Record<string, unknown>);
  }

  async findAll(limit = 50): Promise<ProjectDossier[]> {
    this.ensureInitialized();
    return this.repo.find({} as Record<string, unknown>, {
      sort: { updatedAt: -1 },
      limit,
    });
  }

  async save(data: Partial<ProjectDossier>): Promise<ProjectDossier> {
    this.ensureInitialized();

    const existing = data.investigationId
      ? await this.findByInvestigationId(data.investigationId)
      : null;

    if (existing) {
      const id = existing._id?.toString() ?? existing.id;
      const updated = await this.repo.updateById(id, data);
      if (!updated) {
        throw new Error(`Project dossier not found after update: ${id}`);
      }
      return updated;
    }

    return this.repo.create(data);
  }
}
