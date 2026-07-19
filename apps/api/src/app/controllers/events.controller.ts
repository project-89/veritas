import {
  Controller,
  Get,
  MessageEvent,
  NotFoundException,
  Param,
  Query,
  Sse,
} from '@nestjs/common';
import {
  clusterGlobalEvents,
  dedupeGlobalEvents,
  GlobalEvent,
  GlobalEventAggregationService,
  type StoryCluster,
} from '@veritas/analysis';
import { GlobalEventRepository } from '@veritas/ingestion';
import { filter, interval, map, merge, Observable } from 'rxjs';

/** Feed dedup spans the retention window so repeated reports days apart collapse. */
const FEED_DEDUP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Micro-cache for hot read endpoints. /events/recent re-deduplicates and
 * /events/divergence re-clusters ~1000 documents per request; with several
 * clients polling, that work repeated per-request for identical answers.
 * TTLs are far below the source poll cadences (5–30min), so staleness is
 * bounded well under one data refresh.
 */
class MicroCache {
  private readonly entries = new Map<string, { value: unknown; expires: number }>();

  async get<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key);
    if (hit && hit.expires > Date.now()) return hit.value as T;
    const value = await compute();
    this.entries.set(key, { value, expires: Date.now() + ttlMs });
    // Opportunistic sweep so abandoned keys don't accumulate.
    if (this.entries.size > 200) {
      const now = Date.now();
      for (const [k, v] of this.entries) {
        if (v.expires <= now) this.entries.delete(k);
      }
    }
    return value;
  }
}

@Controller('events')
export class EventsController {
  private readonly cache = new MicroCache();

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
    const cacheKey = `recent:${requested}:${category ?? ''}:${region ?? ''}:${severity ?? ''}:${since ?? ''}`;
    return this.cache.get(cacheKey, 30_000, async () => {
      // Over-fetch, then collapse cross-source duplicates of the same real-world
      // event (multiple feeds mint distinct ids for one happening), so the caller
      // still gets up to `requested` DISTINCT events instead of a wall of dupes.
      const events = await this.eventRepo.getRecentEvents({
        limit: Math.min(requested * 4, 2000),
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
    });
  }

  /**
   * Divergence view: cluster recent news-feed events into stories covered by
   * multiple outlets, keeping only stories seen from 2+ perspective classes
   * (state-domestic / state-international / public-broadcaster / independent).
   * The framing gap between classes on the same story is the product.
   */
  @Get('divergence')
  async getDivergence(
    @Query('limit') limit?: string,
    @Query('windowHours') windowHours?: string,
  ): Promise<StoryCluster[]> {
    const requested = Math.min(Number(limit) || 20, 50);
    const windowMs = (Number(windowHours) || 48) * 60 * 60 * 1000;
    return this.cache.get(`divergence:${requested}:${windowMs}`, 120_000, async () => {
      const since = new Date(Date.now() - windowMs).toISOString();
      const events = await this.eventRepo.getRecentEvents({ limit: 2000, since });
      // News feeds only — signal sources (USGS, CoinGecko...) have no framing.
      const newsEvents = events.filter((e) => e.source.startsWith('RSS:'));

      return clusterGlobalEvents(newsEvents, { windowMs })
        .filter((story) => story.perspectives.length >= 2 && story.events.length >= 2)
        .sort(
          (a, b) =>
            b.perspectives.length - a.perspectives.length || b.events.length - a.events.length,
        )
        .slice(0, requested);
    });
  }

  /**
   * Surge detection: zones where the last 24h of activity is anomalously high
   * versus that zone's OWN prior-week baseline. Absolute density mostly
   * measures where our sources live (US-heavy feeds, Alaskan wildfire
   * clusters); a zone beating its own normal is actual signal.
   *
   * Honest abstention: with under ~48h of history every zone would look like
   * a surge (baseline 0), so the endpoint returns nothing until the retention
   * window has real depth, and a surge needs volume + 2 distinct sources.
   */
  @Get('surge')
  async getSurgeZones(): Promise<
    Array<{ lat: number; lng: number; recent24h: number; baselinePerDay: number; factor: number }>
  > {
    return this.cache.get('surge', 120_000, async () => {
      // Same 6° binning as the tactical hex grid, so markers align with cells.
      // Counting happens IN Mongo — fetching a week of raw events stopped
      // working once daily volume exceeded any reasonable fetch cap.
      const CELL_DEG = 6;
      const DAY_MS = 24 * 60 * 60 * 1000;
      const zones = await this.eventRepo.aggregateZoneActivity({
        cellDeg: CELL_DEG,
        sinceMs: 7 * DAY_MS,
        recentMs: DAY_MS,
      });
      if (zones.length === 0) return [];

      // Require real history before claiming anything is anomalous.
      const now = Date.now();
      const oldest = Math.min(...zones.map((z) => new Date(z.oldest).getTime() || now));
      if (now - oldest < 48 * 60 * 60 * 1000) return [];

      const priorDays = Math.max(1, Math.min(6, (now - DAY_MS - oldest) / DAY_MS));
      const MIN_RECENT = 4;
      const MIN_SOURCES = 2;
      const MIN_FACTOR = 2.5;

      return zones
        .map((z) => {
          const baselinePerDay = z.prior / priorDays;
          return {
            lat: 90 - (z.row + 0.5) * CELL_DEG,
            lng: -180 + (z.col + 0.5) * CELL_DEG,
            recent24h: z.recent,
            baselinePerDay: Math.round(baselinePerDay * 10) / 10,
            // Floor the baseline so an always-quiet zone needs real volume,
            // not 2 posts over 0, to register.
            factor: Math.round((z.recent / Math.max(baselinePerDay, 1)) * 10) / 10,
            sources: z.recentSources.length,
          };
        })
        .filter(
          (c) => c.recent24h >= MIN_RECENT && c.sources >= MIN_SOURCES && c.factor >= MIN_FACTOR,
        )
        .sort((a, b) => b.factor - a.factor)
        .slice(0, 12)
        .map(({ sources: _sources, ...zone }) => zone);
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
