import { Test, TestingModule } from "@nestjs/testing";
import { SourceService } from "./source.service";
import { SourceValidationService } from "./source-validation.service";
import { MemgraphService } from "@/database";
import { mockSourceNode, MockMemgraphService } from "test/test-utils";

describe("SourceService", () => {
  let service: SourceService;
  let memgraphService: MemgraphService;
  let validationService: SourceValidationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SourceService,
        SourceValidationService,
        {
          provide: MemgraphService,
          useClass: MockMemgraphService,
        },
      ],
    }).compile();

    service = module.get<SourceService>(SourceService);
    memgraphService = module.get<MemgraphService>(MemgraphService);
    validationService = module.get<SourceValidationService>(
      SourceValidationService
    );
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("createSource", () => {
    const createInput = {
      name: "Test Source",
      platform: "twitter",
      credibilityScore: 0.8,
      verificationStatus: "unverified",
    } as const;

    it("should create new source", async () => {
      jest
        .spyOn(validationService, "validateSourceInput")
        .mockResolvedValueOnce();
      jest
        .spyOn(memgraphService, "createNode")
        .mockResolvedValueOnce(mockSourceNode);

      const result = await service.createSource(createInput);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.name).toBe(createInput.name);
      expect(result.platform).toBe(createInput.platform);
      expect(result.credibilityScore).toBe(createInput.credibilityScore);
    });

    it("should throw error on validation failure", async () => {
      jest
        .spyOn(validationService, "validateSourceInput")
        .mockRejectedValueOnce(new Error("Validation failed"));

      await expect(service.createSource(createInput)).rejects.toThrow(
        "Validation failed"
      );
    });
  });

  describe("updateSource", () => {
    const updateInput = {
      name: "Updated Source",
      credibilityScore: 0.9,
      verificationStatus: "verified",
    } as const;

    it("should update existing source", async () => {
      const updatedSource = {
        ...mockSourceNode,
        name: updateInput.name,
        credibilityScore: updateInput.credibilityScore,
        verificationStatus: updateInput.verificationStatus,
      };
      jest
        .spyOn(validationService, "validateSourceUpdate")
        .mockResolvedValueOnce();
      jest
        .spyOn(memgraphService, "executeQuery")
        .mockResolvedValueOnce([{ s: mockSourceNode }])
        .mockResolvedValueOnce([{ s: updatedSource }]);

      const result = await service.updateSource("123", updateInput);

      expect(result).toBeDefined();
      expect(result.name).toBe(updateInput.name);
      expect(result.credibilityScore).toBe(updateInput.credibilityScore);
      expect(result.verificationStatus).toBe(updateInput.verificationStatus);
    });

    it("should throw error when source not found", async () => {
      jest.spyOn(memgraphService, "executeQuery").mockResolvedValueOnce([]);

      await expect(service.updateSource("123", updateInput)).rejects.toThrow(
        "Source not found"
      );
    });
  });

  describe("searchSources", () => {
    const searchParams = {
      query: "test",
      platform: "twitter",
      verificationStatus: "verified",
      minCredibilityScore: 0.7,
      limit: 10,
    } as const;

    it("should return search results", async () => {
      jest
        .spyOn(memgraphService, "executeQuery")
        .mockResolvedValueOnce([{ s: mockSourceNode }]);

      const results = await service.searchSources(searchParams);

      expect(Array.isArray(results)).toBe(true);
      if (results.length > 0) {
        expect(results[0]).toHaveProperty("id");
        expect(results[0]).toHaveProperty("name");
        expect(results[0]).toHaveProperty("credibilityScore");
      }
    });

    it("should handle empty search results", async () => {
      jest.spyOn(memgraphService, "executeQuery").mockResolvedValueOnce([]);

      const results = await service.searchSources(searchParams);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });
  });

  describe("getSourceById", () => {
    it("should return source by id", async () => {
      jest
        .spyOn(memgraphService, "executeQuery")
        .mockResolvedValueOnce([{ s: mockSourceNode }]);

      const result = await service.getSourceById("123");

      expect(result).toBeDefined();
      expect(result).toEqual(mockSourceNode);
    });

    it("should return null when source not found", async () => {
      jest.spyOn(memgraphService, "executeQuery").mockResolvedValueOnce([]);

      const result = await service.getSourceById("123");

      expect(result).toBeNull();
    });
  });

  describe("deleteSource", () => {
    it("should delete source successfully", async () => {
      jest
        .spyOn(memgraphService, "executeQuery")
        .mockResolvedValueOnce([{ deleted: 1 }]);

      const result = await service.deleteSource("123");

      expect(result).toBe(true);
    });

    it("should return false when source not found", async () => {
      jest
        .spyOn(memgraphService, "executeQuery")
        .mockResolvedValueOnce([{ deleted: 0 }]);

      const result = await service.deleteSource("123");

      expect(result).toBe(false);
    });
  });

  describe("getSourceContent", () => {
    it("should return source content", async () => {
      const mockContent = [{ id: "1", text: "test" }];
      jest
        .spyOn(memgraphService, "executeQuery")
        .mockResolvedValueOnce([{ c: mockContent[0] }]);

      const results = await service.getSourceContent("123");

      expect(Array.isArray(results)).toBe(true);
      if (results.length > 0) {
        expect(results[0]).toHaveProperty("id");
        expect(results[0]).toHaveProperty("text");
      }
    });
  });

  describe("updateCredibilityScore", () => {
    it("should update credibility score", async () => {
      const updatedSource = {
        ...mockSourceNode,
        credibilityScore: 0.9,
      };
      jest
        .spyOn(memgraphService, "executeQuery")
        .mockResolvedValueOnce([{ s: mockSourceNode }])
        .mockResolvedValueOnce([{ s: updatedSource }]);

      const result = await service.updateCredibilityScore("123", 0.9);

      expect(result).toBeDefined();
      expect(result.credibilityScore).toBe(0.9);
    });

    it("should throw error when source not found", async () => {
      jest.spyOn(memgraphService, "executeQuery").mockResolvedValueOnce([]);

      await expect(service.updateCredibilityScore("123", 0.9)).rejects.toThrow(
        "Source not found"
      );
    });
  });

  describe("calculateAggregateCredibility", () => {
    it("should calculate aggregate credibility", async () => {
      jest.spyOn(memgraphService, "executeQuery").mockResolvedValueOnce([
        {
          contentCount: 100,
          verifiedContentCount: 80,
          averageEngagement: 0.7,
          crossReferences: 50,
        },
      ]);

      const score = await service.calculateAggregateCredibility("123");

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it("should return default score when no data available", async () => {
      jest.spyOn(memgraphService, "executeQuery").mockResolvedValueOnce([]);

      const score = await service.calculateAggregateCredibility("123");

      expect(score).toBe(0.5); // Assuming 0.5 is the default score
    });
  });
});
