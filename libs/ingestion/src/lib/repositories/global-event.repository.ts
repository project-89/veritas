import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { GlobalEvent } from '@veritas/analysis';
import { DatabaseService, Repository } from '@veritas/database';
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
      } else {
        await this.repo.create(doc);
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
