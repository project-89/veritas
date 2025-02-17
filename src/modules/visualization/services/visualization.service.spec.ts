import { Test, TestingModule } from "@nestjs/testing";
import { VisualizationService } from "./visualization.service";
import { MemgraphService } from "@/database";
import { mockTimeFrame } from "test/test-utils";
import {
  NetworkNode,
  NetworkEdge,
  TimelineEvent,
} from "./visualization.service";

describe("VisualizationService", () => {
  let service: VisualizationService;
  let memgraphService: MemgraphService;

  const mockNodes = [
    {
      id: "content-1",
      type: "content",
      label: "Test Content",
      properties: {
        text: "Test content",
        timestamp: new Date(),
        platform: "twitter",
      },
    },
    {
      id: "source-1",
      type: "source",
      label: "Test Source",
      properties: {
        name: "Test Source",
        credibilityScore: 0.8,
        verificationStatus: "verified",
      },
    },
    {
      id: "account-1",
      type: "account",
      label: "Test Account",
      properties: {
        name: "Test User",
        platform: "twitter",
        influence: 0.7,
      },
    },
  ];

  const mockEdges = [
    {
      id: "edge-1",
      source: "source-1",
      target: "content-1",
      type: "PUBLISHED",
      properties: {
        timestamp: new Date(),
      },
    },
    {
      id: "edge-2",
      source: "account-1",
      target: "content-1",
      type: "SHARED",
      properties: {
        timestamp: new Date(),
      },
    },
  ];

  beforeEach(async () => {
    const mockMemgraphService = {
      executeQuery: jest.fn().mockImplementation((query) => {
        if (query.includes("MATCH (n)")) {
          return mockNodes.map((node) => ({ n: node }));
        }
        if (query.includes("MATCH ()-[r]->()")) {
          return mockEdges.map((edge) => ({ r: edge }));
        }
        return [];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VisualizationService,
        {
          provide: MemgraphService,
          useValue: mockMemgraphService,
        },
      ],
    }).compile();

    service = module.get<VisualizationService>(VisualizationService);
    memgraphService = module.get<MemgraphService>(MemgraphService);
  });

  describe("getNetworkGraph", () => {
    it("should return a complete network graph with nodes and edges", async () => {
      const result = await service.getNetworkGraph(mockTimeFrame);

      expect(result).toEqual(
        expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({
              id: "content-1",
              type: "content",
              label: "Test Content",
              metrics: expect.objectContaining({
                size: expect.any(Number),
                color: expect.any(String),
                weight: expect.any(Number),
              }),
            }),
          ]),
          edges: expect.arrayContaining([
            expect.objectContaining({
              id: "edge-1",
              source: "source-1",
              target: "content-1",
              type: "PUBLISHED",
              metrics: expect.objectContaining({
                width: expect.any(Number),
                color: expect.any(String),
                weight: expect.any(Number),
              }),
            }),
          ]),
          metadata: expect.objectContaining({
            timestamp: expect.any(Date),
            nodeCount: expect.any(Number),
            edgeCount: expect.any(Number),
            density: expect.any(Number),
          }),
        })
      );

      expect(memgraphService.executeQuery).toHaveBeenCalledTimes(2);
    });

    it("should handle empty graph data", async () => {
      jest.spyOn(memgraphService, "executeQuery").mockResolvedValue([]);

      const result = await service.getNetworkGraph(mockTimeFrame);

      expect(result).toEqual({
        nodes: [],
        edges: [],
        metadata: expect.objectContaining({
          timestamp: expect.any(Date),
          nodeCount: 0,
          edgeCount: 0,
          density: 0,
        }),
      });
    });

    it("should calculate correct network metrics", async () => {
      const result = await service.getNetworkGraph(mockTimeFrame);

      // Test node metrics
      result.nodes.forEach((node: NetworkNode) => {
        expect(node.metrics.size).toBeGreaterThan(0);
        expect(node.metrics.weight).toBeGreaterThanOrEqual(0);
        expect(node.metrics.weight).toBeLessThanOrEqual(1);
        expect(node.metrics.color).toMatch(/^#[0-9A-Fa-f]{6}$/); // Hex color
      });

      // Test edge metrics
      result.edges.forEach((edge: NetworkEdge) => {
        expect(edge.metrics.width).toBeGreaterThan(0);
        expect(edge.metrics.weight).toBeGreaterThanOrEqual(0);
        expect(edge.metrics.weight).toBeLessThanOrEqual(1);
        expect(edge.metrics.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      });

      // Test network density
      expect(result.metadata.density).toBeGreaterThanOrEqual(0);
      expect(result.metadata.density).toBeLessThanOrEqual(1);
    });

    it("should handle database query errors", async () => {
      jest
        .spyOn(memgraphService, "executeQuery")
        .mockRejectedValueOnce(new Error("Database error"));

      await expect(service.getNetworkGraph(mockTimeFrame)).rejects.toThrow(
        "Database error"
      );
    });
  });

  describe("getTimeline", () => {
    it("should return timeline events in chronological order", async () => {
      const result = await service.getTimeline(mockTimeFrame);

      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            timestamp: expect.any(Date),
            type: expect.any(String),
            content: expect.any(String),
            source: expect.any(String),
            impact: expect.any(Number),
            relatedEvents: expect.any(Array),
          }),
        ])
      );

      // Verify chronological order
      const timestamps = result.map((event) => event.timestamp.getTime());
      expect(timestamps).toEqual([...timestamps].sort());
    });

    it("should calculate impact scores for events", async () => {
      const result = await service.getTimeline(mockTimeFrame);

      result.forEach((event: TimelineEvent) => {
        expect(event.impact).toBeGreaterThanOrEqual(0);
        expect(event.impact).toBeLessThanOrEqual(1);
      });
    });

    it("should handle empty timeline data", async () => {
      jest.spyOn(memgraphService, "executeQuery").mockResolvedValue([]);

      const result = await service.getTimeline(mockTimeFrame);

      expect(result).toEqual([]);
    });

    it("should handle database query errors", async () => {
      jest
        .spyOn(memgraphService, "executeQuery")
        .mockRejectedValueOnce(new Error("Database error"));

      await expect(service.getTimeline(mockTimeFrame)).rejects.toThrow(
        "Database error"
      );
    });
  });

  describe("Node and Edge Calculations", () => {
    describe("Node Metrics", () => {
      it("should calculate correct node size based on type", () => {
        const contentNode = service["calculateNodeSize"]({
          type: "content",
          properties: { engagementMetrics: { reach: 1000 } },
        });
        const sourceNode = service["calculateNodeSize"]({
          type: "source",
          properties: { credibilityScore: 0.8 },
        });
        const accountNode = service["calculateNodeSize"]({
          type: "account",
          properties: { influence: 0.7 },
        });

        expect(contentNode).toBeGreaterThan(0);
        expect(sourceNode).toBeGreaterThan(0);
        expect(accountNode).toBeGreaterThan(0);
      });

      it("should calculate correct node colors", () => {
        const contentColor = service["calculateNodeColor"](
          { type: "content" },
          0.8
        );
        const sourceColor = service["calculateNodeColor"](
          { type: "source" },
          0.6
        );
        const accountColor = service["calculateNodeColor"](
          { type: "account" },
          0.4
        );

        expect(contentColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(sourceColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(accountColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
      });

      it("should calculate correct node weights", () => {
        const contentWeight = service["calculateNodeWeight"]({
          type: "content",
          properties: { engagementMetrics: { viralityScore: 0.8 } },
        });
        const sourceWeight = service["calculateNodeWeight"]({
          type: "source",
          properties: { credibilityScore: 0.7 },
        });

        expect(contentWeight).toBeGreaterThanOrEqual(0);
        expect(contentWeight).toBeLessThanOrEqual(1);
        expect(sourceWeight).toBeGreaterThanOrEqual(0);
        expect(sourceWeight).toBeLessThanOrEqual(1);
      });
    });

    describe("Edge Metrics", () => {
      it("should calculate correct edge width", () => {
        const width = service["calculateEdgeWidth"]({
          type: "SHARED",
          properties: { weight: 0.8 },
        });

        expect(width).toBeGreaterThan(0);
      });

      it("should calculate correct edge colors", () => {
        const publishedColor = service["calculateEdgeColor"](
          { type: "PUBLISHED" },
          0.8
        );
        const sharedColor = service["calculateEdgeColor"](
          { type: "SHARED" },
          0.6
        );

        expect(publishedColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(sharedColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
      });

      it("should calculate correct edge weights", () => {
        const weight = service["calculateEdgeWeight"]({
          type: "SHARED",
          properties: { timestamp: new Date() },
        });

        expect(weight).toBeGreaterThanOrEqual(0);
        expect(weight).toBeLessThanOrEqual(1);
      });
    });
  });
});
