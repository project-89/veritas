import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService, Repository } from '@veritas/database';
import { type RssCacheEntry, type RssCacheItem, RssCacheModel } from '../schemas/rss-cache.schema';

/**
 * Repository for caching RSS feed items per-URL.
 * Eliminates redundant fetches when the same feed is scanned repeatedly.
 */
@Injectable()
export class RssCacheRepository implements OnModuleInit {
  private readonly logger = new Logger(RssCacheRepository.name);
  private repo!: Repository<RssCacheEntry>;
  private initialized = false;

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit() {
    this.initializeRepositories();
  }

  private initializeRepositories() {
    try {
      try {
        this.databaseService.registerModel('RssCache', RssCacheModel);
        this.logger.debug('Registered RssCache model');
      } catch {
        this.logger.warn('RssCache model already registered');
      }

      this.repo = this.databaseService.getRepository<RssCacheEntry>('RssCache');
      this.initialized = true;
      this.logger.log('RssCache repository initialized');
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Failed to initialize RssCache repository: ${err.message}`, err.stack);
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
      throw new Error('RssCacheRepository not initialized — is MongoDB connected?');
    }
  }

  /**
   * Get cached feed items if they exist and are still fresh.
   * @param feedUrl The feed URL to look up
   * @param maxAgeMs Optional override for max age (uses stored maxAgeMs if not provided)
   */
  async getCachedFeed(feedUrl: string, maxAgeMs?: number): Promise<RssCacheItem[] | null> {
    this.ensureInitialized();
    try {
      const entries = await this.repo.find({ feedUrl } as Record<string, unknown>, { limit: 1 });
      const entry = entries[0] ?? null;
      if (!entry) return null;

      const effectiveMaxAge = maxAgeMs ?? entry.maxAgeMs;
      const age = Date.now() - new Date(entry.fetchedAt).getTime();
      if (age > effectiveMaxAge) {
        this.logger.debug(
          `RSS cache expired for ${feedUrl} (age: ${Math.round(age / 60000)}m, max: ${Math.round(effectiveMaxAge / 60000)}m)`,
        );
        return null;
      }

      return entry.items;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in getCachedFeed: ${err.message}`);
      return null;
    }
  }

  /**
   * Store feed items in the cache. Upserts by feedUrl.
   */
  async setCachedFeed(
    feedUrl: string,
    feedName: string,
    items: RssCacheItem[],
    maxAgeMs: number,
  ): Promise<void> {
    this.ensureInitialized();
    try {
      // Delete existing entry for this feed URL
      try {
        const old = await this.repo.find({ feedUrl } as Record<string, unknown>, { limit: 1 });
        for (const entry of old) {
          const id = entry._id?.toString() ?? entry.id;
          if (id) await this.repo.deleteById(id);
        }
      } catch {
        // Best effort cleanup
      }

      // TTL: expire after 2x maxAgeMs (keep around a bit longer for debugging)
      const expiresAt = new Date(Date.now() + maxAgeMs * 2);

      await this.repo.create({
        feedUrl,
        feedName,
        items,
        fetchedAt: new Date(),
        maxAgeMs,
        expiresAt,
      } as Partial<RssCacheEntry>);

      this.logger.debug(
        `Cached ${items.length} items for RSS feed "${feedName}" (maxAge: ${Math.round(maxAgeMs / 60000)}m)`,
      );
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in setCachedFeed: ${err.message}`);
    }
  }
}
