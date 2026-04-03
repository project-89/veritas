import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Query,
  Body,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InvestigationRepository } from '../repositories/investigation.repository';
import { Investigation, Snapshot } from '../schemas/investigation.schema';

/**
 * REST controller for managing investigations and their snapshots.
 */
@Controller('investigations')
export class InvestigationController {
  private readonly logger = new Logger(InvestigationController.name);

  constructor(
    private readonly investigationRepository: InvestigationRepository
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
   * GET /investigations/:id — get a single investigation with its latest snapshot.
   */
  @Get(':id')
  async getInvestigation(
    @Param('id') id: string
  ): Promise<{ investigation: Investigation; latestSnapshot: Snapshot | null }> {
    this.logger.log(`Getting investigation: ${id}`);

    const investigation = await this.investigationRepository.findById(id);
    if (!investigation) {
      throw new NotFoundException(`Investigation not found: ${id}`);
    }

    const latestSnapshot =
      await this.investigationRepository.getLatestSnapshot(id);

    return { investigation, latestSnapshot };
  }

  /**
   * PUT /investigations/:id — update name, status, or settings.
   */
  @Put(':id')
  async updateInvestigation(
    @Param('id') id: string,
    @Body() body: Partial<Pick<Investigation, 'name' | 'status' | 'settings'>>
  ): Promise<Investigation> {
    this.logger.log(`Updating investigation: ${id}`);

    const existing = await this.investigationRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Investigation not found: ${id}`);
    }

    return this.investigationRepository.update(id, body);
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
}
