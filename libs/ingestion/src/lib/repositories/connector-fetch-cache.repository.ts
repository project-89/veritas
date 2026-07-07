import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService, Repository } from '@veritas/database';
import {
  ConnectorFetchCacheEntry,
  ConnectorFetchCacheModel,
  ConnectorFetchCacheSchema,
} from '../schemas/connector-fetch-cache.schema';

const DEFAULT_TTL_MINUTES = 30;

/**
 * Cross-scan fetch cache: identical connector fetches (same platform + query
 * fingerprint) within the TTL are served from Mongo instead of re-hitting the
 * external source. TTL is configurable via CONNECTOR_CACHE_TTL_MINUTES; 0
 * disables caching.
 */
@Injectable()
export class ConnectorFetchCacheRepository implements OnModuleInit {
  private readonly logger = new Logger(ConnectorFetchCacheRepository.name);
  private repo!: Repository<ConnectorFetchCacheEntry>;
  private initialized = false;

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit() {
    this.initializeRepository();
  }

  private initializeRepository() {
    try {
      try {
        this.databaseService.registerModel(
          ConnectorFetchCacheSchema.name,
          ConnectorFetchCacheModel,
        );
      } catch {
        // Model already registered
      }
      this.repo = this.databaseService.getRepository<ConnectorFetchCacheEntry>(
        ConnectorFetchCacheSchema.name,
      );
      this.initialized = true;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Failed to initialize connector fetch cache: ${err.message}`);
    }
  }

  private ensureInitialized(): boolean {
    if (!this.initialized) {
      this.initializeRepository();
    }
    return this.initialized;
  }

  static ttlMs(): number {
    const raw = Number(process.env['CONNECTOR_CACHE_TTL_MINUTES']);
    const minutes = Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_TTL_MINUTES;
    return minutes * 60_000;
  }

  /**
   * Fingerprint of the fetch parameters. Same key ⇒ the source would receive
   * an identical request.
   */
  static buildQueryKey(
    query: string,
    options: { searchMode?: string; timeRange?: string; limit?: number },
  ): string {
    const normalizedQuery = query.trim().toLowerCase().replace(/\s+/g, ' ');
    return [
      normalizedQuery,
      options.searchMode ?? 'topic',
      options.timeRange ?? '',
      options.limit ?? '',
    ].join('::');
  }

  /** Returns cached posts if a fresh entry exists, else null. Never throws. */
  async getFresh(platform: string, queryKey: string): Promise<unknown[] | null> {
    if (!this.ensureInitialized() || ConnectorFetchCacheRepository.ttlMs() === 0) return null;
    try {
      const entry = await this.repo.findOne({ platform, queryKey } as Record<string, unknown>);
      if (!entry) return null;
      const age = Date.now() - new Date(entry.fetchedAt).getTime();
      if (age > ConnectorFetchCacheRepository.ttlMs()) return null;
      return entry.posts;
    } catch (error: unknown) {
      this.logger.debug(`Fetch cache read failed: ${(error as Error).message}`);
      return null;
    }
  }

  /** Upsert the cache entry for this fetch. Best-effort — never throws. */
  async save(platform: string, queryKey: string, posts: unknown[]): Promise<void> {
    const ttl = ConnectorFetchCacheRepository.ttlMs();
    if (!this.ensureInitialized() || ttl === 0) return;
    try {
      const data = {
        posts,
        fetchedAt: new Date(),
        // Keep the doc a bit past staleness so getFresh's age check, not TTL
        // deletion timing, decides freshness.
        expiresAt: new Date(Date.now() + ttl * 2),
      };
      const updated = await this.repo.updateMany(
        { platform, queryKey } as Record<string, unknown>,
        data as Partial<ConnectorFetchCacheEntry>,
      );
      if (updated === 0) {
        await this.repo.create({ platform, queryKey, ...data });
      }
    } catch (error: unknown) {
      // Duplicate-key from a concurrent save is fine — the other write won.
      this.logger.debug(`Fetch cache write failed: ${(error as Error).message}`);
    }
  }
}
