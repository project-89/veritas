import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

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

  /** Scope mode for MAGI psychological profiles */
  @Prop({
    type: String,
    enum: ['investigation-window', 'current-state', 'historical', 'deep-history'],
    default: 'current-state',
  })
  profileMode!: PsychologicalProfileMode;

  /** Optional investigation context for identity-scoped jobs */
  @Prop({ type: String, default: null })
  investigationId!: string | null;

  /** Optional scope window start */
  @Prop({ type: Date, default: null })
  startDate!: Date | null;

  /** Optional scope window end */
  @Prop({ type: Date, default: null })
  endDate!: Date | null;
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
export class AnalysisJobSchema {
  /** Links back to the scan job that produced the posts (null for identity-scoped jobs like psychological-profile) */
  @Prop({ type: String, index: true, default: null })
  scanId!: string | null;

  /** Analysis type */
  @Prop({
    type: String,
    required: true,
    enum: ['investigation', 'propaganda', 'claims', 'downstream', 'psychological-profile'],
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

export type PsychologicalProfileMode =
  | 'investigation-window'
  | 'current-state'
  | 'historical'
  | 'deep-history';

export interface AnalysisJobInput {
  query: string;
  narrativeSummaries: string[];
  narratives: Record<string, unknown>[];
  userHandles: string[];
  postCount: number;
  profileMode?: PsychologicalProfileMode;
  investigationId?: string | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
}

export type AnalysisJobType =
  | 'investigation'
  | 'propaganda'
  | 'claims'
  | 'downstream'
  | 'psychological-profile';
export type AnalysisJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface AnalysisJob {
  _id: string;
  id: string;
  scanId: string | null;
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
