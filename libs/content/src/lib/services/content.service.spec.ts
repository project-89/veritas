import { Test, TestingModule } from "@nestjs/testing";
import { ContentService } from "./content.service";
import { ContentValidationService } from "./content-validation.service";
import { ContentClassificationService } from "./content-classification.service";
import { MemgraphService } from "@/database";
import { MockMemgraphService, mockContentNode } from "test/test-utils";

describe("ContentService", () => {
  let service: ContentService;
  let memgraphService: MemgraphService;
  let validationService: ContentValidationService;
  let classificationService: ContentClassificationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentService,
        ContentValidationService,
        ContentClassificationService,
        {
          provide: MemgraphService,
          useClass: MockMemgraphService,
        },
      ],
    }).compile();

    service = module.get<ContentService>(ContentService);
    memgraphService = module.get<MemgraphService>(MemgraphService);
    validationService = module.get<ContentValidationService>(
      ContentValidationService
    );
    classificationService = module.get<ContentClassificationService>(
      ContentClassificationService
    );
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("createContent", () => {
    const createInput = {
      text: "Test content",
      timestamp: new Date(),
      platform: "twitter",
      sourceId: "123",
    };

    it("should create new content", async () => {
      jest
        .spyOn(validationService, "validateContentInput")
        .mockResolvedValueOnce();
      jest
        .spyOn(classificationService, "classifyContent")
        .mockResolvedValueOnce({
          categories: ["test"],
          sentiment: "neutral",
          toxicity: 0.1,
          subjectivity: 0.5,
          language: "en",
          topics: ["test"],
          entities: [
            {
              text: "test",
              type: "keyword",
              confidence: 0.9,
            },
          ],
        });
      jest
        .spyOn(memgraphService, "createNode")
        .mockResolvedValueOnce(mockContentNode);

      const result = await service.createContent(createInput);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.text).toBe(createInput.text);
      expect(result.platform).toBe(createInput.platform);
    });

    it("should throw error on validation failure", async () => {
      jest
        .spyOn(validationService, "validateContentInput")
        .mockRejectedValueOnce(new Error("Validation failed"));

      await expect(service.createContent(createInput)).rejects.toThrow(
        "Validation failed"
      );
    });
  });

  describe("updateContent", () => {
    const updateInput = {
      text: "Updated content",
      metadata: { key: "value" },
    };

    it("should update existing content", async () => {
      const updatedContent = {
        ...mockContentNode,
        text: updateInput.text,
        metadata: updateInput.metadata,
      };
      jest
        .spyOn(validationService, "validateContentUpdate")
        .mockResolvedValueOnce();
      jest
        .spyOn(memgraphService, "executeQuery")
        .mockResolvedValueOnce([{ c: mockContentNode }])
        .mockResolvedValueOnce([{ c: updatedContent }]);

      const result = await service.updateContent("123", updateInput);

      expect(result).toBeDefined();
      expect(result.text).toBe(updateInput.text);
      expect(result.metadata).toEqual(updateInput.metadata);
    });

    it("should throw error when content not found", async () => {
      jest.spyOn(memgraphService, "executeQuery").mockResolvedValueOnce([]);

      await expect(service.updateContent("123", updateInput)).rejects.toThrow(
        "Content not found"
      );
    });
  });

  describe("searchContent", () => {
    const searchParams = {
      query: "test",
      platform: "twitter",
      limit: 10,
    };

    it("should return search results", async () => {
      jest
        .spyOn(memgraphService, "executeQuery")
        .mockResolvedValueOnce([{ c: mockContentNode }]);

      const results = await service.searchContent(searchParams);

      expect(Array.isArray(results)).toBe(true);
      if (results.length > 0) {
        expect(results[0]).toHaveProperty("id");
        expect(results[0]).toHaveProperty("text");
        expect(results[0]).toHaveProperty("platform");
      }
    });

    it("should handle empty search results", async () => {
      jest.spyOn(memgraphService, "executeQuery").mockResolvedValueOnce([]);

      const results = await service.searchContent(searchParams);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });
  });

  describe("getContentById", () => {
    it("should return content by id", async () => {
      jest
        .spyOn(memgraphService, "executeQuery")
        .mockResolvedValueOnce([{ c: mockContentNode }]);

      const result = await service.getContentById("123");

      expect(result).toBeDefined();
      expect(result).toEqual(mockContentNode);
    });

    it("should return null when content not found", async () => {
      jest.spyOn(memgraphService, "executeQuery").mockResolvedValueOnce([]);

      const result = await service.getContentById("123");

      expect(result).toBeNull();
    });
  });

  describe("deleteContent", () => {
    it("should delete content successfully", async () => {
      jest
        .spyOn(memgraphService, "executeQuery")
        .mockResolvedValueOnce([{ deleted: 1 }]);

      const result = await service.deleteContent("123");

      expect(result).toBe(true);
    });

    it("should return false when content not found", async () => {
      jest
        .spyOn(memgraphService, "executeQuery")
        .mockResolvedValueOnce([{ deleted: 0 }]);

      const result = await service.deleteContent("123");

      expect(result).toBe(false);
    });
  });

  describe("getRelatedContent", () => {
    it("should return related content", async () => {
      jest
        .spyOn(memgraphService, "executeQuery")
        .mockResolvedValueOnce([{ related: mockContentNode }]);

      const results = await service.getRelatedContent("123");

      expect(Array.isArray(results)).toBe(true);
      if (results.length > 0) {
        expect(results[0]).toHaveProperty("id");
        expect(results[0]).toHaveProperty("text");
        expect(results[0]).toHaveProperty("platform");
      }
    });
  });

  describe("updateEngagementMetrics", () => {
    const metrics = {
      likes: 200,
      shares: 100,
      comments: 50,
      reach: 2000,
    };

    it("should update engagement metrics", async () => {
      const updatedContent = {
        ...mockContentNode,
        engagementMetrics: metrics,
      };
      jest
        .spyOn(validationService, "validateEngagementMetrics")
        .mockReturnValueOnce();
      jest
        .spyOn(memgraphService, "executeQuery")
        .mockResolvedValueOnce([{ c: mockContentNode }])
        .mockResolvedValueOnce([{ c: updatedContent }]);

      const result = await service.updateEngagementMetrics("123", metrics);

      expect(result).toBeDefined();
      expect(result.engagementMetrics).toMatchObject(
        expect.objectContaining(metrics)
      );
    });

    it("should throw error when content not found", async () => {
      jest.spyOn(memgraphService, "executeQuery").mockResolvedValueOnce([]);

      await expect(
        service.updateEngagementMetrics("123", metrics)
      ).rejects.toThrow("Content not found");
    });
  });
});
