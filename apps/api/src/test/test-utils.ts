import { MemgraphService } from '@/database';

export class MockMemgraphService extends MemgraphService {
  private mockQueryResults: Record<string, any[]> = {};
  private mockNodes: Record<string, any> = {};
  queryHistory: { query: string; params?: Record<string, any> }[] = [];

  constructor() {
    super();
  }

  setMockQueryResult(query: string, result: any[]): void {
    this.mockQueryResults[query] = result;
  }

  setMockNode(id: string, node: any): void {
    this.mockNodes[id] = node;
  }

  async executeQuery(
    query: string,
    params?: Record<string, any>
  ): Promise<any[]> {
    this.queryHistory.push({ query, params });

    // Return mock result if available
    if (this.mockQueryResults[query]) {
      return this.mockQueryResults[query];
    }

    // Default empty result
    return [];
  }

  async getNodeById(id: string): Promise<any | null> {
    return this.mockNodes[id] || null;
  }

  async createNode(
    label: string,
    properties: Record<string, any>
  ): Promise<any> {
    const id = properties.id || `mock-${Date.now()}`;
    this.mockNodes[id] = { ...properties, _label: label };
    return this.mockNodes[id];
  }

  async createRelationship(
    sourceId: string,
    targetId: string,
    type: string,
    properties?: Record<string, any>
  ): Promise<any> {
    return {
      source: this.mockNodes[sourceId],
      target: this.mockNodes[targetId],
      type,
      ...properties,
    };
  }

  override async deleteNodeById(id: string): Promise<boolean> {
    if (this.mockNodes[id]) {
      delete this.mockNodes[id];
      return true;
    }
    return false;
  }

  getQueryHistory(): { query: string; params?: Record<string, any> }[] {
    return [...this.queryHistory];
  }

  clearQueryHistory(): void {
    this.queryHistory = [];
  }
}
