import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { DatabaseService, type Repository } from '@veritas/database';

/**
 * Self-contained embedding cache store for the analysis lib.
 *
 * The concrete cache repository lives in the ingestion lib, but ingestion
 * already depends on analysis — importing it here would be a circular lib
 * dependency. Instead this store talks to the SAME MongoDB collection
 * (`embedding_cache`) directly via the global DatabaseService, so cached
 * Gemini embeddings are shared regardless of which lib wrote them. It is bound
 * to EMBEDDING_CACHE_STORE in AnalysisModule so NarrativeAnalysisService stops
 * re-embedding every post on every run (real API cost).
 */

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — matches the ingestion schema

// Same collection as libs/ingestion embedding-cache.schema.ts, registered under
// a distinct MODEL name so both libs can register without a mongoose collision.
@Schema({ collection: 'embedding_cache', timestamps: { createdAt: true, updatedAt: false } })
class AnalysisEmbeddingCacheSchema {
  @Prop({ required: true, index: true })
  contentHash!: string;

  @Prop({ type: [Number], required: true })
  embedding!: number[];

  @Prop({ required: true })
  modelName!: string;

  @Prop({ type: Date, required: true, index: { expires: 0 } })
  expiresAt!: Date;
}

const AnalysisEmbeddingCacheModel = SchemaFactory.createForClass(AnalysisEmbeddingCacheSchema);
AnalysisEmbeddingCacheModel.index({ contentHash: 1, modelName: 1 }, { unique: true });

interface CacheEntry {
  contentHash: string;
  embedding: number[];
  modelName: string;
  expiresAt: Date;
}

@Injectable()
export class MongoEmbeddingCacheStore {
  private readonly logger = new Logger(MongoEmbeddingCacheStore.name);
  private repo: Repository<CacheEntry> | null = null;

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  private getRepo(): Repository<CacheEntry> | null {
    if (this.repo) return this.repo;
    if (!this.databaseService) return null;
    try {
      try {
        this.databaseService.registerModel('EmbeddingCacheAnalysis', AnalysisEmbeddingCacheModel);
      } catch {
        // already registered — fine
      }
      this.repo = this.databaseService.getRepository<CacheEntry>('EmbeddingCacheAnalysis');
      return this.repo;
    } catch (error) {
      this.logger.warn(`Embedding cache unavailable: ${(error as Error).message}`);
      return null;
    }
  }

  async getEmbedding(contentHash: string, model: string): Promise<number[] | null> {
    const repo = this.getRepo();
    if (!repo) return null;
    try {
      const entries = await repo.find({ contentHash, modelName: model }, { limit: 1 });
      return entries[0]?.embedding ?? null;
    } catch (error) {
      this.logger.debug(`getEmbedding failed: ${(error as Error).message}`);
      return null;
    }
  }

  async setEmbedding(contentHash: string, model: string, embedding: number[]): Promise<void> {
    const repo = this.getRepo();
    if (!repo) return;
    try {
      const data = { embedding, expiresAt: new Date(Date.now() + TTL_MS) };
      const updated = await repo.updateMany({ contentHash, modelName: model }, data);
      if (updated === 0) {
        await repo.create({ contentHash, modelName: model, ...data });
      }
    } catch (error) {
      this.logger.debug(`setEmbedding failed: ${(error as Error).message}`);
    }
  }

  async getBatchEmbeddings(contentHashes: string[], model: string): Promise<Map<string, number[]>> {
    const result = new Map<string, number[]>();
    const repo = this.getRepo();
    if (!repo) return result;
    try {
      const BATCH = 500;
      for (let i = 0; i < contentHashes.length; i += BATCH) {
        const slice = contentHashes.slice(i, i + BATCH);
        const entries = await repo.find(
          { contentHash: { $in: slice }, modelName: model } as Record<string, unknown>,
          {},
        );
        for (const entry of entries) {
          result.set(entry.contentHash, entry.embedding);
        }
      }
    } catch (error) {
      this.logger.debug(`getBatchEmbeddings failed: ${(error as Error).message}`);
    }
    return result;
  }
}
