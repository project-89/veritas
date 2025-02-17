import { ModuleMetadata } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { ContentNode, SourceNode } from "@/schemas/base.schema";

export async function createTestingModule(
  metadata: ModuleMetadata
): Promise<TestingModule> {
  return Test.createTestingModule(metadata).compile();
}

export const mockContentNode: ContentNode = {
  id: "123e4567-e89b-12d3-a456-426614174000",
  text: "Test content",
  timestamp: new Date(),
  platform: "twitter",
  toxicity: 0.1,
  sentiment: "neutral",
  categories: ["test"],
  topics: ["test"],
  sourceId: "123e4567-e89b-12d3-a456-426614174001",
  metadata: {},
  engagementMetrics: {
    likes: 100,
    shares: 50,
    comments: 25,
    reach: 1000,
    viralityScore: 0.75,
  },
};

export const mockSourceNode: SourceNode = {
  id: "123e4567-e89b-12d3-a456-426614174001",
  name: "Test Source",
  platform: "twitter",
  credibilityScore: 0.8,
  verificationStatus: "verified",
};

export const mockTimeFrame = {
  start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
  end: new Date(),
};

export class MockMemgraphService {
  async executeQuery() {
    return [];
  }
  async createNode() {
    return {};
  }
  async createRelationship() {
    return {};
  }
  async findNodeById() {
    return null;
  }
}

export class MockRedisService {
  async get() {
    return null;
  }
  async set() {
    return;
  }
  async del() {
    return;
  }
  async exists() {
    return false;
  }
}

export function createMockRepository<T = any>() {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getOne: jest.fn().mockResolvedValue(null),
    })),
  };
}
