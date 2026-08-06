import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

// ---------------------------------------------------------------------------
// LlmResponseCache — durable backing for LlmGateway's in-memory response cache
// ---------------------------------------------------------------------------

@Schema({
  collection: 'llm_response_cache',
  timestamps: { createdAt: true, updatedAt: false },
  toJSON: {
    transform: (_: unknown, ret: Record<string, unknown>) => {
      ret['id'] = ret['_id'];
      delete ret['__v'];
      return ret;
    },
  },
})
export class LlmResponseCacheSchema {
  /**
   * The gateway's own cache key: sha256 of (model, promptVersion, prompt).
   *
   * Already a hash when it arrives, so the prompt text itself is never stored
   * — prompts routinely embed ingested post content, which does not belong in
   * a long-lived side table.
   */
  @Prop({ required: true, unique: true, index: true })
  keyHash!: string;

  /** Raw response text, exactly as returned by the model. */
  @Prop({ required: true })
  response!: string;

  /** TTL. Longer than the in-memory cache: prompts are versioned and calls run
   *  at temperature 0, so an identical key stays valid until the prompt or
   *  model changes — both of which change the key. */
  @Prop({ type: Date, required: true, index: { expires: 0 } })
  expiresAt!: Date;
}

export const LlmResponseCacheModel = SchemaFactory.createForClass(LlmResponseCacheSchema);

// ---------------------------------------------------------------------------
// TypeScript interfaces
// ---------------------------------------------------------------------------

export interface LlmResponseCacheEntry {
  _id: string;
  id: string;
  keyHash: string;
  response: string;
  expiresAt: Date;
  createdAt: Date;
}
