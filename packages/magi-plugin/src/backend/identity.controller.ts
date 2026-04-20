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
import { IdentityRecordRepository } from '../../../../libs/ingestion/src/lib/repositories/identity-record.repository';
import { AnalysisJobRepository } from '../../../../libs/ingestion/src/lib/repositories/analysis-job.repository';
import type { IdentityRecord } from '../../../../libs/ingestion/src/lib/schemas/identity-record.schema';
import type { AnalysisJobData } from '../../../../libs/ingestion/src/lib/queue/analysis.processor';
import type { PsychologicalProfileMode } from '../../../../libs/ingestion/src/lib/schemas/analysis-job.schema';

interface GenerateProfileBody {
  mode?: PsychologicalProfileMode;
  investigationId?: string | null;
  scanId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

@Controller('identity')
export class MagiIdentityController {
  private readonly logger = new Logger(MagiIdentityController.name);

  constructor(
    private readonly identityRepo: IdentityRecordRepository,
    private readonly analysisJobRepo: AnalysisJobRepository,
    @InjectQueue('analysis') private readonly analysisQueue: Queue,
  ) {}

  @Get('search')
  async search(
    @Query('q') query: string,
    @Query('limit') limit?: string,
  ): Promise<IdentityRecord[]> {
    if (!query || query.trim().length === 0) return [];
    return this.identityRepo.search(query.trim(), limit ? parseInt(limit, 10) : 20);
  }

  @Get('recent')
  async getRecent(
    @Query('limit') limit?: string,
  ): Promise<IdentityRecord[]> {
    return this.identityRepo.getRecentlyInvestigated(limit ? parseInt(limit, 10) : 20);
  }

  @Get('by-handle/:handle')
  async getByHandle(
    @Param('handle') handle: string,
    @Query('platform') platform?: string,
  ): Promise<IdentityRecord | null> {
    const platformsToTry = platform ? [platform] : ['twitter', 'reddit', 'youtube'];
    for (const p of platformsToTry) {
      const record = await this.identityRepo.findByHandle(handle.toLowerCase(), p);
      if (record) return record;
    }
    return null;
  }

  @Get(':id')
  async getById(@Param('id') id: string): Promise<IdentityRecord> {
    const record = await this.identityRepo.findById(id);
    if (!record) {
      throw new HttpException(`Identity not found: ${id}`, HttpStatus.NOT_FOUND);
    }
    return record;
  }

  @Get(':id/linked')
  async getLinked(@Param('id') id: string): Promise<IdentityRecord[]> {
    const record = await this.identityRepo.findById(id);
    if (!record) {
      throw new HttpException(`Identity not found: ${id}`, HttpStatus.NOT_FOUND);
    }
    if (!record.identityClusterId) return [record];
    return this.identityRepo.findByClusterId(record.identityClusterId);
  }

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

  @Post(':id/generate-profile')
  async generateProfile(
    @Param('id') id: string,
    @Body() body: GenerateProfileBody = {},
  ): Promise<{ status: string; jobId?: string; error?: string }> {
    const record = await this.identityRepo.findById(id);
    if (!record) {
      throw new HttpException(`Identity not found: ${id}`, HttpStatus.NOT_FOUND);
    }

    try {
      const profileMode = body.mode ?? 'current-state';
      const scanId =
        profileMode === 'current-state' || profileMode === 'deep-history'
          ? null
          : typeof body.scanId === 'string' && body.scanId.trim().length > 0
            ? body.scanId
            : null;

      if (profileMode === 'investigation-window' && !scanId) {
        throw new HttpException(
          'scanId is required for investigation-window MAGI profiles',
          HttpStatus.BAD_REQUEST,
        );
      }

      await this.identityRepo.updateProfileStatus(id, 'queued');

      const analysisJob = await this.analysisJobRepo.createJob({
        scanId,
        type: 'psychological-profile' as any,
        narrativeIds: [id],
        input: {
          query: record.primaryHandle,
          narrativeSummaries: [],
          narratives: [],
          userHandles: [record.primaryHandle],
          postCount: record.totalPostsAnalyzed,
          profileMode,
          investigationId:
            typeof body.investigationId === 'string' && body.investigationId.trim().length > 0
              ? body.investigationId
              : null,
          startDate:
            typeof body.startDate === 'string' && body.startDate.trim().length > 0
              ? body.startDate
              : null,
          endDate:
            typeof body.endDate === 'string' && body.endDate.trim().length > 0
              ? body.endDate
              : null,
        },
      });

      const jobId = analysisJob._id?.toString() ?? analysisJob.id;

      const jobData: AnalysisJobData = {
        analysisJobId: jobId,
        scanId,
        type: 'psychological-profile',
      };

      await this.analysisQueue.add('analysis-psychological-profile', jobData, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      });

      this.logger.log(
        `MAGI profile generation queued for @${record.primaryHandle} in ${profileMode} mode (job: ${jobId})`,
      );
      return { status: 'queued', jobId };
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Failed to queue MAGI profile for @${record.primaryHandle}: ${error.message}`, error.stack);
      await this.identityRepo.updateProfileStatus(id, 'failed').catch(() => {});
      return { status: 'failed', error: error.message };
    }
  }
}
