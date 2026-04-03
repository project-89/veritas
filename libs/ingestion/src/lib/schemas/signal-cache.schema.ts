import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// ---------------------------------------------------------------------------
// SignalCache schema — persists external signals from adapters to MongoDB
// ---------------------------------------------------------------------------

@Schema({
  collection: 'signal_cache',
  timestamps: true,
  toJSON: {
    transform: (_: unknown, ret: Record<string, unknown>) => {
      ret['id'] = ret['_id'];
      delete ret['__v'];
      return ret;
    },
  },
})
export class SignalCacheSchema extends Document {
  /** Adapter name (e.g. "Yahoo Finance", "FRED", "World Bank", "GDELT") */
  @Prop({ required: true, index: true })
  adapterName!: string;

  /** 'global' or 'query' — matches the adapter scope */
  @Prop({ type: String, required: true, enum: ['global', 'query'] })
  scope!: 'global' | 'query';

  /** For query-scoped adapters, the keywords used. Empty for global. */
  @Prop({ type: [String], default: [] })
  keywords!: string[];

  /** The date range these signals cover (ISO dates) */
  @Prop({ required: true })
  startDate!: string;

  @Prop({ required: true })
  endDate!: string;

  /** The actual signal data */
  @Prop({ type: Array, default: [] })
  signals!: CachedSignal[];

  /** When this cache entry was fetched from the external source */
  @Prop({ type: Date, required: true })
  fetchedAt!: Date;

  /** Per-adapter max age in ms — after this, re-fetch */
  @Prop({ type: Number, required: true })
  maxAgeMs!: number;
}

export const SignalCacheModel = SchemaFactory.createForClass(SignalCacheSchema);

// Compound index for fast lookups: adapter + scope + date range
SignalCacheModel.index({ adapterName: 1, scope: 1, startDate: 1, endDate: 1 });
// For query-scoped entries, also index by keywords
SignalCacheModel.index({ adapterName: 1, keywords: 1, startDate: 1, endDate: 1 });

// ---------------------------------------------------------------------------
// TypeScript interfaces
// ---------------------------------------------------------------------------

export interface CachedSignal {
  id: string;
  domain: string;
  source: string;
  title: string;
  description: string;
  timestamp: string;
  magnitude: number;
  metadata: Record<string, unknown>;
}

export interface SignalCacheEntry {
  _id: string;
  id: string;
  adapterName: string;
  scope: 'global' | 'query';
  keywords: string[];
  startDate: string;
  endDate: string;
  signals: CachedSignal[];
  fetchedAt: Date;
  maxAgeMs: number;
  createdAt: Date;
  updatedAt: Date;
}
