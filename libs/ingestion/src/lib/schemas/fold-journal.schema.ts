import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

// ---------------------------------------------------------------------------
// FoldJournal — append-only stream of Fold change records emitted by Veritas
// ---------------------------------------------------------------------------

/**
 * The durable log consumers read.
 *
 * Deliberately append-only and WITHOUT a TTL. The point of emitting is
 * reconstruction — "what did this look like at time T" — and that only works
 * if the log is complete. Expiring entries would silently make old
 * reconstructions wrong rather than unavailable, which is the worse failure.
 *
 * Reads are cursor-based on `(t, eventId)`, matching fold-sdk's inclusive
 * cursor semantics, so any number of independent readers can each hold their
 * own position and process at their own pace.
 */
@Schema({
  collection: 'fold_journal',
  timestamps: { createdAt: true, updatedAt: false },
  toJSON: {
    transform: (_: unknown, ret: Record<string, unknown>) => {
      ret['id'] = ret['_id'];
      delete ret['__v'];
      return ret;
    },
  },
})
export class FoldJournalSchema {
  /** Fold event id (a urn). Unique — appending the same event twice is a no-op. */
  @Prop({ required: true, unique: true, index: true })
  eventId!: string;

  /** Fold's numeric ordering key (`event.at.t`), epoch ms for observations. */
  @Prop({ type: Number, required: true, index: true })
  t!: number;

  /** Workspace scope, so a reader can subscribe to one slice. */
  @Prop({ required: true, index: true })
  workspace!: string;

  /** Optional finer scope within the workspace (e.g. 'global-events'). */
  @Prop({ type: String, default: null })
  space!: string | null;

  /** `event.kind`, for readers that only care about some record types. */
  @Prop({ required: true, index: true })
  kind!: string;

  /** The full Fold event, exactly as emitted. */
  @Prop({ type: Object, required: true })
  event!: Record<string, unknown>;
}

export const FoldJournalModel = SchemaFactory.createForClass(FoldJournalSchema);

// Cursor index: readers page by (t, eventId) ascending.
FoldJournalModel.index({ t: 1, eventId: 1 });

export interface FoldJournalEntry {
  _id: string;
  id: string;
  eventId: string;
  t: number;
  workspace: string;
  space: string | null;
  kind: string;
  event: Record<string, unknown>;
  createdAt: Date;
}
