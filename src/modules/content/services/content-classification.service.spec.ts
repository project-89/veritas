import { Test, TestingModule } from "@nestjs/testing";
import {
  ContentClassificationService,
  ContentClassification,
} from "./content-classification.service";

describe("ContentClassificationService", () => {
  let service: ContentClassificationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ContentClassificationService],
    }).compile();

    service = module.get<ContentClassificationService>(
      ContentClassificationService
    );
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("classifyContent", () => {
    it("should classify content with all required fields", async () => {
      const text = "Sample content for classification";

      const result = await service.classifyContent(text);

      expect(result).toEqual({
        categories: ["general"],
        sentiment: "neutral",
        toxicity: 0,
        subjectivity: 0.5,
        language: "en",
        topics: [],
        entities: [],
      });
    });

    it("should handle empty text", async () => {
      const result = await service.classifyContent("");

      expect(result).toEqual({
        categories: ["general"],
        sentiment: "neutral",
        toxicity: 0,
        subjectivity: 0.5,
        language: "en",
        topics: [],
        entities: [],
      });
    });
  });

  describe("batchClassify", () => {
    it("should classify multiple texts", async () => {
      const texts = [
        "First sample content",
        "Second sample content",
        "Third sample content",
      ];

      const results = await service.batchClassify(texts);

      expect(results).toHaveLength(texts.length);
      results.forEach((result) => {
        expect(result).toEqual({
          categories: ["general"],
          sentiment: "neutral",
          toxicity: 0,
          subjectivity: 0.5,
          language: "en",
          topics: [],
          entities: [],
        });
      });
    });

    it("should handle empty array", async () => {
      const results = await service.batchClassify([]);
      expect(results).toHaveLength(0);
    });
  });

  describe("updateClassification", () => {
    it("should update existing classification with new text", async () => {
      const existingClassification: ContentClassification = {
        categories: ["general"],
        sentiment: "neutral",
        toxicity: 0,
        subjectivity: 0.5,
        language: "en",
        topics: [],
        entities: [],
      };
      const newText = "Updated content for classification";

      const result = await service.updateClassification(
        existingClassification,
        newText
      );

      expect(result).toEqual({
        categories: ["general"],
        sentiment: "neutral",
        toxicity: 0,
        subjectivity: 0.5,
        language: "en",
        topics: [],
        entities: [],
      });
    });
  });
});
