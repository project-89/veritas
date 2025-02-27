// Create a mock instance
const mockSnoowrapInstance = {
  search: jest.fn(),
  getUser: jest.fn(),
  getMe: jest.fn(),
};

// Mock the Snoowrap constructor
const MockSnoowrap = jest.fn().mockImplementation(() => mockSnoowrapInstance);

jest.mock("snoowrap", () => ({
  __esModule: true,
  default: MockSnoowrap,
}));

import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { RedditConnector } from "./reddit.connector";
import { Submission, RedditUser } from "snoowrap";
import { mockSourceNode } from "../../../../test/test-utils";
import { SocialMediaPost } from "../interfaces/social-media-connector.interface";
import { EventEmitter } from "events";

describe("RedditConnector", () => {
  let connector: RedditConnector;
  let configService: ConfigService;

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
  } as Submission;

  const mockUser: RedditUser = {
    id: "author123",
    name: "testauthor",
    created_utc: Date.now() / 1000,
    link_karma: 1000,
    comment_karma: 500,
    has_verified_email: true,
    is_mod: true,
    is_gold: true,
  } as RedditUser;

  beforeEach(async () => {
    jest.clearAllMocks();

    const mockConfigService = {
      get: jest.fn((key: string) => {
        switch (key) {
          case "REDDIT_USERNAME":
            return "test-username";
          case "REDDIT_PASSWORD":
            return "test-password";
          default:
            return undefined;
        }
      }),
      getOrThrow: jest.fn((key: string) => {
        switch (key) {
          case "REDDIT_CLIENT_ID":
            return "test-client-id";
          case "REDDIT_CLIENT_SECRET":
            return "test-client-secret";
          default:
            throw new Error(`Configuration ${key} not found`);
        }
      }),
    };

    mockSnoowrapInstance.search.mockResolvedValue([mockSubmission]);
    mockSnoowrapInstance.getUser.mockResolvedValue(mockUser);
    mockSnoowrapInstance.getMe.mockResolvedValue(mockUser);

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
      expect(MockSnoowrap).toHaveBeenCalledWith({
        userAgent: "Veritas/1.0.0",
        clientId: "test-client-id",
        clientSecret: "test-client-secret",
        username: "test-username",
        password: "test-password",
      });
    });

    it("should handle connection errors", async () => {
      const mockError = new Error("Connection failed");
      mockSnoowrapInstance.getMe.mockRejectedValueOnce(mockError);

      const errorConnector = new RedditConnector(configService);
      await expect(errorConnector.connect()).rejects.toThrow(
        "Connection failed"
      );
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
        text: expect.stringContaining(mockSubmission.selftext),
        platform: "reddit",
        authorId: mockSubmission.author,
        authorName: mockSubmission.author,
        url: `https://reddit.com${mockSubmission.permalink}`,
        engagementMetrics: {
          likes: mockSubmission.score,
          shares: 0,
          comments: mockSubmission.num_comments,
          reach: mockSubmission.view_count,
          viralityScore: expect.any(Number),
        },
      });
    });

    it("should handle search errors", async () => {
      const mockError = new Error("API Error");
      mockSnoowrapInstance.search.mockRejectedValueOnce(mockError);

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
        verificationStatus: "verified",
      });
    });

    it("should handle non-existent users", async () => {
      const mockError = new Error("User not found");
      mockSnoowrapInstance.getUser.mockRejectedValueOnce(mockError);

      await expect(connector.getAuthorDetails("nonexistent")).rejects.toThrow(
        "User not found"
      );
    });
  });

  describe("validateCredentials", () => {
    it("should validate credentials by attempting connection", async () => {
      const result = await connector.validateCredentials();
      expect(result).toBe(true);
    });

    it("should return false for invalid credentials", async () => {
      const mockError = new Error("Invalid credentials");
      mockSnoowrapInstance.getMe.mockRejectedValueOnce(mockError);

      const result = await connector.validateCredentials();
      expect(result).toBe(false);
    });
  });

  describe("streamContent", () => {
    beforeEach(async () => {
      await connector.connect();
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should stream submissions matching keywords", async () => {
      const keywords = ["test"];
      const stream = connector.streamContent(keywords);
      const posts: SocialMediaPost[] = [];

      stream.on("data", (post: SocialMediaPost) => {
        posts.push(post);
      });

      // Fast-forward time to trigger the interval
      await jest.advanceTimersByTimeAsync(60000);

      expect(posts).toHaveLength(1);
      expect(posts[0]).toMatchObject({
        id: mockSubmission.id,
        text: expect.stringContaining(mockSubmission.selftext),
        platform: "reddit",
        engagementMetrics: {
          likes: mockSubmission.score,
          shares: 0,
          comments: mockSubmission.num_comments,
          reach: mockSubmission.view_count,
          viralityScore: expect.any(Number),
        },
      });
    });

    it("should handle streaming errors gracefully", async () => {
      const mockError = new Error("Stream error");
      mockSnoowrapInstance.search.mockRejectedValueOnce(mockError);

      const stream = connector.streamContent(["test"]);
      const errors: Error[] = [];

      stream.on("error", (error: Error) => {
        errors.push(error);
      });

      // Fast-forward time to trigger the interval
      await jest.advanceTimersByTimeAsync(60000);

      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe("Stream error");
    });

    it("should stop streaming when disconnected", async () => {
      const keywords = ["test"];
      const stream = connector.streamContent(keywords);
      const posts: SocialMediaPost[] = [];

      stream.on("data", (post: SocialMediaPost) => {
        posts.push(post);
      });

      // Fast-forward time to trigger the first interval
      await jest.advanceTimersByTimeAsync(60000);
      const initialLength = posts.length;

      await connector.disconnect();

      // Fast-forward time again
      await jest.advanceTimersByTimeAsync(60000);

      expect(posts.length).toBe(initialLength);
    });
  });
});
