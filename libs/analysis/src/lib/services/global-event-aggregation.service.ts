import {
  Injectable,
  Inject,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import type { ExternalSignal } from './signal-adapters/signal-adapter.interface';
import { UsgsAdapter } from './signal-adapters/usgs.adapter';
import { GdeltAdapter } from './signal-adapters/gdelt.adapter';
import { AcledAdapter } from './signal-adapters/acled.adapter';
import { resolveCountryCode } from '../utils/geocoding';
import type {
  GlobalEvent,
  EventCategory,
  EventSeverity,
  GeoLocation,
} from '../types/global-event';
/** Injection token for the global event repository (avoids cross-module dependency). */
export const GLOBAL_EVENT_REPOSITORY = Symbol('GLOBAL_EVENT_REPOSITORY');

interface EventRepository {
  upsertEvent(event: GlobalEvent): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USGS_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const GDELT_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const ACLED_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const DEDUP_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_EVENT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

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
export class GlobalEventAggregationService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(GlobalEventAggregationService.name);

  // Adapters (stateless — instantiated directly)
  private readonly usgs = new UsgsAdapter();
  private readonly gdelt = new GdeltAdapter();
  private readonly acled = new AcledAdapter();

  // Polling handles
  private usgsInterval: ReturnType<typeof setInterval> | null = null;
  private gdeltInterval: ReturnType<typeof setInterval> | null = null;
  private acledInterval: ReturnType<typeof setInterval> | null = null;

  // Deduplication: eventId → timestamp (ms)
  private readonly seen = new Map<string, number>();

  // RxJS event stream
  private readonly subject = new Subject<GlobalEvent>();
  readonly events$: Observable<GlobalEvent> = this.subject.asObservable();

  constructor(
    @Optional() @Inject(GLOBAL_EVENT_REPOSITORY) private readonly eventRepo?: EventRepository,
  ) {}

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  onModuleInit(): void {
    this.logger.log('Starting global event aggregation');

    // Fire-and-forget initial polls
    void this.pollUsgs();
    void this.pollGdelt();
    void this.pollAcled();

    // Set up recurring intervals
    this.usgsInterval = setInterval(
      () => void this.pollUsgs(),
      USGS_INTERVAL_MS,
    );
    this.gdeltInterval = setInterval(
      () => void this.pollGdelt(),
      GDELT_INTERVAL_MS,
    );
    this.acledInterval = setInterval(
      () => void this.pollAcled(),
      ACLED_INTERVAL_MS,
    );
  }

  onModuleDestroy(): void {
    if (this.usgsInterval) clearInterval(this.usgsInterval);
    if (this.gdeltInterval) clearInterval(this.gdeltInterval);
    if (this.acledInterval) clearInterval(this.acledInterval);
    this.subject.complete();
    this.logger.log('Global event aggregation stopped');
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

  // ---------------------------------------------------------------------------
  // Processing
  // ---------------------------------------------------------------------------

  private async processEvents(events: GlobalEvent[]): Promise<void> {
    this.pruneDedup();

    for (const event of events) {
      if (this.isDuplicate(event.id)) continue;

      this.seen.set(event.id, Date.now());
      this.subject.next(event);

      // Persist if repository is available
      if (this.eventRepo) {
        try {
          await this.eventRepo.upsertEvent(event);
        } catch (err) {
          this.logger.warn(`Failed to persist event ${event.id}: ${err}`);
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

  /** Remove entries older than the dedup window. */
  private pruneDedup(): void {
    const cutoff = Date.now() - DEDUP_WINDOW_MS;
    for (const [id, ts] of this.seen) {
      if (ts < cutoff) {
        this.seen.delete(id);
      }
    }
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
      description: signal.description,
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
      description: signal.description,
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
      description: signal.description,
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
}
