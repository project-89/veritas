import { Injectable } from '@nestjs/common';
import { z } from 'zod';

export interface ContentCreateInput {
  text: string;
  timestamp: Date;
  platform: string;
  sourceId: string;
  metadata?: Record<string, any>;
}

export interface ContentUpdateInput {
  text?: string;
  metadata?: Record<string, any>;
  engagementMetrics?: {
    likes?: number;
    shares?: number;
    comments?: number;
    reach?: number;
  };
}

const ContentCreateSchema = z.object({
  text: z.string().min(1).max(10000),
  timestamp: z.date(),
  platform: z.enum(['twitter', 'facebook', 'reddit', 'other']),
  sourceId: z.string().uuid(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const EngagementMetricsSchema = z.object({
  likes: z.number().min(0).optional(),
  shares: z.number().min(0).optional(),
  comments: z.number().min(0).optional(),
  reach: z.number().min(0).optional(),
});

const ContentUpdateSchema = z.object({
  text: z.string().min(1).max(10000).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  engagementMetrics: EngagementMetricsSchema.optional(),
});

@Injectable()
export class ContentValidationService {
  async validateContentInput(input: ContentCreateInput): Promise<void> {
    try {
      await ContentCreateSchema.parseAsync(input);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Content validation failed: ${error.message}`);
      }
      throw error;
    }
  }

  async validateContentUpdate(input: ContentUpdateInput): Promise<void> {
    try {
      await ContentUpdateSchema.parseAsync(input);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Content update validation failed: ${error.message}`);
      }
      throw error;
    }
  }

  validateEngagementMetrics(
    metrics: ContentUpdateInput['engagementMetrics']
  ): void {
    try {
      EngagementMetricsSchema.parse(metrics);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(
          `Engagement metrics validation failed: ${error.message}`
        );
      }
      throw error;
    }
  }
}
