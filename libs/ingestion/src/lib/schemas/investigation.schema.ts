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

  @Prop({ type: String, enum: ['topic', 'claim'], default: 'topic' })
  searchMode!: 'topic' | 'claim';
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

@Schema({ _id: false })
class ExtractedEntityEmbed {
  @Prop({ required: true, type: String })
  type!: string;

  @Prop({ required: true, type: String })
  value!: string;
}

@Schema({ _id: false })
class EvidenceSeedEmbed {
  @Prop({ required: true, type: String })
  id!: string;

  @Prop({
    required: true,
    type: String,
    enum: ['url', 'youtube', 'article', 'post', 'wallet', 'contract', 'domain', 'document', 'note'],
  })
  kind!: 'url' | 'youtube' | 'article' | 'post' | 'wallet' | 'contract' | 'domain' | 'document' | 'note';

  @Prop({ required: true, type: String })
  value!: string;

  @Prop({ type: String, default: '' })
  label!: string;

  @Prop({
    required: true,
    type: String,
    enum: ['pending', 'fetched', 'processed', 'error'],
    default: 'pending',
  })
  status!: 'pending' | 'fetched' | 'processed' | 'error';

  @Prop({ type: String, default: null })
  notes!: string | null;

  @Prop({ type: Object, default: {} })
  metadata!: Record<string, unknown>;

  @Prop({ type: [ExtractedEntityEmbed], default: [] })
  extractedEntities!: ExtractedEntityEmbed[];

  @Prop({ type: Date, default: () => new Date() })
  createdAt!: Date;

  @Prop({ type: Date, default: () => new Date() })
  updatedAt!: Date;
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

  @Prop({ type: String, default: null })
  lastScanId!: string | null;

  @Prop({ type: String, default: null })
  linkedProjectDossierId!: string | null;

  @Prop({ type: [EvidenceSeedEmbed], default: [] })
  evidenceSeeds!: EvidenceSeedEmbed[];

  /** Persisted UI session state — restored when user returns to this investigation */
  @Prop({ type: Object, default: null })
  sessionState!: Record<string, unknown> | null;
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

  @Prop({ type: String, default: null })
  scanId!: string | null;

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
  searchMode?: 'topic' | 'claim';
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
  lastScanId: string | null;
  linkedProjectDossierId: string | null;
  evidenceSeeds: EvidenceSeed[];
  sessionState: Record<string, unknown> | null;
}

export interface ExtractedEntity {
  type: string;
  value: string;
}

export interface EvidenceSeed {
  id: string;
  kind: 'url' | 'youtube' | 'article' | 'post' | 'wallet' | 'contract' | 'domain' | 'document' | 'note';
  value: string;
  label: string;
  status: 'pending' | 'fetched' | 'processed' | 'error';
  notes: string | null;
  metadata: Record<string, unknown>;
  extractedEntities: ExtractedEntity[];
  createdAt: Date;
  updatedAt: Date;
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
  scanId: string | null;
  timestamp: Date;
  postCount: number;
  narrativeCount: number;
  summary: SnapshotSummary;
  posts: unknown[];
  narratives: unknown[];
}
