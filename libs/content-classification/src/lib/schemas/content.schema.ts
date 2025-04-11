import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// Entity schema for named entities extracted from content
@Schema({ _id: false })
class Entity {
  @Prop({ required: true })
  text: string;

  @Prop({ required: true })
  type: string;

  @Prop({ required: true, type: Number })
  confidence: number;
}

// Classification data schema
@Schema({ _id: false })
class ClassificationData {
  @Prop({ type: [String], required: true })
  categories: string[];

  @Prop({ required: true })
  sentiment: string;

  @Prop({ required: true, type: Number })
  toxicity: number;

  @Prop({ required: true, type: Number })
  subjectivity: number;

  @Prop({ required: true })
  language: string;

  @Prop({ type: [String], required: true })
  topics: string[];

  @Prop({ type: [Object], required: true })
  entities: Entity[];
}

// Engagement metrics schema
@Schema({ _id: false })
class EngagementMetrics {
  @Prop({ type: Number, default: 0 })
  likes: number;

  @Prop({ type: Number, default: 0 })
  shares: number;

  @Prop({ type: Number, default: 0 })
  comments: number;

  @Prop({ type: Number, default: 0 })
  reach: number;
}

// Main content schema
@Schema({
  collection: 'content',
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (_, ret) => {
      ret.id = ret._id;
      delete ret._id;
      return ret;
    },
  },
})
export class ContentSchema extends Document {
  @Prop({ required: true })
  text: string;

  @Prop({ required: true, type: Date, index: true })
  timestamp: Date;

  @Prop({ required: true, index: true })
  platform: string;

  @Prop({ type: EngagementMetrics, required: true })
  engagementMetrics: EngagementMetrics;

  @Prop({ type: ClassificationData, required: true })
  classification: ClassificationData;

  @Prop({ type: Object })
  metadata?: Record<string, any>;
}

// Create the Mongoose model from the schema
export const ContentModel = SchemaFactory.createForClass(ContentSchema);

// Add text index for search capability
ContentModel.index({ text: 'text' });

// Add compound index for common queries
ContentModel.index({ platform: 1, timestamp: -1 });

// Add index for topic search
ContentModel.index({ 'classification.topics': 1 });
