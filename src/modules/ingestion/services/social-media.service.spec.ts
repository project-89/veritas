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
import { mockSourceNode } from "test/test-utils";

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
    engagement: {
      likes: 100,
      shares: 50,
      comments: 25,
      reach: 1000,
    },
  };

  beforeEach(async () => {
    const mockTwitterConnector = {
      platform: "twitter",
      validateCredentials: jest.fn().mockResolvedValue(true),
      searchContent: jest.fn().mockResolvedValue([mockPost]),
      getAuthorDetails: jest.fn().mockResolvedValue(mockSourceNode),
      streamContent: jest.fn().mockImplementation(async function* () {
        yield mockPost;
      }),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };

    const mockFacebookConnector = {
      platform: "facebook",
      validateCredentials: jest.fn().mockResolvedValue(true),
      searchContent: jest.fn().mockResolvedValue([]),
      getAuthorDetails: jest.fn().mockResolvedValue(mockSourceNode),
      streamContent: jest.fn().mockImplementation(async function* () {}),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };

    const mockRedditConnector = {
      platform: "reddit",
      validateCredentials: jest.fn().mockResolvedValue(true),
      searchContent: jest.fn().mockResolvedValue([]),
      getAuthorDetails: jest.fn().mockResolvedValue(mockSourceNode),
      streamContent: jest.fn().mockImplementation(async function* () {}),
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

  describe("searchAllPlatforms", () => {
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
    it("should handle platform streaming errors", async () => {
      const mockError = new Error("Stream error");
      jest
        .spyOn(twitterConnector, "streamContent")
        .mockImplementation(async function* () {
          throw mockError;
        });

      const stream = service.streamAllPlatforms(["test"]);

      // The error should be propagated through the generator
      await expect(async () => {
        for await (const post of stream) {
          // Should not reach here
          fail("Expected an error to be thrown");
        }
      }).rejects.toThrow("Stream error");
    });

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
        engagement: {
          likes: 100,
          shares: 50,
          comments: 25,
          reach: 1000,
        },
      };

      jest
        .spyOn(twitterConnector, "streamContent")
        .mockImplementation(async function* () {
          yield mockPost;
        });

      const stream = service.streamAllPlatforms(["test"]);
      const { value, done } = await stream.next();

      expect(value).toEqual(mockPost);
      expect(done).toBe(false);
    });
  });
});
