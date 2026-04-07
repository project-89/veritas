import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ScanJobRepository } from '../repositories/scan-job.repository';
import { InvestigationRepository } from '../repositories/investigation.repository';
import { IngestionService } from '../services/ingestion.service';
import type { ScanJob } from '../schemas/scan-job.schema';
import type { ScanJobData } from '../queue/scan.processor';
import type { Investigation } from '../schemas/investigation.schema';

@Controller('scan')
export class ScanController {
  private readonly logger = new Logger(ScanController.name);

  constructor(
    @InjectQueue('scan') private readonly scanQueue: Queue,
    private readonly scanJobRepository: ScanJobRepository,
    private readonly investigationRepository: InvestigationRepository,
    private readonly ingestionService: IngestionService,
  ) {}

  /**
   * POST /scan — Start a new scan.
   * Creates a ScanJob in MongoDB, enqueues per-connector BullMQ jobs,
   * and returns the scanId immediately.
   */
  @Post()
  async startScan(
    @Body()
    body: {
      query: string;
      investigationId?: string;
      platforms?: string[];
      limit?: number;
      timeRange?: string;
    },
  ): Promise<{ scanId: string }> {
    const { query, investigationId: requestedInvestigationId, platforms, limit, timeRange } = body;

    if (!query || query.trim().length === 0) {
      throw new HttpException('Query is required', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(`Starting scan for query: "${query}"`);

    // Determine which connectors to use
    const allConnectors = this.ingestionService.getAllConnectors();
    const availablePlatforms = allConnectors.map((c) => c.platform);

    const targetPlatforms = platforms?.length
      ? platforms.filter((p) => availablePlatforms.includes(p))
      : availablePlatforms;

    if (targetPlatforms.length === 0) {
      throw new HttpException(
        `No connectors available. Available: ${availablePlatforms.join(', ')}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Use the requested investigation when present; otherwise fall back to the
    // historical query-based investigation creation path.
    let investigationId = '';
    try {
      if (requestedInvestigationId?.trim()) {
        const investigation = await this.investigationRepository.findById(requestedInvestigationId.trim());
        if (!investigation) {
          throw new Error(`Investigation not found: ${requestedInvestigationId}`);
        }

        investigationId = investigation._id?.toString() ?? investigation.id ?? '';
        const updatePayload: Partial<Investigation> = {
          settings: {
            platforms: targetPlatforms,
            timeRange: timeRange ?? investigation.settings?.timeRange ?? '7d',
            limit: limit ?? investigation.settings?.limit ?? 50,
          },
        };
        await this.investigationRepository.update(investigationId, updatePayload);
      } else {
        const investigation = await this.investigationRepository.findOrCreateByQuery(
          query,
          { platforms: targetPlatforms, limit, timeRange },
        );
        investigationId = investigation._id?.toString() ?? investigation.id ?? '';
      }
    } catch (error) {
      const err = error as Error;
      this.logger.warn(`Failed to persist investigation: ${err.message}`);
      investigationId = 'unknown';
    }

    // Create the scan job in MongoDB
    const scanJob = await this.scanJobRepository.createJob(
      query,
      investigationId,
      targetPlatforms,
      { timeRange, limit },
    );

    const scanId = scanJob._id?.toString() ?? scanJob.id;

    if (investigationId && investigationId !== 'unknown') {
      try {
        await this.investigationRepository.setLastScanId(investigationId, scanId);
      } catch (error) {
        const err = error as Error;
        this.logger.warn(`Failed to persist lastScanId for investigation ${investigationId}: ${err.message}`);
      }
    }

    // Enqueue a BullMQ job for each connector
    for (const platform of targetPlatforms) {
      const jobData: ScanJobData = {
        scanId,
        connector: platform,
        query,
        options: {
          limit,
          timeRange,
        },
        startedAt: new Date().toISOString(),
      };

      await this.scanQueue.add(`scan-${platform}`, jobData, {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      });

      this.logger.debug(`Enqueued job for connector "${platform}" (scan: ${scanId})`);
    }

    this.logger.log(
      `Scan ${scanId} started: ${targetPlatforms.length} connectors queued [${targetPlatforms.join(', ')}]`,
    );

    return { scanId };
  }

  /**
   * GET /scan/active — List all active scans.
   * NOTE: This must be defined BEFORE :id routes to avoid "active" being
   * captured as an id parameter.
   */
  @Get('active')
  async getActiveScans(): Promise<ScanJob[]> {
    return this.scanJobRepository.getActiveJobs();
  }

  /**
   * GET /scan/recent — List recent scans.
   */
  @Get('recent')
  async getRecentScans(@Query('limit') limit?: string): Promise<ScanJob[]> {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.scanJobRepository.getRecentJobs(parsedLimit);
  }

  /**
   * GET /scan/investigation/:id — List recent scans for an investigation.
   */
  @Get('investigation/:id')
  async getInvestigationScans(
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ): Promise<ScanJob[]> {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    return this.scanJobRepository.getJobsByInvestigation(id, parsedLimit);
  }

  /**
   * GET /scan/:id — Get scan status + connector progress.
   */
  @Get(':id')
  async getScanStatus(@Param('id') id: string): Promise<ScanJob> {
    const job = await this.scanJobRepository.getJob(id);
    if (!job) {
      throw new HttpException(`Scan job not found: ${id}`, HttpStatus.NOT_FOUND);
    }
    return job;
  }

  /**
   * GET /scan/:id/posts — Get all posts collected so far.
   */
  @Get(':id/posts')
  async getScanPosts(
    @Param('id') id: string,
  ): Promise<{ posts: unknown[]; totalPosts: number }> {
    const job = await this.scanJobRepository.getJob(id);
    if (!job) {
      throw new HttpException(`Scan job not found: ${id}`, HttpStatus.NOT_FOUND);
    }

    const posts = Array.isArray(job.posts) ? job.posts : [];
    return { posts, totalPosts: posts.length };
  }

  /**
   * PUT /scan/:id/analysis-cache — Save analysis results for fast reload.
   */
  @Put(':id/analysis-cache')
  async saveAnalysisCache(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<{ success: boolean }> {
    const job = await this.scanJobRepository.getJob(id);
    if (!job) {
      throw new HttpException(`Scan job not found: ${id}`, HttpStatus.NOT_FOUND);
    }
    await this.scanJobRepository.updateAnalysisCache(id, body);
    return { success: true };
  }

  /**
   * GET /scan/:id/analysis-cache — Get cached analysis results.
   */
  @Get(':id/analysis-cache')
  async getAnalysisCache(
    @Param('id') id: string,
  ): Promise<Record<string, unknown> | null> {
    const job = await this.scanJobRepository.getJob(id);
    if (!job) {
      throw new HttpException(`Scan job not found: ${id}`, HttpStatus.NOT_FOUND);
    }
    return job.analysisCache ?? null;
  }

  /**
   * POST /scan/:id/cancel — Cancel a running scan.
   */
  @Post(':id/cancel')
  async cancelScan(@Param('id') id: string): Promise<{ success: boolean }> {
    const job = await this.scanJobRepository.getJob(id);
    if (!job) {
      throw new HttpException(`Scan job not found: ${id}`, HttpStatus.NOT_FOUND);
    }

    await this.scanJobRepository.cancelJob(id);

    // Also try to remove queued BullMQ jobs
    try {
      const waitingJobs = await this.scanQueue.getJobs(['waiting', 'delayed']);
      for (const queueJob of waitingJobs) {
        if (queueJob.data?.scanId === id) {
          await queueJob.remove();
        }
      }
    } catch (error) {
      this.logger.warn('Could not remove queued BullMQ jobs during cancel');
    }

    this.logger.log(`Cancelled scan: ${id}`);
    return { success: true };
  }

  /**
   * POST /scan/:id/retry/:connector — Retry a failed connector.
   */
  @Post(':id/retry/:connector')
  async retryConnector(
    @Param('id') id: string,
    @Param('connector') connector: string,
  ): Promise<{ success: boolean }> {
    const job = await this.scanJobRepository.getJob(id);
    if (!job) {
      throw new HttpException(`Scan job not found: ${id}`, HttpStatus.NOT_FOUND);
    }

    if (!job.connectors[connector]) {
      throw new HttpException(
        `Connector "${connector}" not found in scan ${id}`,
        HttpStatus.NOT_FOUND,
      );
    }

    // Reset the connector status
    await this.scanJobRepository.resetConnector(id, connector);

    // Enqueue a new BullMQ job
    const jobData: ScanJobData = {
      scanId: id,
      connector,
      query: job.query,
      options: {
        limit: job.settings.limit,
        timeRange: job.settings.timeRange,
      },
      startedAt: new Date().toISOString(),
    };

    await this.scanQueue.add(`scan-${connector}-retry`, jobData, {
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    this.logger.log(`Retrying connector "${connector}" for scan ${id}`);
    return { success: true };
  }
}
