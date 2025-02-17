import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { FacebookConnector } from "./facebook.connector";
import { FacebookAdsApi, Page, Post } from "facebook-nodejs-business-sdk";
import { mockSourceNode } from "../../../../test/test-utils";
import { SocialMediaPost } from "../interfaces/social-media-connector.interface";

jest.mock("facebook-nodejs-business-sdk");

describe("FacebookConnector", () => {
  let connector: FacebookConnector;
  let configService: ConfigService;
  let facebookApi: jest.Mocked<FacebookAdsApi>;

  const mockPost: Post = {
    id: "123",
    message: "Test post",
    created_time: new Date().toISOString(),
    from: {
      id: "author123",
      name: "Test Author",
    },
    permalink_url: "https://facebook.com/testauthor/posts/123",
    reactions: {
      summary: {
        total_count: 100,
      },
    },
    shares: {
      count: 50,
    },
    comments: {
      summary: {
        total_count: 25,
      },
    },
    insights: {
      data: [
        {
          values: [
            {
              value: 1000,
            },
          ],
        },
      ],
    },
  };

  const mockPage = {
    id: "author123",
    name: "Test Page",
    verification_status: "verified",
    fan_count: 10000,
  };

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string) => {
        switch (key) {
          case "FACEBOOK_APP_ID":
            return "test-app-id";
          case "FACEBOOK_APP_SECRET":
            return "test-app-secret";
          case "FACEBOOK_ACCESS_TOKEN":
            return "test-access-token";
          default:
            return undefined;
        }
      }),
    };

    // Mock Facebook API
    (FacebookAdsApi.init as jest.Mock).mockReturnValue({
      getPage: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(mockPage),
        getPosts: jest.fn().mockResolvedValue({
          data: [mockPost],
        }),
      }),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FacebookConnector,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    connector = module.get<FacebookConnector>(FacebookConnector);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe("connect", () => {
    it("should initialize Facebook client with correct credentials", async () => {
      await connector.connect();

      expect(FacebookAdsApi.init).toHaveBeenCalledWith("test-access-token");
    });

    it("should handle connection errors", async () => {
      (FacebookAdsApi.init as jest.Mock).mockImplementationOnce(() => {
        throw new Error("Connection failed");
      });

      await expect(connector.connect()).rejects.toThrow("Connection failed");
    });
  });

  describe("searchContent", () => {
    beforeEach(async () => {
      await connector.connect();
    });

    it("should search posts and transform them to social media posts", async () => {
      const query = "test query";
      const options = {
        startDate: new Date("2024-01-01"),
        endDate: new Date("2024-01-02"),
        limit: 10,
      };

      const results = await connector.searchContent(query, options);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: mockPost.id,
        text: mockPost.message,
        platform: "facebook",
        authorId: mockPost.from?.id,
        authorName: mockPost.from?.name,
        url: mockPost.permalink_url,
        engagement: {
          likes: mockPost.reactions?.summary.total_count,
          shares: mockPost.shares?.count,
          comments: mockPost.comments?.summary.total_count,
          reach: mockPost.insights?.data[0].values[0].value,
        },
      });
    });

    it("should handle search errors", async () => {
      const mockError = new Error("API Error");
      (FacebookAdsApi.init as jest.Mock).mockReturnValue({
        getPage: jest.fn().mockReturnValue({
          getPosts: jest.fn().mockRejectedValue(mockError),
        }),
      });

      await expect(connector.searchContent("test")).rejects.toThrow(
        "API Error"
      );
    });
  });

  describe("getAuthorDetails", () => {
    beforeEach(async () => {
      await connector.connect();
    });

    it("should fetch and transform page details", async () => {
      const authorId = "author123";

      const result = await connector.getAuthorDetails(authorId);

      expect(result).toMatchObject({
        id: authorId,
        name: mockPage.name,
        platform: "facebook",
        credibilityScore: expect.any(Number),
        verificationStatus: "verified",
      });
    });

    it("should handle non-existent pages", async () => {
      (FacebookAdsApi.init as jest.Mock).mockReturnValue({
        getPage: jest.fn().mockReturnValue({
          get: jest.fn().mockRejectedValue(new Error("Page not found")),
        }),
      });

      await expect(
        connector.getAuthorDetails("non-existent")
      ).rejects.toThrow();
    });
  });

  describe("validateCredentials", () => {
    it("should validate credentials by attempting connection", async () => {
      const result = await connector.validateCredentials();
      expect(result).toBe(true);
    });

    it("should return false for invalid credentials", async () => {
      (FacebookAdsApi.init as jest.Mock).mockImplementationOnce(() => {
        throw new Error("Invalid credentials");
      });

      const result = await connector.validateCredentials();
      expect(result).toBe(false);
    });
  });

  describe("streamContent", () => {
    beforeEach(async () => {
      await connector.connect();
    });

    it("should stream posts matching keywords", async () => {
      const keywords = ["test", "example"];
      const stream = connector.streamContent(keywords);

      const results: SocialMediaPost[] = [];
      for await (const post of stream) {
        results.push(post);
        if (results.length >= 1) break; // Only test first item
      }

      expect(results[0]).toMatchObject({
        id: mockPost.id,
        text: mockPost.message,
        platform: "facebook",
        authorId: mockPost.from?.id,
        authorName: mockPost.from?.name,
        url: mockPost.permalink_url,
        engagement: {
          likes: mockPost.reactions?.summary.total_count,
          shares: mockPost.shares?.count,
          comments: mockPost.comments?.summary.total_count,
          reach: mockPost.insights?.data[0].values[0].value,
        },
      });
    });

    it("should handle streaming errors gracefully", async () => {
      (FacebookAdsApi.init as jest.Mock).mockReturnValue({
        getPage: jest.fn().mockReturnValue({
          getPosts: jest.fn().mockRejectedValue(new Error("Stream error")),
        }),
      });

      const stream = connector.streamContent(["test"]);
      const results: SocialMediaPost[] = [];

      try {
        for await (const post of stream) {
          results.push(post);
        }
      } catch (error) {
        expect(error.message).toBe("Stream error");
      }

      expect(results).toHaveLength(0);
    });

    it("should stop streaming when disconnected", async () => {
      const keywords = ["test"];
      const stream = connector.streamContent(keywords);

      // Start streaming
      const streamPromise = (async () => {
        const results: SocialMediaPost[] = [];
        for await (const post of stream) {
          results.push(post);
        }
        return results;
      })();

      // Disconnect after a short delay
      setTimeout(() => {
        connector.disconnect();
      }, 100);

      const results = await streamPromise;
      expect(results.length).toBeLessThanOrEqual(1);
    });
  });
});
