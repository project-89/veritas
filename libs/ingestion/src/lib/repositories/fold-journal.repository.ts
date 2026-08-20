import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { DatabaseService, Repository } from '@veritas/database';
import type { FoldEvent } from '@veritas/shared/utils';
import { type FoldJournalEntry, FoldJournalModel } from '../schemas/fold-journal.schema';

/** Inclusive cursor, matching fold-sdk's `(t, eventId)` semantics. */
export interface FoldCursor {
  t: number;
  eventId: string;
}

export interface FoldReadOptions {
  /** Return records strictly AFTER this position. Omit to read from the start. */
  after?: FoldCursor;
  limit?: number;
  workspace?: string;
  space?: string;
  kind?: string;
}

/**
 * Append-only journal of Fold change records, readable by cursor.
 *
 * This is the integration surface: Veritas appends, and any number of
 * independent readers page through with their own `(t, eventId)` cursor. Fold
 * itself performs no I/O — consumption is pull-based journal reads, not
 * pub/sub — so a durable ordered log is exactly the right shape.
 *
 * Appends are idempotent on `eventId`: re-emitting the same event is a no-op
 * rather than a duplicate, so a replay or an overlapping poll cannot corrupt
 * a reader's view.
 */
@Injectable()
export class FoldJournalRepository implements OnModuleInit {
  private readonly logger = new Logger(FoldJournalRepository.name);
  private repo!: Repository<FoldJournalEntry>;
  private initialized = false;

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  async onModuleInit() {
    if (!this.databaseService) {
      this.logger.warn('No DatabaseService — Fold journal disabled, events will not be emitted');
      return;
    }
    try {
      try {
        this.databaseService.registerModel('FoldJournal', FoldJournalModel);
      } catch {
        this.logger.debug('FoldJournal model already registered');
      }
      this.repo = this.databaseService.getRepository<FoldJournalEntry>('FoldJournal');
      this.initialized = true;
      this.logger.log('Fold journal initialized');
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Failed to initialize Fold journal: ${err.message}`, err.stack);
    }
  }

  get enabled(): boolean {
    return this.initialized;
  }

  /**
   * Append events. Returns how many were newly written.
   *
   * Never throws: emission is a side channel, and a journal problem must not
   * fail the ingest that produced the event.
   */
  async append(events: FoldEvent[]): Promise<number> {
    if (!this.initialized || events.length === 0) return 0;
    let written = 0;
    for (const event of events) {
      try {
        const existing = await this.repo.find({ eventId: event.id } as Record<string, unknown>, {
          limit: 1,
        });
        if (existing.length > 0) continue;

        await this.repo.create({
          eventId: event.id,
          t: event.at.t,
          workspace: event.capture.scope.workspace,
          space: event.capture.scope.space ?? null,
          kind: event.kind,
          event: event as unknown as Record<string, unknown>,
        });
        written++;
      } catch (error: unknown) {
        const err = error as Error;
        // A unique-index collision means a concurrent writer got there first,
        // which is the idempotent outcome we wanted anyway.
        this.logger.debug(`Fold journal append skipped for ${event.id}: ${err.message}`);
      }
    }
    if (written > 0) this.logger.debug(`Fold journal: appended ${written} record(s)`);
    return written;
  }

  /**
   * Read forward from a cursor, ascending by `(t, eventId)`.
   *
   * The tie-break on eventId is what makes the cursor total: without it,
   * events sharing a timestamp could be skipped or repeated across pages.
   */
  async read(options: FoldReadOptions = {}): Promise<FoldJournalEntry[]> {
    if (!this.initialized) return [];
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 1000);

    const filter: Record<string, unknown> = {};
    if (options.workspace) filter['workspace'] = options.workspace;
    if (options.space) filter['space'] = options.space;
    if (options.kind) filter['kind'] = options.kind;
    if (options.after) {
      filter['$or'] = [
        { t: { $gt: options.after.t } },
        { t: options.after.t, eventId: { $gt: options.after.eventId } },
      ];
    }

    try {
      return await this.repo.find(filter, { limit, sort: { t: 1, eventId: 1 } });
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Fold journal read failed: ${err.message}`);
      return [];
    }
  }

  /** Cursor for the last entry, so a reader can start at the tail. */
  async latestCursor(): Promise<FoldCursor | null> {
    if (!this.initialized) return null;
    try {
      const rows = await this.repo.find({}, { limit: 1, sort: { t: -1, eventId: -1 } });
      const last = rows[0];
      return last ? { t: last.t, eventId: last.eventId } : null;
    } catch {
      return null;
    }
  }
}
