import {
  Controller,
  Get,
  MessageEvent,
  NotFoundException,
  Param,
  Query,
  Sse,
} from '@nestjs/common';
import { dedupeGlobalEvents, GlobalEvent, GlobalEventAggregationService } from '@veritas/analysis';
import { GlobalEventRepository } from '@veritas/ingestion';
import { filter, interval, map, merge, Observable } from 'rxjs';

/** Feed dedup spans the retention window so repeated reports days apart collapse. */
const FEED_DEDUP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

@Controller('events')
export class EventsController {
  constructor(
    private readonly aggregation: GlobalEventAggregationService,
    private readonly eventRepo: GlobalEventRepository,
  ) {}

  /**
   * SSE endpoint — streams real-time GlobalEvents to connected clients.
   * Optional query params to filter:
   *   ?categories=environmental,political
   *   ?regions=us,europe
   */
  @Sse('stream')
  stream(
    @Query('categories') categories?: string,
    @Query('regions') regions?: string,
  ): Observable<MessageEvent> {
    const categorySet = categories
      ? new Set(categories.split(',').map((c) => c.trim().toLowerCase()))
      : null;

    const regionSet = regions
      ? new Set(regions.split(',').map((r) => r.trim().toLowerCase()))
      : null;

    const events$ = this.aggregation.events$.pipe(
      filter((event: GlobalEvent) => {
        if (categorySet && !categorySet.has(event.category)) return false;
        if (
          regionSet &&
          event.location.region &&
          !regionSet.has(event.location.region.toLowerCase())
        ) {
          return false;
        }
        return true;
      }),
      map(
        (event: GlobalEvent): MessageEvent => ({
          data: event,
          type: 'event',
          id: event.id,
        }),
      ),
    );

    // 30-second heartbeat to keep the connection alive
    const heartbeat$ = interval(30_000).pipe(
      map(
        (): MessageEvent => ({
          data: { type: 'heartbeat', timestamp: new Date().toISOString() },
          type: 'heartbeat',
        }),
      ),
    );

    return merge(events$, heartbeat$);
  }

  /**
   * Get recent events with optional filters.
   */
  @Get('recent')
  async getRecent(
    @Query('limit') limit?: string,
    @Query('category') category?: string,
    @Query('region') region?: string,
    @Query('severity') severity?: string,
    @Query('since') since?: string,
  ): Promise<GlobalEvent[]> {
    const requested = Number(limit) || 200;
    // Over-fetch, then collapse cross-source duplicates of the same real-world
    // event (multiple feeds mint distinct ids for one happening), so the caller
    // still gets up to `requested` DISTINCT events instead of a wall of dupes.
    const events = await this.eventRepo.getRecentEvents({
      limit: Math.min(requested * 4, 1000),
      category: category || undefined,
      region: region || undefined,
      severity: severity || undefined,
      since: since || undefined,
    });
    // Collapse across the whole retention window the feed spans (~7d), not just
    // the 12h ingestion window: the same place having the same kind of event
    // (repeated GDACS/USGS earthquake reports, etc.) should appear once in the
    // feed, even when the reports land days apart.
    return dedupeGlobalEvents(events, { windowMs: FEED_DEDUP_WINDOW_MS }).slice(0, requested);
  }

  /**
   * Get a single event by ID.
   */
  @Get(':id')
  async getEvent(@Param('id') id: string): Promise<GlobalEvent> {
    const event = await this.eventRepo.getEventById(id);
    if (!event) {
      throw new NotFoundException(`Event ${id} not found`);
    }
    return event;
  }
}
