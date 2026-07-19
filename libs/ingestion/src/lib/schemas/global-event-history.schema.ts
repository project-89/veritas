import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

// ---------------------------------------------------------------------------
// Append-only history + archive for global events.
//
// The live `globalevents` collection is deliberately mutable (upsert on
// re-poll) with a 7-day TTL — right for the map and feed, but it gives the
// platform amnesia: a quietly rewritten headline destroys the evidence of the
// rewrite, and the TTL erases everything the longitudinal analyses need.
//
// These two collections are INSERT-ONLY — no update path exists, by design:
// - global_event_history: one row per observed field change (stealth-edit
//   detection — an outlet revising its framing after publication IS signal).
// - global_event_archive: one slim row per event, written on first ingest,
//   NO TTL — months of framing data for divergence-over-time analysis at
//   trivial storage cost (~MB/month of slim rows).
// ---------------------------------------------------------------------------

@Schema({
  collection: 'global_event_history',
  timestamps: { createdAt: true, updatedAt: false },
})
export class GlobalEventHistorySchema {
  @Prop({ required: true, index: true })
  eventId!: string;

  /** Which field changed: title | severity | location. */
  @Prop({ required: true })
  field!: string;

  @Prop({ required: true })
  previous!: string;

  @Prop({ required: true })
  next!: string;

  @Prop({ required: true })
  source!: string;
}

export const GlobalEventHistoryModel = SchemaFactory.createForClass(GlobalEventHistorySchema);
GlobalEventHistoryModel.index({ eventId: 1, createdAt: -1 });
GlobalEventHistoryModel.index({ createdAt: -1 });

@Schema({
  collection: 'global_event_archive',
  timestamps: { createdAt: true, updatedAt: false },
})
export class GlobalEventArchiveSchema {
  @Prop({ required: true, unique: true, index: true })
  eventId!: string;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true, index: true })
  source!: string;

  @Prop({ required: true })
  category!: string;

  @Prop({ required: true })
  severity!: string;

  /** Provenance at time of ingest (independent | public-broadcaster | ...). */
  @Prop()
  ownership?: string;

  @Prop()
  audience?: string;

  @Prop({ type: Number })
  lat?: number;

  @Prop({ type: Number })
  lng?: number;

  @Prop()
  label?: string;

  @Prop()
  countryCode?: string;

  /** The event's own timestamp (publication/occurrence time). */
  @Prop({ type: Date, required: true, index: true })
  timestamp!: Date;
}

export const GlobalEventArchiveModel = SchemaFactory.createForClass(GlobalEventArchiveSchema);
GlobalEventArchiveModel.index({ source: 1, timestamp: -1 });
GlobalEventArchiveModel.index({ ownership: 1, timestamp: -1 });

export interface GlobalEventHistoryDoc {
  eventId: string;
  field: string;
  previous: string;
  next: string;
  source: string;
  createdAt?: Date;
}

export interface GlobalEventArchiveDoc {
  eventId: string;
  title: string;
  source: string;
  category: string;
  severity: string;
  ownership?: string;
  audience?: string;
  lat?: number;
  lng?: number;
  label?: string;
  countryCode?: string;
  timestamp: Date;
  createdAt?: Date;
}
