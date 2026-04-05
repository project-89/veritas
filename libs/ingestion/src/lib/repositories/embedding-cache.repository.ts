import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService, Repository } from '@veritas/database';
import {
  EmbeddingCacheModel,
  type EmbeddingCacheEntry,
} from '../schemas/embedding-cache.schema';

/** 30 days in milliseconds */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Hash text content for embedding cache lookups.
 * Uses the first 2000 chars (same truncation as the embedding service).
 */
export function hashText(text: string): string {
  let hash = 0;
  const str = text.slice(0, 2000);
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return `emb-${hash.toString(36)}`;
}

/**
 * Repository for caching Gemini embedding results.
 * Embeddings are deterministic for the same text + model, so we cache them
 * to avoid redundant API calls.
 */
@Injectable()
export class EmbeddingCacheRepository implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingCacheRepository.name);
  private repo!: Repository<EmbeddingCacheEntry>;
  private initialized = false;

  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit() {
    this.initializeRepositories();
  }

  private initializeRepositories() {
    try {
      try {
        this.databaseService.registerModel('EmbeddingCache', EmbeddingCacheModel);
        this.logger.debug('Registered EmbeddingCache model');
      } catch {
        this.logger.warn('EmbeddingCache model already registered');
      }

      this.repo = this.databaseService.getRepository<EmbeddingCacheEntry>('EmbeddingCache');
      this.initialized = true;
      this.logger.log('EmbeddingCache repository initialized');
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Failed to initialize EmbeddingCache repository: ${err.message}`, err.stack);
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
      throw new Error('EmbeddingCacheRepository not initialized — is MongoDB connected?');
    }
  }

  /**
   * Get a cached embedding for a content hash + model.
   */
  async getEmbedding(contentHash: string, model: string): Promise<number[] | null> {
    this.ensureInitialized();
    try {
      const entries = await this.repo.find(
        { contentHash, modelName: model } as Record<string, unknown>,
        { limit: 1 },
      );
      const entry = entries[0] ?? null;
      if (!entry) return null;
      return entry.embedding;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in getEmbedding: ${err.message}`);
      return null;
    }
  }

  /**
   * Store an embedding in the cache.
   */
  async setEmbedding(contentHash: string, model: string, embedding: number[]): Promise<void> {
    this.ensureInitialized();
    try {
      // Delete any existing entry for this hash + model
      try {
        const old = await this.repo.find(
          { contentHash, modelName: model } as Record<string, unknown>,
          { limit: 1 },
        );
        for (const entry of old) {
          const id = entry._id?.toString() ?? entry.id;
          if (id) await this.repo.deleteById(id);
        }
      } catch {
        // Best effort cleanup
      }

      await this.repo.create({
        contentHash,
        modelName: model,
        embedding,
        expiresAt: new Date(Date.now() + TTL_MS),
      } as Partial<EmbeddingCacheEntry>);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in setEmbedding: ${err.message}`);
    }
  }

  /**
   * Get embeddings for multiple content hashes in one query.
   * Returns a Map of contentHash -> embedding for found entries.
   */
  async getBatchEmbeddings(contentHashes: string[], model: string): Promise<Map<string, number[]>> {
    this.ensureInitialized();
    const result = new Map<string, number[]>();
    try {
      // Query in batches to avoid oversized $in queries
      const BATCH_SIZE = 500;
      for (let i = 0; i < contentHashes.length; i += BATCH_SIZE) {
        const batch = contentHashes.slice(i, i + BATCH_SIZE);
        const entries = await this.repo.find(
          { contentHash: { $in: batch }, modelName: model } as Record<string, unknown>,
          {},
        );
        for (const entry of entries) {
          result.set(entry.contentHash, entry.embedding);
        }
      }
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Error in getBatchEmbeddings: ${err.message}`);
    }
    return result;
  }
}
