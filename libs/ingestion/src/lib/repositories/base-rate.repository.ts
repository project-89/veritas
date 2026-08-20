import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import type { ArchivedEvent, BaseRateStore } from '@veritas/analysis';
import { DatabaseService, Repository } from '@veritas/database';

interface ArchiveRow {
  eventId: string;
  /** Stored as a BSON Date, NOT an ISO string. */
  timestamp: Date | string;
  category?: string;
  severity?: string;
  source?: string;
}

/**
 * Base rates over `global_event_archive`.
 *
 * That collection was created as slim, no-TTL rows explicitly for longitudinal
 * analysis, and this is the use it was waiting for: it is the only corpus long
 * enough to say how often something happens ANYWAY. `global_events` expires and
 * `scan_posts` is query-scoped, so neither can serve as a baseline.
 *
 * Reads only. A base rate that could be mutated by the thing it measures would
 * not be a baseline.
 */
@Injectable()
export class BaseRateRepository implements BaseRateStore, OnModuleInit {
  private readonly logger = new Logger(BaseRateRepository.name);
  private repo!: Repository<ArchiveRow>;
  private initialized = false;

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  async onModuleInit() {
    if (!this.databaseService) {
      this.logger.warn('No DatabaseService — base rates unavailable, detectors will abstain');
      return;
    }
    try {
      this.repo = this.databaseService.getRepository<ArchiveRow>('GlobalEventArchive');
      this.initialized = true;
      this.logger.log('Base-rate store initialized over global_event_archive');
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Failed to initialize base-rate store: ${err.message}`);
    }
  }

  async findInWindow(
    startMs: number,
    endMs: number,
    filter?: { category?: string; severity?: string },
  ): Promise<ArchivedEvent[]> {
    if (!this.initialized) return [];
    try {
      const query: Record<string, unknown> = {
        // MUST be Date objects. `timestamp` is a BSON Date, and comparing it
        // against ISO strings matches NOTHING — silently, returning an empty
        // window that reads as "no events happened" rather than "the query is
        // wrong". Verified against the live collection: the string form
        // returned 0, the Date form 2,975.
        timestamp: { $gte: new Date(startMs), $lt: new Date(endMs) },
      };
      if (filter?.category) query['category'] = filter.category;
      if (filter?.severity) query['severity'] = filter.severity;

      const rows = await this.repo.find(query, { limit: 5000 });
      return rows.map((r) => ({
        eventId: r.eventId,
        timestamp: toIso(r.timestamp),
        ...(r.category ? { category: r.category } : {}),
        ...(r.severity ? { severity: r.severity } : {}),
        ...(r.source ? { source: r.source } : {}),
      }));
    } catch (error: unknown) {
      this.logger.debug(`Base-rate window query failed: ${(error as Error).message}`);
      return [];
    }
  }

  async timeRange(): Promise<{ earliestMs: number; latestMs: number } | null> {
    if (!this.initialized) return null;
    try {
      const [oldest] = await this.repo.find({}, { limit: 1, sort: { timestamp: 1 } });
      const [newest] = await this.repo.find({}, { limit: 1, sort: { timestamp: -1 } });
      if (!oldest || !newest) return null;

      const earliestMs = Date.parse(toIso(oldest.timestamp));
      const latestMs = Date.parse(toIso(newest.timestamp));
      if (!Number.isFinite(earliestMs) || !Number.isFinite(latestMs)) return null;
      return { earliestMs, latestMs };
    } catch {
      return null;
    }
  }
}

/** The port speaks ISO strings; the collection stores Dates. */
function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
