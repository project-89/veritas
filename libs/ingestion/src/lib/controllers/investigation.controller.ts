import {
  Controller,
  Get,
  Put,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InvestigationRepository } from '../repositories/investigation.repository';
import { EvidenceSeed, Investigation, Snapshot } from '../schemas/investigation.schema';
import {
  InvestigationEvidenceDossier,
  InvestigationEvidenceService,
} from '../services/investigation-evidence.service';

type InvestigationWithDossier = Investigation & {
  evidenceDossier: InvestigationEvidenceDossier;
};

/**
 * REST controller for managing investigations and their snapshots.
 */
@Controller('investigations')
export class InvestigationController {
  private readonly logger = new Logger(InvestigationController.name);

  constructor(
    private readonly investigationRepository: InvestigationRepository,
    private readonly investigationEvidenceService: InvestigationEvidenceService,
  ) {}

  /**
   * GET /investigations — list all investigations, sorted by updatedAt desc.
   * Optionally filter by status and paginate.
   */
  @Get()
  async listInvestigations(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string
  ): Promise<Investigation[]> {
    this.logger.log('Listing investigations');
    return this.investigationRepository.findAll({
      status,
      limit: limit ? Number(limit) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }

  /**
   * PUT /investigations — create or find an investigation for a query.
   */
  @Put()
  async createOrGet(
    @Body() body: { query: string; platforms?: string[]; timeRange?: string; limit?: number },
  ): Promise<Investigation> {
    const { query, platforms, timeRange, limit } = body;
    if (!query?.trim()) {
      throw new NotFoundException('Query is required');
    }
    return this.investigationRepository.findOrCreateByQuery(query.trim(), {
      platforms: platforms ?? [],
      timeRange: timeRange ?? '7d',
      limit: limit ?? 100,
    });
  }

  /**
   * GET /investigations/:id — get a single investigation with its latest snapshot.
   */
  @Get(':id')
  async getInvestigation(
    @Param('id') id: string
  ): Promise<{ investigation: InvestigationWithDossier; latestSnapshot: Snapshot | null }> {
    this.logger.log(`Getting investigation: ${id}`);

    const investigation = await this.investigationRepository.findById(id);
    if (!investigation) {
      throw new NotFoundException(`Investigation not found: ${id}`);
    }

    const latestSnapshot =
      await this.investigationRepository.getLatestSnapshot(id);

    return { investigation: this.withEvidenceDossier(investigation), latestSnapshot };
  }

  /**
   * PUT /investigations/:id — update name, status, or settings.
   */
  @Put(':id')
  async updateInvestigation(
    @Param('id') id: string,
    @Body() body: Partial<Pick<Investigation, 'name' | 'status' | 'settings'>>
  ): Promise<InvestigationWithDossier> {
    this.logger.log(`Updating investigation: ${id}`);

    const existing = await this.investigationRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Investigation not found: ${id}`);
    }

    const updated = await this.investigationRepository.update(id, body);
    return this.withEvidenceDossier(updated);
  }

  /**
   * DELETE /investigations/:id — archive (soft delete) an investigation.
   */
  @Delete(':id')
  async archiveInvestigation(
    @Param('id') id: string
  ): Promise<{ success: boolean }> {
    this.logger.log(`Archiving investigation: ${id}`);

    const existing = await this.investigationRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Investigation not found: ${id}`);
    }

    await this.investigationRepository.archive(id);
    return { success: true };
  }

  /**
   * PATCH /investigations/:id/session — save UI session state.
   */
  @Patch(':id/session')
  async saveSessionState(
    @Param('id') id: string,
    @Body() body: { sessionState: Record<string, unknown> },
  ): Promise<{ success: boolean }> {
    const existing = await this.investigationRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Investigation not found: ${id}`);
    }
    await this.investigationRepository.saveSessionState(id, body.sessionState);
    return { success: true };
  }

  /**
   * PATCH /investigations/:id/rename — rename an investigation.
   */
  @Patch(':id/rename')
  async renameInvestigation(
    @Param('id') id: string,
    @Body() body: { name: string },
  ): Promise<{ success: boolean }> {
    const existing = await this.investigationRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Investigation not found: ${id}`);
    }
    await this.investigationRepository.update(id, { name: body.name } as any);
    return { success: true };
  }

  /**
   * PATCH /investigations/:id/evidence-seeds — append an evidence seed.
   */
  @Patch(':id/evidence-seeds')
  async addEvidenceSeed(
    @Param('id') id: string,
    @Body()
    body: {
      kind: EvidenceSeed['kind'];
      value: string;
      label?: string;
      notes?: string | null;
      metadata?: Record<string, unknown>;
      extractedEntities?: EvidenceSeed['extractedEntities'];
    },
  ): Promise<{ success: boolean; investigation: InvestigationWithDossier }> {
    const existing = await this.investigationRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Investigation not found: ${id}`);
    }
    if (!body.kind || !body.value?.trim()) {
      throw new BadRequestException('Evidence seed kind and value are required');
    }

    const now = new Date();
    const seed = await this.investigationEvidenceService.prepareSeed({
      id: randomUUID(),
      kind: body.kind,
      value: body.value.trim(),
      label: body.label?.trim() ?? '',
      status: 'pending',
      notes: body.notes ?? null,
      metadata: body.metadata ?? {},
      extractedEntities: body.extractedEntities ?? [],
      createdAt: now,
      updatedAt: now,
    } satisfies EvidenceSeed);

    const investigation = await this.investigationRepository.addEvidenceSeed(id, seed);
    return { success: true, investigation: this.withEvidenceDossier(investigation) };
  }

  /**
   * GET /investigations/:id/snapshots — list snapshots for an investigation.
   */
  @Get(':id/snapshots')
  async listSnapshots(
    @Param('id') id: string,
    @Query('limit') limit?: string
  ): Promise<Snapshot[]> {
    this.logger.log(`Listing snapshots for investigation: ${id}`);

    const existing = await this.investigationRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Investigation not found: ${id}`);
    }

    return this.investigationRepository.getSnapshots(id, {
      limit: limit ? Number(limit) : undefined,
    });
  }

  /**
   * GET /investigations/:id/snapshots/:snapshotId — get a specific snapshot.
   */
  @Get(':id/snapshots/:snapshotId')
  async getSnapshot(
    @Param('id') id: string,
    @Param('snapshotId') snapshotId: string
  ): Promise<Snapshot> {
    this.logger.log(
      `Getting snapshot ${snapshotId} for investigation: ${id}`
    );

    const snapshot =
      await this.investigationRepository.getSnapshotById(snapshotId);
    if (!snapshot || snapshot.investigationId !== id) {
      throw new NotFoundException(
        `Snapshot not found: ${snapshotId} for investigation ${id}`
      );
    }

    return snapshot;
  }

  private withEvidenceDossier(investigation: Investigation): InvestigationWithDossier {
    return {
      ...investigation,
      evidenceDossier: this.investigationEvidenceService.buildDossier(investigation.evidenceSeeds ?? []),
    };
  }
}
