import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// ---------------------------------------------------------------------------
// Alert — a notification generated when a monitored investigation changes
// ---------------------------------------------------------------------------

export type AlertType =
  | 'new_narrative'
  | 'velocity_spike'
  | 'sentiment_reversal'
  | 'coordination_detected'
  | 'new_platform'
  | 'volume_surge';

export type AlertSeverity = 'info' | 'warning' | 'critical';

@Schema({
  collection: 'alerts',
  timestamps: { createdAt: true, updatedAt: false },
  toJSON: {
    transform: (_: unknown, ret: Record<string, unknown>) => {
      ret['id'] = ret['_id'];
      delete ret['__v'];
      return ret;
    },
  },
})
export class AlertSchema extends Document {
  @Prop({ required: true, index: true })
  investigationId!: string;

  @Prop({
    type: String,
    required: true,
    enum: [
      'new_narrative',
      'velocity_spike',
      'sentiment_reversal',
      'coordination_detected',
      'new_platform',
      'volume_surge',
    ],
  })
  type!: AlertType;

  @Prop({
    type: String,
    required: true,
    enum: ['info', 'warning', 'critical'],
    default: 'info',
  })
  severity!: AlertSeverity;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  description!: string;

  @Prop({ type: Object, default: {} })
  metadata!: Record<string, unknown>;

  @Prop({ type: Boolean, default: false, index: true })
  read!: boolean;
}

export const AlertModel = SchemaFactory.createForClass(AlertSchema);

AlertModel.index({ investigationId: 1, createdAt: -1 });
AlertModel.index({ read: 1, createdAt: -1 });

// ---------------------------------------------------------------------------
// MonitorConfig — per-investigation monitoring settings
// ---------------------------------------------------------------------------

@Schema({ _id: false })
class AlertThresholdsEmbed {
  @Prop({ type: Number, default: 2.0 })
  velocityMultiplier!: number;

  @Prop({ type: Number, default: 0.3 })
  sentimentShift!: number;

  @Prop({ type: Number, default: 3 })
  minNewNarrativePosts!: number;
}

@Schema({
  collection: 'monitor_configs',
  timestamps: true,
  toJSON: {
    transform: (_: unknown, ret: Record<string, unknown>) => {
      ret['id'] = ret['_id'];
      delete ret['__v'];
      return ret;
    },
  },
})
export class MonitorConfigSchema extends Document {
  @Prop({ required: true, unique: true, index: true })
  investigationId!: string;

  @Prop({ type: Boolean, default: false })
  enabled!: boolean;

  @Prop({ type: Number, default: 60 })
  intervalMinutes!: number;

  @Prop({ type: AlertThresholdsEmbed, default: () => ({}) })
  alertThresholds!: AlertThresholdsEmbed;

  @Prop({ type: Date, default: null })
  lastRunAt!: Date | null;

  @Prop({ type: Date, default: null })
  nextRunAt!: Date | null;
}

export const MonitorConfigModel = SchemaFactory.createForClass(MonitorConfigSchema);

// ---------------------------------------------------------------------------
// TypeScript interfaces for use outside Mongoose
// ---------------------------------------------------------------------------

export interface AlertThresholds {
  velocityMultiplier: number;
  sentimentShift: number;
  minNewNarrativePosts: number;
}

export interface Alert {
  _id: string;
  id: string;
  investigationId: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  read: boolean;
}

export interface MonitorConfig {
  _id: string;
  id: string;
  investigationId: string;
  enabled: boolean;
  intervalMinutes: number;
  alertThresholds: AlertThresholds;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
}
