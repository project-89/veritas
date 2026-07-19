import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { GlobalEvent } from '@veritas/analysis';
import { DatabaseService, Repository } from '@veritas/database';
import {
  type GlobalEventArchiveDoc,
  GlobalEventArchiveModel,
  type GlobalEventHistoryDoc,
  GlobalEventHistoryModel,
} from '../schemas/global-event-history.schema';
import { GlobalEventModel } from '../schemas/global-event.schema';

// ---------------------------------------------------------------------------
// Stored document shape (what Mongo actually holds)
// ---------------------------------------------------------------------------

interface GlobalEventDoc {
  _id: string;
  eventId: string;
  source: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  timestamp: Date;
  location: {
    lat: number;
    lng: number;
    label: string;
    countryCode?: string;
    region?: string;
  };
  magnitude: number;
  metadata: Record<string, unknown>;
  expiresAt: Date;
  createdAt: Date;
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeText(value: string | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9,\s-]/g, ' ')
    .replace(/\s+/g, ' ');
}

function roundCoord(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1) : '0.0';
}

function bucketTimestamp(timestamp: Date): string {
  const time = timestamp.getTime();
  if (!Number.isFinite(time)) return 'invalid';
  const bucketMs = 15 * 60 * 1000;
  return String(Math.floor(time / bucketMs));
}

function eventSignature(doc: GlobalEventDoc): string {
  return [
    doc.source,
    doc.category,
    normalizeTitle(doc.title),
    roundCoord(doc.location.lat),
    roundCoord(doc.location.lng),
    bucketTimestamp(doc.timestamp),
  ].join('|');
}

function hasExactCoordinates(doc: GlobalEventDoc): boolean {
  const coords = doc.metadata['coordinates'] as
    | { latitude?: number; longitude?: number }
    | undefined;
  return Number.isFinite(coords?.latitude) && Number.isFinite(coords?.longitude);
}

function locationSpecificityScore(doc: GlobalEventDoc): number {
  const label = doc.location.label?.trim() ?? '';
  let score = 0;
  if (hasExactCoordinates(doc)) score += 100;
  if (label.length >= 24) score += 5;
  if (/[0-9]/.test(label)) score += 3;
  if (label.includes(',')) score += 2;
  return score;
}

function sourcePriority(source: string): number {
  if (source === 'USGS') return 5;
  if (source === 'GDACS') return 4;
  if (source === 'ReliefWeb') return 3;
  if (source === 'GDELT') return 2;
  if (source.startsWith('RSS:')) return 1;
  return 0;
}

