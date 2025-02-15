import { makeApi } from '@zodios/core';
import { z } from 'zod';
import {
  ContentNodeSchema,
  SourceNodeSchema
} from '../schemas/base.schema';

// Additional API-specific schemas
const TimeFrameSchema = z.object({
  start: z.date(),
  end: z.date()
});

const DeviationMetricsSchema = z.object({
  baselineScore: z.number().min(0).max(1),
  deviationMagnitude: z.number(),
  propagationVelocity: z.number(),
  crossReferenceScore: z.number(),
  sourceCredibility: z.number().min(0).max(1),
  impactScore: z.number()
});

const PatternSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['organic', 'coordinated', 'automated']),
  confidence: z.number().min(0).max(1),
  nodes: z.array(z.string().uuid()),
  edges: z.array(z.string().uuid()),
  timeframe: TimeFrameSchema
});

// API Definitions
export const api = makeApi([
  {
    method: 'post',
    path: '/content',
    alias: 'createContent',
    description: 'Create new content node',
    parameters: [
      {
        name: 'content',
        type: 'Body',
        schema: ContentNodeSchema
      }
    ],
    response: ContentNodeSchema
  },
  {
    method: 'get',
    path: '/analysis/deviation',
    alias: 'getRealityDeviation',
    description: 'Get reality deviation metrics',
    parameters: [
      {
        name: 'narrativeId',
        type: 'Query',
        schema: z.string().uuid()
      }
    ],
    response: DeviationMetricsSchema
  },
  {
    method: 'get',
    path: '/analysis/patterns',
    alias: 'getPatterns',
    description: 'Get detected patterns in timeframe',
    parameters: [
      {
        name: 'timeframe',
        type: 'Query',
        schema: TimeFrameSchema
      }
    ],
    response: z.array(PatternSchema)
  }
]);

// Types are automatically inferred
export type API = typeof api; 