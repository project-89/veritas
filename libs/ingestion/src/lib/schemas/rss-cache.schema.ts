import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

// ---------------------------------------------------------------------------
// RssCache schema — caches RSS feed items per-URL to avoid redundant fetches
// ---------------------------------------------------------------------------

@Schema({ _id: false })
class RssCacheItemEmbed {
  @Prop({ type: String, default: '' })
  title!: string;

  @Prop({ type: String, default: '' })
  link!: string;

  @Prop({ type: String, default: '' })
  pubDate!: string;

  @Prop({ type: String, default: '' })
  content!: string;

  @Prop({ type: String, default: '' })
  contentSnippet!: string;
}

@Schema({
  collection: 'rss_cache',
  timestamps: { createdAt: true, updatedAt: false },
  toJSON: {
    transform: (_: unknown, ret: Record<string, unknown>) => {
      ret['id'] = ret['_id'];
      delete ret['__v'];
      return ret;
    },
  },
})
export class RssCacheSchema {
  /** Feed URL (unique per entry) */
  @Prop({ required: true, unique: true, index: true })
  feedUrl!: string;

  /** Human-readable feed name */
  @Prop({ type: String, default: '' })
  feedName!: string;

  /** Cached items from this feed */
  @Prop({ type: [RssCacheItemEmbed], default: [] })
  items!: RssCacheItemEmbed[];

  /** When this feed was last fetched */
  @Prop({ type: Date, required: true })
  fetchedAt!: Date;

  /** Per-feed max age in ms (RSS feeds update at different rates) */
  @Prop({ type: Number, required: true })
  maxAgeMs!: number;

  /** TTL: auto-delete after the document's expiresAt date */
  @Prop({ type: Date, required: true, index: { expires: 0 } })
  expiresAt!: Date;
}

export const RssCacheModel = SchemaFactory.createForClass(RssCacheSchema);

// ---------------------------------------------------------------------------
// TypeScript interfaces
// ---------------------------------------------------------------------------

export interface RssCacheItem {
  title: string;
  link: string;
  pubDate: string;
  content: string;
  contentSnippet: string;
}

export interface RssCacheEntry {
  _id: string;
  id: string;
  feedUrl: string;
  feedName: string;
  items: RssCacheItem[];
  fetchedAt: Date;
  maxAgeMs: number;
  expiresAt: Date;
  createdAt: Date;
}
