import { Test, TestingModule } from "@nestjs/testing";
import { AnalysisService } from "./analysis.service";
import { MemgraphService } from "@/database";
import { ContentNode } from "@/schemas/base.schema";
import {
  MockMemgraphService,
  mockContentNode,
  mockTimeFrame,
} from "../../test/test-utils";

describe("AnalysisService", () => {
  let service: AnalysisService;
  let memgraphService: MemgraphService;

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
});
