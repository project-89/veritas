import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

// ---------------------------------------------------------------------------
// ScanPost schema — one document per fetched post, keyed by scan.
//
// Posts used to live in a single array on the ScanJob document, which meant
// a full-array rewrite on every connector completion and a hard ceiling at
// MongoDB's 16MB BSON document limit. Individual documents append cheaply
// and scale with collection size instead of document size.
// ---------------------------------------------------------------------------

@Schema({
  collection: 'scan_posts',
  timestamps: { createdAt: true, updatedAt: false },
  toJSON: {
    transform: (_: unknown, ret: Record<string, unknown>) => {
      ret['id'] = ret['_id'];
      delete ret['__v'];
      return ret;
    },
  },
})
export class ScanPostSchema {
  /** Parent scan job ID */
  @Prop({ required: true, index: true })
  scanId!: string;

  /** Connector that fetched this post */
  @Prop({ required: true })
  connector!: string;

  /** Insertion order within the scan (preserves legacy array ordering) */
  @Prop({ type: Number, required: true })
  seq!: number;

  /** Serialized post payload (same shape previously stored in ScanJob.posts) */
  @Prop({ type: Object, required: true })
  post!: Record<string, unknown>;
}

export const ScanPostModel = SchemaFactory.createForClass(ScanPostSchema);
ScanPostModel.index({ scanId: 1, seq: 1 });

// ---------------------------------------------------------------------------
// TypeScript interface
// ---------------------------------------------------------------------------

export interface ScanPost {
  _id?: string;
  id?: string;
  scanId: string;
  connector: string;
  seq: number;
  post: Record<string, unknown>;
  createdAt?: Date;
}