function earthquakeMagnitude(doc: GlobalEventDoc): number | null {
  const raw = doc.metadata['mag'];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

function isEarthquakeLike(doc: GlobalEventDoc): boolean {
  if (doc.category !== 'environmental') return false;

  const metadataType = normalizeText(
    typeof doc.metadata['type'] === 'string' ? doc.metadata['type'] : '',
  );
  const text = `${normalizeText(doc.title)} ${normalizeText(doc.description)} ${normalizeText(doc.location.label)}`;
  return (
    metadataType.includes('earthquake') || text.includes('earthquake') || text.includes(' seismic ')
  );
}

function geoDistanceDegrees(a: GlobalEventDoc, b: GlobalEventDoc): number {
  if (
    !Number.isFinite(a.location.lat) ||
    !Number.isFinite(a.location.lng) ||
    !Number.isFinite(b.location.lat) ||
    !Number.isFinite(b.location.lng)
  ) {
    return Number.POSITIVE_INFINITY;
  }

  const dLat = a.location.lat - b.location.lat;
  const dLng = a.location.lng - b.location.lng;
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

function labelsOverlap(a: GlobalEventDoc, b: GlobalEventDoc): boolean {
  const candidatesA = [normalizeText(a.location.label), normalizeText(a.title)].filter(Boolean);
  const candidatesB = [normalizeText(b.location.label), normalizeText(b.title)].filter(Boolean);

  for (const left of candidatesA) {
    for (const right of candidatesB) {
      const shorter = left.length <= right.length ? left : right;
      const longer = left.length > right.length ? left : right;
      if (shorter.length >= 4 && longer.includes(shorter)) {
        return true;
      }
    }
  }

  return false;
}

function sameCountryHint(a: GlobalEventDoc, b: GlobalEventDoc): boolean {
  if (a.location.countryCode && b.location.countryCode) {
    return a.location.countryCode.toLowerCase() === b.location.countryCode.toLowerCase();
  }
  return labelsOverlap(a, b);
}

function areCorrelatedEarthquakeDocs(a: GlobalEventDoc, b: GlobalEventDoc): boolean {
  if (a.source === b.source) return false;
  if (!isEarthquakeLike(a) || !isEarthquakeLike(b)) return false;

  const aTs = a.timestamp.getTime();
  const bTs = b.timestamp.getTime();
  if (!Number.isFinite(aTs) || !Number.isFinite(bTs) || Math.abs(aTs - bTs) > 6 * 60 * 60 * 1000) {
    return false;
  }

  const magnitudeA = earthquakeMagnitude(a);
  const magnitudeB = earthquakeMagnitude(b);
  const similarMagnitude =
    magnitudeA == null || magnitudeB == null || Math.abs(magnitudeA - magnitudeB) <= 0.6;

  if (!similarMagnitude) return false;

  const nearByCoords = geoDistanceDegrees(a, b) <= 3.5;
  const broadAndSpecificPair = hasExactCoordinates(a) !== hasExactCoordinates(b);

  if (nearByCoords) return true;
  if (broadAndSpecificPair && sameCountryHint(a, b)) return true;
  return false;
}

function compareDocQuality(a: GlobalEventDoc, b: GlobalEventDoc): number {
  const specificityDelta = locationSpecificityScore(a) - locationSpecificityScore(b);
  if (specificityDelta !== 0) return specificityDelta;

  const sourceDelta = sourcePriority(a.source) - sourcePriority(b.source);
  if (sourceDelta !== 0) return sourceDelta;

  const magA = earthquakeMagnitude(a) ?? a.magnitude ?? 0;
  const magB = earthquakeMagnitude(b) ?? b.magnitude ?? 0;
  if (magA !== magB) return magA - magB;

  return a.timestamp.getTime() - b.timestamp.getTime();
}

/**
 * Field-level changes between the stored version of an event and its
 * re-ingested version. Only substantive changes count: retitles, severity
 * moves, and location moves beyond coordinate noise. Powers the append-only
 * history — a source revising its framing after publication is signal.
 */
export function diffEventChanges(
  prev: { title: string; severity: string; location: { lat: number; lng: number; label: string } },
  next: { title: string; severity: string; location: { lat: number; lng: number; label: string } },
): Array<{ field: string; previous: string; next: string }> {
  const changes: Array<{ field: string; previous: string; next: string }> = [];
  if (normalizeTitle(prev.title) !== normalizeTitle(next.title)) {
    changes.push({ field: 'title', previous: prev.title, next: next.title });
  }
  if (prev.severity !== next.severity) {
    changes.push({ field: 'severity', previous: prev.severity, next: next.severity });
  }
  const labelChanged = (prev.location.label ?? '') !== (next.location.label ?? '');
  const moved =
    Math.abs((prev.location.lat ?? 0) - (next.location.lat ?? 0)) > 0.5 ||
    Math.abs((prev.location.lng ?? 0) - (next.location.lng ?? 0)) > 0.5;
  if (labelChanged || moved) {
    changes.push({
      field: 'location',
      previous: `${prev.location.label} (${prev.location.lat?.toFixed?.(2)}, ${prev.location.lng?.toFixed?.(2)})`,
      next: `${next.location.label} (${next.location.lat?.toFixed?.(2)}, ${next.location.lng?.toFixed?.(2)})`,
    });
  }
  return changes;
}

// ---------------------------------------------------------------------------
// Query options
// ---------------------------------------------------------------------------

export interface GlobalEventQueryOptions {
  category?: string;
  region?: string;
  severity?: string;
  limit?: number;
  since?: string;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

@Injectable()
export class GlobalEventRepository implements OnModuleInit {
  private readonly logger = new Logger(GlobalEventRepository.name);
  private repo!: Repository<GlobalEventDoc>;
  private historyRepo?: Repository<GlobalEventHistoryDoc>;
  private archiveRepo?: Repository<GlobalEventArchiveDoc>;
  private initialized = false;

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit() {
    this.initializeRepository();
  }

  private initializeRepository() {
    try {
      try {
        this.databaseService.registerModel('GlobalEvent', GlobalEventModel);
      } catch {
        this.logger.warn('GlobalEvent model already registered');
      }

      this.repo = this.databaseService.getRepository<GlobalEventDoc>('GlobalEvent');
      try {
        this.databaseService.registerModel('GlobalEventHistory', GlobalEventHistoryModel);
        this.databaseService.registerModel('GlobalEventArchive', GlobalEventArchiveModel);
      } catch {
        this.logger.warn('GlobalEvent history/archive models already registered');
      }
      this.historyRepo =
        this.databaseService.getRepository<GlobalEventHistoryDoc>('GlobalEventHistory');
      this.archiveRepo =
        this.databaseService.getRepository<GlobalEventArchiveDoc>('GlobalEventArchive');
      this.initialized = true;
      this.logger.log('GlobalEvent repository initialized');
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Failed to initialize GlobalEvent repository: ${err.message}`, err.stack);
    }
  }

  private ensureInitialized() {
    if (!this.initialized) {
      this.initializeRepository();
    }
  }

  // ---------------------------------------------------------------------------
  // Write
  // ---------------------------------------------------------------------------

  /**
   * Per-zone activity counts computed IN the database: events binned into
   * `cellDeg`° lat/lng cells, split into last-24h vs prior counts, with the
   * distinct recent sources per cell. Powers surge detection — fetching a
   * week of raw events to count them in memory stopped working once volume
   * meant the newest-N cap couldn't span the baseline window.
   *
   * Applies the same placement-honesty rules as the maps: no global anchors,
   * and RSS events only when the headline geocoded (a feed-home fallback
   * would register the OUTLET's publish volume as zone activity).
   */
  async aggregateZoneActivity(options: {
    cellDeg: number;
    sinceMs: number;
    recentMs: number;
  }): Promise<
    Array<{
      row: number;
      col: number;
      recent: number;
      prior: number;
      recentSources: string[];
      oldest: Date;
    }>
  > {
    this.ensureInitialized();
    if (!this.repo.aggregate) return [];
    const now = Date.now();
    const since = new Date(now - options.sinceMs);
    const recentCutoff = new Date(now - options.recentMs);

    interface ZoneRow {
      _id: { row: number; col: number };
      recent: number;
      prior: number;
      recentSources: string[];
      oldest: Date;
    }
    const rows = await this.repo.aggregate<ZoneRow>([
      {
        $match: {
          timestamp: { $gte: since },
          'location.region': { $ne: 'global' },
          'location.label': { $ne: 'Global' },
          $or: [{ source: { $not: /^RSS:/ } }, { 'location.region': 'geocoded' }],
        },
      },
      {
        $addFields: {
          row: {
            $floor: { $divide: [{ $subtract: [90, '$location.lat'] }, options.cellDeg] },
          },
          col: {
            $floor: { $divide: [{ $add: ['$location.lng', 180] }, options.cellDeg] },
          },
          isRecent: { $gte: ['$timestamp', recentCutoff] },
        },
      },
      {
        $group: {
          _id: { row: '$row', col: '$col' },
          recent: { $sum: { $cond: ['$isRecent', 1, 0] } },
          prior: { $sum: { $cond: ['$isRecent', 0, 1] } },
          recentSources: { $addToSet: { $cond: ['$isRecent', '$source', '$$REMOVE'] } },
          oldest: { $min: '$timestamp' },
        },
      },
    ]);
    return rows.map((r) => ({
      row: r._id.row,
      col: r._id.col,
      recent: r.recent,
      prior: r.prior,
      recentSources: r.recentSources ?? [],
      oldest: r.oldest,
    }));
  }

  /**
   * Upsert a GlobalEvent by its unique event id.
   * If a document with the same eventId exists it is updated; otherwise created.
   */
  async upsertEvent(event: GlobalEvent): Promise<void> {
    this.ensureInitialized();
    try {
      const existing = await this.repo.findOne({ eventId: event.id } as Partial<GlobalEventDoc> &
        Record<string, unknown>);
      const doc = this.toDocument(event);

      if (existing) {
        const id =
          existing._id?.toString() ??
          ((existing as unknown as Record<string, unknown>)['id'] as string);
        await this.repo.updateById(id, doc);
        // Append-only edit history: the live doc is about to be overwritten,
        // so record what changed BEFORE the old version is gone. Best-effort —
        // history must never break ingestion.
        //
        // Noise filters — history is for EDITORIAL changes:
        // - CoinGecko titles embed prices that tick every poll; market data,
        //   not framing.
        // - A title "change" whose old value matches the new version's
        //   originalTitle is the translation layer completing, not an edit.
        let changes =
          event.source === 'CoinGecko' ? [] : diffEventChanges(existing, doc as GlobalEventDoc);
        const originalTitle = doc.metadata?.['originalTitle'];
        if (
          typeof originalTitle === 'string' &&
          normalizeTitle(originalTitle) === normalizeTitle(existing.title)
        ) {
          changes = changes.filter((c) => c.field !== 'title');
        }
        if (changes.length > 0 && this.historyRepo) {
          try {
            await this.historyRepo.createMany(
              changes.map((c) => ({ ...c, eventId: event.id, source: event.source })),
            );
          } catch (err) {
            this.logger.warn(`Event history append failed for ${event.id}: ${err}`);
          }
        }
      } else {
        await this.repo.create(doc);
        // Slim no-TTL archive row on first sight — the long-term memory the
        // live collection's 7-day TTL deliberately lacks.
        if (this.archiveRepo) {
          try {
            await this.archiveRepo.create({
              eventId: event.id,
              title: event.title,
              source: event.source,
              category: event.category,
              severity: event.severity,
              ownership:
                typeof event.metadata?.['feedOwnership'] === 'string'
                  ? (event.metadata['feedOwnership'] as string)
                  : undefined,
              audience:
                typeof event.metadata?.['feedAudience'] === 'string'
                  ? (event.metadata['feedAudience'] as string)
                  : undefined,
              lat: event.location?.lat,
              lng: event.location?.lng,
              label: event.location?.label,
              countryCode: event.location?.countryCode,
              timestamp: new Date(event.timestamp),
            });
          } catch (err) {
            this.logger.warn(`Event archive append failed for ${event.id}: ${err}`);
          }
        }
      }
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in upsertEvent: ${err.message}`, err.stack);
      throw error;
    }
  }

  private toDocument(event: GlobalEvent): Partial<GlobalEventDoc> {
    return {
      eventId: event.id,
      source: event.source,
      category: event.category,
      severity: event.severity,
      title: event.title?.trim() || `${event.source} event`,
      description:
        event.description?.trim() || `${event.source}: ${event.title?.trim() || 'Untitled event'}`,
      timestamp: new Date(event.timestamp),
      location: {
        ...event.location,
        lat: Number.isFinite(event.location.lat) ? event.location.lat : 0,
        lng: Number.isFinite(event.location.lng) ? event.location.lng : 0,
        label: event.location.label?.trim() || event.location.region?.trim() || 'Unknown',
      },
      magnitude: event.magnitude,
      metadata: event.metadata,
      expiresAt: new Date(event.expiresAt),
    };
  }

  // ---------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------

  /**
   * Query recent events with optional filters.
   */
  async getRecentEvents(options?: GlobalEventQueryOptions): Promise<GlobalEvent[]> {
    this.ensureInitialized();
    try {
      const filter: Record<string, unknown> = {};

      if (options?.category) {
        filter['category'] = options.category;
      }
      if (options?.severity) {
        filter['severity'] = options.severity;
      }
      if (options?.region) {
        filter['location.region'] = options.region;
      }
      if (options?.since) {
        filter['timestamp'] = { $gte: new Date(options.since) };
      }

      const docs = await this.repo.find(
        filter as Partial<GlobalEventDoc> & Record<string, unknown>,
        {
          limit: options?.limit ?? 200,
          sort: { timestamp: -1 },
        },
      );

      const dedupedDocs = this.dedupeDocs(docs);
      return dedupedDocs.map((d) => this.toGlobalEvent(d));
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in getRecentEvents: ${err.message}`, err.stack);
      throw error;
    }
  }

  /**
   * Get a single event by its eventId field.
   */
  async getEventById(eventId: string): Promise<GlobalEvent | null> {
    this.ensureInitialized();
    try {
      const doc = await this.repo.findOne({ eventId } as Partial<GlobalEventDoc> &
        Record<string, unknown>);
      return doc ? this.toGlobalEvent(doc) : null;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in getEventById: ${err.message}`, err.stack);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Mapper
  // ---------------------------------------------------------------------------

  private toGlobalEvent(doc: GlobalEventDoc): GlobalEvent {
    return {
      id: doc.eventId,
      source: doc.source,
      category: doc.category as GlobalEvent['category'],
      severity: doc.severity as GlobalEvent['severity'],
      title: doc.title,
      description: doc.description,
      timestamp: doc.timestamp.toISOString(),
      location: doc.location,
      magnitude: doc.magnitude,
      metadata: doc.metadata,
      expiresAt: doc.expiresAt.toISOString(),
    };
  }

  private dedupeDocs(docs: GlobalEventDoc[]): GlobalEventDoc[] {
    const byId = new Map<string, GlobalEventDoc>();
    const signatureToId = new Map<string, string>();

    for (const doc of docs) {
      const signature = eventSignature(doc);
      const existingBySignatureId = signatureToId.get(signature);

      if (existingBySignatureId && existingBySignatureId !== doc.eventId) {
        const current = byId.get(existingBySignatureId);
        if (!current || doc.timestamp >= current.timestamp) {
          if (current) byId.delete(existingBySignatureId);
          byId.set(doc.eventId, doc);
          signatureToId.set(signature, doc.eventId);
        }
        continue;
      }

      const existingById = byId.get(doc.eventId);
      if (!existingById || doc.timestamp >= existingById.timestamp) {
        byId.set(doc.eventId, doc);
        signatureToId.set(signature, doc.eventId);
      }
    }

    const exactDeduped = Array.from(byId.values());
    const correlated: GlobalEventDoc[] = [];

    const qualitySorted = [...exactDeduped].sort((a, b) => {
      const qualityDelta = compareDocQuality(b, a);
      if (qualityDelta !== 0) return qualityDelta;
      return b.timestamp.getTime() - a.timestamp.getTime();
    });

    for (const doc of qualitySorted) {
      const existingIdx = correlated.findIndex((current) =>
        areCorrelatedEarthquakeDocs(current, doc),
      );
      if (existingIdx === -1) {
        correlated.push(doc);
        continue;
      }

      const current = correlated[existingIdx];
      if (!current) {
        correlated.push(doc);
        continue;
      }
      if (compareDocQuality(doc, current) > 0) {
        correlated[existingIdx] = doc;
      }
    }

    return correlated.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }
}
