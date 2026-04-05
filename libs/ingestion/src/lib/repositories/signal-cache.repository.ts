import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService, Repository } from '@veritas/database';
import {
  SignalCacheModel,
  type SignalCacheEntry,
  type CachedSignal,
} from '../schemas/signal-cache.schema';

/**
 * Repository for persisting external signal data from adapters.
 * Supports per-adapter staleness checks and incremental date-range fetching.
 */
@Injectable()
export class SignalCacheRepository implements OnModuleInit {
  private readonly logger = new Logger(SignalCacheRepository.name);
  private repo!: Repository<SignalCacheEntry>;
  private initialized = false;

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit() {
    this.initializeRepositories();
  }

  private initializeRepositories() {
    try {
      try {
        this.databaseService.registerModel('SignalCache', SignalCacheModel);
        this.logger.debug('Registered SignalCache model');
      } catch {
        this.logger.warn('SignalCache model already registered');
      }

      this.repo = this.databaseService.getRepository<SignalCacheEntry>('SignalCache');
      this.initialized = true;
      this.logger.log('SignalCache repository initialized');
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Failed to initialize SignalCache repository: ${err.message}`, err.stack);
    }
  }

  private ensureInitialized() {
    if (!this.initialized) {
      try {
        this.initializeRepositories();
      } catch {
        // swallow
      }
    }
    if (!this.initialized) {
      throw new Error('SignalCacheRepository not initialized — is MongoDB connected?');
    }
  }

  /**
   * Find a valid (non-expired) cache entry for a global adapter + date range.
   * Returns null if no valid cache exists.
   */
  async findGlobalCache(
    adapterName: string,
    startDate: string,
    endDate: string,
  ): Promise<SignalCacheEntry | null> {
    this.ensureInitialized();
    try {
      const entries = await this.repo.find(
        {
          adapterName,
          scope: 'global',
          startDate,
          endDate,
        } as Record<string, unknown>,
        { sort: { fetchedAt: -1 }, limit: 1 },
      );

      const entry = entries[0] ?? null;
      if (!entry) return null;

      const age = Date.now() - new Date(entry.fetchedAt).getTime();
      if (age > entry.maxAgeMs) {
        this.logger.debug(
          `Cache expired for ${adapterName} (age: ${Math.round(age / 3600000)}h, max: ${Math.round(entry.maxAgeMs / 3600000)}h)`,
        );
        return null;
      }

      return entry;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in findGlobalCache: ${err.message}`);
      return null;
    }
  }

  /**
   * Find a valid cache entry for a query-scoped adapter + keywords + date range.
   * Keywords are sorted for consistent matching.
   */
  async findQueryCache(
    adapterName: string,
    keywords: string[],
    startDate: string,
    endDate: string,
  ): Promise<SignalCacheEntry | null> {
    this.ensureInitialized();
    try {
      const sortedKeywords = [...keywords].sort();
      const entries = await this.repo.find(
        {
          adapterName,
          scope: 'query',
          keywords: sortedKeywords,
          startDate,
          endDate,
        } as Record<string, unknown>,
        { sort: { fetchedAt: -1 }, limit: 1 },
      );

      const entry = entries[0] ?? null;
      if (!entry) return null;

      const age = Date.now() - new Date(entry.fetchedAt).getTime();
      if (age > entry.maxAgeMs) {
        return null;
      }

      return entry;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in findQueryCache: ${err.message}`);
      return null;
    }
  }

  /**
   * Save signals from an adapter to the cache. Upserts by adapter+scope+dateRange.
   */
  async saveSignals(params: {
    adapterName: string;
    scope: 'global' | 'query';
    keywords: string[];
    startDate: string;
    endDate: string;
    signals: CachedSignal[];
    maxAgeMs: number;
  }): Promise<void> {
    this.ensureInitialized();
    try {
      const sortedKeywords = [...params.keywords].sort();

      // Remove old entries for this adapter+scope+dateRange
      const filter: Record<string, unknown> = {
        adapterName: params.adapterName,
        scope: params.scope,
        startDate: params.startDate,
        endDate: params.endDate,
      };
      if (params.scope === 'query') {
        filter['keywords'] = sortedKeywords;
      }

      // Delete stale entries first
      try {
        const old = await this.repo.find(filter, {});
        for (const entry of old) {
          const id = entry._id?.toString() ?? entry.id;
          if (id) {
            await this.repo.deleteById(id);
          }
        }
      } catch {
        // Best effort cleanup
      }

      // Insert fresh entry (with TTL-based auto-delete at 2x maxAge)
      await this.repo.create({
        adapterName: params.adapterName,
        scope: params.scope,
        keywords: sortedKeywords,
        startDate: params.startDate,
        endDate: params.endDate,
        signals: params.signals,
        fetchedAt: new Date(),
        maxAgeMs: params.maxAgeMs,
        expiresAt: new Date(Date.now() + params.maxAgeMs * 2),
      } as Partial<SignalCacheEntry>);

      this.logger.debug(
        `Cached ${params.signals.length} signals for ${params.adapterName} [${params.scope}] (${params.startDate} → ${params.endDate})`,
      );
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in saveSignals: ${err.message}`);
    }
  }

  /**
   * Get all cached signals for a date range across all global adapters.
   */
  async getAllGlobalSignals(
    startDate: string,
    endDate: string,
  ): Promise<{ adapterName: string; signals: CachedSignal[]; fetchedAt: Date }[]> {
    this.ensureInitialized();
    try {
      const entries = await this.repo.find(
        {
          scope: 'global',
          startDate,
          endDate,
        } as Record<string, unknown>,
        { sort: { fetchedAt: -1 } },
      );

      // Only return non-expired entries
      return entries
        .filter((e: SignalCacheEntry) => Date.now() - new Date(e.fetchedAt).getTime() <= e.maxAgeMs)
        .map((e: SignalCacheEntry) => ({
          adapterName: e.adapterName,
          signals: e.signals,
          fetchedAt: e.fetchedAt,
        }));
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in getAllGlobalSignals: ${err.message}`);
      return [];
    }
  }
}
