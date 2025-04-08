import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * Schema for entity information extracted from content
 */
@Schema({ _id: false })
export class Entity {
  @Prop({ required: true })
  text!: string;

  @Prop({ required: true })
  type!: string;

  @Prop({ required: true, type: Number })
  confidence!: number;
}

/**
 * Schema for engagement metrics
 */
@Schema({ _id: false })
export class EngagementMetrics {
  @Prop({ required: true, type: Number, default: 0 })
  likes!: number;

  @Prop({ required: true, type: Number, default: 0 })
  shares!: number;

  @Prop({ required: true, type: Number, default: 0 })
  comments!: number;

  @Prop({ required: true, type: Number, default: 0 })
  reach!: number;
}

/**
 * Schema for content classification results
 */
@Schema({ _id: false })
export class ClassificationData {
  @Prop({ required: true, type: [String] })
  categories!: string[];

  @Prop({ required: true })
  sentiment!: string;

  @Prop({ required: true, type: Number })
  toxicity!: number;

  @Prop({ required: true, type: Number })
  subjectivity!: number;

  @Prop({ required: true })
  language!: string;

  @Prop({ required: true, type: [String] })
  topics!: string[];

  @Prop({ required: true, type: [Entity] })
  entities!: Entity[];
}

/**
 * Schema for content with classification data
 */
@Schema({
  collection: 'content',
  timestamps: true,
  toJSON: {
    transform: (_: any, ret: any) => {
      delete ret._id;
      return ret;
    },
  },
})
export class ContentSchema extends Document {
  @Prop({ required: true, unique: true })
  override id!: string;

  @Prop({ required: true, index: true })
  text!: string;

  @Prop({ required: true, type: Date, index: true })
  timestamp!: Date;

  @Prop({ required: true, index: true })
  platform!: string;

  @Prop({ required: true, type: EngagementMetrics })
  engagementMetrics!: EngagementMetrics;

  @Prop({ required: true, type: ClassificationData })
  classification!: ClassificationData;

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  @Prop({ required: true, type: Date })
  createdAt!: Date;

  @Prop({ required: true, type: Date })
  updatedAt!: Date;
}

export const ContentModel = SchemaFactory.createForClass(ContentSchema);

// Create indices for common queries
ContentModel.index({ 'classification.topics': 1 });
ContentModel.index({ 'classification.categories': 1 });
ContentModel.index({ 'classification.sentiment': 1 });
ContentModel.index({ platform: 1, timestamp: -1 });
ContentModel.index({ text: 'text' });
