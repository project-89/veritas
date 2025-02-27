import { Test, TestingModule } from "@nestjs/testing";
import { ClientKafka } from "@nestjs/microservices";
import { ContentStorageService } from "./content-storage.service";
import { MemgraphService, RedisService } from "@/database";
import {
  MockMemgraphService,
  mockContentNode,
  mockSourceNode,
} from "test/test-utils";

describe("ContentStorageService", () => {
  let service: ContentStorageService;
  let memgraphService: MemgraphService;
  let redisService: RedisService;
  let kafkaClient: ClientKafka;

  beforeEach(async () => {
    const mockKafkaClient = {
      emit: jest.fn().mockResolvedValue(undefined),
      connect: jest.fn().mockResolvedValue(undefined),
      subscribeToResponseOf: jest.fn(),
    };

    const mockRedisService = {
      setHash: jest.fn().mockResolvedValue(undefined),
      getHash: jest
        .fn()
        .mockResolvedValue({ data: JSON.stringify(mockContentNode) }),
    };

    const mockMemgraphService = {
      createNode: jest.fn().mockResolvedValue({ id: "test-id" }),
      createRelationship: jest.fn().mockResolvedValue({ id: "rel-id" }),
      executeQuery: jest.fn().mockResolvedValue([{ c: mockContentNode }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentStorageService,
        {
          provide: "KAFKA_SERVICE",
          useValue: mockKafkaClient,
        },
        {
          provide: MemgraphService,
          useValue: mockMemgraphService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<ContentStorageService>(ContentStorageService);
    memgraphService = module.get<MemgraphService>(MemgraphService);
    redisService = module.get<RedisService>(RedisService);
    kafkaClient = module.get<ClientKafka>("KAFKA_SERVICE");
  });

  describe("onModuleInit", () => {
    it("should subscribe to required topics and connect to Kafka", async () => {
      await service.onModuleInit();

      expect(kafkaClient.subscribeToResponseOf).toHaveBeenCalledWith(
        "content.created"
      );
      expect(kafkaClient.subscribeToResponseOf).toHaveBeenCalledWith(
        "content.updated"
      );
      expect(kafkaClient.subscribeToResponseOf).toHaveBeenCalledWith(
        "source.verified"
      );
      expect(kafkaClient.connect).toHaveBeenCalled();
    });
  });

  describe("ingestContent", () => {
    it("should store content and source in graph database and cache", async () => {
      const result = await service.ingestContent(
        mockContentNode,
        mockSourceNode
      );

      // Check graph database operations
      expect(memgraphService.createNode).toHaveBeenCalledWith(
        "Content",
        mockContentNode
      );
      expect(memgraphService.createNode).toHaveBeenCalledWith(
        "Source",
        mockSourceNode
      );
      expect(memgraphService.createRelationship).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        "PUBLISHED",
        expect.objectContaining({
          timestamp: expect.any(String),
        })
      );

      // Check cache operation
      expect(redisService.setHash).toHaveBeenCalledWith(
        `content:${mockContentNode.id}`,
        {
          data: JSON.stringify({
            ...mockContentNode,
            sourceId: mockSourceNode.id,
          }),
        }
      );

      // Check Kafka event
      expect(kafkaClient.emit).toHaveBeenCalledWith(
        "content.created",
        expect.objectContaining({
          content: mockContentNode,
          source: mockSourceNode,
          timestamp: expect.any(Date),
        })
      );

      expect(result).toEqual({
        contentNode: { id: "test-id" },
        sourceNode: { id: "test-id" },
      });
    });

    it("should handle storage errors", async () => {
      jest
        .spyOn(memgraphService, "createNode")
        .mockRejectedValueOnce(new Error("Storage error"));

      await expect(
        service.ingestContent(mockContentNode, mockSourceNode)
      ).rejects.toThrow("Storage error");
    });
  });

  describe("updateContent", () => {
    const updates = {
      text: "Updated content",
      metadata: { key: "value" },
    };

    it("should update content in graph database and cache", async () => {
      const result = await service.updateContent(mockContentNode.id, updates);

      // Check graph database update
      expect(memgraphService.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          contentId: mockContentNode.id,
          updates,
        })
      );

      // Check cache update
      expect(redisService.getHash).toHaveBeenCalledWith(
        `content:${mockContentNode.id}`
      );
      expect(redisService.setHash).toHaveBeenCalledWith(
        `content:${mockContentNode.id}`,
        {
          data: expect.any(String),
        }
      );

      // Check Kafka event
      expect(kafkaClient.emit).toHaveBeenCalledWith(
        "content.updated",
        expect.objectContaining({
          contentId: mockContentNode.id,
          updates,
          timestamp: expect.any(Date),
        })
      );

      expect(result).toEqual(mockContentNode);
    });

    it("should handle update errors", async () => {
      jest
        .spyOn(memgraphService, "executeQuery")
        .mockRejectedValueOnce(new Error("Update error"));

      await expect(
        service.updateContent(mockContentNode.id, updates)
      ).rejects.toThrow("Update error");
    });
  });

  describe("verifySource", () => {
    it("should update source verification status", async () => {
      const sourceId = "test-source-id";
      const verificationStatus = "verified";

      jest
        .spyOn(memgraphService, "executeQuery")
        .mockResolvedValueOnce([{ s: mockSourceNode }]);

      const result = await service.verifySource(sourceId, verificationStatus);

      // Check graph database update
      expect(memgraphService.executeQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          sourceId,
          verificationStatus,
          timestamp: expect.any(String),
        })
      );

      // Check Kafka event
      expect(kafkaClient.emit).toHaveBeenCalledWith(
        "source.verified",
        expect.objectContaining({
          sourceId,
          verificationStatus,
          timestamp: expect.any(Date),
        })
      );

      expect(result).toEqual(mockSourceNode);
    });

    it("should handle verification errors", async () => {
      jest
        .spyOn(memgraphService, "executeQuery")
        .mockRejectedValueOnce(new Error("Verification error"));

      await expect(
        service.verifySource("test-source-id", "verified")
      ).rejects.toThrow("Verification error");
    });
  });
});
