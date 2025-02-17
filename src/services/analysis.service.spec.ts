import { Test, TestingModule } from "@nestjs/testing";
import { AnalysisService } from "./analysis.service";
import { MemgraphService } from "@/database";
import { ContentNode } from "@/schemas/base.schema";
import {
  MockMemgraphService,
  mockContentNode,
  mockTimeFrame,
  mockSourceNode,
} from "../../test/test-utils";
import {
  ExtendedContentNode,
  Pattern,
  DeviationMetrics,
} from "@/modules/analysis/analysis.types";

describe("AnalysisService", () => {
  let service: AnalysisService;
  let memgraphService: MemgraphService;

  const mockNodes = [
    {
      id: "1",
      type: "content",
      properties: { text: "test1", timestamp: new Date() },
    },
    {
      id: "2",
      type: "content",
      properties: { text: "test2", timestamp: new Date() },
    },
  ];

  const mockEdges = [
    {
      id: "e1",
      type: "SHARED",
      source: "1",
      target: "2",
      properties: { timestamp: new Date() },
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalysisService,
        {
          provide: MemgraphService,
          useValue: {
            executeQuery: jest.fn(),
          },
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
    it("should calculate reality deviation metrics for a narrative", async () => {
      const narrativeId = "test-narrative-id";
      const mockContent = { ...mockContentNode };
      const mockPropagation = {
        velocity: 0.8,
        reach: 1000,
        engagement: 0.7,
        crossPlatformSpread: 0.5,
      };
      const mockCrossReference = {
        verifiedSourceCount: 5,
        contradictionCount: 1,
        supportingEvidenceCount: 10,
        totalReferences: 15,
      };

      jest
        .spyOn(service as any, "getNarrativeContent")
        .mockResolvedValue(mockContent);
      jest
        .spyOn(service as any, "analyzePropagation")
        .mockResolvedValue(mockPropagation);
      jest
        .spyOn(service as any, "analyzeCrossReferences")
        .mockResolvedValue(mockCrossReference);

      const result = await service.measureRealityDeviation(narrativeId);

      expect(result).toMatchObject({
        baselineScore: expect.any(Number),
        deviationMagnitude: expect.any(Number),
        propagationVelocity: expect.any(Number),
        crossReferenceScore: expect.any(Number),
        sourceCredibility: expect.any(Number),
        impactScore: expect.any(Number),
      });
    });

    it("should handle non-existent narrative", async () => {
      jest.spyOn(service as any, "getNarrativeContent").mockResolvedValue(null);

      await expect(
        service.measureRealityDeviation("non-existent-id")
      ).rejects.toThrow();
    });
  });

  describe("detectPatterns", () => {
    it("should detect various pattern types in the given timeframe", async () => {
      const mockInteractions = [
        {
          type: "SHARED",
          timestamp: new Date(),
          source: "user1",
          target: "content1",
        },
        {
          type: "SHARED",
          timestamp: new Date(),
          source: "user2",
          target: "content1",
        },
      ];

      jest
        .spyOn(memgraphService, "executeQuery")
        .mockResolvedValue(mockInteractions);
      jest
        .spyOn(service as any, "detectCoordinatedPatterns")
        .mockResolvedValue([
          {
            id: "pattern1",
            type: "coordinated",
            confidence: 0.8,
            nodes: ["node1", "node2"],
            edges: ["edge1"],
            timeframe: mockTimeFrame,
          },
        ]);

      const result = await service.detectPatterns(mockTimeFrame);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toMatchObject({
        id: expect.any(String),
        type: expect.stringMatching(/^(organic|coordinated|automated)$/),
        confidence: expect.any(Number),
        nodes: expect.any(Array),
        edges: expect.any(Array),
        timeframe: expect.any(Object),
      });
    });

    it("should handle empty interaction data", async () => {
      jest.spyOn(memgraphService, "executeQuery").mockResolvedValue([]);

      const result = await service.detectPatterns(mockTimeFrame);

      expect(result).toHaveLength(0);
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

  describe("calculateSourceCredibility", () => {
    const mockContent = {
      id: "content1",
      text: "Test content with sufficient length to test content scoring",
      classification: {
        toxicity: 0.2,
        sentiment: "neutral",
      },
      metadata: {
        links: ["https://example.com"],
        media: ["image.jpg"],
        verified: true,
      },
    };

    const mockInteractions = [
      { type: "LIKED", userId: "user1" },
      { type: "SHARED", userId: "user2" },
      { type: "COMMENTED", userId: "user3" },
      { type: "LIKED", userId: "user4" },
    ];

    it("should calculate credibility score for a source with content and interactions", async () => {
      jest.spyOn(memgraphService, "executeQuery").mockResolvedValueOnce([
        {
          c: mockContent,
          interactions: mockInteractions,
          uniqueUsers: 4,
        },
      ]);

      const credibilityScore =
        await service.calculateSourceCredibility("source1");

      expect(credibilityScore).toBeGreaterThan(0);
      expect(credibilityScore).toBeLessThanOrEqual(1);
      expect(memgraphService.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("MATCH (s:Source {id: $sourceId})"),
        { sourceId: "source1" }
      );
    });

    it("should handle source with no content", async () => {
      jest.spyOn(memgraphService, "executeQuery").mockResolvedValueOnce([]);

      await expect(
        service.calculateSourceCredibility("source1")
      ).rejects.toThrow("Source not found or has no content");
    });

    it("should handle content with no interactions", async () => {
      jest.spyOn(memgraphService, "executeQuery").mockResolvedValueOnce([
        {
          c: mockContent,
          interactions: [],
          uniqueUsers: 0,
        },
      ]);

      const credibilityScore =
        await service.calculateSourceCredibility("source1");
      expect(credibilityScore).toBeGreaterThan(0); // Should still have score from content and verification
    });

    it("should calculate higher score for verified content with quality interactions", async () => {
      const highQualityContent = {
        ...mockContent,
        classification: {
          toxicity: 0.1,
          sentiment: "neutral",
        },
      };

      const qualityInteractions = Array(10).fill({
        type: "SHARED",
        userId: "unique",
      });

      jest.spyOn(memgraphService, "executeQuery").mockResolvedValueOnce([
        {
          c: highQualityContent,
          interactions: qualityInteractions,
          uniqueUsers: 8,
        },
      ]);

      const highScore = await service.calculateSourceCredibility("source1");

      // Reset mock for low quality content
      const lowQualityContent = {
        ...mockContent,
        classification: {
          toxicity: 0.8,
          sentiment: "negative",
        },
        metadata: {
          links: [],
          media: [],
          verified: false,
        },
      };

      jest.spyOn(memgraphService, "executeQuery").mockResolvedValueOnce([
        {
          c: lowQualityContent,
          interactions: [],
          uniqueUsers: 0,
        },
      ]);

      const lowScore = await service.calculateSourceCredibility("source2");

      expect(highScore).toBeGreaterThan(lowScore);
    });

    it("should handle multiple content items from the same source", async () => {
      const multipleContent = [
        {
          c: mockContent,
          interactions: mockInteractions,
          uniqueUsers: 4,
        },
        {
          c: {
            ...mockContent,
            id: "content2",
            classification: {
              toxicity: 0.3,
              sentiment: "positive",
            },
          },
          interactions: mockInteractions.slice(0, 2),
          uniqueUsers: 2,
        },
      ];

      jest
        .spyOn(memgraphService, "executeQuery")
        .mockResolvedValueOnce(multipleContent);

      const credibilityScore =
        await service.calculateSourceCredibility("source1");
      expect(credibilityScore).toBeGreaterThan(0);
      expect(credibilityScore).toBeLessThanOrEqual(1);
    });
  });

  describe("detectPatternsForContent", () => {
    it("should detect patterns related to specific content", async () => {
      const mockContent: ExtendedContentNode = {
        ...mockContentNode,
        id: "content-1",
      };

      jest
        .spyOn(memgraphService, "executeQuery")
        .mockResolvedValueOnce([{ nodes: mockNodes, edges: mockEdges }])
        .mockResolvedValueOnce([{ nodes: [], edges: [] }])
        .mockResolvedValueOnce([{ nodes: [], edges: [] }]);

      const result = await service.detectPatternsForContent(mockContent);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(memgraphService.executeQuery).toHaveBeenCalled();
    });
  });

  describe("calculateContentDeviation", () => {
    it("should calculate deviation metrics for content", async () => {
      const mockContent: ExtendedContentNode = {
        ...mockContentNode,
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

  describe("findRelatedContent", () => {
    it("should find content related to the input content", async () => {
      const mockContent: ExtendedContentNode = {
        ...mockContentNode,
        id: "content-1",
      };

      jest
        .spyOn(memgraphService, "executeQuery")
        .mockResolvedValueOnce([
          { n: { ...mockContentNode, id: "related-1" } },
          { n: { ...mockContentNode, id: "related-2" } },
        ]);

      const result = await service.findRelatedContent(mockContent);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(memgraphService.executeQuery).toHaveBeenCalled();
    });
  });
});
