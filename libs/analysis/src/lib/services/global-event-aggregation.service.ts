import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Observable, Subject } from 'rxjs';
import type { EventCategory, EventSeverity, GeoLocation, GlobalEvent } from '../types/global-event';
import { REGION_CENTROIDS, resolveCountryCode } from '../utils/geocoding';
import { contentTokens, locationAnchor, overlapCoefficient } from './utils/dedupe-global-events';
import { AcledAdapter } from './signal-adapters/acled.adapter';
import { CoinGeckoAdapter } from './signal-adapters/coingecko.adapter';
import { GdacsAdapter } from './signal-adapters/gdacs.adapter';
import { GdeltAdapter } from './signal-adapters/gdelt.adapter';
import { ReliefWebAdapter } from './signal-adapters/reliefweb.adapter';
import type { ExternalSignal } from './signal-adapters/signal-adapter.interface';
import { UsgsAdapter } from './signal-adapters/usgs.adapter';
/** Injection token for the global event repository (avoids cross-module dependency). */
export const GLOBAL_EVENT_REPOSITORY = Symbol('GLOBAL_EVENT_REPOSITORY');
export const GLOBAL_EVENT_RSS_FEEDS = Symbol('GLOBAL_EVENT_RSS_FEEDS');

export interface RssFeedEntry {
  name: string;
  url: string;
  category: string;
  tier: 1 | 2 | 3;
  language: string;
  region?: string;
}

