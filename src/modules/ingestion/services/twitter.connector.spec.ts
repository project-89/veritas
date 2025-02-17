import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { TwitterConnector } from "./twitter.connector";
import { TwitterApi, TweetV2, UserV2, TwitterApiv2 } from "twitter-api-v2";
import { mockSourceNode } from "../../../../test/test-utils";
import { SocialMediaPost } from "../interfaces/social-media-connector.interface";

jest.mock("twitter-api-v2");

describe("TwitterConnector", () => {
  let connector: TwitterConnector;
  let configService: ConfigService;
  let twitterApi: jest.Mocked<TwitterApi>;

  const mockTweet: TweetV2 & { public_metrics?: any } = {
    id: "123",
    text: "Test tweet",
    edit_history_tweet_ids: ["123"],
    created_at: new Date().toISOString(),
    public_metrics: {
      like_count: 100,
      retweet_count: 50,
      reply_count: 25,
      quote_count: 10,
      impression_count: 1000,
    },
    author_id: "author123",
  };

  const mockUser: UserV2 = {
    id: "author123",
    name: "Test Author",
    username: "testauthor",
    verified: true,
    public_metrics: {
      followers_count: 1000,
      following_count: 500,
      tweet_count: 1000,
    },
  };

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string) => {
        switch (key) {
          case "TWITTER_API_KEY":
            return "test-api-key";
          case "TWITTER_API_SECRET":
            return "test-api-secret";
          case "TWITTER_ACCESS_TOKEN":
            return "test-access-token";
          case "TWITTER_ACCESS_SECRET":
            return "test-access-secret";
          default:
            return undefined;
        }
      }),
    };

    const mockTwitterApiV2: Partial<TwitterApiv2> = {
      search: jest.fn().mockResolvedValue({ data: [mockTweet] }),
      user: jest.fn().mockResolvedValue({ data: mockUser }),
      searchAll: jest.fn().mockResolvedValue({ data: [mockTweet] }),
    };

    twitterApi = {
      v2: mockTwitterApiV2 as TwitterApiv2,
      readWrite: true,
    } as unknown as jest.Mocked<TwitterApi>;

    (TwitterApi as jest.MockedClass<typeof TwitterApi>).mockImplementation(
      () => twitterApi
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwitterConnector,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    connector = module.get<TwitterConnector>(TwitterConnector);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe("connect", () => {
    it("should initialize Twitter client with correct credentials", async () => {
      await connector.connect();

      expect(TwitterApi).toHaveBeenCalledWith({
        appKey: "test-api-key",
        appSecret: "test-api-secret",
        accessToken: "test-access-token",
        accessSecret: "test-access-secret",
      });
    });

    it("should handle connection errors", async () => {
      (
        TwitterApi as jest.MockedClass<typeof TwitterApi>
      ).mockImplementationOnce(() => {
        throw new Error("Connection failed");
      });

      await expect(connector.connect()).rejects.toThrow("Connection failed");
    });
  });

  describe("searchContent", () => {
    beforeEach(async () => {
      await connector.connect();
    });

    it("should search tweets and transform them to social media posts", async () => {
      const query = "test query";
      const options = {
        startDate: new Date("2024-01-01"),
        endDate: new Date("2024-01-02"),
        limit: 10,
      };

      const results = await connector.searchContent(query, options);

      expect(twitterApi.v2.searchAll).toHaveBeenCalledWith(
        expect.stringContaining(query),
        expect.objectContaining({
          start_time: options.startDate.toISOString(),
          end_time: options.endDate.toISOString(),
          max_results: options.limit,
        })
      );
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: mockTweet.id,
        text: mockTweet.text,
        platform: "twitter",
        authorId: mockTweet.author_id,
        engagement: {
          likes: mockTweet.public_metrics.like_count,
          shares: mockTweet.public_metrics.retweet_count,
          comments: mockTweet.public_metrics.reply_count,
          reach: mockTweet.public_metrics.impression_count,
        },
      });
    });

    it("should handle search errors", async () => {
      (twitterApi.v2.searchAll as jest.Mock).mockRejectedValueOnce(
        new Error("API Error")
      );

      await expect(connector.searchContent("test")).rejects.toThrow(
        "API Error"
      );
    });
  });

  describe("getAuthorDetails", () => {
    beforeEach(async () => {
      await connector.connect();
    });

    it("should fetch and transform user details", async () => {
      const authorId = "author123";

      const result = await connector.getAuthorDetails(authorId);

      expect(twitterApi.v2.user).toHaveBeenCalledWith(authorId);
      expect(result).toMatchObject({
        id: authorId,
        name: "Test Author",
        platform: "twitter",
        credibilityScore: expect.any(Number),
        verificationStatus: "verified",
      });
    });

    it("should handle non-existent users", async () => {
      (twitterApi.v2.user as jest.Mock).mockRejectedValueOnce(
        new Error("User not found")
      );

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
      (
        TwitterApi as jest.MockedClass<typeof TwitterApi>
      ).mockImplementationOnce(() => {
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

    it("should stream tweets matching keywords", async () => {
      const keywords = ["test", "example"];
      const stream = connector.streamContent(keywords);

      const results: SocialMediaPost[] = [];
      for await (const post of stream) {
        results.push(post);
        if (results.length >= 1) break; // Only test first item
      }

      expect(results[0]).toMatchObject({
        id: mockTweet.id,
        text: mockTweet.text,
        platform: "twitter",
        authorId: mockTweet.author_id,
        engagement: {
          likes: mockTweet.public_metrics.like_count,
          shares: mockTweet.public_metrics.retweet_count,
          comments: mockTweet.public_metrics.reply_count,
          reach: mockTweet.public_metrics.impression_count,
        },
      });
    });

    it("should handle streaming errors gracefully", async () => {
      jest
        .spyOn(twitterApi.v2, "searchAll")
        .mockRejectedValue(new Error("Stream error"));

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
