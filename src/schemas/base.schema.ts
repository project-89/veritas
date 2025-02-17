import { z } from "zod";

// Base Schemas
export const ActivityMetricsSchema = z.object({
  postFrequency: z.number(),
  engagementRate: z.number(),
  activeHours: z.array(z.number()),
  interactionPattern: z.enum(["normal", "automated", "suspicious"]),
});

export const EngagementMetricsSchema = z.object({
  likes: z.number().min(0),
  shares: z.number().min(0),
  comments: z.number().min(0),
  reach: z.number().min(0),
  viralityScore: z.number().min(0).max(1),
});

// Node Schemas
export const AccountNodeSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  platform: z.enum(["twitter", "facebook", "reddit", "other"]),
  influence: z.number().min(0).max(1),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const ContentNodeSchema = z.object({
  id: z.string().uuid(),
  text: z.string(),
  timestamp: z.date(),
  platform: z.enum(["twitter", "facebook", "reddit", "other"]),
  toxicity: z.number().optional(),
  sentiment: z.enum(["positive", "negative", "neutral"]).optional(),
  categories: z.array(z.string()).optional(),
  topics: z.array(z.string()).optional(),
  sourceId: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  engagementMetrics: EngagementMetricsSchema.optional(),
  classification: z
    .object({
      categories: z.array(z.string()),
      sentiment: z.enum(["positive", "negative", "neutral"]),
      toxicity: z.number(),
      subjectivity: z.number(),
      language: z.string(),
      topics: z.array(z.string()),
      entities: z.array(
        z.object({
          text: z.string(),
          type: z.string(),
          confidence: z.number(),
        })
      ),
    })
    .optional(),
});

export const SourceNodeSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  platform: z.enum(["twitter", "facebook", "reddit", "other"]),
  credibilityScore: z.number().min(0).max(1),
  verificationStatus: z.enum(["verified", "unverified", "suspicious"]),
  metadata: z.record(z.string(), z.any()).optional(),
});

// Edge Schemas
export const SharesEdgeSchema = z.object({
  from: z.string().uuid(),
  to: z.string().uuid(),
  timestamp: z.date(),
  platform: z.enum(["twitter", "facebook", "reddit", "other"]),
});

export const InteractsEdgeSchema = z.object({
  from: z.string().uuid(),
  to: z.string().uuid(),
  type: z.enum(["reply", "retweet", "quote", "mention"]),
  timestamp: z.date(),
});

// Derive TypeScript types
export type ActivityMetrics = z.infer<typeof ActivityMetricsSchema>;
export type EngagementMetrics = z.infer<typeof EngagementMetricsSchema>;
export type AccountNode = z.infer<typeof AccountNodeSchema>;
export type ContentNode = z.infer<typeof ContentNodeSchema>;
export type SourceNode = z.infer<typeof SourceNodeSchema>;
export type SharesEdge = z.infer<typeof SharesEdgeSchema>;
export type InteractsEdge = z.infer<typeof InteractsEdgeSchema>;

export const ContentValidationSchema = z.object({
  id: z.string().uuid(),
  text: z.string(),
  timestamp: z.date(),
  platform: z.enum(["twitter", "facebook", "reddit", "other"]),
  engagementMetrics: EngagementMetricsSchema,
  classification: z.object({
    categories: z.array(z.string()),
    sentiment: z.enum(["positive", "negative", "neutral"]),
    toxicity: z.number(),
    subjectivity: z.number(),
    language: z.string(),
    topics: z.array(z.string()),
    entities: z.array(
      z.object({
        text: z.string(),
        type: z.string(),
        confidence: z.number(),
      })
    ),
  }),
  metadata: z.record(z.string(), z.any()).optional(),
});
