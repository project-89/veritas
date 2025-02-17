import { Test, TestingModule } from "@nestjs/testing";
import { IngestionResolver } from "./ingestion.resolver";
import { ContentStorageService } from "../content-storage.service";
import { ContentClassificationService } from "@/modules/content/services/content-classification.service";
import { ContentNode, SourceNode } from "@/schemas/base.schema";
import { Platform, VerificationStatus } from "../types/ingestion.types";

describe("IngestionResolver", () => {
  let resolver: IngestionResolver;
  let storageService: jest.Mocked<ContentStorageService>;
  let classificationService: jest.Mocked<ContentClassificationService>;

  const mockClassification = {
    categories: ["news"],
    sentiment: "neutral" as const,
    toxicity: 0.1,
    subjectivity: 0.5,
    language: "en",
    topics: ["technology"],
    entities: [
      {
        text: "test",
        type: "keyword",
        confidence: 0.9,
      },
    ],
  };

  const mockEngagementMetrics = {
    likes: 100,
    shares: 50,
    comments: 25,
    reach: 1000,
    viralityScore: 0.75,
  };

  beforeEach(async () => {
    const mockStorageService = {
      ingestContent: jest.fn(),
      verifySource: jest.fn(),
    };

    const mockClassificationService = {
      classifyContent: jest.fn().mockResolvedValue(mockClassification),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionResolver,
        {
          provide: ContentStorageService,
          useValue: mockStorageService,
        },
        {
          provide: ContentClassificationService,
          useValue: mockClassificationService,
        },
      ],
    }).compile();

    resolver = module.get<IngestionResolver>(IngestionResolver);
    storageService = module.get(ContentStorageService);
    classificationService = module.get(ContentClassificationService);
  });

  describe("ingestContent", () => {
    it("should successfully ingest content with source", async () => {
      const contentInput = {
        text: "Test content",
        platform: Platform.TWITTER,
        engagementMetrics: mockEngagementMetrics,
        metadata: { source: "test" },
      };

      const sourceInput = {
        name: "Test Source",
        platform: Platform.TWITTER,
        credibilityScore: 0.8,
        verificationStatus: VerificationStatus.VERIFIED,
        metadata: { verified: true },
      };

      const contentNode: ContentNode = {
        id: expect.any(String),
        text: contentInput.text,
        timestamp: expect.any(Date),
        platform: contentInput.platform,
        toxicity: mockClassification.toxicity,
        sentiment: mockClassification.sentiment,
        categories: mockClassification.categories,
        topics: mockClassification.topics,
        engagementMetrics: contentInput.engagementMetrics,
        metadata: contentInput.metadata,
      };

      const expectedSourceNode: SourceNode = {
        id: expect.any(String),
        name: sourceInput.name,
        platform: sourceInput.platform,
        credibilityScore: sourceInput.credibilityScore,
        verificationStatus: sourceInput.verificationStatus,
        metadata: sourceInput.metadata,
      };

      storageService.ingestContent.mockResolvedValue({
        contentNode: contentNode,
        sourceNode: expectedSourceNode,
      });

      const result = await resolver.ingestContent(contentInput, sourceInput);

      expect(result).toEqual(contentNode);
      expect(classificationService.classifyContent).toHaveBeenCalledWith(
        contentInput.text
      );
      expect(storageService.ingestContent).toHaveBeenCalledWith(
        expect.objectContaining(contentNode),
        expect.objectContaining(expectedSourceNode)
      );
    });

    it("should handle classification service errors", async () => {
      classificationService.classifyContent.mockRejectedValue(
        new Error("Classification failed")
      );

      const contentInput = {
        text: "Test content",
        platform: Platform.TWITTER,
        engagementMetrics: mockEngagementMetrics,
      };

      const sourceInput = {
        name: "Test Source",
        platform: Platform.TWITTER,
        credibilityScore: 0.8,
        verificationStatus: VerificationStatus.VERIFIED,
      };

      await expect(
        resolver.ingestContent(contentInput, sourceInput)
      ).rejects.toThrow("Classification failed");
    });
  });

  describe("verifySource", () => {
    it("should successfully verify a source", async () => {
      const sourceId = "test-id";
      const status = VerificationStatus.VERIFIED;
      const expectedSource: SourceNode = {
        id: sourceId,
        name: "Test Source",
        platform: Platform.TWITTER,
        credibilityScore: 0.8,
        verificationStatus: status,
      };

      storageService.verifySource.mockResolvedValue(expectedSource);

      const result = await resolver.verifySource(sourceId, status);

      expect(result).toEqual(expectedSource);
      expect(storageService.verifySource).toHaveBeenCalledWith(
        sourceId,
        status
      );
    });

    it("should handle verification errors", async () => {
      const sourceId = "test-id";
      const status = VerificationStatus.VERIFIED;

      storageService.verifySource.mockRejectedValue(
        new Error("Verification failed")
      );

      await expect(resolver.verifySource(sourceId, status)).rejects.toThrow(
        "Verification failed"
      );
    });
  });
});
