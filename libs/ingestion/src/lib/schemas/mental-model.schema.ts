import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
class MentalModelSourceSummaryEmbed {
  @Prop({ required: true, type: Number })
  totalSeeds!: number;

  @Prop({ required: true, type: Number })
  processedSeeds!: number;

  @Prop({ type: [String], default: [] })
  seedKinds!: string[];

  @Prop({ type: [String], default: [] })
  evidenceLabels!: string[];
}

@Schema({ _id: false })
class MentalModelHeuristicEmbed {
  @Prop({ required: true, type: String })
  title!: string;

  @Prop({ required: true, type: String })
  description!: string;

  @Prop({ type: [String], default: [] })
  evidence!: string[];
}

@Schema({
  collection: 'mental_models',
  timestamps: true,
  toJSON: {
    transform: (_: unknown, ret: Record<string, unknown>) => {
      ret['id'] = ret['_id'];
      delete ret['__v'];
      return ret;
    },
  },
})
export class MentalModelSchema {
  @Prop({ required: true, type: String, index: true, unique: true })
  investigationId!: string;

  @Prop({ required: true, type: String })
  name!: string;

  @Prop({ required: true, type: String })
  domain!: string;

  @Prop({ required: true, type: MentalModelSourceSummaryEmbed })
  sourceSummary!: MentalModelSourceSummaryEmbed;

  @Prop({ type: [String], default: [] })
  theses!: string[];

  @Prop({ type: [MentalModelHeuristicEmbed], default: [] })
  heuristics!: MentalModelHeuristicEmbed[];

  @Prop({ type: [String], default: [] })
  decisionRules!: string[];

  @Prop({ type: [String], default: [] })
  workflowSteps!: string[];

  @Prop({ type: [String], default: [] })
  evidencePreferences!: string[];

  @Prop({ type: [String], default: [] })
  blindSpots!: string[];

  @Prop({ type: [String], default: [] })
  signaturePhrases!: string[];

  @Prop({ required: true, type: String })
  summary!: string;

  @Prop({
    required: true,
    type: String,
    enum: ['generated', 'fallback'],
    default: 'fallback',
  })
  status!: 'generated' | 'fallback';

  @Prop({ required: true, type: String })
  modelUsed!: string;

  @Prop({ required: true, type: Date, default: () => new Date() })
  generatedAt!: Date;
}

export const MentalModelModel = SchemaFactory.createForClass(MentalModelSchema);

MentalModelModel.index({ updatedAt: -1 });

export interface MentalModelSourceSummary {
  totalSeeds: number;
  processedSeeds: number;
  seedKinds: string[];
  evidenceLabels: string[];
}

export interface MentalModelHeuristic {
  title: string;
  description: string;
  evidence: string[];
}

export interface MentalModel {
  _id: string;
  id: string;
  investigationId: string;
  name: string;
  domain: string;
  sourceSummary: MentalModelSourceSummary;
  theses: string[];
  heuristics: MentalModelHeuristic[];
  decisionRules: string[];
  workflowSteps: string[];
  evidencePreferences: string[];
  blindSpots: string[];
  signaturePhrases: string[];
  summary: string;
  status: 'generated' | 'fallback';
  modelUsed: string;
  generatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
