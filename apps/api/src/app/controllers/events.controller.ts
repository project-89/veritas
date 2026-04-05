import {
  Controller,
  Get,
  Param,
  Query,
  Sse,
  MessageEvent,
  NotFoundException,
} from '@nestjs/common';
import { Observable, map, merge, interval, filter } from 'rxjs';
import {
  GlobalEventAggregationService,
  GlobalEvent,
} from '@veritas/analysis';
import { GlobalEventRepository } from '@veritas/ingestion';

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
    return this.eventRepo.getRecentEvents({
      limit: Number(limit) || 200,
      category: category || undefined,
      region: region || undefined,
      severity: severity || undefined,
      since: since || undefined,
    });
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
