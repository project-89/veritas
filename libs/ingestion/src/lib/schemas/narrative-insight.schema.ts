import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// Sentiment Analysis Schema
@Schema({ _id: false })
class SentimentAnalysis {
  @Prop({ required: true, type: Number })
  score!: number;

  @Prop({ required: true, enum: ['negative', 'neutral', 'positive'] })
  label!: 'negative' | 'neutral' | 'positive';

  @Prop({ required: true, type: Number })
  confidence!: number;
}

// Entity Schema
@Schema({ _id: false })
class Entity {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  type!: string;

  @Prop({ required: true, type: Number })
  relevance!: number;
}

// Engagement Schema
@Schema({ _id: false })
class Engagement {
  @Prop({ required: true, type: Number })
  total!: number;

  @Prop({ required: true, type: Object })
  breakdown!: Record<string, number>;
}

// NarrativeInsight Schema
@Schema({
  collection: 'narrative_insights',
  timestamps: true,
  toJSON: {
    transform: (_: any, ret: any) => {
      delete ret._id;
      return ret;
    },
  },
})
export class NarrativeInsightSchema extends Document {
  @Prop({ required: true, unique: true })
  override id!: string;

  @Prop({ required: true, index: true })
  contentHash!: string;

  @Prop({ required: true, index: true })
  sourceHash!: string;

  @Prop({ required: true, index: true })
  platform!: string;

  @Prop({ required: true, type: Date, index: true })
  timestamp!: Date;

  @Prop({ required: true, type: [String], index: true })
  themes!: string[];

  @Prop({ required: true, type: [Entity] })
  entities!: Entity[];

  @Prop({ required: true, type: SentimentAnalysis })
  sentiment!: SentimentAnalysis;

  @Prop({ required: true, type: Engagement })
  engagement!: Engagement;

  @Prop({ required: true, type: Number })
  narrativeScore!: number;

  @Prop({ required: true, type: Date })
  processedAt!: Date;

  @Prop({ required: true, type: Date, index: true })
  expiresAt!: Date;
}

export const NarrativeInsightModel = SchemaFactory.createForClass(
  NarrativeInsightSchema
);

// Create indices for common queries
NarrativeInsightModel.index({ timestamp: -1 });
NarrativeInsightModel.index({ 'sentiment.score': 1 });
NarrativeInsightModel.index({ themes: 1 });
NarrativeInsightModel.index({ platform: 1, timestamp: -1 });
