import { Injectable } from '@nestjs/common';
import { ContentNode } from '@veritas/shared/types';

@Injectable()
export class ContentService {
  // In a real implementation, this would interact with a database
  private contentItems: Map<string, ContentNode> = new Map();

  async findById(id: string): Promise<ContentNode | null> {
    return this.contentItems.get(id) || null;
  }

  async create(data: Partial<ContentNode>): Promise<ContentNode> {
    const id = data.id || this.generateId();
    const timestamp = new Date();

    const contentNode: ContentNode = {
      id,
      title: data.title || '',
      content: data.content || '',
      sourceId: data.sourceId || '',
      createdAt: data.createdAt || timestamp,
      updatedAt: data.updatedAt || timestamp,
      authorId: data.authorId,
      url: data.url,
      engagementMetrics: data.engagementMetrics,
      metadata: data.metadata,
    };

    this.contentItems.set(id, contentNode);
    return contentNode;
  }

  async findAll(): Promise<ContentNode[]> {
    return Array.from(this.contentItems.values());
  }

  async update(
    id: string,
    data: Partial<ContentNode>
  ): Promise<ContentNode | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const updated: ContentNode = {
      ...existing,
      ...data,
      id, // Ensure ID doesn't change
      updatedAt: new Date(),
    };

    this.contentItems.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.contentItems.delete(id);
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}
