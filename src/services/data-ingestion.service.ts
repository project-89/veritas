import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  ContentNodeSchema,
  SourceNodeSchema,
  ContentNode,
  SourceNode
} from '../schemas/base.schema';

@Injectable()
export class DataIngestionService {
  async ingestContent(
    source: SourceNode,
    content: ContentNode
  ): Promise<void> {
    try {
      // Validate data at runtime
      const validSource = SourceNodeSchema.parse(source);
      const validContent = ContentNodeSchema.parse(content);
      
      // TODO: Implement actual data ingestion
      // 1. Store in graph database
      // 2. Index for search
      // 3. Trigger analysis pipeline
      
      console.log('Ingesting content:', {
        source: validSource,
        content: validContent
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.message}`);
      }
      throw error;
    }
  }

  async validateData<T extends z.ZodType>(
    schema: T,
    data: unknown
  ): Promise<z.infer<T>> {
    try {
      return schema.parse(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.message}`);
      }
      throw error;
    }
  }
} 