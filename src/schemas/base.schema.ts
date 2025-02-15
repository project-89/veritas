import { z } from 'zod';

// Base Schemas
export const ActivityMetricsSchema = z.object({
  postFrequency: z.number(),
  engagementRate: z.number(),
  activeHours: z.array(z.number()),
  interactionPattern: z.enum(['normal', 'automated', 'suspicious'])
});

export const EngagementMetricsSchema = z.object({
  likes: z.number(),
  shares: z.number(),
  comments: z.number(),
  reach: z.number(),
  viralityScore: z.number()
});

// Node Schemas
export const AccountNodeSchema = z.object({
  id: z.string().uuid(),
  platform: z.enum(['twitter', 'facebook', 'reddit', 'other']),
  creationDate: z.date(),
  activityMetrics: ActivityMetricsSchema,
  credibilityScore: z.number().min(0).max(1)
});

export const ContentNodeSchema = z.object({
  id: z.string().uuid(),
  text: z.string(),
  timestamp: z.date(),
  platform: z.enum(['twitter', 'facebook', 'reddit', 'other']),
  engagementMetrics: EngagementMetricsSchema
});

export const SourceNodeSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  credibilityScore: z.number().min(0).max(1),
  verificationStatus: z.enum(['verified', 'unverified', 'disputed'])
});

// Edge Schemas
export const SharesEdgeSchema = z.object({
  from: z.string().uuid(),
  to: z.string().uuid(),
  timestamp: z.date(),
  platform: z.enum(['twitter', 'facebook', 'reddit', 'other'])
});

export const InteractsEdgeSchema = z.object({
  from: z.string().uuid(),
  to: z.string().uuid(),
  type: z.enum(['reply', 'retweet', 'quote', 'mention']),
  timestamp: z.date()
});

// Derive TypeScript types
export type ActivityMetrics = z.infer<typeof ActivityMetricsSchema>;
export type EngagementMetrics = z.infer<typeof EngagementMetricsSchema>;
export type AccountNode = z.infer<typeof AccountNodeSchema>;
export type ContentNode = z.infer<typeof ContentNodeSchema>;
export type SourceNode = z.infer<typeof SourceNodeSchema>;
export type SharesEdge = z.infer<typeof SharesEdgeSchema>;
export type InteractsEdge = z.infer<typeof InteractsEdgeSchema>; 