interface EventRepository {
  upsertEvent(event: GlobalEvent): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USGS_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const GDELT_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes (GDELT rate-limits aggressively)
const ACLED_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const COINGECKO_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const GDACS_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const RELIEFWEB_INTERVAL_MS = 60 * 60 * 1000; // 60 minutes
const RSS_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const DEDUP_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_EVENT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CONTENT_DEDUP_WINDOW_MS = 12 * 60 * 60 * 1000; // 12h: same happening reported across sources
const CONTENT_DEDUP_OVERLAP = 0.5; // content-token overlap to treat as the same event
const MAX_CONTENT_SIGNATURES = 5000; // memory bound on the signature store

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Aggregates real-time events from USGS, GDELT, and ACLED signal adapters
 * into a unified GlobalEvent stream.
 *
 * - Polls each adapter at its own interval
 * - Normalizes adapter-specific ExternalSignal to GlobalEvent
 * - Deduplicates events using an in-memory sliding window
 * - Emits via RxJS Subject (events$ observable)
 * - Optionally persists to MongoDB via GlobalEventRepository
 */
@Injectable()
export class GlobalEventAggregationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GlobalEventAggregationService.name);

  // Adapters (stateless — instantiated directly)
  private readonly usgs = new UsgsAdapter();
  private readonly gdelt = new GdeltAdapter();
  private readonly acled = new AcledAdapter();
  private readonly coingecko = new CoinGeckoAdapter();
  private readonly gdacs = new GdacsAdapter();
  private readonly reliefweb = new ReliefWebAdapter();

  // Polling handles
  private usgsInterval: ReturnType<typeof setInterval> | null = null;
  private gdeltInterval: ReturnType<typeof setInterval> | null = null;
  private acledInterval: ReturnType<typeof setInterval> | null = null;
  private coingeckoInterval: ReturnType<typeof setInterval> | null = null;
  private gdacsInterval: ReturnType<typeof setInterval> | null = null;
  private reliefwebInterval: ReturnType<typeof setInterval> | null = null;
  private rssInterval: ReturnType<typeof setInterval> | null = null;

  // Deduplication: eventId → timestamp (ms)
  private readonly seen = new Map<string, number>();

  // Content-level dedup: signatures of recently accepted events, so the SAME
  // real-world happening arriving from a different source (a distinct id) is
  // suppressed instead of stacking up in the feed.
  private readonly recentSignatures: Array<{
    tokens: Set<string>;
    anchor: string;
    category: EventCategory;
    time: number;
  }> = [];

  // RxJS event stream
  private readonly subject = new Subject<GlobalEvent>();
  readonly events$: Observable<GlobalEvent> = this.subject.asObservable();
  private initialPollTimeouts: Array<ReturnType<typeof setTimeout>> = [];

  constructor(
    private readonly moduleRef: ModuleRef,
    @Optional() @Inject(GLOBAL_EVENT_REPOSITORY) private eventRepo?: EventRepository,
    @Optional() @Inject(GLOBAL_EVENT_RSS_FEEDS) private readonly rssFeeds: RssFeedEntry[] = [],
  ) {}

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  onModuleInit(): void {
    if (!this.eventRepo) {
      try {
        this.eventRepo = this.moduleRef.get<EventRepository>(GLOBAL_EVENT_REPOSITORY, {
          strict: false,
        });
      } catch {
        // Best effort fallback; service can still stream live events without persistence.
      }
    }

    this.logger.log(
      `Starting global event aggregation (persistence: ${this.eventRepo ? 'enabled' : 'DISABLED — GLOBAL_EVENT_REPOSITORY not injected'})`,
    );

    // Stagger initial polls to avoid thundering herd / rate limits
    void this.pollUsgs();
    this.scheduleInitialPoll(() => void this.pollCoingecko(), 10_000);
    this.scheduleInitialPoll(() => void this.pollRss(), 20_000);
    this.scheduleInitialPoll(() => void this.pollGdelt(), 60_000);
    this.scheduleInitialPoll(() => void this.pollGdacs(), 75_000);
    this.scheduleInitialPoll(() => void this.pollReliefweb(), 80_000);

    // ACLED polling — disabled by default (requires API key setup)
    const acledEnabled = process.env['ACLED_ENABLED'] === 'true';
    if (acledEnabled) {
      this.scheduleInitialPoll(() => void this.pollAcled(), 90_000);
      this.acledInterval = setInterval(() => void this.pollAcled(), ACLED_INTERVAL_MS);
      this.acledInterval.unref?.();
    } else {
      this.logger.log('ACLED polling disabled (set ACLED_ENABLED=true to enable)');
    }

    // Set up recurring intervals
    this.usgsInterval = setInterval(() => void this.pollUsgs(), USGS_INTERVAL_MS);
    this.usgsInterval.unref?.();
    this.gdeltInterval = setInterval(() => void this.pollGdelt(), GDELT_INTERVAL_MS);
    this.gdeltInterval.unref?.();
    this.coingeckoInterval = setInterval(() => void this.pollCoingecko(), COINGECKO_INTERVAL_MS);
    this.coingeckoInterval.unref?.();
    this.gdacsInterval = setInterval(() => void this.pollGdacs(), GDACS_INTERVAL_MS);
    this.gdacsInterval.unref?.();
    this.reliefwebInterval = setInterval(() => void this.pollReliefweb(), RELIEFWEB_INTERVAL_MS);
    this.reliefwebInterval.unref?.();
    this.rssInterval = setInterval(() => void this.pollRss(), RSS_INTERVAL_MS);
    this.rssInterval.unref?.();
  }

  onModuleDestroy(): void {
    this.initialPollTimeouts.forEach((timeout) => {
      clearTimeout(timeout);
    });
    this.initialPollTimeouts = [];
    if (this.rssInterval) clearInterval(this.rssInterval);
    if (this.coingeckoInterval) clearInterval(this.coingeckoInterval);
    if (this.usgsInterval) clearInterval(this.usgsInterval);
    if (this.gdeltInterval) clearInterval(this.gdeltInterval);
    if (this.acledInterval) clearInterval(this.acledInterval);
    if (this.gdacsInterval) clearInterval(this.gdacsInterval);
    if (this.reliefwebInterval) clearInterval(this.reliefwebInterval);
    this.subject.complete();
    this.logger.log('Global event aggregation stopped');
  }

  private scheduleInitialPoll(task: () => void, delayMs: number): void {
    const timeout = setTimeout(task, delayMs);
    timeout.unref?.();
    this.initialPollTimeouts.push(timeout);
  }

  // ---------------------------------------------------------------------------
  // Polling
  // ---------------------------------------------------------------------------

  private async pollUsgs(): Promise<void> {
    try {
      const now = new Date();
      const signals = await this.usgs.fetchSignals({
        keywords: [],
        startDate: new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString(),
        endDate: now.toISOString(),
      });

      const events = signals
        .map((s) => this.normalizeUsgs(s))
        .filter((e): e is GlobalEvent => e !== null);

      await this.processEvents(events);
      this.logger.debug(`USGS poll: ${events.length} events`);
    } catch (err) {
      this.logger.error(`USGS poll error: ${err}`);
    }
  }

  private async pollGdelt(): Promise<void> {
    try {
      const now = new Date();
      const signals = await this.gdelt.fetchSignals({
        keywords: ['conflict', 'crisis', 'disaster', 'protest', 'election'],
        startDate: new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString(),
        endDate: now.toISOString(),
      });

      const events = signals
        .map((s) => this.normalizeGdelt(s))
        .filter((e): e is GlobalEvent => e !== null);

      await this.processEvents(events);
      this.logger.debug(`GDELT poll: ${events.length} events`);
    } catch (err) {
      this.logger.error(`GDELT poll error: ${err}`);
    }
  }

  private async pollAcled(): Promise<void> {
    try {
      const now = new Date();
      const signals = await this.acled.fetchSignals({
        keywords: [],
        startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        endDate: now.toISOString(),
      });

      const events = signals
        .map((s) => this.normalizeAcled(s))
        .filter((e): e is GlobalEvent => e !== null);

      await this.processEvents(events);
      this.logger.debug(`ACLED poll: ${events.length} events`);
    } catch (err) {
      this.logger.error(`ACLED poll error: ${err}`);
    }
  }

  private async pollRss(): Promise<void> {
    try {
      // Only poll tier-1 feeds for the world map (most important ~15 feeds)
      const tier1Feeds = this.rssFeeds.filter((feed) => feed.tier === 1);
      const events: GlobalEvent[] = [];
      const now = new Date();

      // Fetch in batches of 5 to avoid overwhelming
      for (let i = 0; i < tier1Feeds.length; i += 5) {
        const batch = tier1Feeds.slice(i, i + 5);
        const results = await Promise.allSettled(
          batch.map(async (feed) => {
            try {
              const Parser = (await import('rss-parser')).default;
              const parser = new Parser({ timeout: 10000 });
              const parsed = await parser.parseURL(feed.url);
              return { feed, items: parsed.items ?? [] };
            } catch {
              return { feed, items: [] };
            }
          }),
        );

        for (const result of results) {
          if (result.status !== 'fulfilled') continue;
          const { feed, items } = result.value;

          // Only items from last 2 hours
          const cutoff = now.getTime() - 2 * 60 * 60 * 1000;

          for (const item of items.slice(0, 5)) {
            // Max 5 per feed
            const pubDate = item.pubDate ? new Date(item.pubDate).getTime() : 0;
            if (pubDate < cutoff) continue;

            const title = item.title ?? 'Untitled';
            const id = `rss-${feed.name}-${title.slice(0, 50).replace(/\W/g, '-').toLowerCase()}`;

            // Resolve location from feed region
            const region = feed.region ?? 'global';
            const centroid = REGION_CENTROIDS[region] ??
              REGION_CENTROIDS['global'] ?? { lat: 20, lng: 0 };

            // Classify category from feed category
            let category: EventCategory = 'media';
            if (
              [
                'us_politics',
                'europe',
                'middle_east',
                'africa',
                'latin_america',
                'asia_pacific',
              ].includes(feed.category)
            ) {
              category = 'political';
            } else if (['finance', 'crypto', 'energy'].includes(feed.category)) {
              category = 'economic';
            } else if (['science_health'].includes(feed.category)) {
              category = 'environmental';
            }

            // Deterministic de-overlap jitter derived from the event id, so a
            // given event renders at a STABLE position (region-anchored) rather
            // than jumping around the map on every reload.
            let h = 0;
            for (let ci = 0; ci < id.length; ci++) h = (h * 31 + id.charCodeAt(ci)) | 0;
            const jitterLat = ((h % 1000) / 1000 - 0.5) * 8;
            const jitterLng = (((h >> 10) % 1000) / 1000 - 0.5) * 12;

            events.push({
              id,
              source: `RSS:${feed.name}`,
              category,
              severity: feed.tier === 1 ? 'medium' : 'low',
              title,
              description: this.getEventDescription(
                item.contentSnippet?.slice(0, 300) ??
                  item.content?.replace(/<[^>]+>/g, ' ').slice(0, 300),
                title,
                `RSS:${feed.name}`,
              ),
              timestamp: item.pubDate ?? now.toISOString(),
              location: {
                lat: centroid.lat + jitterLat,
                lng: centroid.lng + jitterLng,
                label: feed.region ?? 'Global',
                region,
              },
              magnitude: feed.tier === 1 ? 0.5 : 0.3,
              metadata: {
                feedName: feed.name,
                feedCategory: feed.category,
                feedTier: feed.tier,
                link: item.link,
              },
              expiresAt: new Date(Date.now() + DEFAULT_EVENT_TTL_MS).toISOString(),
            });
          }
        }
      }

      await this.processEvents(events);
      this.logger.debug(`RSS poll: ${events.length} events from ${tier1Feeds.length} tier-1 feeds`);
    } catch (err) {
      this.logger.error(`RSS poll error: ${err}`);
    }
  }

  private async pollCoingecko(): Promise<void> {
    try {
      const now = new Date();
      const signals = await this.coingecko.fetchSignals({
        keywords: [],
        startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        endDate: now.toISOString(),
      });

      // CoinGecko signals are global market data — create events for significant movers
      const events: GlobalEvent[] = signals
        .filter((s) => s.magnitude >= 0.3) // Only significant moves
        .map((s) => {
          const priceChange =
            (s.metadata?.['price_change_percentage_24h'] as number) ??
            (s.metadata?.['price_change_24h'] as number) ??
            0;
          const direction = priceChange >= 0 ? 'up' : 'down';
          const symbol = (s.metadata?.['symbol'] as string)?.toUpperCase() ?? '???';
          const isTrending = Number((s.metadata?.['trending_score'] as number) ?? 0) > 0;
          const title =
            isTrending && priceChange === 0
              ? `[Trending] ${symbol}`
              : `${symbol} ${direction} ${Math.abs(priceChange).toFixed(1)}% in 24h`;

          return {
            id: `coingecko-${s.id}`,
            source: 'CoinGecko',
            category: 'economic' as EventCategory,
            severity: (s.magnitude >= 0.7
              ? 'high'
              : s.magnitude >= 0.5
                ? 'medium'
                : 'low') as EventSeverity,
            title,
            description: this.getEventDescription(s.description, title, 'CoinGecko'),
            timestamp: s.timestamp,
            location: { lat: 20, lng: 0, label: 'Global', region: 'global' }, // Crypto is global
            magnitude: s.magnitude,
            metadata: s.metadata,
            expiresAt: new Date(Date.now() + DEFAULT_EVENT_TTL_MS).toISOString(),
          };
        });

      await this.processEvents(events);
      this.logger.debug(`CoinGecko poll: ${events.length} events`);
    } catch (err) {
      this.logger.error(`CoinGecko poll error: ${err}`);
    }
  }

  private async pollGdacs(): Promise<void> {
    try {
      const now = new Date();
      const signals = await this.gdacs.fetchSignals({
        keywords: [],
        startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        endDate: now.toISOString(),
      });

      const events = signals
        .map((s) => this.normalizeGdacs(s))
        .filter((e): e is GlobalEvent => e !== null);

      await this.processEvents(events);
      this.logger.debug(`GDACS poll: ${events.length} events`);
    } catch (err) {
      this.logger.error(`GDACS poll error: ${err}`);
    }
  }

  private async pollReliefweb(): Promise<void> {
    try {
      const now = new Date();
      const signals = await this.reliefweb.fetchSignals({
        keywords: [],
        startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        endDate: now.toISOString(),
      });

      const events = signals
        .map((s) => this.normalizeReliefweb(s))
        .filter((e): e is GlobalEvent => e !== null);

      await this.processEvents(events);
      this.logger.debug(`ReliefWeb poll: ${events.length} events`);
    } catch (err) {
      this.logger.error(`ReliefWeb poll error: ${err}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Processing
  // ---------------------------------------------------------------------------

  private async processEvents(events: GlobalEvent[]): Promise<void> {
    this.pruneDedup();

    for (const event of events) {
      const normalizedEvent = this.sanitizeEvent(event);

      if (this.isDuplicate(normalizedEvent.id)) continue;
      if (this.isContentDuplicate(normalizedEvent)) continue;

      this.seen.set(normalizedEvent.id, Date.now());
      this.subject.next(normalizedEvent);

      // Persist if repository is available
      if (this.eventRepo) {
        try {
          await this.eventRepo.upsertEvent(normalizedEvent);
        } catch (err) {
          this.logger.warn(`Failed to persist event ${normalizedEvent.id}: ${err}`);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Deduplication
  // ---------------------------------------------------------------------------

  private isDuplicate(eventId: string): boolean {
    return this.seen.has(eventId);
  }

  /**
   * True when this event describes the same happening (same category, location
   * anchor, similar title, close in time) as one already accepted in the window
   * — even though it carries a different source id.
   */
  private isContentDuplicate(event: GlobalEvent): boolean {
    const tokens = contentTokens(event.title, event.location?.label);
    if (tokens.size === 0) return false; // can't judge — keep it
    const anchor = locationAnchor(event.location);
    const time = new Date(event.timestamp).getTime();

    for (const sig of this.recentSignatures) {
      if (sig.category !== event.category) continue;
      if (sig.anchor !== anchor) continue;
      if (Number.isFinite(time) && Math.abs(sig.time - time) > CONTENT_DEDUP_WINDOW_MS) continue;
      if (overlapCoefficient(tokens, sig.tokens) >= CONTENT_DEDUP_OVERLAP) return true;
    }

    this.recentSignatures.push({ tokens, anchor, category: event.category, time });
    return false;
  }

  /** Remove entries older than the dedup window. */
  private pruneDedup(): void {
    const cutoff = Date.now() - DEDUP_WINDOW_MS;
    for (const [id, ts] of this.seen) {
      if (ts < cutoff) {
        this.seen.delete(id);
      }
    }
    // Bound the signature store. Correctness is enforced by the per-event time
    // check in isContentDuplicate (events far apart in time never match), so
    // this only caps memory — drop the oldest-inserted signatures past the cap.
    if (this.recentSignatures.length > MAX_CONTENT_SIGNATURES) {
      this.recentSignatures.splice(0, this.recentSignatures.length - MAX_CONTENT_SIGNATURES);
    }
  }

  private sanitizeEvent(event: GlobalEvent): GlobalEvent {
    return {
      ...event,
      title: event.title?.trim() || `${event.source} event`,
      description: this.getEventDescription(event.description, event.title, event.source),
      location: this.sanitizeLocation(event.location),
    };
  }

  private getEventDescription(
    description: string | null | undefined,
    title: string,
    source: string,
  ): string {
    const trimmed = description?.trim();
    if (trimmed) return trimmed;

    const cleanTitle = title?.trim() || 'Untitled event';
    return `${source}: ${cleanTitle}`;
  }

  private sanitizeLocation(location: GeoLocation): GeoLocation {
    const lat = Number.isFinite(location.lat) ? Math.max(-90, Math.min(90, location.lat)) : 0;
    const lng = Number.isFinite(location.lng)
      ? ((((location.lng + 180) % 360) + 360) % 360) - 180
      : 0;

    return {
      ...location,
      lat,
      lng,
      label: location.label?.trim() || location.region?.trim() || 'Unknown',
    };
  }

  // ---------------------------------------------------------------------------
  // Normalization — USGS
  // ---------------------------------------------------------------------------

  private normalizeUsgs(signal: ExternalSignal): GlobalEvent | null {
    const coords = signal.metadata['coordinates'] as
      | { latitude?: number; longitude?: number }
      | undefined;

    const lat = coords?.latitude ?? 0;
    const lng = coords?.longitude ?? 0;
    const mag = (signal.metadata['mag'] as number) ?? 0;

    const location: GeoLocation = {
      lat,
      lng,
      label: (signal.metadata['place'] as string) || 'Unknown',
    };

    return {
      id: signal.id,
      source: 'USGS',
      category: 'environmental' as EventCategory,
      severity: this.usgsSevseverity(mag),
      title: signal.title,
      description: this.getEventDescription(signal.description, signal.title, 'USGS'),
      timestamp: signal.timestamp,
      location,
      magnitude: signal.magnitude,
      metadata: signal.metadata,
      expiresAt: new Date(Date.now() + DEFAULT_EVENT_TTL_MS).toISOString(),
    };
  }

  private usgsSevseverity(mag: number): EventSeverity {
    if (mag >= 7.5) return 'critical';
    if (mag >= 6.0) return 'high';
    if (mag >= 5.0) return 'medium';
    return 'low';
  }

  // ---------------------------------------------------------------------------
  // Normalization — ACLED
  // ---------------------------------------------------------------------------

  private normalizeAcled(signal: ExternalSignal): GlobalEvent | null {
    const country = (signal.metadata['country'] as string) || '';
    const resolved = resolveCountryCode(country);

    const location: GeoLocation = resolved
      ? {
          lat: resolved.lat,
          lng: resolved.lng,
          label: resolved.label,
          countryCode: country,
          region: (signal.metadata['region'] as string) || undefined,
        }
      : {
          lat: 0,
          lng: 0,
          label: country || 'Unknown',
          region: (signal.metadata['region'] as string) || undefined,
        };

    const fatalities = (signal.metadata['fatalities'] as number) ?? 0;

    return {
      id: signal.id,
      source: 'ACLED',
      category: 'political' as EventCategory,
      severity: this.acledSeverity(fatalities),
      title: signal.title,
      description: this.getEventDescription(signal.description, signal.title, 'ACLED'),
      timestamp: signal.timestamp,
      location,
      magnitude: signal.magnitude,
      metadata: signal.metadata,
      expiresAt: new Date(Date.now() + DEFAULT_EVENT_TTL_MS).toISOString(),
    };
  }

  private acledSeverity(fatalities: number): EventSeverity {
    if (fatalities >= 50) return 'critical';
    if (fatalities >= 10) return 'high';
    if (fatalities >= 1) return 'medium';
    return 'low';
  }

  // ---------------------------------------------------------------------------
  // Normalization — GDELT
  // ---------------------------------------------------------------------------

  private normalizeGdelt(signal: ExternalSignal): GlobalEvent | null {
    const country = (signal.metadata['country'] as string) || '';
    const resolved = resolveCountryCode(country);

    const location: GeoLocation = resolved
      ? {
          lat: resolved.lat,
          lng: resolved.lng,
          label: resolved.label,
          countryCode: country,
        }
      : {
          lat: 0,
          lng: 0,
          label: country || 'Unknown',
        };

    const tone = Math.abs((signal.metadata['tone'] as number) ?? 0);

    return {
      id: signal.id,
      source: 'GDELT',
      category: 'media' as EventCategory,
      severity: this.gdeltSeverity(tone),
      title: signal.title,
      description: this.getEventDescription(signal.description, signal.title, 'GDELT'),
      timestamp: signal.timestamp,
      location,
      magnitude: signal.magnitude,
      metadata: signal.metadata,
      expiresAt: new Date(Date.now() + DEFAULT_EVENT_TTL_MS).toISOString(),
    };
  }

  private gdeltSeverity(absTone: number): EventSeverity {
    if (absTone >= 15) return 'critical';
    if (absTone >= 10) return 'high';
    if (absTone >= 5) return 'medium';
    return 'low';
  }

  // ---------------------------------------------------------------------------
  // Normalization — GDACS
  // ---------------------------------------------------------------------------

  private normalizeGdacs(signal: ExternalSignal): GlobalEvent | null {
    const coords = signal.metadata['coordinates'] as
      | { latitude?: number; longitude?: number }
      | undefined;

    const lat = coords?.latitude ?? 0;
    const lng = coords?.longitude ?? 0;

    const location: GeoLocation = {
      lat,
      lng,
      label: (signal.metadata['country'] as string) || signal.title || 'Unknown',
    };

    return {
      id: signal.id,
      source: 'GDACS',
      category: 'environmental' as EventCategory,
      severity: this.gdacsSeverity(signal.magnitude),
      title: signal.title,
      description: this.getEventDescription(signal.description, signal.title, 'GDACS'),
      timestamp: signal.timestamp,
      location,
      magnitude: signal.magnitude,
      metadata: signal.metadata,
      expiresAt: new Date(Date.now() + DEFAULT_EVENT_TTL_MS).toISOString(),
    };
  }

  private gdacsSeverity(magnitude: number): EventSeverity {
    if (magnitude >= 0.9) return 'critical';
    if (magnitude >= 0.7) return 'high';
    if (magnitude >= 0.4) return 'medium';
    return 'low';
  }

  // ---------------------------------------------------------------------------
  // Normalization — ReliefWeb
  // ---------------------------------------------------------------------------

  private normalizeReliefweb(signal: ExternalSignal): GlobalEvent | null {
    const country = (signal.metadata['country'] as string) || '';
    const resolved = resolveCountryCode(country);

    const location: GeoLocation = resolved
      ? {
          lat: resolved.lat,
          lng: resolved.lng,
          label: resolved.label,
          countryCode: country,
        }
      : {
          lat: 0,
          lng: 0,
          label: country || 'Unknown',
        };

    return {
      id: signal.id,
      source: 'ReliefWeb',
      category: 'political' as EventCategory,
      severity: this.reliefwebSeverity(signal.magnitude),
      title: signal.title,
      description: this.getEventDescription(signal.description, signal.title, 'ReliefWeb'),
      timestamp: signal.timestamp,
      location,
      magnitude: signal.magnitude,
      metadata: signal.metadata,
      expiresAt: new Date(Date.now() + DEFAULT_EVENT_TTL_MS).toISOString(),
    };
  }

  private reliefwebSeverity(magnitude: number): EventSeverity {
    if (magnitude >= 0.9) return 'critical';
    if (magnitude >= 0.7) return 'high';
    if (magnitude >= 0.5) return 'medium';
    return 'low';
  }
}
