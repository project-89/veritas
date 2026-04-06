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
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { IdentityRecordRepository } from '../repositories/identity-record.repository';
import { AnalysisJobRepository } from '../repositories/analysis-job.repository';
import type { IdentityRecord } from '../schemas/identity-record.schema';
import type { AnalysisJobData } from '../queue/analysis.processor';

@Controller('identity')
export class IdentityController {
  private readonly logger = new Logger(IdentityController.name);

  constructor(
    private readonly identityRepo: IdentityRecordRepository,
    private readonly analysisJobRepo: AnalysisJobRepository,
    @InjectQueue('analysis') private readonly analysisQueue: Queue,
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
  ): Promise<IdentityRecord | null> {
    // Try all platforms if not specified
    const platformsToTry = platform ? [platform] : ['twitter', 'reddit', 'youtube'];
    for (const p of platformsToTry) {
      const record = await this.identityRepo.findByHandle(handle.toLowerCase(), p);
      if (record) return record;
    }
    // Return null instead of 404 — identity records are created on investigation,
    // so not finding one is normal for users that haven't been investigated yet
    return null;
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
  async generateProfile(@Param('id') id: string): Promise<{ status: string; jobId?: string; error?: string }> {
    const record = await this.identityRepo.findById(id);
    if (!record) {
      throw new HttpException(`Identity not found: ${id}`, HttpStatus.NOT_FOUND);
    }

    try {
      // Mark as queued
      await this.identityRepo.updateProfileStatus(id, 'queued');

      // Create analysis job for the profiler
      const analysisJob = await this.analysisJobRepo.createJob({
        scanId: null,
        type: 'psychological-profile' as any,
        narrativeIds: [id],
        input: {
          query: record.primaryHandle,
          narrativeSummaries: [],
          narratives: [],
          userHandles: [record.primaryHandle],
          postCount: record.totalPostsAnalyzed,
        },
      });

      const jobId = analysisJob._id?.toString() ?? analysisJob.id;

      // Enqueue BullMQ job
      const jobData: AnalysisJobData = {
        analysisJobId: jobId,
        scanId: null,
        type: 'psychological-profile',
      };

      await this.analysisQueue.add('analysis-psychological-profile', jobData, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      });

      this.logger.log(`MAGI profile generation queued for @${record.primaryHandle} (job: ${jobId})`);
      return { status: 'queued', jobId };
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Failed to queue MAGI profile for @${record.primaryHandle}: ${error.message}`, error.stack);
      await this.identityRepo.updateProfileStatus(id, 'failed').catch(() => {});
      return { status: 'failed', error: error.message };
    }
  }
}
