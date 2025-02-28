import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  ContentNode,
  ContentNodeSchema,
  SourceNode,
  SourceNodeSchema,
} from '../schemas/base.schema';

@Injectable()
export class DataIngestionService {
  private contentNodes: ContentNode[] = [];
  private sourceNodes: SourceNode[] = [];

  async ingestContent(content: ContentNode): Promise<ContentNode> {
    try {
      // Validate content
      const validatedContent = await this.validateData(
        ContentNodeSchema,
        content
      );

      // Check for duplicates
      const existingContent = this.contentNodes.find(
        (node) => node.id === validatedContent.id
      );
      if (existingContent) {
        throw new Error(
          `Content with ID ${validatedContent.id} already exists`
        );
      }

      // Add timestamp if not present
      if (!validatedContent.timestamp) {
        validatedContent.timestamp = Date.now();
      }

      // Store content
      this.contentNodes.push(validatedContent);

      return validatedContent;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.message}`);
      }
      throw error;
    }
  }

  async ingestSource(source: SourceNode): Promise<SourceNode> {
    try {
      // Validate source
      const validatedSource = await this.validateData(SourceNodeSchema, source);

      // Check for duplicates
      const existingSource = this.sourceNodes.find(
        (node) => node.id === validatedSource.id
      );
      if (existingSource) {
        throw new Error(`Source with ID ${validatedSource.id} already exists`);
      }

      // Add timestamp if not present
      if (!validatedSource.timestamp) {
        validatedSource.timestamp = Date.now();
      }

      // Store source
      this.sourceNodes.push(validatedSource);

      return validatedSource;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.message}`);
      }
      throw error;
    }
  }

  getContentById(id: string): ContentNode | undefined {
    return this.contentNodes.find((node) => node.id === id);
  }

  getSourceById(id: string): SourceNode | undefined {
    return this.sourceNodes.find((node) => node.id === id);
  }

  getAllContent(): ContentNode[] {
    return [...this.contentNodes];
  }

  getAllSources(): SourceNode[] {
    return [...this.sourceNodes];
  }

  deleteContentById(id: string): boolean {
    const initialLength = this.contentNodes.length;
    this.contentNodes = this.contentNodes.filter((node) => node.id !== id);
    return initialLength !== this.contentNodes.length;
  }

  deleteSourceById(id: string): boolean {
    const initialLength = this.sourceNodes.length;
    this.sourceNodes = this.sourceNodes.filter((node) => node.id !== id);
    return initialLength !== this.sourceNodes.length;
  }

  async validateData<T>(schema: z.ZodType<T>, data: unknown): Promise<T> {
    try {
      return schema.parse(data) as T;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Validation error: ${error.message}`);
      }
      throw error;
    }
  }
}
