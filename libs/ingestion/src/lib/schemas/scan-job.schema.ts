import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// ---------------------------------------------------------------------------
// Connector status sub-schema
// ---------------------------------------------------------------------------

@Schema({ _id: false })
class ConnectorStatusEmbed {
  @Prop({
    type: String,
    required: true,
    enum: ['queued', 'running', 'done', 'failed', 'cancelled'],
    default: 'queued',
  })
  status!: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

  @Prop({ type: Number, default: 0 })
  postCount!: number;

  @Prop({ type: Number, default: 0 })
  insightCount!: number;

  @Prop({ type: String, default: null })
  startedAt!: string | null;

  @Prop({ type: String, default: null })
  completedAt!: string | null;

  @Prop({ type: String, default: null })
  error!: string | null;

  @Prop({ type: Number, default: null })
  duration!: number | null;
}

// ---------------------------------------------------------------------------
// Scan settings sub-schema
// ---------------------------------------------------------------------------

@Schema({ _id: false })
class ScanSettingsEmbed {
  @Prop({ type: [String], default: [] })
  platforms!: string[];

  @Prop({ type: String, default: '7d' })
  timeRange!: string;

  @Prop({ type: Number, default: 50 })
  limit!: number;

  @Prop({ type: String, enum: ['topic', 'claim'], default: 'topic' })
  searchMode!: 'topic' | 'claim';
}

// ---------------------------------------------------------------------------
// ScanJob schema
// ---------------------------------------------------------------------------

@Schema({
  collection: 'scan_jobs',
  timestamps: true,
  toJSON: {
    transform: (_: unknown, ret: Record<string, unknown>) => {
      ret['id'] = ret['_id'];
      delete ret['__v'];
      return ret;
    },
  },
})
export class ScanJobSchema extends Document {
  @Prop({ required: true, index: true })
  query!: string;

  @Prop({ required: true, index: true })
  investigationId!: string;

  @Prop({
    type: String,
    required: true,
    enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
    default: 'pending',
    index: true,
  })
  status!: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

  @Prop({ type: ScanSettingsEmbed, default: () => ({}) })
  settings!: ScanSettingsEmbed;

  @Prop({ type: Object, default: () => ({}) })
  connectors!: Record<string, ConnectorStatusEmbed>;

  @Prop({ type: Number, default: 0 })
  totalPosts!: number;

  @Prop({ type: Number, default: 0 })
  totalInsights!: number;

  @Prop({ type: Array, default: [] })
  posts!: unknown[];

  /** Cached analysis results — avoids re-running analysis on page refresh */
  @Prop({ type: Object, default: null })
  analysisCache!: Record<string, unknown> | null;

  @Prop({ type: Date, default: null })
  completedAt!: Date | null;
}

export const ScanJobModel = SchemaFactory.createForClass(ScanJobSchema);

// Indices for common queries
ScanJobModel.index({ status: 1, createdAt: -1 });
ScanJobModel.index({ investigationId: 1, createdAt: -1 });

// ---------------------------------------------------------------------------
// TypeScript interfaces
// ---------------------------------------------------------------------------

export interface ConnectorStatus {
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  postCount: number;
  insightCount: number;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  duration: number | null;
}

export interface ScanSettings {
  platforms: string[];
  timeRange: string;
  limit: number;
  searchMode?: 'topic' | 'claim';
}

export interface ScanJob {
  _id: string;
  id: string;
  query: string;
  investigationId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  settings: ScanSettings;
  connectors: Record<string, ConnectorStatus>;
  totalPosts: number;
  totalInsights: number;
  posts: unknown[];
  analysisCache: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}
