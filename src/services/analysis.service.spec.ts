import { Test, TestingModule } from "@nestjs/testing";
import { AnalysisService } from "./analysis.service";
import { MemgraphService } from "@/database";
import { MockMemgraphService } from "test/test-utils";
import { ExtendedContentNode } from "@/modules/analysis/analysis.types";
import { ContentClassification } from "@/modules/content/services/content-classification.service";
import { ContentNode } from "@/schemas/base.schema";

describe("AnalysisService", () => {
  let service: AnalysisService;
  let memgraphService: MemgraphService;

  const mockClassification: ContentClassification = {
    sentiment: "neutral",
    categories: ["news"],
    topics: ["test"],
    toxicity: 0.1,
    subjectivity: 0.5,
    language: "en",
    entities: [
      {
        text: "test",
        type: "keyword",
        confidence: 0.9,
      },
    ],
  };

  const mockBaseContent: ContentNode = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    text: "Test content",
    sourceId: "source-123",
    timestamp: new Date(),
    platform: "twitter",
    classification: mockClassification,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalysisService,
        {
          provide: MemgraphService,
          useClass: MockMemgraphService,
        },
      ],
    }).compile();

    service = module.get<AnalysisService>(AnalysisService);
    memgraphService = module.get<MemgraphService>(MemgraphService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("measureRealityDeviation", () => {
    const narrativeId = "123e4567-e89b-12d3-a456-426614174000";
    const sourceId = "source-123";

    it("should calculate deviation metrics for valid narrative", async () => {
      const mockContent = {
        ...mockBaseContent,
        id: narrativeId,
        text: "Test narrative",
      };

      jest
        .spyOn(memgraphService, "executeQuery")
        .mockResolvedValueOnce([{ c: mockContent }]) // getNarrativeContent
        .mockResolvedValueOnce([{ sourceId }]) // getContentSourceId
        .mockResolvedValueOnce([
          {
            contentCount: 100,
            verifiedContentCount: 80,
            avgEngagement: 0.7,
            crossReferences: 50,
          },
        ]) // calculateSourceCredibility
        .mockResolvedValueOnce([
          {
            shareCount: 2,
            totalReach: 300,
            totalEngagement: 1.7,
            platformCount: 1,
            firstShare: 0,
            lastShare: 86400, // 1 day in seconds
          },
        ]) // analyzePropagation
        .mockResolvedValueOnce([
          {
            references: [
              { type: "support", sourceId: "verified-source" },
              { type: "contradiction", sourceId: "other-source" },
            ],
          },
        ]); // analyzeCrossReferences

      const result = await service.measureRealityDeviation(narrativeId);

      expect(result).toBeDefined();
      expect(result.baselineScore).toBeGreaterThanOrEqual(0);
      expect(result.baselineScore).toBeLessThanOrEqual(1);
      expect(result.deviationMagnitude).toBeDefined();
      expect(result.propagationVelocity).toBeDefined();
      expect(result.crossReferenceScore).toBeDefined();
      expect(result.sourceCredibility).toBeGreaterThanOrEqual(0);
      expect(result.sourceCredibility).toBeLessThanOrEqual(1);
      expect(result.impactScore).toBeDefined();
    });

    it("should throw error when narrative not found", async () => {
      jest.spyOn(memgraphService, "executeQuery").mockResolvedValueOnce([]);

      await expect(
        service.measureRealityDeviation(narrativeId)
      ).rejects.toThrow("Narrative content not found for ID:");
    });

    it("should handle invalid timestamps in propagation data", async () => {
      jest
        .spyOn(memgraphService, "executeQuery")
        .mockResolvedValueOnce([{ c: mockBaseContent }])
        .mockResolvedValueOnce([{ sourceId: "source-123" }])
        .mockResolvedValueOnce([{ contentCount: 100 }])
        .mockResolvedValueOnce([
          {
            shareCount: 2,
            totalReach: 300,
            totalEngagement: 1.7,
            platformCount: 1,
            firstShare: null,
            lastShare: "invalid",
          },
        ])
        .mockResolvedValueOnce([{ references: [] }]);

      const result = await service.measureRealityDeviation(mockBaseContent.id);
      expect(result.propagationVelocity).toBe(0);
    });

    it("should handle extreme engagement metrics", async () => {
      jest
        .spyOn(memgraphService, "executeQuery")
        .mockResolvedValueOnce([{ c: mockBaseContent }])
        .mockResolvedValueOnce([{ sourceId: "source-123" }])
        .mockResolvedValueOnce([{ contentCount: 100 }])
        .mockResolvedValueOnce([
          {
            shareCount: 1000000,
            totalReach: 1000000000,
            totalEngagement: 100,
            platformCount: 10,
            firstShare: 0,
            lastShare: 3600,
          },
        ])
        .mockResolvedValueOnce([{ references: [] }]);

      const result = await service.measureRealityDeviation(mockBaseContent.id);
      expect(result.impactScore).toBeGreaterThan(0.8);
    });

    it("should handle conflicting cross-references", async () => {
      jest
        .spyOn(memgraphService, "executeQuery")
        .mockResolvedValueOnce([{ c: mockBaseContent }])
        .mockResolvedValueOnce([{ sourceId: "source-123" }])
        .mockResolvedValueOnce([
          {
            contentCount: 100,
            verifiedContentCount: 50,
            avgEngagement: 0.5,
            crossReferences: 50,
            verifiedSourceCount: 5,
            totalSourceCount: 20,
          },
        ])
        .mockResolvedValueOnce([
          {
            shareCount: 2,
            totalReach: 300,
            totalEngagement: 1.7,
            platformCount: 1,
            firstShare: 0,
            lastShare: 86400,
          },
        ])
        .mockResolvedValueOnce([
          {
            verifiedSources: 2,
            contradictions: 2,
            supporting: 2,
            total: 4,
            references: [
              {
                type: "support",
                sourceId: "source-1",
                credibilityScore: 0.5,
                verificationStatus: "verified",
              },
              {
                type: "contradiction",
                sourceId: "source-2",
                credibilityScore: 0.5,
                verificationStatus: "verified",
              },
              {
                type: "support",
                sourceId: "source-3",
                credibilityScore: 0.5,
                verificationStatus: "unverified",
              },
              {
                type: "contradiction",
                sourceId: "source-4",
                credibilityScore: 0.5,
                verificationStatus: "unverified",
              },
            ],
          },
        ]);

      const result = await service.measureRealityDeviation(mockBaseContent.id);
      expect(result.crossReferenceScore).toBeGreaterThan(0.4);
      expect(result.crossReferenceScore).toBeLessThan(0.6);
    });
  });

  describe("detectPatterns", () => {
    const mockNodes = [
      { id: "user1", type: "account", name: "User 1" },
      { id: "user2", type: "account", name: "User 2" },
      { id: "content1", type: "content", text: "Test content 1" },
      { id: "content2", type: "content", text: "Test content 2" },
    ];

    const mockInteractions = [
      {
        r: {
          id: "1",
          type: "share",
          properties: {
            timestamp: new Date("2024-01-01T10:00:00Z"),
            engagement: 0.8,
          },
        },
        n: { id: "user1", type: "account" },
        m: { id: "content1", type: "content" },
      },
      {
        r: {
          id: "2",
          type: "share",
          properties: {
            timestamp: new Date("2024-01-01T10:15:00Z"),
            engagement: 0.7,
          },
        },
        n: { id: "user2", type: "account" },
        m: { id: "content1", type: "content" },
      },
      {
        r: {
          id: "3",
          type: "share",
          properties: {
            timestamp: new Date("2024-01-01T10:30:00Z"),
            engagement: 0.9,
          },
        },
        n: { id: "user3", type: "account" },
        m: { id: "content1", type: "content" },
      },
    ];

    const mockAutomatedInteractions = [
      {
        r: {
          id: "4",
          type: "share",
          properties: {
            timestamp: new Date("2024-01-01T12:00:00Z"),
            engagement: 0.5,
          },
        },
        n: { id: "bot1", type: "account" },
        m: { id: "content1", type: "content" },
      },
      {
        r: {
          id: "5",
          type: "share",
          properties: {
            timestamp: new Date("2024-01-01T12:05:00Z"),
            engagement: 0.5,
          },
        },
        n: { id: "bot1", type: "account" },
        m: { id: "content1", type: "content" },
      },
      {
        r: {
          id: "6",
          type: "share",
          properties: {
            timestamp: new Date("2024-01-01T12:10:00Z"),
            engagement: 0.5,
          },
        },
        n: { id: "bot1", type: "account" },
        m: { id: "content1", type: "content" },
      },
      {
        r: {
          id: "7",
          type: "share",
          properties: {
            timestamp: new Date("2024-01-01T12:15:00Z"),
            engagement: 0.5,
          },
        },
        n: { id: "bot1", type: "account" },
        m: { id: "content1", type: "content" },
      },
    ];

    it("should detect patterns within timeframe", async () => {
      jest
        .spyOn(memgraphService, "executeQuery")
        .mockImplementation(async (query) => {
          if (query.includes("MATCH (n)-[r]-(m)")) {
            return [{ nodes: mockNodes, edges: mockInteractions }];
          }
          return [];
        });

      const timeframe = {
        start: new Date(Date.now() - 24 * 60 * 60 * 1000),
        end: new Date(),
      };

      const patterns = await service.detectPatterns(timeframe);
      expect(patterns).toBeDefined();
      expect(Array.isArray(patterns)).toBe(true);
      if (patterns.length > 0) {
        expect(patterns[0]).toHaveProperty("id");
        expect(patterns[0]).toHaveProperty("type");
        expect(patterns[0]).toHaveProperty("confidence");
        expect(patterns[0]).toHaveProperty("nodes");
        expect(patterns[0]).toHaveProperty("edges");
        expect(patterns[0]).toHaveProperty("timeframe");
      }
    });

    it("should handle empty interaction data", async () => {
      const timeframe = {
        start: new Date(Date.now() - 24 * 60 * 60 * 1000),
        end: new Date(),
      };

      jest.spyOn(memgraphService, "executeQuery").mockResolvedValue([]);
      const patterns = await service.detectPatterns(timeframe);
      expect(patterns).toEqual([]);
    });

    it("should detect patterns in overlapping time windows", async () => {
      const timeframe = {
        start: new Date("2024-01-01T10:00:00Z"),
        end: new Date("2024-01-01T13:00:00Z"),
      };

      jest.spyOn(memgraphService, "executeQuery").mockResolvedValue([
        {
          n: { id: "user1", type: "account" },
          r: {
            id: "1",
            type: "share",
            properties: {
              timestamp: new Date("2024-01-01T10:00:00Z"),
              engagement: 0.8,
            },
          },
          m: { id: "content1", type: "content" },
        },
        {
          n: { id: "user2", type: "account" },
          r: {
            id: "2",
            type: "share",
            properties: {
              timestamp: new Date("2024-01-01T10:15:00Z"),
              engagement: 0.7,
            },
          },
          m: { id: "content1", type: "content" },
        },
        {
          n: { id: "user3", type: "account" },
          r: {
            id: "3",
            type: "share",
            properties: {
              timestamp: new Date("2024-01-01T10:30:00Z"),
              engagement: 0.9,
            },
          },
          m: { id: "content1", type: "content" },
        },
      ]);

      const patterns = await service.detectPatterns(timeframe);
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.some((p) => p.type === "coordinated")).toBe(true);
    });

    it("should detect high-frequency automated patterns", async () => {
      const timeframe = {
        start: new Date("2024-01-01T12:00:00Z"),
        end: new Date("2024-01-01T13:00:00Z"),
      };

      jest.spyOn(memgraphService, "executeQuery").mockResolvedValue([
        {
          n: { id: "bot1", type: "account" },
          r: {
            id: "4",
            type: "share",
            properties: {
              timestamp: new Date("2024-01-01T12:00:00Z"),
              engagement: 0.5,
            },
          },
          m: { id: "content1", type: "content" },
        },
        {
          n: { id: "bot1", type: "account" },
          r: {
            id: "5",
            type: "share",
            properties: {
              timestamp: new Date("2024-01-01T12:05:00Z"),
              engagement: 0.5,
            },
          },
          m: { id: "content1", type: "content" },
        },
        {
          n: { id: "bot1", type: "account" },
          r: {
            id: "6",
            type: "share",
            properties: {
              timestamp: new Date("2024-01-01T12:10:00Z"),
              engagement: 0.5,
            },
          },
          m: { id: "content1", type: "content" },
        },
        {
          n: { id: "bot1", type: "account" },
          r: {
            id: "7",
            type: "share",
            properties: {
              timestamp: new Date("2024-01-01T12:15:00Z"),
              engagement: 0.5,
            },
          },
          m: { id: "content1", type: "content" },
        },
      ]);

      const patterns = await service.detectPatterns(timeframe);
      expect(
        patterns.some((p) => p.type === "automated" && p.confidence > 0.8)
      ).toBe(true);
    });
  });

  describe("getContentById", () => {
    const contentId = "123e4567-e89b-12d3-a456-426614174000";

    it("should return extended content node with analysis", async () => {
      const mockContent: ExtendedContentNode = {
        ...mockBaseContent,
        id: contentId,
      };

      jest
        .spyOn(memgraphService, "executeQuery")
        .mockResolvedValueOnce([{ c: mockContent }]);

      const result = await service.getContentById(contentId);

      expect(result).toBeDefined();
      expect(result?.id).toBe(contentId);
      expect(result?.classification).toBeDefined();
    });

    it("should return null when content not found", async () => {
      jest.spyOn(memgraphService, "executeQuery").mockResolvedValueOnce([]);

      const result = await service.getContentById(contentId);

      expect(result).toBeNull();
    });
  });

  describe("findRelatedContent", () => {
    it("should find related content based on topics and sentiment", async () => {
      const mockContent: ExtendedContentNode = {
        ...mockBaseContent,
        id: "content-1",
      };

      const mockRelatedContent = {
        ...mockContent,
        id: "content-2",
        text: "Related test content",
      };

      jest
        .spyOn(memgraphService, "executeQuery")
        .mockResolvedValueOnce([{ related: mockRelatedContent }]);

      const results = await service.findRelatedContent(mockContent);

      expect(Array.isArray(results)).toBe(true);
      if (results.length > 0) {
        expect(results[0]).toHaveProperty("id");
        expect(results[0]).toHaveProperty("text");
        expect(results[0]).toHaveProperty("classification");
      }
    });

    it("should handle no related content found", async () => {
      const mockContent: ExtendedContentNode = {
        ...mockBaseContent,
        id: "content-1",
      };

      jest.spyOn(memgraphService, "executeQuery").mockResolvedValueOnce([]);

      const results = await service.findRelatedContent(mockContent);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    it("should find content with multiple matching topics", async () => {
      const contentWithMultipleTopics: ExtendedContentNode = {
        ...mockBaseContent,
        classification: {
          ...mockClassification,
          topics: ["topic1", "topic2", "topic3"],
        },
      };

      const mockRelatedContent = [
        {
          ...mockBaseContent,
          id: "content-2",
          classification: {
            ...mockClassification,
            topics: ["topic1", "topic2"],
          },
        },
        {
          ...mockBaseContent,
          id: "content-3",
          classification: {
            ...mockClassification,
            topics: ["topic2", "topic3"],
          },
        },
      ];

      jest
        .spyOn(memgraphService, "executeQuery")
        .mockResolvedValueOnce(
          mockRelatedContent.map((content) => ({ related: content }))
        );

      const results = await service.findRelatedContent(
        contentWithMultipleTopics
      );
      expect(results.length).toBe(2);
      expect(results[0]?.classification?.topics).toEqual(
        expect.arrayContaining(["topic1", "topic2"])
      );
    });

    it("should find content in different languages", async () => {
      const contentInFrench: ExtendedContentNode = {
        ...mockBaseContent,
        classification: {
          ...mockClassification,
          language: "fr",
          topics: ["topic1"],
        },
      };

      const mockRelatedContent = {
        ...mockBaseContent,
        id: "content-2",
        classification: {
          ...mockClassification,
          language: "en",
          topics: ["topic1"],
        },
      };

      jest
        .spyOn(memgraphService, "executeQuery")
        .mockResolvedValueOnce([{ related: mockRelatedContent }]);

      const results = await service.findRelatedContent(contentInFrench);
      expect(results.length).toBe(1);
      expect(results[0]?.classification?.language).not.toBe(
        contentInFrench.classification?.language
      );
    });

    it("should prioritize content by sentiment similarity", async () => {
      const positiveContent: ExtendedContentNode = {
        ...mockBaseContent,
        classification: {
          ...mockClassification,
          sentiment: "positive",
          topics: ["topic1"],
        },
      };

      const mockRelatedContent = [
        {
          ...mockBaseContent,
          id: "content-2",
          classification: {
            ...mockClassification,
            sentiment: "positive",
            topics: ["topic1"],
          },
        },
        {
          ...mockBaseContent,
          id: "content-3",
          classification: {
            ...mockClassification,
            sentiment: "negative",
            topics: ["topic1"],
          },
        },
      ];

      jest
        .spyOn(memgraphService, "executeQuery")
        .mockResolvedValueOnce(
          mockRelatedContent.map((content) => ({ related: content }))
        );

      const results = await service.findRelatedContent(positiveContent);
      expect(results[0]?.classification?.sentiment).toBe("positive");
    });
  });

  describe("calculateSourceCredibility", () => {
    const sourceId = "123e4567-e89b-12d3-a456-426614174000";

    it("should calculate credibility score for source", async () => {
      const mockQueryResults = [
        {
          contentCount: 100,
          verifiedContentCount: 80,
          avgEngagement: 0.7,
          crossReferences: 50,
        },
      ];

      jest
        .spyOn(memgraphService, "executeQuery")
        .mockResolvedValueOnce(mockQueryResults);

      const score = await service.calculateSourceCredibility(sourceId);

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it("should throw error when source has no content", async () => {
      jest.spyOn(memgraphService, "executeQuery").mockResolvedValueOnce([]);

      await expect(
        service.calculateSourceCredibility(sourceId)
      ).rejects.toThrow("Source not found or has no content");
    });
  });

  describe("pattern detection helpers", () => {
    it("should correctly identify coordinated patterns", () => {
      const cluster = {
        interactions: [
          { timestamp: new Date(), source: "user1" },
          { timestamp: new Date(), source: "user2" },
        ],
        timeSpread: 100,
        interactionRegularity: 0.9,
      };

      const isCoordinated = (service as any).isCoordinatedPattern(cluster);
      expect(typeof isCoordinated).toBe("boolean");
    });

    it("should correctly identify automated behavior", () => {
      const interactions = [
        { timestamp: new Date(), source: "user1" },
        { timestamp: new Date(), source: "user1" },
      ];

      const isAutomated = (service as any).isAutomatedBehavior(interactions);
      expect(typeof isAutomated).toBe("boolean");
    });

    it("should calculate pattern confidence accurately", () => {
      const cluster = {
        timeSpread: 100,
        interactionRegularity: 0.9,
        interactionVelocity: 0.8,
        contentVariety: 0.3,
      };

      const confidence = (service as any).calculatePatternConfidence(cluster);
      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
    });
  });

  describe("metric calculations", () => {
    it("should calculate baseline score correctly", () => {
      const sourceCredibility = 0.8;
      const crossReferenceMetrics = {
        verifiedSourceCount: 5,
        contradictionCount: 1,
        supportingEvidenceCount: 10,
        totalReferences: 15,
      };

      const score = (service as any).calculateBaselineScore(
        sourceCredibility,
        crossReferenceMetrics
      );

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it("should calculate impact score correctly", () => {
      const deviationMagnitude = 0.5;
      const propagationMetrics = {
        velocity: 0.8,
        reach: 1000,
        engagement: 0.7,
        crossPlatformSpread: 0.5,
      };
      const temporalPatterns = new Map([["pattern1", 0.8]]);

      const score = (service as any).calculateImpactScore(
        deviationMagnitude,
        propagationMetrics,
        temporalPatterns
      );

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe("temporal analysis", () => {
    it("should calculate temporal score correctly", () => {
      const score = (service as any).calculateTemporalScore(
        500, // interactionCount
        3600000, // avgTimeDiff (1 hour)
        900000 // stdDevTimeDiff (15 minutes)
      );

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
      expect(typeof score).toBe("number");
    });

    it("should handle edge cases in temporal calculations", () => {
      const zeroScore = (service as any).calculateTemporalScore(0, 0, 0);
      expect(zeroScore).toBeGreaterThanOrEqual(0);
      expect(zeroScore).toBeLessThanOrEqual(1);

      const highScore = (service as any).calculateTemporalScore(
        1000,
        3600000,
        100000
      );
      expect(highScore).toBeGreaterThanOrEqual(0);
      expect(highScore).toBeLessThanOrEqual(1);
    });
  });

  describe("utility functions", () => {
    it("should calculate mean correctly", () => {
      const mean = (service as any).calculateMean([1, 2, 3, 4, 5]);
      expect(mean).toBe(3);
    });

    it("should calculate standard deviation correctly", () => {
      const stdDev = (service as any).calculateStandardDeviation([
        2, 4, 4, 4, 5, 5, 7, 9,
      ]);
      expect(stdDev).toBeCloseTo(2, 1);
    });

    it("should create correct time windows", () => {
      const timeframe = {
        start: new Date("2024-01-01T00:00:00"),
        end: new Date("2024-01-01T02:00:00"),
      };
      const windowSize = 3600000; // 1 hour

      const windows = (service as any).createTimeWindows(timeframe, windowSize);

      expect(windows).toHaveLength(2);
      expect(windows[0].start).toEqual(timeframe.start);
      expect(windows[0].end).toEqual(new Date("2024-01-01T01:00:00"));
      expect(windows[1].start).toEqual(new Date("2024-01-01T01:00:00"));
      expect(windows[1].end).toEqual(timeframe.end);
    });
  });

  describe("calculateContentDeviation", () => {
    it("should calculate deviation metrics for content", async () => {
      const mockContent: ExtendedContentNode = {
        ...mockBaseContent,
        id: "content-1",
      };

      jest
        .spyOn(memgraphService, "executeQuery")
        .mockResolvedValueOnce([{ metrics: { velocity: 0.5, reach: 1000 } }])
        .mockResolvedValueOnce([
          { metrics: { verifiedCount: 5, totalCount: 10 } },
        ])
        .mockResolvedValueOnce([{ sourceCredibility: 0.8 }]);

      const result = await service.calculateContentDeviation(mockContent);

      expect(result).toBeDefined();
      expect(result.baselineScore).toBeDefined();
      expect(result.deviationMagnitude).toBeDefined();
      expect(result.propagationVelocity).toBeDefined();
      expect(result.crossReferenceScore).toBeDefined();
      expect(result.sourceCredibility).toBeDefined();
      expect(result.impactScore).toBeDefined();
    });
  });
});
