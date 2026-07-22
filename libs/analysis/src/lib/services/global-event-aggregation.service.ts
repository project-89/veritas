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
import { geocodeFromText, REGION_CENTROIDS, resolveCountryCode } from '../utils/geocoding';
import { contentTokens, overlapCoefficient, sameLocation } from './utils/dedupe-global-events';
import { AcledAdapter } from './signal-adapters/acled.adapter';
import { CoinGeckoAdapter } from './signal-adapters/coingecko.adapter';
import { EonetAdapter } from './signal-adapters/eonet.adapter';
import { GdacsAdapter } from './signal-adapters/gdacs.adapter';
import { GdeltAdapter } from './signal-adapters/gdelt.adapter';
import { GfwMaritimeAdapter } from './signal-adapters/gfw-maritime.adapter';
import { NwsAdapter } from './signal-adapters/nws.adapter';
import type { ExternalSignal } from './signal-adapters/signal-adapter.interface';
import { UsgsAdapter } from './signal-adapters/usgs.adapter';
import { WeatherAdapter } from './signal-adapters/weather.adapter';
import { TranslationService } from './translation.service';
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
  /** Editorial control (structural, bloc-agnostic — see rss-feed-catalog). */
  ownership?: 'independent' | 'public-broadcaster' | 'state-media' | 'state-official';
  /** Who the outlet talks to: its own population or the outside world. */
  audience?: 'domestic' | 'international';
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
const EONET_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes (open events change slowly)
const NWS_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const GFW_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes (maritime intelligence, token-gated)
const WEATHER_INTERVAL_MS = 60 * 60 * 1000; // 60 minutes (severe-weather conditions)
const RSS_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const RSS_MAX_AGE_MS = 24 * 60 * 60 * 1000; // keep feed items from the last 24h
const DEDUP_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_EVENT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CONTENT_DEDUP_WINDOW_MS = 12 * 60 * 60 * 1000; // 12h: same happening reported across sources
const CONTENT_DEDUP_OVERLAP = 0.5; // content-token overlap to treat as the same event
const MAX_CONTENT_SIGNATURES = 5000; // memory bound on the signature store

/** The global-event signal sources this service polls, with their cadences.
 *  Served by /capabilities — defined HERE, next to the interval constants,
 *  so the reported list cannot drift from what actually runs. */
export const GLOBAL_EVENT_SIGNAL_SOURCES: ReadonlyArray<{
  name: string;
  kind: 'geophysical' | 'disaster' | 'weather' | 'conflict' | 'news' | 'market' | 'feeds';
  intervalMinutes: number;
}> = [
  { name: 'USGS Earthquakes', kind: 'geophysical', intervalMinutes: USGS_INTERVAL_MS / 60_000 },
  { name: 'GDACS Disasters', kind: 'disaster', intervalMinutes: GDACS_INTERVAL_MS / 60_000 },
  { name: 'NASA EONET', kind: 'disaster', intervalMinutes: EONET_INTERVAL_MS / 60_000 },
  { name: 'NOAA/NWS Alerts', kind: 'weather', intervalMinutes: NWS_INTERVAL_MS / 60_000 },
  { name: 'Open-Meteo Severe Weather', kind: 'weather', intervalMinutes: WEATHER_INTERVAL_MS / 60_000 },
  { name: 'ACLED Conflict', kind: 'conflict', intervalMinutes: ACLED_INTERVAL_MS / 60_000 },
  { name: 'GDELT News', kind: 'news', intervalMinutes: GDELT_INTERVAL_MS / 60_000 },
  { name: 'CoinGecko Markets', kind: 'market', intervalMinutes: COINGECKO_INTERVAL_MS / 60_000 },
  { name: 'RSS Tier-1 Feeds', kind: 'feeds', intervalMinutes: RSS_INTERVAL_MS / 60_000 },
];

/** Minimal HTML entity decode for feed titles ("BTS&apos; halftime show"). */
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&apos;|&#0?39;/g, "'")
    .replace(/&quot;|&#0?34;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

/** "south_korea" → "South Korea" — region slugs are not user-facing labels. */
function humanizeRegion(region: string): string {
  return region
    .split(/[_\s]+/)
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0]?.toUpperCase() + w.slice(1)))
    .join(' ');
}

/** Publication date recovered from an article URL (many CMSs embed
 *  /YYYY/MM/DD/). The only date source for feeds whose items carry none
 *  (e.g. Press TV) — without it those items would re-read as "fresh" and be
 *  re-timestamped on every poll. */
