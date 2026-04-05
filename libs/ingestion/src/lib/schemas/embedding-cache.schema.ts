import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// ---------------------------------------------------------------------------
// EmbeddingCache schema — caches Gemini embedding results by content hash
// ---------------------------------------------------------------------------

@Schema({
  collection: 'embedding_cache',
  timestamps: { createdAt: true, updatedAt: false },
  toJSON: {
    transform: (_: unknown, ret: Record<string, unknown>) => {
      ret['id'] = ret['_id'];
      delete ret['__v'];
      return ret;
    },
  },
})
export class EmbeddingCacheSchema extends Document {
  /** Hash of the text content (first 2000 chars) */
  @Prop({ required: true, index: true })
  contentHash!: string;

  /** The embedding vector */
  @Prop({ type: [Number], required: true })
  embedding!: number[];

  /** Model used to generate the embedding */
  @Prop({ required: true })
  modelName!: string;

  /** TTL: auto-delete after 30 days */
  @Prop({ type: Date, required: true, index: { expires: 0 } })
  expiresAt!: Date;
}

export const EmbeddingCacheModel = SchemaFactory.createForClass(EmbeddingCacheSchema);

// Compound unique index for fast lookups: contentHash + modelName
EmbeddingCacheModel.index({ contentHash: 1, modelName: 1 }, { unique: true });

// ---------------------------------------------------------------------------
// TypeScript interfaces
// ---------------------------------------------------------------------------

export interface EmbeddingCacheEntry {
  _id: string;
  id: string;
  contentHash: string;
  embedding: number[];
  modelName: string;
  expiresAt: Date;
  createdAt: Date;
}
