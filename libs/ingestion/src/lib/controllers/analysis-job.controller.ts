import { InjectQueue } from '@nestjs/bullmq';
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Post,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import type { AnalysisJobData } from '../queue/analysis.processor';
import { AnalysisJobRepository } from '../repositories/analysis-job.repository';
import type { AnalysisJob, AnalysisJobType } from '../schemas/analysis-job.schema';

interface BatchJobRequest {
  type: AnalysisJobType;
  narrativeIds: string[];
  input: {
    query: string;
    narrativeSummaries?: string[];
    narratives?: Record<string, unknown>[];
    userHandles?: string[];
    postCount?: number;
  };
}

@Controller('analysis-jobs')
export class AnalysisJobController {
  private readonly logger = new Logger(AnalysisJobController.name);

  constructor(
    @InjectQueue('analysis') private readonly analysisQueue: Queue,
    private readonly analysisJobRepo: AnalysisJobRepository,
  ) {}

  /**
   * POST /analysis-jobs/batch — Start multiple analysis jobs at once.
   * Returns the created job IDs immediately.
   */
  @Post('batch')
  async startBatch(
    @Body() body: { scanId: string; jobs: BatchJobRequest[] },
  ): Promise<{ jobIds: string[] }> {
    const { scanId, jobs } = body;

    if (!scanId) {
      throw new HttpException('scanId is required', HttpStatus.BAD_REQUEST);
    }
    if (!jobs || jobs.length === 0) {
      throw new HttpException('jobs array is required', HttpStatus.BAD_REQUEST);
    }

    const jobIds: string[] = [];

    for (const jobReq of jobs) {
      // Create MongoDB document
      const analysisJob = await this.analysisJobRepo.createJob({
        scanId,
        type: jobReq.type,
        narrativeIds: jobReq.narrativeIds,
        input: {
          query: jobReq.input.query,
          narrativeSummaries: jobReq.input.narrativeSummaries ?? [],
          narratives: jobReq.input.narratives ?? [],
          userHandles: jobReq.input.userHandles ?? [],
          postCount: jobReq.input.postCount ?? 0,
        },
      });

      const jobId = analysisJob._id?.toString() ?? analysisJob.id;
      jobIds.push(jobId);

      // Enqueue BullMQ job
      const jobData: AnalysisJobData = {
        analysisJobId: jobId,
        scanId,
        type: jobReq.type,
      };

      await this.analysisQueue.add(`analysis-${jobReq.type}`, jobData, {
        attempts: 2,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: 200,
        removeOnFail: 100,
      });

      this.logger.debug(`Enqueued analysis job ${jobId} [${jobReq.type}]`);
    }

    this.logger.log(
      `Started ${jobIds.length} analysis jobs for scan ${scanId}: ${jobs.map((j) => j.type).join(', ')}`,
    );

    return { jobIds };
  }

  /**
   * GET /analysis-jobs/by-scan/:scanId — Get all analysis jobs for a scan.
   */
  @Get('by-scan/:scanId')
  async getJobsByScan(@Param('scanId') scanId: string): Promise<AnalysisJob[]> {
    return this.analysisJobRepo.getJobsByScan(scanId);
  }

  /**
   * GET /analysis-jobs/:id — Get a single analysis job with result.
   */
  @Get(':id')
  async getJob(@Param('id') id: string): Promise<AnalysisJob> {
    const job = await this.analysisJobRepo.getJob(id);
    if (!job) {
      throw new HttpException(`Analysis job not found: ${id}`, HttpStatus.NOT_FOUND);
    }
    return job;
  }

  /**
   * POST /analysis-jobs/:id/cancel — Cancel a single job.
   */
  @Post(':id/cancel')
  async cancelJob(@Param('id') id: string): Promise<{ success: boolean }> {
    const job = await this.analysisJobRepo.getJob(id);
    if (!job) {
      throw new HttpException(`Analysis job not found: ${id}`, HttpStatus.NOT_FOUND);
    }

    await this.analysisJobRepo.cancelJob(id);

    // Try to remove from BullMQ queue if still waiting
    try {
      const waitingJobs = await this.analysisQueue.getJobs(['waiting', 'delayed']);
      for (const queueJob of waitingJobs) {
        if (queueJob.data?.analysisJobId === id) {
          await queueJob.remove();
        }
      }
    } catch {
      // Best effort
    }

    return { success: true };
  }
}
