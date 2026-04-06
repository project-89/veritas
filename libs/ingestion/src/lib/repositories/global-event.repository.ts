import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService, Repository } from '@veritas/database';
import { GlobalEventModel, GlobalEventSchema } from '../schemas/global-event.schema';
import type { GlobalEvent } from '@veritas/analysis';

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
      this.logger.error(
        `Failed to initialize GlobalEvent repository: ${err.message}`,
        err.stack,
      );
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
      const existing = await this.repo.findOne({ eventId: event.id } as Partial<GlobalEventDoc> & Record<string, unknown>);
      const doc = this.toDocument(event);

      if (existing) {
        const id =
          existing._id?.toString() ??
          (existing as unknown as Record<string, unknown>)['id'] as string;
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
      description: event.description?.trim() || `${event.source}: ${event.title?.trim() || 'Untitled event'}`,
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

      const docs = await this.repo.find(filter as Partial<GlobalEventDoc> & Record<string, unknown>, {
        limit: options?.limit ?? 200,
        sort: { timestamp: -1 },
      });

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
      const doc = await this.repo.findOne({ eventId } as Partial<GlobalEventDoc> & Record<string, unknown>);
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

    return Array.from(byId.values()).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }
}
