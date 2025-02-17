import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { RedditConnector } from "./reddit.connector";
import Snoowrap, { Submission, RedditUser } from "snoowrap";
import { mockSourceNode } from "../../../../test/test-utils";
import { SocialMediaPost } from "../interfaces/social-media-connector.interface";

jest.mock("snoowrap");

describe("RedditConnector", () => {
  let connector: RedditConnector;
  let configService: ConfigService;
  let redditClient: jest.Mocked<Snoowrap>;

  const mockSubmission: Submission = {
    id: "123",
    title: "Test Title",
    selftext: "Test content",
    author: "testauthor",
    created_utc: Date.now() / 1000,
    permalink: "/r/test/comments/123/test_post",
    score: 100,
    num_comments: 25,
    view_count: 1000,
    subreddit_name_prefixed: "r/test",
  };

  const mockUser: RedditUser = {
    id: "author123",
    name: "testauthor",
    created_utc: Date.now() / 1000,
    link_karma: 1000,
    comment_karma: 500,
    has_verified_email: true,
    is_mod: true,
    is_gold: true,
  };

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string) => {
        switch (key) {
          case "REDDIT_CLIENT_ID":
            return "test-client-id";
          case "REDDIT_CLIENT_SECRET":
            return "test-client-secret";
          case "REDDIT_USERNAME":
            return "test-username";
          case "REDDIT_PASSWORD":
            return "test-password";
          default:
            return undefined;
        }
      }),
    };

    // Mock Reddit API
    (Snoowrap as jest.MockedClass<typeof Snoowrap>).mockImplementation(
      () =>
        ({
          search: jest.fn().mockResolvedValue([mockSubmission]),
          getUser: jest.fn().mockResolvedValue(mockUser),
          getMe: jest.fn().mockResolvedValue(mockUser),
        }) as unknown as Snoowrap
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedditConnector,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    connector = module.get<RedditConnector>(RedditConnector);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe("connect", () => {
    it("should initialize Reddit client with correct credentials", async () => {
      await connector.connect();

      expect(Snoowrap).toHaveBeenCalledWith({
        userAgent: expect.any(String),
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        username: "test-username",
        password: "test-password",
      });
    });

    it("should handle connection errors", async () => {
      (Snoowrap as jest.MockedClass<typeof Snoowrap>).mockImplementationOnce(
        () => {
          throw new Error("Connection failed");
        }
      );

      await expect(connector.connect()).rejects.toThrow("Connection failed");
    });
  });

  describe("searchContent", () => {
    beforeEach(async () => {
      await connector.connect();
    });

    it("should search submissions and transform them to social media posts", async () => {
      const query = "test query";
      const options = {
        startDate: new Date("2024-01-01"),
        endDate: new Date("2024-01-02"),
        limit: 10,
      };

      const results = await connector.searchContent(query, options);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: mockSubmission.id,
        text: `${mockSubmission.title}\n\n${mockSubmission.selftext}`,
        platform: "reddit",
        authorId: mockSubmission.author,
        authorName: mockSubmission.author,
        url: `https://reddit.com${mockSubmission.permalink}`,
        engagement: {
          likes: mockSubmission.score,
          comments: mockSubmission.num_comments,
          reach: mockSubmission.view_count || 0,
          shares: 0, // Reddit doesn't provide share counts
        },
      });
    });

    it("should handle search errors", async () => {
      const mockError = new Error("API Error");
      (Snoowrap as jest.MockedClass<typeof Snoowrap>).mockImplementation(
        () =>
          ({
            search: jest.fn().mockRejectedValue(mockError),
          }) as unknown as Snoowrap
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
      const authorId = "testauthor";

      const result = await connector.getAuthorDetails(authorId);

      expect(result).toMatchObject({
        id: mockUser.id,
        name: mockUser.name,
        platform: "reddit",
        credibilityScore: expect.any(Number),
        verificationStatus: expect.stringMatching(/verified|unverified/),
      });
    });

    it("should handle non-existent users", async () => {
      (Snoowrap as jest.MockedClass<typeof Snoowrap>).mockImplementation(
        () =>
          ({
            getUser: jest.fn().mockRejectedValue(new Error("User not found")),
          }) as unknown as Snoowrap
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
      (Snoowrap as jest.MockedClass<typeof Snoowrap>).mockImplementation(
        () =>
          ({
            getMe: jest
              .fn()
              .mockRejectedValue(new Error("Invalid credentials")),
          }) as unknown as Snoowrap
      );

      const result = await connector.validateCredentials();
      expect(result).toBe(false);
    });
  });

  describe("streamContent", () => {
    beforeEach(async () => {
      await connector.connect();
    });

    it("should stream submissions matching keywords", async () => {
      const keywords = ["test", "example"];
      const stream = connector.streamContent(keywords);

      const results: SocialMediaPost[] = [];
      for await (const post of stream) {
        results.push(post);
        if (results.length >= 1) break; // Only test first item
      }

      expect(results[0]).toMatchObject({
        id: mockSubmission.id,
        text: `${mockSubmission.title}\n\n${mockSubmission.selftext}`,
        platform: "reddit",
        authorId: mockSubmission.author,
        authorName: mockSubmission.author,
        url: `https://reddit.com${mockSubmission.permalink}`,
        engagement: {
          likes: mockSubmission.score,
          comments: mockSubmission.num_comments,
          reach: mockSubmission.view_count || 0,
          shares: 0,
        },
      });
    });

    it("should handle streaming errors gracefully", async () => {
      (Snoowrap as jest.MockedClass<typeof Snoowrap>).mockImplementation(
        () =>
          ({
            search: jest.fn().mockRejectedValue(new Error("Stream error")),
          }) as unknown as Snoowrap
      );

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
