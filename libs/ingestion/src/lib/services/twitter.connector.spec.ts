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
      getOrThrow: jest.fn((key: string) => {
        switch (key) {
          case "TWITTER_BEARER_TOKEN":
            return "test-bearer-token";
          default:
            throw new Error(`Configuration ${key} not found`);
        }
      }),
    };

    // Mock Twitter API
    const mockTwitterApiV2 = {
      search: jest.fn().mockResolvedValue({
        data: [mockTweet],
        includes: {
          users: [mockUser],
        },
      }),
      user: jest.fn().mockResolvedValue({
        data: mockUser,
      }),
      me: jest.fn().mockResolvedValue({
        data: mockUser,
      }),
    } as unknown as TwitterApiv2;

    (TwitterApi as jest.MockedClass<typeof TwitterApi>).mockImplementation(
      () =>
        ({
          v2: mockTwitterApiV2,
        }) as unknown as TwitterApi
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
    twitterApi = new TwitterApi("test-bearer-token") as jest.Mocked<TwitterApi>;

    // Connect before running tests
    await connector.connect();
  });

  describe("connect", () => {
    it("should initialize Twitter client with correct credentials", async () => {
      await connector.connect();
      expect(TwitterApi).toHaveBeenCalledWith("test-bearer-token");
    });

    it("should handle connection errors", async () => {
      (
        TwitterApi as jest.MockedClass<typeof TwitterApi>
      ).mockImplementationOnce(() => {
        throw new Error("Connection failed");
      });
      const errorConnector = new TwitterConnector(configService);
      await expect(errorConnector.connect()).rejects.toThrow(
        "Connection failed"
      );
    });
  });

  describe("searchContent", () => {
    it("should search tweets and transform them to social media posts", async () => {
      const result = await connector.searchContent("test");
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: mockTweet.id,
        text: mockTweet.text,
        timestamp: expect.any(Date),
        platform: "twitter",
        engagementMetrics: {
          likes: mockTweet.public_metrics.like_count,
          shares: mockTweet.public_metrics.retweet_count,
          comments: mockTweet.public_metrics.reply_count,
          reach: mockTweet.public_metrics.impression_count,
          viralityScore: expect.any(Number),
        },
      });
    });

    it("should handle search errors", async () => {
      const mockError = new Error("API Error");
      const mockTwitterApiV2 = {
        search: jest.fn().mockRejectedValue(mockError),
      } as unknown as TwitterApiv2;

      (
        TwitterApi as jest.MockedClass<typeof TwitterApi>
      ).mockImplementationOnce(
        () =>
          ({
            v2: mockTwitterApiV2,
          }) as unknown as TwitterApi
      );

      const errorConnector = new TwitterConnector(configService);
      await errorConnector.connect();
      await expect(errorConnector.searchContent("test")).rejects.toThrow(
        "API Error"
      );
    });
  });

  describe("getAuthorDetails", () => {
    it("should fetch and transform user details", async () => {
      const authorId = "author123";
      const mockTwitterApiV2 = {
        user: jest.fn().mockResolvedValue({
          data: mockUser,
        }),
      } as unknown as TwitterApiv2;

      (
        TwitterApi as jest.MockedClass<typeof TwitterApi>
      ).mockImplementationOnce(
        () =>
          ({
            v2: mockTwitterApiV2,
          }) as unknown as TwitterApi
      );

      const testConnector = new TwitterConnector(configService);
      await testConnector.connect();
      const result = await testConnector.getAuthorDetails(authorId);
      expect(mockTwitterApiV2.user).toHaveBeenCalledWith(authorId, {
        "user.fields": ["created_at", "public_metrics", "verified"],
      });
      expect(result).toMatchObject({
        id: authorId,
        name: mockUser.name,
        platform: "twitter",
        credibilityScore: expect.any(Number),
        verificationStatus: "verified",
      });
    });

    it("should handle non-existent users", async () => {
      const mockError = new Error("User not found");
      jest.spyOn(twitterApi.v2, "user").mockRejectedValueOnce(mockError);
      await expect(connector.getAuthorDetails("nonexistent")).rejects.toThrow(
        "User not found"
      );
    });
  });

  describe("validateCredentials", () => {
    it("should validate credentials by attempting connection", async () => {
      const result = await connector.validateCredentials();
      expect(result).toBe(true);
      expect(twitterApi.v2.me).toHaveBeenCalled();
    });

    it("should return false for invalid credentials", async () => {
      jest
        .spyOn(twitterApi.v2, "me")
        .mockRejectedValueOnce(new Error("Invalid credentials"));
      const result = await connector.validateCredentials();
      expect(result).toBe(false);
    });
  });

  describe("streamContent", () => {
    beforeEach(() => {
      // Override the polling interval for testing
      jest.useFakeTimers();
    });

    afterEach(async () => {
      jest.useRealTimers();
      await connector.disconnect();
    });

    it("should stream tweets matching keywords", async () => {
      const mockTwitterApiV2 = {
        search: jest.fn().mockResolvedValue({
          data: [mockTweet],
          includes: { users: [mockUser] },
        }),
        me: jest.fn().mockResolvedValue({ data: mockUser }),
      } as unknown as TwitterApiv2;

      (
        TwitterApi as jest.MockedClass<typeof TwitterApi>
      ).mockImplementationOnce(
        () =>
          ({
            v2: mockTwitterApiV2,
          }) as unknown as TwitterApi
      );

      const testConnector = new TwitterConnector(configService);
      await testConnector.connect();

      const keywords = ["test"];
      const stream = testConnector.streamContent(keywords);
      const posts: SocialMediaPost[] = [];

      stream.on("data", (post: SocialMediaPost) => {
        posts.push(post);
      });

      // Fast-forward time to trigger the interval
      jest.advanceTimersByTime(60000);

      // Wait for any pending promises to resolve
      await Promise.resolve();

      expect(posts.length).toBeGreaterThan(0);
      expect(posts[0]).toMatchObject({
        id: mockTweet.id,
        text: mockTweet.text,
        platform: "twitter",
      });

      await testConnector.disconnect();
    });

    it("should handle streaming errors gracefully", async () => {
      const mockError = new Error("Stream error");
      const mockTwitterApiV2 = {
        search: jest.fn().mockRejectedValue(mockError),
        me: jest.fn().mockResolvedValue({ data: mockUser }),
      } as unknown as TwitterApiv2;

      (
        TwitterApi as jest.MockedClass<typeof TwitterApi>
      ).mockImplementationOnce(
        () =>
          ({
            v2: mockTwitterApiV2,
          }) as unknown as TwitterApi
      );

      const errorConnector = new TwitterConnector(configService);
      await errorConnector.connect();
      const stream = errorConnector.streamContent(["test"]);
      const errors: Error[] = [];

      stream.on("error", (error: Error) => {
        errors.push(error);
      });

      // Fast-forward time to trigger the interval
      jest.advanceTimersByTime(60000);

      // Wait for any pending promises to resolve
      await Promise.resolve();

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toBe("Stream error");

      await errorConnector.disconnect();
    });

    it("should stop streaming when disconnected", async () => {
      // Create a new connector instance with fresh mocks
      const mockTwitterApiV2 = {
        search: jest.fn().mockResolvedValue({
          data: [mockTweet],
          includes: { users: [mockUser] },
        }),
        me: jest.fn().mockResolvedValue({ data: mockUser }),
      } as unknown as TwitterApiv2;

      (
        TwitterApi as jest.MockedClass<typeof TwitterApi>
      ).mockImplementationOnce(
        () =>
          ({
            v2: mockTwitterApiV2,
          }) as unknown as TwitterApi
      );

      const testConnector = new TwitterConnector(configService);
      await testConnector.connect();

      const keywords = ["test"];
      const stream = testConnector.streamContent(keywords);
      const posts: SocialMediaPost[] = [];

      stream.on("data", (post: SocialMediaPost) => {
        posts.push(post);
      });

      // Fast-forward time to trigger the first interval
      jest.advanceTimersByTime(60000);
      await Promise.resolve();

      const initialLength = posts.length;

      await testConnector.disconnect();

      // Fast-forward time again
      jest.advanceTimersByTime(60000);
      await Promise.resolve();

      expect(posts.length).toBe(initialLength);
    });
  });
});
