import { Test, TestingModule } from "@nestjs/testing";
import {
  SocialMediaService,
  SocialMediaPlatform,
} from "./social-media.service";
import type { SocialMediaPlatform as SocialMediaPlatformType } from "./social-media.service";
import { TwitterConnector } from "./twitter.connector";
import { FacebookConnector } from "./facebook.connector";
import { RedditConnector } from "./reddit.connector";
import {
  SocialMediaPost,
  SocialMediaConnector,
} from "../interfaces/social-media-connector.interface";
import { mockSourceNode } from "../../../../test/test-utils";
import { EventEmitter } from "events";

describe("SocialMediaService", () => {
  let service: SocialMediaService;
  let twitterConnector: TwitterConnector;
  let facebookConnector: FacebookConnector;
  let redditConnector: RedditConnector;

  const mockPost: SocialMediaPost = {
    id: "123",
    text: "Test post",
    timestamp: new Date(),
    platform: "twitter",
    authorId: "author123",
    authorName: "Test Author",
    authorHandle: "@testauthor",
    url: "https://twitter.com/testauthor/123",
    engagementMetrics: {
      likes: 100,
      shares: 50,
      comments: 25,
      reach: 1000,
      viralityScore: 0.5,
    },
  };

  beforeEach(async () => {
    const mockTwitterConnector = {
      platform: "twitter",
      validateCredentials: jest.fn().mockResolvedValue(true),
      searchContent: jest.fn().mockResolvedValue([mockPost]),
      getAuthorDetails: jest.fn().mockResolvedValue(mockSourceNode),
      streamContent: jest.fn().mockImplementation((keywords: string[]) => {
        const emitter = new EventEmitter();
        // Simulate emitting a post
        setTimeout(() => {
          emitter.emit("data", mockPost);
        }, 0);
        return emitter;
      }),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };

    const mockFacebookConnector = {
      platform: "facebook",
      validateCredentials: jest.fn().mockResolvedValue(true),
      searchContent: jest.fn().mockResolvedValue([]),
      getAuthorDetails: jest.fn().mockResolvedValue(mockSourceNode),
      streamContent: jest.fn().mockImplementation((keywords: string[]) => {
        return new EventEmitter();
      }),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };

    const mockRedditConnector = {
      platform: "reddit",
      validateCredentials: jest.fn().mockResolvedValue(true),
      searchContent: jest.fn().mockResolvedValue([]),
      getAuthorDetails: jest.fn().mockResolvedValue(mockSourceNode),
      streamContent: jest.fn().mockImplementation((keywords: string[]) => {
        return new EventEmitter();
      }),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SocialMediaService,
        {
          provide: TwitterConnector,
          useValue: mockTwitterConnector,
        },
        {
          provide: FacebookConnector,
          useValue: mockFacebookConnector,
        },
        {
          provide: RedditConnector,
          useValue: mockRedditConnector,
        },
      ],
    }).compile();

    service = module.get<SocialMediaService>(SocialMediaService);
    twitterConnector = module.get<TwitterConnector>(TwitterConnector);
    facebookConnector = module.get<FacebookConnector>(FacebookConnector);
    redditConnector = module.get<RedditConnector>(RedditConnector);
  });

  describe("Module Lifecycle", () => {
    describe("onModuleInit", () => {
      it("should validate credentials for all platforms", async () => {
        await service.onModuleInit();

        expect(twitterConnector.validateCredentials).toHaveBeenCalled();
        expect(facebookConnector.validateCredentials).toHaveBeenCalled();
        expect(redditConnector.validateCredentials).toHaveBeenCalled();
      });

      it("should handle validation failures gracefully", async () => {
        const validationError = new Error("Invalid credentials");
        jest
          .spyOn(twitterConnector, "validateCredentials")
          .mockRejectedValueOnce(validationError);

        await expect(service.onModuleInit()).resolves.not.toThrow();
      });
    });

    describe("onModuleDestroy", () => {
      it("should disconnect from all platforms", async () => {
        await service.onModuleDestroy();

        expect(twitterConnector.disconnect).toHaveBeenCalled();
        expect(facebookConnector.disconnect).toHaveBeenCalled();
        expect(redditConnector.disconnect).toHaveBeenCalled();
      });

      it("should handle disconnection errors gracefully", async () => {
        const disconnectError = new Error("Disconnect failed");
        jest
          .spyOn(twitterConnector, "disconnect")
          .mockRejectedValueOnce(disconnectError);

        await expect(service.onModuleDestroy()).resolves.not.toThrow();
      });
    });
  });

  describe("searchAllPlatforms", () => {
    it("should search with date range options", async () => {
      const startDate = new Date("2024-01-01");
      const endDate = new Date("2024-01-31");

      await service.searchAllPlatforms("test", { startDate, endDate });

      expect(twitterConnector.searchContent).toHaveBeenCalledWith(
        "test",
        expect.objectContaining({
          startDate,
          endDate,
        })
      );
    });

    it("should search with limit option", async () => {
      const limit = 10;

      await service.searchAllPlatforms("test", { limit });

      expect(twitterConnector.searchContent).toHaveBeenCalledWith(
        "test",
        expect.objectContaining({ limit })
      );
    });

    it("should handle empty results from all platforms", async () => {
      jest.spyOn(twitterConnector, "searchContent").mockResolvedValue([]);

      const results = await service.searchAllPlatforms("test");

      expect(results).toEqual([]);
    });

    it("should handle mixed success and failure across platforms", async () => {
      jest
        .spyOn(twitterConnector, "searchContent")
        .mockRejectedValue(new Error("API Error"));
      jest
        .spyOn(facebookConnector, "searchContent")
        .mockResolvedValue([mockPost]);

      const results = await service.searchAllPlatforms("test");

      expect(results).toEqual([mockPost]);
    });

    it("should search content across all platforms", async () => {
      const query = "test query";
      const options = {
        startDate: new Date(),
        endDate: new Date(),
        limit: 10,
      };

      const results = await service.searchAllPlatforms(query, options);

      expect(twitterConnector.searchContent).toHaveBeenCalledWith(
        query,
        options
      );
      expect(facebookConnector.searchContent).toHaveBeenCalledWith(
        query,
        options
      );
      expect(redditConnector.searchContent).toHaveBeenCalledWith(
        query,
        options
      );
      expect(results).toHaveLength(1); // Only Twitter mock returns a post
      expect(results[0]).toEqual(mockPost);
    });

    it("should search specific platforms when specified", async () => {
      const query = "test query";
      const options = {
        platforms: ["twitter", "facebook"] as SocialMediaPlatform[],
      };

      await service.searchAllPlatforms(query, options);

      expect(twitterConnector.searchContent).toHaveBeenCalled();
      expect(facebookConnector.searchContent).toHaveBeenCalled();
      expect(redditConnector.searchContent).not.toHaveBeenCalled();
    });

    it("should handle platform errors gracefully", async () => {
      jest
        .spyOn(twitterConnector, "searchContent")
        .mockRejectedValueOnce(new Error("API Error"));

      const results = await service.searchAllPlatforms("test");

      expect(results).toHaveLength(0);
    });
  });

  describe("getAuthorDetails", () => {
    it("should get author details from specified platform", async () => {
      const authorId = "author123";
      const platform = "twitter";

      const result = await service.getAuthorDetails(authorId, platform);

      expect(twitterConnector.getAuthorDetails).toHaveBeenCalledWith(authorId);
      expect(result).toEqual(mockSourceNode);
    });

    it("should throw error for unsupported platform", async () => {
      const authorId = "author123";
      const platform = "unsupported" as any;

      await expect(
        service.getAuthorDetails(authorId, platform)
      ).rejects.toThrow("Unsupported platform");
    });
  });

  describe("streamAllPlatforms", () => {
    // Increase timeout for streaming tests
    jest.setTimeout(10000);

    it("should handle platform streaming errors", async () => {
      const mockError = new Error("Stream error");
      jest
        .spyOn(twitterConnector, "streamContent")
        .mockImplementation((keywords: string[]) => {
          const emitter = new EventEmitter();
          process.nextTick(() => {
            emitter.emit("error", mockError);
          });
          return emitter;
        });

      const stream = service.streamAllPlatforms(["test"]);

      try {
        // Just try to get the first value, which should trigger the error
        await stream.next();
        fail("Expected an error to be thrown");
      } catch (error) {
        expect(error).toEqual(mockError);
      }
    }, 15000); // Increase timeout for this specific test

    it("should aggregate content from all platforms", async () => {
      const mockPost: SocialMediaPost = {
        id: "test-post",
        text: "Test content",
        timestamp: new Date(),
        platform: "twitter",
        authorId: "test-author",
        authorName: "Test User",
        authorHandle: "@testuser",
        url: "https://twitter.com/testuser/status/test-post",
        engagementMetrics: {
          likes: 100,
          shares: 50,
          comments: 25,
          reach: 1000,
          viralityScore: 0.5,
        },
      };

      jest
        .spyOn(twitterConnector, "streamContent")
        .mockImplementation((keywords: string[]) => {
          const emitter = new EventEmitter();
          // Emit data immediately instead of using setTimeout
          process.nextTick(() => {
            emitter.emit("data", mockPost);
          });
          return emitter;
        });

      const stream = service.streamAllPlatforms(["test"]);
      const { value, done } = await stream.next();

      expect(value).toEqual(mockPost);
      expect(done).toBe(false);
    });
  });
});
