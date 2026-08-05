import { createHash } from 'node:crypto';
import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import type { TranslationCacheStore } from '@veritas/content-classification/llm';
import { DatabaseService, Repository } from '@veritas/database';
import {
  type TranslationCacheEntry,
  TranslationCacheModel,
} from '../schemas/translation-cache.schema';

/** 30 days in milliseconds — matches the embedding cache. */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Durable translation cache, implementing the {@link TranslationCacheStore}
 * port from the content-classification lib.
 *
 * Translations are deterministic and paid-for, so losing them on every restart
 * or deploy means re-buying identical work from Gemini. This backs the
 * in-process LRU in TranslationService with a 30-day Mongo collection.
 *
 * Every method degrades to a miss rather than throwing: a cache that is down
 * must slow the pipeline, never break it.
 */
@Injectable()
export class TranslationCacheRepository implements TranslationCacheStore, OnModuleInit {
  private readonly logger = new Logger(TranslationCacheRepository.name);
  private repo!: Repository<TranslationCacheEntry>;
  private initialized = false;

  /**
   * DatabaseService is optional: this provider is instantiated inside
   * ContentClassificationModule, which only sees DatabaseService when the host
   * app registers DatabaseModule globally (the API does; a standalone ingestion
   * setup may not). Without it the cache stays uninitialized and every lookup
   * is a miss — the same graceful path as a database that is simply down.
   */
  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  async onModuleInit() {
    this.initializeRepositories();
  }

  private initializeRepositories() {
    if (!this.databaseService) {
      this.logger.warn(
        'No DatabaseService available — translation cache is in-memory only, ' +
          'translations will be re-fetched after a restart',
      );
      return;
    }
    try {
      try {
        this.databaseService.registerModel('TranslationCache', TranslationCacheModel);
        this.logger.debug('Registered TranslationCache model');
      } catch {
        this.logger.warn('TranslationCache model already registered');
      }

      this.repo = this.databaseService.getRepository<TranslationCacheEntry>('TranslationCache');
      this.initialized = true;
      this.logger.log('TranslationCache repository initialized');
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Failed to initialize TranslationCache repository: ${err.message}`,
        err.stack,
      );
    }
  }

  /**
   * Hash the cache key. The caller's key embeds the full source text, which we
   * deliberately do not persist — only the fingerprint needed for lookup.
   */
  private hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex').slice(0, 32);
  }

  async get(key: string): Promise<string | null> {
    if (!this.initialized) return null;
    try {
      const entries = await this.repo.find({ keyHash: this.hashKey(key) } as Record<
        string,
        unknown
      >, { limit: 1 });
      return entries[0]?.translation ?? null;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.debug(`Translation cache read failed: ${err.message}`);
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    if (!this.initialized) return;
    try {
      const keyHash = this.hashKey(key);
      // Update-then-insert; the unique keyHash index makes a lost race harmless.
      const data = {
        translation: value,
        expiresAt: new Date(Date.now() + TTL_MS),
      } as Partial<TranslationCacheEntry>;
      const updated = await this.repo.updateMany({ keyHash } as Record<string, unknown>, data);
      if (updated === 0) {
        await this.repo.create({ keyHash, ...data });
      }
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.debug(`Translation cache write failed: ${err.message}`);
    }
  }
}
