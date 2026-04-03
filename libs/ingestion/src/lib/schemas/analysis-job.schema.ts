import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// ---------------------------------------------------------------------------
// Input sub-schema — what the processor needs to run the job
// ---------------------------------------------------------------------------

@Schema({ _id: false })
class AnalysisJobInputEmbed {
  @Prop({ required: true })
  query!: string;

  /** Narrative summaries for display */
  @Prop({ type: [String], default: [] })
  narrativeSummaries!: string[];

  /** Full serialized narrative objects (needed by analysis services) */
  @Prop({ type: Array, default: [] })
  narratives!: Record<string, unknown>[];

  /** User handles to investigate (investigation jobs only) */
  @Prop({ type: [String], default: [] })
  userHandles!: string[];

  /** How many posts are in the scan job (for progress estimation) */
  @Prop({ type: Number, default: 0 })
  postCount!: number;
}

// ---------------------------------------------------------------------------
// AnalysisJob schema
// ---------------------------------------------------------------------------

@Schema({
  collection: 'analysis_jobs',
  timestamps: true,
  toJSON: {
    transform: (_: unknown, ret: Record<string, unknown>) => {
      ret['id'] = ret['_id'];
      delete ret['__v'];
      return ret;
    },
  },
})
export class AnalysisJobSchema extends Document {
  /** Links back to the scan job that produced the posts */
  @Prop({ required: true, index: true })
  scanId!: string;

  /** Analysis type */
  @Prop({
    type: String,
    required: true,
    enum: ['investigation', 'propaganda', 'claims', 'downstream'],
  })
  type!: 'investigation' | 'propaganda' | 'claims' | 'downstream';

  /** Job lifecycle status */
  @Prop({
    type: String,
    required: true,
    enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
    default: 'pending',
    index: true,
  })
  status!: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

  /** Which narrative IDs this job covers */
  @Prop({ type: [String], default: [] })
  narrativeIds!: string[];

  /** Input parameters for the processor */
  @Prop({ type: AnalysisJobInputEmbed, default: () => ({}) })
  input!: AnalysisJobInputEmbed;

  /** Results (populated on completion) */
  @Prop({ type: Object, default: null })
  result!: Record<string, unknown> | null;

  @Prop({ type: Date, default: null })
  startedAt!: Date | null;

  @Prop({ type: Date, default: null })
  completedAt!: Date | null;

  /** Duration in milliseconds */
  @Prop({ type: Number, default: null })
  duration!: number | null;

  @Prop({ type: String, default: null })
  error!: string | null;
}

export const AnalysisJobModel = SchemaFactory.createForClass(AnalysisJobSchema);

AnalysisJobModel.index({ scanId: 1, status: 1 });
AnalysisJobModel.index({ status: 1, createdAt: -1 });

// ---------------------------------------------------------------------------
// TypeScript interfaces
// ---------------------------------------------------------------------------

export interface AnalysisJobInput {
  query: string;
  narrativeSummaries: string[];
  narratives: Record<string, unknown>[];
  userHandles: string[];
  postCount: number;
}

export type AnalysisJobType = 'investigation' | 'propaganda' | 'claims' | 'downstream';
export type AnalysisJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface AnalysisJob {
  _id: string;
  id: string;
  scanId: string;
  type: AnalysisJobType;
  status: AnalysisJobStatus;
  narrativeIds: string[];
  input: AnalysisJobInput;
  result: Record<string, unknown> | null;
  startedAt: Date | null;
  completedAt: Date | null;
  duration: number | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}
