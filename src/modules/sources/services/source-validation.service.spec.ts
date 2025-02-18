import { Test, TestingModule } from "@nestjs/testing";
import { SourceValidationService } from "./source-validation.service";
import { SourceCreateInput, SourceUpdateInput } from "./source.service";

describe("SourceValidationService", () => {
  let service: SourceValidationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SourceValidationService],
    }).compile();

    service = module.get<SourceValidationService>(SourceValidationService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("validateSourceInput", () => {
    const validInput: SourceCreateInput = {
      name: "Test Source",
      platform: "twitter",
      credibilityScore: 0.8,
      verificationStatus: "verified",
      metadata: { key: "value" },
    };

    it("should validate correct input", async () => {
      await expect(
        service.validateSourceInput(validInput)
      ).resolves.not.toThrow();
    });

    it("should validate input without optional fields", async () => {
      const minimalInput: SourceCreateInput = {
        name: "Test Source",
        platform: "twitter",
      };
      await expect(
        service.validateSourceInput(minimalInput)
      ).resolves.not.toThrow();
    });

    it("should throw error for empty name", async () => {
      const invalidInput = { ...validInput, name: "" };
      await expect(service.validateSourceInput(invalidInput)).rejects.toThrow(
        "Source validation failed"
      );
    });

    it("should throw error for name exceeding max length", async () => {
      const invalidInput = {
        ...validInput,
        name: "a".repeat(201), // Max length is 200
      };
      await expect(service.validateSourceInput(invalidInput)).rejects.toThrow(
        "Source validation failed"
      );
    });

    it("should throw error for invalid platform", async () => {
      const invalidInput = {
        ...validInput,
        platform: "invalid_platform" as any,
      };
      await expect(service.validateSourceInput(invalidInput)).rejects.toThrow(
        "Source validation failed"
      );
    });

    it("should throw error for invalid credibility score", async () => {
      const invalidInput = { ...validInput, credibilityScore: 1.5 };
      await expect(service.validateSourceInput(invalidInput)).rejects.toThrow(
        "Source validation failed"
      );
    });

    it("should throw error for invalid verification status", async () => {
      const invalidInput = {
        ...validInput,
        verificationStatus: "invalid_status" as any,
      };
      await expect(service.validateSourceInput(invalidInput)).rejects.toThrow(
        "Source validation failed"
      );
    });

    it("should validate metadata with various value types", async () => {
      const inputWithComplexMetadata: SourceCreateInput = {
        ...validInput,
        metadata: {
          string: "value",
          number: 123,
          boolean: true,
          array: [1, 2, 3],
          object: { key: "value" },
          null: null,
        },
      };
      await expect(
        service.validateSourceInput(inputWithComplexMetadata)
      ).resolves.not.toThrow();
    });
  });

  describe("validateSourceUpdate", () => {
    const validUpdate: SourceUpdateInput = {
      name: "Updated Source",
      credibilityScore: 0.9,
      verificationStatus: "verified",
      metadata: { key: "updated_value" },
    };

    it("should validate correct update input", async () => {
      await expect(
        service.validateSourceUpdate(validUpdate)
      ).resolves.not.toThrow();
    });

    it("should validate partial update", async () => {
      const partialUpdate: SourceUpdateInput = {
        name: "Updated Source",
      };
      await expect(
        service.validateSourceUpdate(partialUpdate)
      ).resolves.not.toThrow();
    });

    it("should throw error for invalid name in update", async () => {
      const invalidUpdate = { ...validUpdate, name: "" };
      await expect(service.validateSourceUpdate(invalidUpdate)).rejects.toThrow(
        "Source update validation failed"
      );
    });

    it("should throw error for invalid credibility score in update", async () => {
      const invalidUpdate = { ...validUpdate, credibilityScore: -0.1 };
      await expect(service.validateSourceUpdate(invalidUpdate)).rejects.toThrow(
        "Source update validation failed"
      );
    });

    it("should throw error for invalid verification status in update", async () => {
      const invalidUpdate = {
        ...validUpdate,
        verificationStatus: "invalid_status" as any,
      };
      await expect(service.validateSourceUpdate(invalidUpdate)).rejects.toThrow(
        "Source update validation failed"
      );
    });

    it("should validate empty update object", async () => {
      const emptyUpdate: SourceUpdateInput = {};
      await expect(
        service.validateSourceUpdate(emptyUpdate)
      ).resolves.not.toThrow();
    });

    it("should validate update with only metadata", async () => {
      const metadataUpdate: SourceUpdateInput = {
        metadata: { newKey: "newValue" },
      };
      await expect(
        service.validateSourceUpdate(metadataUpdate)
      ).resolves.not.toThrow();
    });
  });
});
