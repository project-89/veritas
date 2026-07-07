import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({
  collection: 'narrative_trends',
  timestamps: true,
  toJSON: {
    transform: (_: unknown, ret: Record<string, unknown>) => {
      delete ret['_id'];
      return ret;
    },
  },
})
export class NarrativeTrendSchema {
  @Prop({ required: true, unique: true })
  id!: string;

  @Prop({ required: true, index: true })
  timeframe!: string;

  @Prop({ required: true, index: true })
  primaryTheme!: string;

  @Prop({ required: true, type: [String] })
  relatedThemes!: string[];

  @Prop({ required: true, type: Number })
  insightCount!: number;

  @Prop({ required: true, type: Number })
  uniqueSourcesCount!: number;

  @Prop({ required: true, type: Number })
  sentimentTrend!: number;

  @Prop({ required: true, type: Object })
  platformDistribution!: Record<string, number>;

  @Prop({ required: true, type: Number, index: true })
  narrativeScore!: number;

  @Prop({ required: true, type: Date })
  detectedAt!: Date;
}

export const NarrativeTrendModel = SchemaFactory.createForClass(NarrativeTrendSchema);

// Create indices for common queries
// primaryTheme already indexed via @Prop({ index: true })
NarrativeTrendModel.index({ timeframe: 1, narrativeScore: -1 });
NarrativeTrendModel.index({ sentimentTrend: 1 });
