import { Test, TestingModule } from "@nestjs/testing";
import { ContentValidationService } from "./content-validation.service";
import { z } from "zod";

describe("ContentValidationService", () => {
  let service: ContentValidationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ContentValidationService],
    }).compile();

    service = module.get<ContentValidationService>(ContentValidationService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("validateContentInput", () => {
    it("should validate valid content input", async () => {
      const validInput = {
        text: "Valid content",
        timestamp: new Date(),
        platform: "twitter",
        sourceId: "123e4567-e89b-12d3-a456-426614174000",
      };

      await expect(
        service.validateContentInput(validInput)
      ).resolves.not.toThrow();
    });

    it("should reject invalid content input", async () => {
      const invalidInput = {
        text: "", // Empty text
        timestamp: "invalid-date", // Invalid date
        platform: "invalid-platform", // Invalid platform
        sourceId: "invalid-uuid", // Invalid UUID
      };

      await expect(
        service.validateContentInput(invalidInput as any)
      ).rejects.toThrow();
    });
  });

  describe("validateContentUpdate", () => {
    it("should validate valid content update", async () => {
      const validUpdate = {
        text: "Updated content",
        metadata: { key: "value" },
      };

      await expect(
        service.validateContentUpdate(validUpdate)
      ).resolves.not.toThrow();
    });

    it("should reject invalid content update", async () => {
      const invalidUpdate = {
        text: "", // Empty text
        metadata: "invalid-metadata", // Invalid metadata type
      };

      await expect(
        service.validateContentUpdate(invalidUpdate as any)
      ).rejects.toThrow();
    });
  });

  describe("validateEngagementMetrics", () => {
    it("should validate valid engagement metrics", () => {
      const validMetrics = {
        likes: 100,
        shares: 50,
        comments: 25,
        reach: 1000,
      };

      expect(() =>
        service.validateEngagementMetrics(validMetrics)
      ).not.toThrow();
    });

    it("should reject invalid engagement metrics", () => {
      const invalidMetrics = {
        likes: -1, // Negative value
        shares: "50", // Invalid type
        comments: -25, // Negative value
        reach: "invalid", // Invalid type
      };

      expect(() =>
        service.validateEngagementMetrics(invalidMetrics as any)
      ).toThrow();
    });

    it("should allow partial metrics update", () => {
      const partialMetrics = {
        likes: 100,
        shares: 50,
      };

      expect(() =>
        service.validateEngagementMetrics(partialMetrics)
      ).not.toThrow();
    });
  });
});
