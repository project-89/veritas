import {
  Controller,
  Get,
  Post,
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
import { ProjectDossierRepository } from '../repositories/project-dossier.repository';
import { MentalModelRepository } from '../repositories/mental-model.repository';
import {
  ProjectDossier,
  ProjectDossierOverlap,
} from '../schemas/project-dossier.schema';
import { MentalModel } from '../schemas/mental-model.schema';
import { ProjectDossierService } from '../services/project-dossier.service';
import { OnChainCorrelationService } from '../services/onchain-correlation.service';
import { MentalModelService } from '../services/mental-model.service';

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
    private readonly projectDossierRepository: ProjectDossierRepository,
    private readonly mentalModelRepository: MentalModelRepository,
    private readonly projectDossierService: ProjectDossierService,
    private readonly onChainCorrelationService: OnChainCorrelationService,
    private readonly mentalModelService: MentalModelService,
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
    @Body() body: { query: string; name?: string; platforms?: string[]; timeRange?: string; limit?: number },
  ): Promise<Investigation> {
    const { query, name, platforms, timeRange, limit } = body;
    if (!query?.trim()) {
      throw new NotFoundException('Query is required');
    }
    if (name?.trim()) {
      return this.investigationRepository.createInvestigation({
        query: query.trim(),
        name: name.trim(),
        settings: {
          platforms: platforms ?? [],
          timeRange: timeRange ?? '7d',
          limit: limit ?? 100,
        },
      });
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
  ): Promise<{
    investigation: InvestigationWithDossier;
    latestSnapshot: Snapshot | null;
    projectDossier: ProjectDossier | null;
    mentalModel: MentalModel | null;
    dossierOverlaps: ProjectDossierOverlap[];
  }> {
    this.logger.log(`Getting investigation: ${id}`);

    const investigation = await this.investigationRepository.findById(id);
    if (!investigation) {
      throw new NotFoundException(`Investigation not found: ${id}`);
    }

    const latestSnapshot =
      await this.investigationRepository.getLatestSnapshot(id);

    const projectDossier = await this.projectDossierRepository.findByInvestigationId(id);
    const mentalModel = await this.mentalModelRepository.findByInvestigationId(id);
    const dossierOverlaps = projectDossier
      ? await this.getDossierOverlaps(projectDossier)
      : [];

    return {
      investigation: this.withEvidenceDossier(investigation, projectDossier),
      latestSnapshot,
      projectDossier,
      mentalModel,
      dossierOverlaps,
    };
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
    const projectDossier = await this.projectDossierRepository.findByInvestigationId(id);
    return this.withEvidenceDossier(updated, projectDossier);
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
    const projectDossier = await this.projectDossierRepository.findByInvestigationId(id);
    return { success: true, investigation: this.withEvidenceDossier(investigation, projectDossier) };
  }

  /**
   * POST /investigations/:id/project-dossier — create or refresh a durable project dossier.
   */
  @Post(':id/project-dossier')
  async buildProjectDossier(
    @Param('id') id: string,
  ): Promise<{
    success: boolean;
    investigation: InvestigationWithDossier;
    projectDossier: ProjectDossier;
    dossierOverlaps: ProjectDossierOverlap[];
  }> {
    const investigation = await this.investigationRepository.findById(id);
    if (!investigation) {
      throw new NotFoundException(`Investigation not found: ${id}`);
    }

    const evidenceDossier = this.investigationEvidenceService.buildDossier(investigation.evidenceSeeds ?? []);
    const onChainSummary = await this.onChainCorrelationService.buildSummary(
      this.projectDossierService.extractAddressCandidates(evidenceDossier),
    );
    const dossierData = this.projectDossierService.buildFromInvestigation(
      investigation,
      evidenceDossier,
      onChainSummary,
    );
    const projectDossier = await this.projectDossierRepository.save(dossierData);
    const projectDossierId = projectDossier._id?.toString() ?? projectDossier.id;

    let updatedInvestigation = investigation;
    if (investigation.linkedProjectDossierId !== projectDossierId) {
      updatedInvestigation = await this.investigationRepository.update(id, {
        linkedProjectDossierId: projectDossierId,
      } as Partial<Investigation>);
    }

    const dossierOverlaps = await this.getDossierOverlaps(projectDossier);

    return {
      success: true,
      investigation: this.withEvidenceDossier(updatedInvestigation, projectDossier),
      projectDossier,
      dossierOverlaps,
    };
  }

  /**
   * GET /investigations/:id/project-dossier — fetch the current linked dossier and overlaps.
   */
  @Get(':id/project-dossier')
  async getProjectDossier(
    @Param('id') id: string,
  ): Promise<{ projectDossier: ProjectDossier | null; dossierOverlaps: ProjectDossierOverlap[] }> {
    const investigation = await this.investigationRepository.findById(id);
    if (!investigation) {
      throw new NotFoundException(`Investigation not found: ${id}`);
    }

    const projectDossier = await this.projectDossierRepository.findByInvestigationId(id);
    if (!projectDossier) {
      return { projectDossier: null, dossierOverlaps: [] };
    }

    return {
      projectDossier,
      dossierOverlaps: await this.getDossierOverlaps(projectDossier),
    };
  }

  /**
   * POST /investigations/:id/mental-model — create or refresh a mental model dossier.
   */
  @Post(':id/mental-model')
  async buildMentalModel(
    @Param('id') id: string,
  ): Promise<{
    success: boolean;
    investigation: InvestigationWithDossier;
    mentalModel: MentalModel;
  }> {
    const investigation = await this.investigationRepository.findById(id);
    if (!investigation) {
      throw new NotFoundException(`Investigation not found: ${id}`);
    }

    const projectDossier = await this.projectDossierRepository.findByInvestigationId(id);
    const evidenceDossier = this.investigationEvidenceService.buildDossier(investigation.evidenceSeeds ?? []);
    const mentalModelData = await this.mentalModelService.buildFromInvestigation({
      investigation,
      evidenceDossier,
      projectDossier,
    });
    const mentalModel = await this.mentalModelRepository.save(mentalModelData);

    return {
      success: true,
      investigation: this.withEvidenceDossier(investigation, projectDossier),
      mentalModel,
    };
  }

  /**
   * GET /investigations/:id/mental-model — fetch the current mental model dossier.
   */
  @Get(':id/mental-model')
  async getMentalModel(
    @Param('id') id: string,
  ): Promise<{ mentalModel: MentalModel | null }> {
    const investigation = await this.investigationRepository.findById(id);
    if (!investigation) {
      throw new NotFoundException(`Investigation not found: ${id}`);
    }

    return {
      mentalModel: await this.mentalModelRepository.findByInvestigationId(id),
    };
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

  private withEvidenceDossier(
    investigation: Investigation,
    projectDossier?: ProjectDossier | null,
  ): InvestigationWithDossier {
    return {
      ...investigation,
      linkedProjectDossierId:
        investigation.linkedProjectDossierId ??
        projectDossier?._id?.toString() ??
        projectDossier?.id ??
        null,
      evidenceDossier: this.investigationEvidenceService.buildDossier(investigation.evidenceSeeds ?? []),
    };
  }

  private async getDossierOverlaps(projectDossier: ProjectDossier): Promise<ProjectDossierOverlap[]> {
    const allDossiers = await this.projectDossierRepository.findAll(100);
    return this.projectDossierService.compareAgainstMany(projectDossier, allDossiers).slice(0, 10);
  }
}
