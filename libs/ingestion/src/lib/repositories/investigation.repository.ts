import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService, Repository } from '@veritas/database';
import {
  EvidenceSeed,
  Investigation,
  InvestigationModel,
  InvestigationSettings,
  Snapshot,
  SnapshotModel,
  SnapshotSummary,
} from '../schemas/investigation.schema';

/**
 * Repository for managing investigations and their snapshots.
 * Uses MongoDB via DatabaseService following the same pattern as MongoNarrativeRepository.
 * Initializes in onModuleInit to ensure DatabaseService is connected first.
 */
@Injectable()
export class InvestigationRepository implements OnModuleInit {
  private readonly logger = new Logger(InvestigationRepository.name);
  private investigationRepo!: Repository<Investigation>;
  private snapshotRepo!: Repository<Snapshot>;
  private initialized = false;

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit() {
    this.initializeRepositories();
  }

  private initializeRepositories() {
    try {
      try {
        this.databaseService.registerModel('Investigation', InvestigationModel);
        this.databaseService.registerModel('Snapshot', SnapshotModel);
        this.logger.debug('Successfully registered Investigation models with database service');
      } catch (error) {
        this.logger.warn('Models already registered or error registering models', error);
      }

      this.investigationRepo = this.databaseService.getRepository<Investigation>('Investigation');
      this.snapshotRepo = this.databaseService.getRepository<Snapshot>('Snapshot');

      this.initialized = true;
      this.logger.log('Investigation repository initialized');
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Failed to initialize repositories: ${err.message}`, err.stack);
      // Don't throw — let the app start, repository methods will fail gracefully
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
      throw new Error('InvestigationRepository not initialized — is MongoDB connected?');
    }
  }

  /**
   * Find an existing investigation by query, or create a new one.
   * This is the primary entry point when a search is executed.
   */
  async findOrCreateByQuery(
    query: string,
    settings?: Partial<InvestigationSettings>,
  ): Promise<Investigation> {
    this.ensureInitialized();
    try {
      const existing = await this.investigationRepo.findOne({
        query,
      });

      if (existing) {
        this.logger.debug(`Found existing investigation for query: "${query}"`);
        return existing;
      }

      const investigation = await this.investigationRepo.create({
        query,
        name: query,
        status: 'active',
        settings: {
          platforms: settings?.platforms ?? [],
          timeRange: settings?.timeRange ?? '7d',
          limit: settings?.limit ?? 50,
          searchMode: settings?.searchMode ?? 'topic',
        },
        lastSnapshotId: null,
        lastScanId: null,
        linkedProjectDossierId: null,
        evidenceSeeds: [],
      } as Partial<Investigation>);

      this.logger.log(`Created new investigation for query: "${query}"`);
      return investigation;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in findOrCreateByQuery: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Create a new investigation container with an explicit case title.
   */
  async createInvestigation(params: {
    query: string;
    name?: string;
    settings?: Partial<InvestigationSettings>;
  }): Promise<Investigation> {
    this.ensureInitialized();
    const query = params.query.trim();
    const name = params.name?.trim() || query;

    try {
      const investigation = await this.investigationRepo.create({
        query,
        name,
        status: 'active',
        settings: {
          platforms: params.settings?.platforms ?? [],
          timeRange: params.settings?.timeRange ?? '7d',
          limit: params.settings?.limit ?? 50,
        },
        lastSnapshotId: null,
        lastScanId: null,
        linkedProjectDossierId: null,
        evidenceSeeds: [],
      } as Partial<Investigation>);

      this.logger.log(`Created new investigation "${name}" for query: "${query}"`);
      return investigation;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in createInvestigation: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * List all investigations, sorted by most recently updated.
   */
  async findAll(options?: {
    status?: string;
    limit?: number;
    skip?: number;
  }): Promise<Investigation[]> {
    this.ensureInitialized();
    try {
      const filter: Record<string, unknown> = {};
      if (options?.status) {
        filter['status'] = options.status;
      }

      return await this.investigationRepo.find(filter, {
        limit: options?.limit,
        skip: options?.skip,
        sort: { updatedAt: -1 },
      });
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in findAll: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Find a single investigation by its ID.
   */
  async findById(id: string): Promise<Investigation | null> {
    this.ensureInitialized();
    try {
      return await this.investigationRepo.findById(id);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in findById: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Batch-load investigations by ID in one query (avoids N+1 lookups).
   */
  async findByIds(ids: string[]): Promise<Investigation[]> {
    this.ensureInitialized();
    if (ids.length === 0) return [];
    try {
      return await this.investigationRepo.find({ _id: { $in: ids } } as Record<string, unknown>);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in findByIds: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Update an investigation (name, status, settings, etc.).
   */
  async update(id: string, data: Partial<Investigation>): Promise<Investigation> {
    this.ensureInitialized();
    try {
      const updated = await this.investigationRepo.updateById(id, data);
      if (!updated) {
        throw new Error(`Investigation not found: ${id}`);
      }
      this.logger.debug(`Updated investigation: ${id}`);
      return updated;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in update: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Save UI session state for an investigation (centerMode, selections, panel widths).
   */
  async saveSessionState(id: string, sessionState: Record<string, unknown>): Promise<void> {
    this.ensureInitialized();
    try {
      await this.investigationRepo.updateById(id, { sessionState } as Partial<Investigation>);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error saving session state: ${err.message}`);
    }
  }

  /**
   * Persist the most recent scan for an investigation so the UI can reopen it exactly.
   */
  async setLastScanId(id: string, scanId: string): Promise<void> {
    this.ensureInitialized();
    try {
      await this.investigationRepo.updateById(id, {
        lastScanId: scanId,
      } as Partial<Investigation>);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error setting lastScanId: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Append a new evidence seed to an investigation.
   */
  async addEvidenceSeed(id: string, seed: EvidenceSeed): Promise<Investigation> {
    this.ensureInitialized();
    const investigation = await this.findById(id);
    if (!investigation) {
      throw new Error(`Investigation not found: ${id}`);
    }

    const evidenceSeeds = [...(investigation.evidenceSeeds ?? []), seed];
    return this.update(id, { evidenceSeeds } as Partial<Investigation>);
  }

  /**
   * Soft-delete an investigation by setting status to 'archived'.
   */
  async archive(id: string): Promise<void> {
    this.ensureInitialized();
    try {
      await this.investigationRepo.updateById(id, {
        status: 'archived',
      } as Partial<Investigation>);
      this.logger.log(`Archived investigation: ${id}`);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in archive: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Permanently delete an investigation and its snapshots.
   */
  async deletePermanent(id: string): Promise<void> {
    this.ensureInitialized();
    try {
      await this.snapshotRepo.deleteMany({ investigationId: id } as Record<string, unknown>);
      await this.investigationRepo.deleteById(id);
      this.logger.log(`Deleted investigation permanently: ${id}`);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in deletePermanent: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Add a snapshot to an investigation and update the investigation's lastSnapshotId.
   */
  async addSnapshot(
    investigationId: string,
    data: {
      scanId?: string | null;
      posts: unknown[];
      narratives: unknown[];
      summary: SnapshotSummary;
    },
  ): Promise<Snapshot> {
    this.ensureInitialized();
    try {
      const snapshot = await this.snapshotRepo.create({
        investigationId,
        scanId: data.scanId ?? null,
        timestamp: new Date(),
        postCount: data.posts.length,
        narrativeCount: data.narratives.length,
        summary: data.summary,
        posts: data.posts,
        narratives: data.narratives,
      } as Partial<Snapshot>);

      // Update the investigation's lastSnapshotId
      const snapshotId = snapshot._id?.toString() ?? snapshot.id;
      await this.investigationRepo.updateById(investigationId, {
        lastSnapshotId: snapshotId,
      } as Partial<Investigation>);

      this.logger.debug(`Added snapshot ${snapshotId} to investigation ${investigationId}`);
      return snapshot;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in addSnapshot: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Create or refresh the snapshot associated with a specific scan.
   */
  async upsertSnapshotForScan(
    investigationId: string,
    scanId: string,
    data: {
      posts: unknown[];
      narratives: unknown[];
      summary: SnapshotSummary;
    },
  ): Promise<Snapshot> {
    this.ensureInitialized();
    try {
      const existing = await this.snapshotRepo.find(
        { investigationId, scanId } as Record<string, unknown>,
        {
          limit: 1,
          sort: { timestamp: -1 },
        },
      );

      const current = existing[0];
      if (!current) {
        return this.addSnapshot(investigationId, {
          scanId,
          posts: data.posts,
          narratives: data.narratives,
          summary: data.summary,
        });
      }

      const currentId =
        (current._id as unknown as { toString?: () => string })?.toString?.() ?? current.id;
      const updated = await this.snapshotRepo.updateById(currentId, {
        timestamp: new Date(),
        postCount: data.posts.length,
        narrativeCount: data.narratives.length,
        summary: data.summary,
        posts: data.posts,
        narratives: data.narratives,
      } as Partial<Snapshot>);

      if (!updated) {
        throw new Error(`Snapshot not found during upsert: ${currentId}`);
      }

      await this.investigationRepo.updateById(investigationId, {
        lastSnapshotId: currentId,
      } as Partial<Investigation>);

      return updated;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in upsertSnapshotForScan: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Get snapshots for an investigation, sorted by most recent first.
   */
  async getSnapshots(investigationId: string, options?: { limit?: number }): Promise<Snapshot[]> {
    this.ensureInitialized();
    try {
      return await this.snapshotRepo.find({ investigationId } as Record<string, unknown>, {
        limit: options?.limit,
        sort: { timestamp: -1 },
      });
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in getSnapshots: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Get the most recent snapshot for an investigation.
   */
  async getLatestSnapshot(investigationId: string): Promise<Snapshot | null> {
    this.ensureInitialized();
    try {
      // Get recent snapshots and return the first one that has posts
      const snapshots = await this.snapshotRepo.find(
        { investigationId } as Record<string, unknown>,
        {
          limit: 5,
          sort: { timestamp: -1 },
        },
      );
      // Prefer snapshot with actual post data
      const withPosts = snapshots.find((s) => {
        const rec = s as unknown as Record<string, unknown>;
        return Array.isArray(rec['posts']) && (rec['posts'] as unknown[]).length > 0;
      });
      return withPosts ?? snapshots[0] ?? null;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in getLatestSnapshot: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Get a specific snapshot by its ID.
   */
  async getSnapshotById(snapshotId: string): Promise<Snapshot | null> {
    this.ensureInitialized();
    try {
      return await this.snapshotRepo.findById(snapshotId);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in getSnapshotById: ${err.message}`, err.stack);
      throw error;
    }
  }
}
