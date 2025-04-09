import { Schema, Document, Model } from 'mongoose';

export interface Content {
  title: string;
  body: string;
  url?: string;
  source?: string;
  author?: string;
  createdAt: Date;
  updatedAt: Date;
  classifications?: string[];
  metadata?: Record<string, any>;
}

export interface ContentDocument extends Omit<Content, 'id'>, Document {}

export type ContentModel = Model<ContentDocument>;

export const ContentSchema = new Schema<ContentDocument>(
  {
    title: { type: String, required: true },
    body: { type: String, required: true },
    url: { type: String },
    source: { type: String },
    author: { type: String },
    classifications: { type: [String], default: [] },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    versionKey: false,
    id: true,
    toJSON: {
      virtuals: true,
      transform: (_, ret) => {
        ret.id = ret._id;
        delete ret._id;
        return ret;
      },
    },
  }
);
