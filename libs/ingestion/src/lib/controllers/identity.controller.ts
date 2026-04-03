import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { IdentityRecordRepository } from '../repositories/identity-record.repository';
import type { IdentityRecord } from '../schemas/identity-record.schema';

@Controller('identity')
export class IdentityController {
  private readonly logger = new Logger(IdentityController.name);

  constructor(
    private readonly identityRepo: IdentityRecordRepository,
  ) {}

  /**
   * GET /identity/search?q= — Search identities by handle.
   */
  @Get('search')
  async search(
    @Query('q') query: string,
    @Query('limit') limit?: string,
  ): Promise<IdentityRecord[]> {
    if (!query || query.trim().length === 0) return [];
    return this.identityRepo.search(query.trim(), limit ? parseInt(limit, 10) : 20);
  }

  /**
   * GET /identity/recent — Recently investigated identities.
   */
  @Get('recent')
  async getRecent(
    @Query('limit') limit?: string,
  ): Promise<IdentityRecord[]> {
    return this.identityRepo.getRecentlyInvestigated(limit ? parseInt(limit, 10) : 20);
  }

  /**
   * GET /identity/by-handle/:handle — Get identity by handle.
   */
  @Get('by-handle/:handle')
  async getByHandle(
    @Param('handle') handle: string,
    @Query('platform') platform?: string,
  ): Promise<IdentityRecord> {
    // Try all platforms if not specified
    const platformsToTry = platform ? [platform] : ['twitter', 'reddit', 'youtube'];
    for (const p of platformsToTry) {
      const record = await this.identityRepo.findByHandle(handle.toLowerCase(), p);
      if (record) return record;
    }
    throw new HttpException(`Identity not found: ${handle}`, HttpStatus.NOT_FOUND);
  }

  /**
   * GET /identity/:id — Get identity by MongoDB ID.
   */
  @Get(':id')
  async getById(@Param('id') id: string): Promise<IdentityRecord> {
    const record = await this.identityRepo.findById(id);
    if (!record) {
      throw new HttpException(`Identity not found: ${id}`, HttpStatus.NOT_FOUND);
    }
    return record;
  }

  /**
   * GET /identity/:id/linked — Get all linked identities (same person, different platforms).
   */
  @Get(':id/linked')
  async getLinked(@Param('id') id: string): Promise<IdentityRecord[]> {
    const record = await this.identityRepo.findById(id);
    if (!record) {
      throw new HttpException(`Identity not found: ${id}`, HttpStatus.NOT_FOUND);
    }
    if (!record.identityClusterId) return [record];
    return this.identityRepo.findByClusterId(record.identityClusterId);
  }

  /**
   * POST /identity/link — Link two identity records as the same person.
   */
  @Post('link')
  async linkIdentities(
    @Body() body: { identityIdA: string; identityIdB: string },
  ): Promise<{ clusterId: string }> {
    const { identityIdA, identityIdB } = body;
    if (!identityIdA || !identityIdB) {
      throw new HttpException('identityIdA and identityIdB are required', HttpStatus.BAD_REQUEST);
    }
    const clusterId = await this.identityRepo.linkIdentities(identityIdA, identityIdB);
    return { clusterId };
  }

  /**
   * POST /identity/:id/generate-profile — Trigger MAGI psychological profile generation.
   */
  @Post(':id/generate-profile')
  async generateProfile(@Param('id') id: string): Promise<{ status: string }> {
    const record = await this.identityRepo.findById(id);
    if (!record) {
      throw new HttpException(`Identity not found: ${id}`, HttpStatus.NOT_FOUND);
    }

    // Mark as queued
    await this.identityRepo.updateProfileStatus(id, 'queued');

    // TODO: Enqueue via analysis job queue once the psychological-profile job type is wired
    // For now, return the status so the frontend can poll
    this.logger.log(`MAGI profile generation queued for @${record.primaryHandle}`);

    return { status: 'queued' };
  }
}
