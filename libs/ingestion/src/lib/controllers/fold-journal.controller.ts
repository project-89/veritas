import { Controller, Get, Logger, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FoldJournalRepository } from '../repositories/fold-journal.repository';

/**
 * Read surface for the Fold change-record stream.
 *
 * Consumption is PULL, matching fold-sdk: a reader holds its own inclusive
 * `(t, eventId)` cursor and pages forward. That is what makes "any number of
 * stream readers" work — each keeps its own position, they cannot interfere,
 * a slow reader cannot back-pressure a fast one, and a reader that dies
 * resumes exactly where it stopped. There is no server-side subscription
 * state to get out of sync.
 */
@ApiTags('fold')
@Controller('fold')
export class FoldJournalController {
  private readonly logger = new Logger(FoldJournalController.name);

  constructor(private readonly journal: FoldJournalRepository) {}

  /**
   * GET /fold/events?afterT=&afterId=&limit=&workspace=&space=&kind=
   *
   * Returns records strictly after the supplied cursor, ascending. The
   * response carries the cursor to use next, so a reader never has to
   * reconstruct it from the payload.
   */
  @Get('events')
  @ApiOperation({ summary: 'Read Fold change records forward from a cursor' })
  async events(
    @Query('afterT') afterT?: string,
    @Query('afterId') afterId?: string,
    @Query('limit') limit?: string,
    @Query('workspace') workspace?: string,
    @Query('space') space?: string,
    @Query('kind') kind?: string,
  ): Promise<{
    events: unknown[];
    nextCursor: { t: number; eventId: string } | null;
    enabled: boolean;
  }> {
    if (!this.journal.enabled) {
      return { events: [], nextCursor: null, enabled: false };
    }

    const parsedT = afterT === undefined ? undefined : Number(afterT);
    // A cursor needs BOTH halves — t alone is ambiguous when several records
    // share a timestamp, which is exactly when a partial cursor would skip or
    // repeat records.
    const after =
      parsedT !== undefined && Number.isFinite(parsedT) && afterId
        ? { t: parsedT, eventId: afterId }
        : undefined;

    const entries = await this.journal.read({
      ...(after ? { after } : {}),
      ...(limit ? { limit: Number(limit) } : {}),
      ...(workspace ? { workspace } : {}),
      ...(space ? { space } : {}),
      ...(kind ? { kind } : {}),
    });

    const last = entries[entries.length - 1];
    return {
      events: entries.map((e) => e.event),
      nextCursor: last ? { t: last.t, eventId: last.eventId } : (after ?? null),
      enabled: true,
    };
  }

  /** GET /fold/cursor — the tail, for a reader that wants only new records. */
  @Get('cursor')
  @ApiOperation({ summary: 'Latest journal cursor' })
  async cursor(): Promise<{ cursor: { t: number; eventId: string } | null; enabled: boolean }> {
    return { cursor: await this.journal.latestCursor(), enabled: this.journal.enabled };
  }
}
