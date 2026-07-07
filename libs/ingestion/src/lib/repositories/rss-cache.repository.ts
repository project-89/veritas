import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService, Repository } from '@veritas/database';
import { type RssCacheEntry, type RssCacheItem, RssCacheModel } from '../schemas/rss-cache.schema';
import {
  type FeedFailureState,
  RssFeedStateModel,
  type RssFeedStateEntry,
} from '../schemas/rss-feed-state.schema';

/**
 * Repository for caching RSS feed items per-URL.
 * Eliminates redundant fetches when the same feed is scanned repeatedly.
 */
@Injectable()
export class RssCacheRepository implements OnModuleInit {
  private readonly logger = new Logger(RssCacheRepository.name);
  private repo!: Repository<RssCacheEntry>;
  private stateRepo!: Repository<RssFeedStateEntry>;
  private initialized = false;

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit() {
    this.initializeRepositories();
  }

  private initializeRepositories() {
    try {
      try {
        this.databaseService.registerModel('RssCache', RssCacheModel);
        this.databaseService.registerModel('RssFeedState', RssFeedStateModel);
        this.logger.debug('Registered RssCache models');
      } catch {
        this.logger.warn('RssCache models already registered');
      }

      this.repo = this.databaseService.getRepository<RssCacheEntry>('RssCache');
      this.stateRepo = this.databaseService.getRepository<RssFeedStateEntry>('RssFeedState');
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

  // ---------------------------------------------------------------------------
  // Feed failure/suppression state (persisted so cooldowns survive restarts)
  // ---------------------------------------------------------------------------

  /** Load all still-active feed suppression states. Best-effort — never throws. */
  async loadFeedFailureStates(): Promise<Map<string, FeedFailureState>> {
    const states = new Map<string, FeedFailureState>();
    try {
      this.ensureInitialized();
      const entries = await this.stateRepo.find({
        suppressedUntil: { $gt: Date.now() },
      } as Record<string, unknown>);
      for (const entry of entries) {
        states.set(entry.feedUrl, {
          consecutiveFailures: entry.consecutiveFailures,
          lastErrorSignature: entry.lastErrorSignature,
          suppressedUntil: entry.suppressedUntil,
        });
      }
    } catch (error: unknown) {
      this.logger.debug(`Could not load feed failure states: ${(error as Error).message}`);
    }
    return states;
  }

  /** Persist one feed's suppression state. Best-effort — never throws. */
  async saveFeedFailureState(feedUrl: string, state: FeedFailureState): Promise<void> {
    try {
      this.ensureInitialized();
      const data = {
        ...state,
        // Self-clean a day after the suppression lapses
        expiresAt: new Date(state.suppressedUntil + 24 * 60 * 60 * 1000),
      } as Partial<RssFeedStateEntry>;
      const updated = await this.stateRepo.updateMany(
        { feedUrl } as Record<string, unknown>,
        data,
      );
      if (updated === 0) {
        await this.stateRepo.create({ feedUrl, ...data });
      }
    } catch (error: unknown) {
      this.logger.debug(`Could not persist feed failure state: ${(error as Error).message}`);
    }
  }

  /** Remove one feed's suppression state after a successful fetch. */
  async clearFeedFailureState(feedUrl: string): Promise<void> {
    try {
      this.ensureInitialized();
      await this.stateRepo.deleteMany({ feedUrl } as Record<string, unknown>);
    } catch (error: unknown) {
      this.logger.debug(`Could not clear feed failure state: ${(error as Error).message}`);
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
      // TTL: expire after 2x maxAgeMs (keep around a bit longer for debugging)
      const data = {
        feedName,
        items,
        fetchedAt: new Date(),
        maxAgeMs,
        expiresAt: new Date(Date.now() + maxAgeMs * 2),
      } as Partial<RssCacheEntry>;

      // Update-then-insert; the unique feedUrl index makes a lost race harmless.
      const updated = await this.repo.updateMany({ feedUrl } as Record<string, unknown>, data);
      if (updated === 0) {
        await this.repo.create({ feedUrl, ...data });
      }

      this.logger.debug(
        `Cached ${items.length} items for RSS feed "${feedName}" (maxAge: ${Math.round(maxAgeMs / 60000)}m)`,
      );
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in setCachedFeed: ${err.message}`);
    }
  }
}
