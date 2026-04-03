import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// Investigation settings sub-schema (internal Mongoose class)
@Schema({ _id: false })
class InvestigationSettingsEmbed {
  @Prop({ type: [String], default: [] })
  platforms!: string[];

  @Prop({ type: String, default: '7d' })
  timeRange!: string;

  @Prop({ type: Number, default: 50 })
  limit!: number;
}

// Snapshot summary sub-schema (internal Mongoose class)
@Schema({ _id: false })
class SnapshotSummaryEmbed {
  @Prop({ required: true, type: Number })
  total!: number;

  @Prop({ required: true, type: Number })
  positive!: number;

  @Prop({ required: true, type: Number })
  negative!: number;

  @Prop({ required: true, type: Number })
  neutral!: number;

  @Prop({ required: true, type: Object })
  byPlatform!: Record<string, number>;
}

// Investigation — top-level container for a topic analysis
@Schema({
  collection: 'investigations',
  timestamps: true,
  toJSON: {
    transform: (_: unknown, ret: Record<string, unknown>) => {
      ret['id'] = ret['_id'];
      delete ret['__v'];
      return ret;
    },
  },
})
export class InvestigationSchema extends Document {
  @Prop({ required: true, unique: true, index: true })
  query!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({
    type: String,
    required: true,
    enum: ['active', 'archived'],
    default: 'active',
    index: true,
  })
  status!: 'active' | 'archived';

  @Prop({ type: InvestigationSettingsEmbed, default: () => ({}) })
  settings!: InvestigationSettingsEmbed;

  @Prop({ type: String, default: null })
  lastSnapshotId!: string | null;
}

export const InvestigationModel =
  SchemaFactory.createForClass(InvestigationSchema);

// Indices for common queries
InvestigationModel.index({ updatedAt: -1 });
InvestigationModel.index({ status: 1, updatedAt: -1 });

// Snapshot — a point-in-time capture of search results
@Schema({
  collection: 'investigation_snapshots',
  timestamps: false,
  toJSON: {
    transform: (_: unknown, ret: Record<string, unknown>) => {
      ret['id'] = ret['_id'];
      delete ret['__v'];
      return ret;
    },
  },
})
export class SnapshotSchema extends Document {
  @Prop({ required: true, index: true })
  investigationId!: string;

  @Prop({ required: true, type: Date, default: () => new Date() })
  timestamp!: Date;

  @Prop({ required: true, type: Number })
  postCount!: number;

  @Prop({ required: true, type: Number })
  narrativeCount!: number;

  @Prop({ required: true, type: SnapshotSummaryEmbed })
  summary!: SnapshotSummaryEmbed;

  @Prop({ type: Array, default: [] })
  posts!: unknown[];

  @Prop({ type: Array, default: [] })
  narratives!: unknown[];
}

export const SnapshotModel = SchemaFactory.createForClass(SnapshotSchema);

// Indices for common queries
SnapshotModel.index({ investigationId: 1, timestamp: -1 });

// TypeScript interfaces for use outside Mongoose
export interface InvestigationSettings {
  platforms: string[];
  timeRange: string;
  limit: number;
}

export interface Investigation {
  _id: string;
  id: string;
  query: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  status: 'active' | 'archived';
  settings: InvestigationSettings;
  lastSnapshotId: string | null;
}

export interface SnapshotSummary {
  total: number;
  positive: number;
  negative: number;
  neutral: number;
  byPlatform: Record<string, number>;
}

export interface Snapshot {
  _id: string;
  id: string;
  investigationId: string;
  timestamp: Date;
  postCount: number;
  narrativeCount: number;
  summary: SnapshotSummary;
  posts: unknown[];
  narratives: unknown[];
}
