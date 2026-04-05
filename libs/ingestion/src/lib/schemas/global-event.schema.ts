import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// ---------------------------------------------------------------------------
// GeoLocation sub-document
// ---------------------------------------------------------------------------

@Schema({ _id: false })
class GeoLocationEmbed {
  @Prop({ type: Number, required: true })
  lat!: number;

  @Prop({ type: Number, required: true })
  lng!: number;

  @Prop({ type: String, required: true })
  label!: string;

  @Prop({ type: String })
  countryCode?: string;

  @Prop({ type: String })
  region?: string;
}

// ---------------------------------------------------------------------------
// GlobalEvent — real-time events ingested from external signal adapters
// ---------------------------------------------------------------------------

@Schema({
  collection: 'global_events',
  timestamps: { createdAt: true, updatedAt: false },
  toJSON: {
    transform: (_: unknown, ret: Record<string, unknown>) => {
      ret['id'] = ret['_id'];
      delete ret['__v'];
      return ret;
    },
  },
})
export class GlobalEventSchema extends Document {
  /** Unique event identifier (e.g. usgs-<hash>, acled-<hash>) */
  @Prop({ required: true, unique: true, index: true })
  eventId!: string;

  @Prop({ required: true })
  source!: string;

  @Prop({
    type: String,
    required: true,
    enum: ['environmental', 'political', 'economic', 'media'],
  })
  category!: string;

  @Prop({
    type: String,
    required: true,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'low',
  })
  severity!: string;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  description!: string;

  @Prop({ type: Date, required: true })
  timestamp!: Date;

  @Prop({ type: GeoLocationEmbed, required: true })
  location!: GeoLocationEmbed;

  @Prop({ type: Number, default: 0 })
  magnitude!: number;

  @Prop({ type: Object, default: {} })
  metadata!: Record<string, unknown>;

  /** TTL index — MongoDB automatically deletes documents after this date */
  @Prop({ type: Date, required: true, index: { expires: 0 } })
  expiresAt!: Date;
}

export const GlobalEventModel = SchemaFactory.createForClass(GlobalEventSchema);

GlobalEventModel.index({ category: 1, timestamp: -1 });
GlobalEventModel.index({ severity: 1, timestamp: -1 });
GlobalEventModel.index({ 'location.region': 1, timestamp: -1 });
