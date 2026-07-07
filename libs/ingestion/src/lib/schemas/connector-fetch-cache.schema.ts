import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

// ---------------------------------------------------------------------------
// ConnectorFetchCache schema — caches one connector run's results per
// (platform, query fingerprint) so repeat scans of the same query within the
// TTL window are served from Mongo instead of re-hitting the source.
// ---------------------------------------------------------------------------

@Schema({
  collection: 'connector_fetch_cache',
  timestamps: { createdAt: true, updatedAt: false },
  toJSON: {
    transform: (_: unknown, ret: Record<string, unknown>) => {
      ret['id'] = ret['_id'];
      delete ret['__v'];
      return ret;
    },
  },
})
export class ConnectorFetchCacheSchema {
  /** Connector platform key (twitter, reddit, ...) */
  @Prop({ required: true })
  platform!: string;

  /**
   * Fingerprint of the fetch parameters: normalized query + searchMode +
   * timeRange + limit. Same fingerprint ⇒ same source request.
   */
  @Prop({ required: true })
  queryKey!: string;

  /** Serialized posts exactly as stored on the scan job */
  @Prop({ type: Array, default: [] })
  posts!: unknown[];

  @Prop({ type: Date, required: true })
  fetchedAt!: Date;

  /** TTL: auto-delete after the document's expiresAt date */
  @Prop({ type: Date, required: true, index: { expires: 0 } })
  expiresAt!: Date;
}

export const ConnectorFetchCacheModel = SchemaFactory.createForClass(ConnectorFetchCacheSchema);
ConnectorFetchCacheModel.index({ platform: 1, queryKey: 1 }, { unique: true });

// ---------------------------------------------------------------------------
// TypeScript interface
// ---------------------------------------------------------------------------

export interface ConnectorFetchCacheEntry {
  _id?: string;
  id?: string;
  platform: string;
  queryKey: string;
  posts: unknown[];
  fetchedAt: Date;
  expiresAt: Date;
  createdAt?: Date;
}