function dateFromUrl(link: string | undefined): Date | null {
  if (!link) return null;
  const m = link.match(/\/(20\d{2})\/(\d{2})\/(\d{2})(?:\/|$)/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Place name for an EONET event: "Wildfire Bear, Denali, Alaska" → "Denali,
 *  Alaska"; nameless titles fall back to a headline geocode, then coordinates. */
function eonetPlaceLabel(title: string, lat: number, lng: number): string {
  const commaIdx = title.indexOf(', ');
  if (commaIdx !== -1) {
    const place = title.slice(commaIdx + 2).trim();
    if (place.length >= 3) return place;
  }
  const geo = geocodeFromText(title);
  if (geo) return geo.label;
  return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lng).toFixed(1)}°${lng >= 0 ? 'E' : 'W'}`;
}

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
  private readonly eonet = new EonetAdapter();
  private readonly nws = new NwsAdapter();
  private readonly gfw = new GfwMaritimeAdapter();
  private readonly weather = new WeatherAdapter();

  // Polling handles
  private usgsInterval: ReturnType<typeof setInterval> | null = null;
  private gdeltInterval: ReturnType<typeof setInterval> | null = null;
  private acledInterval: ReturnType<typeof setInterval> | null = null;
  private coingeckoInterval: ReturnType<typeof setInterval> | null = null;
  private gdacsInterval: ReturnType<typeof setInterval> | null = null;
  private eonetInterval: ReturnType<typeof setInterval> | null = null;
  private nwsInterval: ReturnType<typeof setInterval> | null = null;
  private gfwInterval: ReturnType<typeof setInterval> | null = null;
  private weatherInterval: ReturnType<typeof setInterval> | null = null;
  private rssInterval: ReturnType<typeof setInterval> | null = null;

  // Deduplication: eventId → timestamp (ms)
  private readonly seen = new Map<string, number>();

  // Content-level dedup: signatures of recently accepted events, so the SAME
  // real-world happening arriving from a different source (a distinct id) is
  // suppressed instead of stacking up in the feed.
  private readonly recentSignatures: Array<{
    tokens: Set<string>;
    location: GeoLocation;
    category: EventCategory;
    time: number;
    source: string;
  }> = [];

  // RxJS event stream
  private readonly subject = new Subject<GlobalEvent>();
  readonly events$: Observable<GlobalEvent> = this.subject.asObservable();
  private initialPollTimeouts: Array<ReturnType<typeof setTimeout>> = [];

  constructor(
    private readonly moduleRef: ModuleRef,
    @Optional() @Inject(GLOBAL_EVENT_REPOSITORY) private eventRepo?: EventRepository,
    @Optional() @Inject(GLOBAL_EVENT_RSS_FEEDS) private readonly rssFeeds: RssFeedEntry[] = [],
    @Optional() private readonly translator?: TranslationService,
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
    this.scheduleInitialPoll(() => void this.pollEonet(), 30_000);
    this.scheduleInitialPoll(() => void this.pollNws(), 45_000);
    this.scheduleInitialPoll(() => void this.pollWeather(), 55_000);

    // ACLED polling — disabled by default (requires API key setup)
    // Auto-enable when credentials are present (consistent with GFW/AISStream);
    // ACLED_ENABLED=false can still force it off.
    const acledEnabled =
      Boolean(process.env['ACLED_USERNAME'] && process.env['ACLED_PASSWORD']) &&
      process.env['ACLED_ENABLED'] !== 'false';
    if (acledEnabled) {
      this.scheduleInitialPoll(() => void this.pollAcled(), 90_000);
      this.acledInterval = setInterval(() => void this.pollAcled(), ACLED_INTERVAL_MS);
      this.acledInterval.unref?.();
    } else {
      this.logger.log('ACLED polling disabled (set ACLED_USERNAME + ACLED_PASSWORD to enable)');
    }

    // GFW maritime intelligence — only when a token is configured.
    if (this.gfw.available) {
      this.scheduleInitialPoll(() => void this.pollGfw(), 50_000);
      this.gfwInterval = setInterval(() => void this.pollGfw(), GFW_INTERVAL_MS);
      this.gfwInterval.unref?.();
    } else {
      this.logger.log('GFW maritime disabled (set GFW_API_TOKEN to enable)');
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
    this.weatherInterval = setInterval(() => void this.pollWeather(), WEATHER_INTERVAL_MS);
    this.weatherInterval.unref?.();
    this.eonetInterval = setInterval(() => void this.pollEonet(), EONET_INTERVAL_MS);
    this.eonetInterval.unref?.();
    this.nwsInterval = setInterval(() => void this.pollNws(), NWS_INTERVAL_MS);
    this.nwsInterval.unref?.();
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
    if (this.eonetInterval) clearInterval(this.eonetInterval);
    if (this.gfwInterval) clearInterval(this.gfwInterval);
    if (this.weatherInterval) clearInterval(this.weatherInterval);
    if (this.nwsInterval) clearInterval(this.nwsInterval);
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

          // Keep items from the last 24h. A 2h window dropped almost everything
          // — many feeds (e.g. NPR politics) had zero items that fresh at poll
          // time, which starved the political and media categories even though
          // the feeds themselves were fine.
          const cutoff = now.getTime() - RSS_MAX_AGE_MS;

          // Resolve each item's publication time: pubDate, else a date embedded
          // in the article URL, else "now" (undated items are assumed recent,
          // not dropped). Sort by that BEFORE taking the top 5 — some feeds
          // (CGTN) are not newest-first, and slicing the raw order was
          // silently discarding their fresh items in favor of stale ones.
          const dated = items
            .map((item) => {
              const parsed = item.pubDate ? new Date(item.pubDate).getTime() : Number.NaN;
              const resolved = Number.isFinite(parsed)
                ? parsed
                : (dateFromUrl(item.link)?.getTime() ?? now.getTime());
              return { item, time: resolved };
            })
            .sort((a, b) => b.time - a.time);

          // Max 5 per feed, newest first, within the 24h window.
          const fresh = dated.filter(({ time }) => time >= cutoff).slice(0, 5);

          // Domestic-language feeds (RIA Novosti, IRNA, ...): translate the
          // headlines so they geocode and cluster with the rest of the feed.
          // Originals are kept in metadata; a failed translation keeps the
          // original text visibly untranslated rather than dropping the item.
          let translations: Array<string | null> = fresh.map(() => null);
          if (feed.language !== 'en' && this.translator?.available) {
            translations = await this.translator.translateHeadlines(
              fresh.map(({ item }) => item.title ?? 'Untitled'),
              feed.language,
            );
          }

          for (let itemIdx = 0; itemIdx < fresh.length; itemIdx++) {
            const entry = fresh[itemIdx];
            if (!entry) continue;
            const { item, time: itemTime } = entry;

            const originalTitle = decodeEntities(item.title ?? 'Untitled');
            const translatedTitle = translations[itemIdx] ?? null;
            const title = translatedTitle ?? originalTitle;
            // Keyed on the ORIGINAL title so the id is stable whether or not
            // translation succeeded on a given poll.
            const id = `rss-${feed.name}-${originalTitle.slice(0, 50).replace(/\W/g, '-').toLowerCase()}`;

            // Prefer a country named in the headline, so world-news lands on the
            // map instead of the "global" placeholder; else the feed's region.
            const geo = geocodeFromText(title);
            const region = geo ? 'geocoded' : (feed.region ?? 'global');
            const centroid = geo
              ? { lat: geo.lat, lng: geo.lng }
              : (REGION_CENTROIDS[feed.region ?? 'global'] ??
                REGION_CENTROIDS['global'] ?? { lat: 20, lng: 0 });

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
            // than jumping around the map on every reload. The hash MUST be
            // abs()ed: `(h*31+c)|0` goes negative, and a negative modulo made
            // the jitter range asymmetric (down to -12°/-18°), dropping e.g. a
            // Jordan-geocoded story into the Sudanese desert.
            let h = 0;
            for (let ci = 0; ci < id.length; ci++) h = (h * 31 + id.charCodeAt(ci)) | 0;
            const jitterLat = ((Math.abs(h) % 1000) / 1000 - 0.5) * 8;
            const jitterLng = ((Math.abs(h >> 10) % 1000) / 1000 - 0.5) * 12;

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
              timestamp: new Date(itemTime).toISOString(),
              location: {
                lat: centroid.lat + jitterLat,
                lng: centroid.lng + jitterLng,
                label: geo ? geo.label : humanizeRegion(feed.region ?? 'Global'),
                region,
                ...(geo ? { countryCode: geo.code } : {}),
              },
              magnitude: feed.tier === 1 ? 0.5 : 0.3,
              metadata: {
                feedName: feed.name,
                feedCategory: feed.category,
                feedTier: feed.tier,
                // Provenance: state-media vs public-broadcaster vs independent.
                // Never dropped — comparing what state outlets say against
                // everyone else IS the narrative signal.
                feedOwnership: feed.ownership ?? 'independent',
                ...(feed.audience ? { feedAudience: feed.audience } : {}),
                // Translation provenance: a translated headline is marked as
                // such with the original alongside — never silently swapped.
                ...(feed.language !== 'en'
                  ? {
                      originalLanguage: feed.language,
                      originalTitle,
                      translated: translatedTitle !== null,
                    }
                  : {}),
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

  private async pollEonet(): Promise<void> {
    try {
      const signals = await this.eonet.fetchSignals();
      const events = signals
        .map((s) => this.normalizeEonet(s))
        .filter((e): e is GlobalEvent => e !== null);
      await this.processEvents(events);
      this.logger.debug(`EONET poll: ${events.length} events`);
    } catch (err) {
      this.logger.error(`EONET poll error: ${err}`);
    }
  }

  /** Whether the maritime (GFW) layer is active — surfaced by /capabilities. */
  get maritimeAvailable(): boolean {
    return this.gfw.available;
  }

  private async pollGfw(): Promise<void> {
    try {
      const signals = await this.gfw.fetchSignals();
      const events = signals
        .map((s) => this.normalizeMaritime(s))
        .filter((e): e is GlobalEvent => e !== null);
      await this.processEvents(events);
      this.logger.debug(`GFW maritime poll: ${events.length} events`);
    } catch (err) {
      this.logger.error(`GFW maritime poll error: ${err}`);
    }
  }

  private async pollWeather(): Promise<void> {
    try {
      const signals = await this.weather.fetchSignals();
      const events = signals
        .map((s) => this.normalizeWeather(s))
        .filter((e): e is GlobalEvent => e !== null);
      await this.processEvents(events);
      this.logger.debug(`Open-Meteo weather poll: ${events.length} severe conditions`);
    } catch (err) {
      this.logger.error(`Open-Meteo weather poll error: ${err}`);
    }
  }

  private async pollNws(): Promise<void> {
    try {
      const signals = await this.nws.fetchSignals();
      const events = signals
        .map((s) => this.normalizeNws(s))
        .filter((e): e is GlobalEvent => e !== null);
      await this.processEvents(events);
      this.logger.debug(`NWS poll: ${events.length} events`);
    } catch (err) {
      this.logger.error(`NWS poll error: ${err}`);
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
    const time = new Date(event.timestamp).getTime();

    for (const sig of this.recentSignatures) {
      // Only cross-source reports of the same event are duplicates; distinct
      // events from one structured source (e.g. many EONET wildfires) are not.
      if (sig.source === event.source) continue;
      if (sig.category !== event.category) continue;
      if (!sameLocation(sig.location, event.location)) continue;
      if (Number.isFinite(time) && Math.abs(sig.time - time) > CONTENT_DEDUP_WINDOW_MS) continue;
      if (overlapCoefficient(tokens, sig.tokens) >= CONTENT_DEDUP_OVERLAP) return true;
    }

    this.recentSignatures.push({
      tokens,
      location: event.location,
      category: event.category,
      time,
      source: event.source,
    });
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
    const place = (signal.metadata['location'] as string) || '';
    const coords = signal.metadata['coordinates'] as
      | { latitude?: number; longitude?: number }
      | undefined;
    const resolved = resolveCountryCode(country);

    // Prefer ACLED's exact incident coordinates — a conflict event is a
    // specific place, not a country centroid. Fall back to the country
    // centroid only when the event carries no coordinates.
    const location: GeoLocation =
      coords && Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude)
        ? {
            lat: coords.latitude ?? 0,
            lng: coords.longitude ?? 0,
            label: place || country || 'Unknown',
            countryCode: country || undefined,
            region: 'geocoded',
          }
        : resolved
          ? {
              lat: resolved.lat,
              lng: resolved.lng,
              label: place || resolved.label,
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
  // Normalization — NASA EONET
  // ---------------------------------------------------------------------------

  private normalizeWeather(signal: ExternalSignal): GlobalEvent | null {
    const coords = signal.metadata['coordinates'] as
      | { latitude?: number; longitude?: number }
      | undefined;
    if (!Number.isFinite(coords?.latitude) || !Number.isFinite(coords?.longitude)) return null;
    return {
      id: signal.id,
      source: 'Open-Meteo',
      category: 'environmental' as EventCategory,
      severity: this.magnitudeSeverity(signal.magnitude),
      title: signal.title,
      description: this.getEventDescription(signal.description, signal.title, 'Open-Meteo'),
      timestamp: signal.timestamp,
      location: {
        lat: coords?.latitude ?? 0,
        lng: coords?.longitude ?? 0,
        label: (signal.metadata['place'] as string) ?? 'Severe weather',
      },
      magnitude: signal.magnitude,
      metadata: signal.metadata,
      expiresAt: new Date(Date.now() + DEFAULT_EVENT_TTL_MS).toISOString(),
    };
  }

  private normalizeMaritime(signal: ExternalSignal): GlobalEvent | null {
    const coords = signal.metadata['coordinates'] as
      | { latitude?: number; longitude?: number }
      | undefined;
    if (!Number.isFinite(coords?.latitude) || !Number.isFinite(coords?.longitude)) return null;
    const lat = coords?.latitude ?? 0;
    const lng = coords?.longitude ?? 0;
    const eez = (signal.metadata['eez'] as string[] | undefined)?.[0];
    return {
      id: signal.id,
      source: 'Global Fishing Watch',
      category: 'maritime' as EventCategory,
      severity: this.magnitudeSeverity(signal.magnitude),
      title: signal.title,
      description: this.getEventDescription(signal.description, signal.title, 'Global Fishing Watch'),
      timestamp: signal.timestamp,
      location: {
        lat,
        lng,
        // At-sea events rarely have a place name; label with the EEZ if known,
        // else coordinates (never a category name — the tactical-map lesson).
        label:
          eez ??
          `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lng).toFixed(1)}°${lng >= 0 ? 'E' : 'W'}`,
      },
      magnitude: signal.magnitude,
      metadata: signal.metadata,
      expiresAt: new Date(Date.now() + DEFAULT_EVENT_TTL_MS).toISOString(),
    };
  }

  private normalizeEonet(signal: ExternalSignal): GlobalEvent | null {
    const coords = signal.metadata['coordinates'] as
      | { latitude?: number; longitude?: number }
      | undefined;
    if (!Number.isFinite(coords?.latitude) || !Number.isFinite(coords?.longitude)) return null;

    const lat = coords?.latitude ?? 0;
    const lng = coords?.longitude ?? 0;
    const location: GeoLocation = {
      lat,
      lng,
      // A location label must name a PLACE — the category ("Wildfires") ends up
      // printed as a zone name on the tactical map otherwise. EONET titles are
      // usually "Wildfire Bear, Denali, Alaska": the place is what follows the
      // first comma. Fall back to a headline geocode, then raw coordinates.
      label: eonetPlaceLabel(signal.title, lat, lng),
    };

    return {
      id: signal.id,
      source: 'NASA EONET',
      category: 'environmental' as EventCategory,
      severity: this.magnitudeSeverity(signal.magnitude),
      title: signal.title,
      description: this.getEventDescription(signal.description, signal.title, 'NASA EONET'),
      timestamp: signal.timestamp,
      location,
      magnitude: signal.magnitude,
      metadata: signal.metadata,
      expiresAt: new Date(Date.now() + DEFAULT_EVENT_TTL_MS).toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Normalization — NOAA/NWS
  // ---------------------------------------------------------------------------

  private normalizeNws(signal: ExternalSignal): GlobalEvent | null {
    const coords = signal.metadata['coordinates'] as
      | { latitude?: number; longitude?: number }
      | undefined;
    if (!Number.isFinite(coords?.latitude) || !Number.isFinite(coords?.longitude)) return null;

    const sev = (signal.metadata['nwsSeverity'] as string) ?? 'Unknown';
    const location: GeoLocation = {
      lat: coords?.latitude ?? 0,
      lng: coords?.longitude ?? 0,
      label: (signal.metadata['areaDesc'] as string)?.split(';')[0]?.trim() || 'United States',
      countryCode: 'US',
    };

    return {
      id: signal.id,
      source: 'NOAA/NWS',
      category: 'environmental' as EventCategory,
      severity: sev === 'Extreme' ? 'critical' : sev === 'Severe' ? 'high' : 'medium',
      title: signal.title,
      description: this.getEventDescription(signal.description, signal.title, 'NOAA/NWS'),
      timestamp: signal.timestamp,
      location,
      magnitude: signal.magnitude,
      metadata: signal.metadata,
      expiresAt: new Date(Date.now() + DEFAULT_EVENT_TTL_MS).toISOString(),
    };
  }

  private magnitudeSeverity(magnitude: number): EventSeverity {
    if (magnitude >= 0.85) return 'critical';
    if (magnitude >= 0.7) return 'high';
    if (magnitude >= 0.45) return 'medium';
    return 'low';
  }
}
