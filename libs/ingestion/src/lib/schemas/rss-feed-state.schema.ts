import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

// ---------------------------------------------------------------------------
// RssFeedState schema — persists per-feed failure/suppression state so
// exponential cooldowns survive process restarts (previously in-memory only,
// meaning every restart hammered known-dead feeds again).
// ---------------------------------------------------------------------------

/** Failure/suppression state for one feed (shared with RSSConnector). */
export interface FeedFailureState {
  consecutiveFailures: number;
  lastErrorSignature: string;
  /** Epoch ms until which the feed is suppressed */
  suppressedUntil: number;
}

@Schema({
  collection: 'rss_feed_state',
  timestamps: { createdAt: false, updatedAt: true },
  toJSON: {
    transform: (_: unknown, ret: Record<string, unknown>) => {
      ret['id'] = ret['_id'];
      delete ret['__v'];
      return ret;
    },
  },
})
export class RssFeedStateSchema {
  @Prop({ required: true, unique: true, index: true })
  feedUrl!: string;

  @Prop({ type: Number, required: true })
  consecutiveFailures!: number;

  @Prop({ type: String, default: '' })
  lastErrorSignature!: string;

  /** Epoch ms until which the feed is suppressed */
  @Prop({ type: Number, required: true })
  suppressedUntil!: number;

  /** TTL: self-clean well after the suppression has lapsed */
  @Prop({ type: Date, required: true, index: { expires: 0 } })
  expiresAt!: Date;
}

export const RssFeedStateModel = SchemaFactory.createForClass(RssFeedStateSchema);

export interface RssFeedStateEntry extends FeedFailureState {
  _id?: string;
  id?: string;
  feedUrl: string;
  expiresAt: Date;
}
