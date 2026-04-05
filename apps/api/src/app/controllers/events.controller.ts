import {
  Controller,
  Get,
  Logger,
  MessageEvent,
  NotFoundException,
  OnModuleInit,
  Param,
  Query,
  Sse,
} from '@nestjs/common';
import { GlobalEvent, GlobalEventAggregationService } from '@veritas/analysis';
import { GlobalEventRepository } from '@veritas/ingestion';
import { filter, interval, map, merge, Observable } from 'rxjs';

@Controller('events')
export class EventsController implements OnModuleInit {
  private readonly logger = new Logger(EventsController.name);

  constructor(
    private readonly aggregation: GlobalEventAggregationService,
    private readonly eventRepo: GlobalEventRepository,
  ) {}

  /**
   * Subscribe to the aggregation stream and persist every event to MongoDB.
   * This ensures /events/recent always has data even on page refresh.
   */
  onModuleInit() {
    this.aggregation.events$.subscribe(async (event) => {
      try {
        await this.eventRepo.upsertEvent(event);
      } catch (err) {
        this.logger.debug(`Failed to persist event ${event.id}: ${err}`);
      }
    });
    this.logger.log('Event persistence subscriber active — events will be stored to MongoDB');
  }

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
