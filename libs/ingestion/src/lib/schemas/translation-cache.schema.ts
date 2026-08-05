import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

// ---------------------------------------------------------------------------
// TranslationCache schema — caches translated text by a hash of (kind, source)
// ---------------------------------------------------------------------------

@Schema({
  collection: 'translation_cache',
  timestamps: { createdAt: true, updatedAt: false },
  toJSON: {
    transform: (_: unknown, ret: Record<string, unknown>) => {
      ret['id'] = ret['_id'];
      delete ret['__v'];
      return ret;
    },
  },
})
export class TranslationCacheSchema {
  /**
   * Hash of the translation cache key (kind + normalized source text).
   *
   * The source text is hashed rather than stored: the cache only ever needs
   * to answer "have we translated this exact string before", and ingested
   * post text does not belong in a long-lived side table.
   */
  @Prop({ required: true, unique: true, index: true })
  keyHash!: string;

  /** The English rendering. */
  @Prop({ required: true })
  translation!: string;

  /** TTL: auto-delete after 30 days. */
  @Prop({ type: Date, required: true, index: { expires: 0 } })
  expiresAt!: Date;
}

export const TranslationCacheModel = SchemaFactory.createForClass(TranslationCacheSchema);

// ---------------------------------------------------------------------------
// TypeScript interfaces
// ---------------------------------------------------------------------------

export interface TranslationCacheEntry {
  _id: string;
  id: string;
  keyHash: string;
  translation: string;
  expiresAt: Date;
  createdAt: Date;
}
