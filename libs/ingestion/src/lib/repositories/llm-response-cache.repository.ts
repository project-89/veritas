import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { LlmGateway, type LlmResponseCacheStore } from '@veritas/content-classification/llm';
import { DatabaseService, Repository } from '@veritas/database';
import {
  type LlmResponseCacheEntry,
  LlmResponseCacheModel,
} from '../schemas/llm-response-cache.schema';

/** Default durable lifetime for a cached LLM response. */
const DEFAULT_TTL_DAYS = 7;

function ttlMs(): number {
  const raw = process.env['LLM_PERSISTENT_CACHE_TTL_DAYS'];
  const parsed = raw === undefined || raw === '' ? DEFAULT_TTL_DAYS : Number(raw);
  const days = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_DAYS;
  return days * 24 * 60 * 60 * 1000;
}

/**
 * Durable second level behind {@link LlmGateway}'s in-memory response cache.
 *
 * The gateway holds 500 entries for 60 minutes and dies with the process, yet
 * it fronts every Gemini call in the system. Without this, a restart or deploy
 * re-buys propaganda analysis, claim verification, causal reasoning, narrative
 * summaries and investigations that were already paid for.
 *
 * Attaches itself to the gateway on module init — the gateway is a DI-free
 * process-wide singleton and cannot receive an injected repository.
 *
 * Every method degrades to a miss rather than throwing: a cache that is down
 * must slow the pipeline, never break it.
 */
@Injectable()
export class LlmResponseCacheRepository implements LlmResponseCacheStore, OnModuleInit {
  private readonly logger = new Logger(LlmResponseCacheRepository.name);
  private repo!: Repository<LlmResponseCacheEntry>;
  private initialized = false;

  /**
   * DatabaseService is optional so a deployment without a database degrades to
   * in-memory caching instead of failing to boot.
   */
  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  async onModuleInit() {
    this.initializeRepositories();
    if (this.initialized) {
      LlmGateway.instance.setPersistentCache(this);
      this.logger.log('LLM response cache attached to the gateway');
    }
  }

  private initializeRepositories() {
    if (!this.databaseService) {
      this.logger.warn(
        'No DatabaseService available — LLM responses are cached in memory only, ' +
          'and will be re-fetched (and re-paid for) after a restart',
      );
      return;
    }
    try {
      try {
        this.databaseService.registerModel('LlmResponseCache', LlmResponseCacheModel);
        this.logger.debug('Registered LlmResponseCache model');
      } catch {
        this.logger.warn('LlmResponseCache model already registered');
      }

      this.repo = this.databaseService.getRepository<LlmResponseCacheEntry>('LlmResponseCache');
      this.initialized = true;
      this.logger.log('LlmResponseCache repository initialized');
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Failed to initialize LlmResponseCache repository: ${err.message}`,
        err.stack,
      );
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.initialized) return null;
    try {
      const entries = await this.repo.find({ keyHash: key } as Record<string, unknown>, {
        limit: 1,
      });
      return entries[0]?.response ?? null;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.debug(`LLM response cache read failed: ${err.message}`);
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    if (!this.initialized) return;
    try {
      // Update-then-insert; the unique keyHash index makes a lost race harmless.
      const data = {
        response: value,
        expiresAt: new Date(Date.now() + ttlMs()),
      } as Partial<LlmResponseCacheEntry>;
      const updated = await this.repo.updateMany({ keyHash: key } as Record<string, unknown>, data);
      if (updated === 0) {
        await this.repo.create({ keyHash: key, ...data });
      }
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.debug(`LLM response cache write failed: ${err.message}`);
    }
  }
}
