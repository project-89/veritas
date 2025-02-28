import { z } from 'zod';

// Base node schema
export const NodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  timestamp: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type Node = z.infer<typeof NodeSchema>;

// Content node schema
export const ContentNodeSchema = NodeSchema.extend({
  type: z.literal('content'),
  content: z.string(),
  source: z.string().optional(),
  url: z.string().optional(),
  title: z.string().optional(),
  author: z.string().optional(),
  publishedAt: z.number().optional(),
  sentiment: z.number().optional(),
  topics: z.array(z.string()).optional(),
  entities: z.array(z.string()).optional(),
});

export type ContentNode = z.infer<typeof ContentNodeSchema>;

// Source node schema
export const SourceNodeSchema = NodeSchema.extend({
  type: z.literal('source'),
  name: z.string(),
  url: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  reliability: z.number().optional(),
  bias: z.number().optional(),
});

export type SourceNode = z.infer<typeof SourceNodeSchema>;

// Edge schema
export const EdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  type: z.string(),
  weight: z.number().optional(),
  timestamp: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type Edge = z.infer<typeof EdgeSchema>;

// Graph schema
export const GraphSchema = z.object({
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  metadata: z.record(z.unknown()).optional(),
});

export type Graph = z.infer<typeof GraphSchema>;
