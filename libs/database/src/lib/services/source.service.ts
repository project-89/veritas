import { Injectable } from '@nestjs/common';
import { SourceNode } from '@veritas/shared/types';

@Injectable()
export class SourceService {
  // In a real implementation, this would interact with a database
  private sources: Map<string, SourceNode> = new Map();

  async findById(id: string): Promise<SourceNode | null> {
    return this.sources.get(id) || null;
  }

  async create(data: Partial<SourceNode>): Promise<SourceNode> {
    const id = data.id || this.generateId();
    const timestamp = new Date();

    const sourceNode: SourceNode = {
      id,
      name: data.name || '',
      type: data.type || 'other',
      createdAt: data.createdAt || timestamp,
      updatedAt: data.updatedAt || timestamp,
      url: data.url,
      description: data.description,
      trustScore: data.trustScore,
      metadata: data.metadata,
    };

    this.sources.set(id, sourceNode);
    return sourceNode;
  }

  async findAll(): Promise<SourceNode[]> {
    return Array.from(this.sources.values());
  }

  async update(
    id: string,
    data: Partial<SourceNode>
  ): Promise<SourceNode | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const updated: SourceNode = {
      ...existing,
      ...data,
      id, // Ensure ID doesn't change
      updatedAt: new Date(),
    };

    this.sources.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.sources.delete(id);
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}
