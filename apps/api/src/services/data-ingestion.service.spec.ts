import { Test, TestingModule } from "@nestjs/testing";
import { DataIngestionService } from "./data-ingestion.service";
import { z } from "zod";
import {
  ContentNode,
  SourceNode,
  ContentNodeSchema,
  SourceNodeSchema,
} from "../schemas/base.schema";

describe("DataIngestionService", () => {
  let service: DataIngestionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DataIngestionService],
    }).compile();

    service = module.get<DataIngestionService>(DataIngestionService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("ingestContent", () => {
    const mockSource: SourceNode = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      name: "Test Source",
      platform: "twitter",
      credibilityScore: 0.8,
      verificationStatus: "verified",
    };

    const mockContent: ContentNode = {
      id: "123e4567-e89b-12d3-a456-426614174001",
      text: "Test content",
      timestamp: new Date(),
      platform: "twitter",
      sourceId: "123e4567-e89b-12d3-a456-426614174000",
      toxicity: 0.1,
      sentiment: "neutral",
      categories: ["test"],
      topics: ["test"],
    };

    it("should successfully ingest valid content and source", async () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      await expect(
        service.ingestContent(mockSource, mockContent)
      ).resolves.not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        "Ingesting content:",
        expect.objectContaining({
          source: mockSource,
          content: mockContent,
        })
      );
    });

    it("should throw error for invalid source", async () => {
      const invalidSource = { ...mockSource, platform: "invalid" };

      await expect(
        service.ingestContent(invalidSource as SourceNode, mockContent)
      ).rejects.toThrow("Validation error");
    });

    it("should throw error for invalid content", async () => {
      const invalidContent = { ...mockContent, sentiment: "invalid" };

      await expect(
        service.ingestContent(mockSource, invalidContent as ContentNode)
      ).rejects.toThrow("Validation error");
    });

    it("should handle non-validation errors", async () => {
      const error = new Error("Test error");
      jest.spyOn(SourceNodeSchema, "parse").mockImplementation(() => {
        throw error;
      });

      await expect(
        service.ingestContent(mockSource, mockContent)
      ).rejects.toThrow(error);
    });
  });

  describe("validateData", () => {
    const TestSchema = z.object({
      name: z.string(),
      value: z.number(),
    });

    it("should validate correct data", async () => {
      const validData = { name: "test", value: 123 };

      const result = await service.validateData(TestSchema, validData);
      expect(result).toEqual(validData);
    });

    it("should throw error for invalid data", async () => {
      const invalidData = { name: "test", value: "not a number" };

      await expect(
        service.validateData(TestSchema, invalidData)
      ).rejects.toThrow("Validation error");
    });

    it("should handle non-validation errors", async () => {
      const error = new Error("Test error");
      jest.spyOn(TestSchema, "parse").mockImplementation(() => {
        throw error;
      });

      await expect(service.validateData(TestSchema, {})).rejects.toThrow(error);
    });

    it("should validate complex nested data", async () => {
      const ComplexSchema = z.object({
        name: z.string(),
        nested: z.object({
          array: z.array(z.number()),
          optional: z.string().optional(),
        }),
      });

      const validData = {
        name: "test",
        nested: {
          array: [1, 2, 3],
          optional: "value",
        },
      };

      const result = await service.validateData(ComplexSchema, validData);
      expect(result).toEqual(validData);
    });
  });
});
