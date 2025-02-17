import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { FacebookConnector } from "./facebook.connector";
import { FacebookAdsApi, Page, Post } from "facebook-nodejs-business-sdk";
import { mockSourceNode } from "../../../../test/test-utils";
import { SocialMediaPost } from "../interfaces/social-media-connector.interface";

jest.mock("facebook-nodejs-business-sdk");

beforeAll(() => {
  jest.useFakeTimers();
});

afterAll(() => {
  jest.useRealTimers();
});

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

  const configValues = {
    FACEBOOK_ACCESS_TOKEN: "test-token",
    FACEBOOK_APP_ID: "test-app-id",
    FACEBOOK_APP_SECRET: "test-app-secret",
    FACEBOOK_PAGE_ID: "test-page-id",
  };

  const mockConfig = {
    get: jest.fn((key: keyof typeof configValues) => configValues[key]),
    getOrThrow: jest.fn((key: keyof typeof configValues) => {
      const value = configValues[key];
      if (value === undefined) {
        throw new Error(`Configuration ${key} not found`);
      }
      return value;
    }),
    has: jest.fn(),
    set: jest.fn(),
    validate: jest.fn(),
    validationSchema: {},
    validationOptions: {},
    load: jest.fn(),
    loadConfig: jest.fn(),
    watch: jest.fn(),
    watchBootstrap: jest.fn(),
    onModuleDestroy: jest.fn(),
    internalConfig: {},
    isCacheEnabled: true,
    cache: new Map(),
    _changes$: { subscribe: jest.fn() },
    _getFromCache: jest.fn(),
    _getFromProcess: jest.fn(),
    _getFromEnv: jest.fn(),
    _getFromFile: jest.fn(),
    _getGlobalEnvVariableValue: jest.fn(),
  } as unknown as ConfigService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Mock Facebook API
    const mockFacebookApi = {
      getPage: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(mockPage),
        getPosts: jest.fn().mockResolvedValue({
          data: [mockPost],
        }),
      }),
    };

    (FacebookAdsApi.init as jest.Mock).mockReturnValue(mockFacebookApi);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FacebookConnector,
        {
          provide: ConfigService,
          useValue: mockConfig,
        },
      ],
    }).compile();

    connector = module.get<FacebookConnector>(FacebookConnector);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(async () => {
    await connector.disconnect();
    jest.clearAllMocks();
  });

  describe("connect", () => {
    it("should initialize Facebook client with correct credentials", async () => {
      await connector.connect();

      expect(FacebookAdsApi.init).toHaveBeenCalledWith("test-token");
    });

    it("should handle connection errors", async () => {
      (FacebookAdsApi.init as jest.Mock).mockImplementation(() => {
        throw new Error("Connection failed");
      });

      await expect(connector.connect()).rejects.toThrow("Connection failed");
    });
  });

  describe("searchContent", () => {
    it("should search posts and transform them to social media posts", async () => {
      const mockPost = {
        id: "123",
        message: "Test post",
        created_time: "2023-01-01T00:00:00Z",
        from: {
          id: "author123",
          name: "Test Author",
        },
        permalink_url: "https://facebook.com/posts/123",
        reactions: { summary: { total_count: 10 } },
        shares: { count: 5 },
        comments: { summary: { total_count: 3 } },
        insights: {
          data: [
            {
              name: "post_impressions",
              values: [{ value: 1000 }],
            },
          ],
        },
      };

      const mockPageInstance = {
        getPosts: jest.fn().mockResolvedValue({
          data: [mockPost],
        }),
      };

      const mockPageConstructor = jest.fn(() => mockPageInstance);
      (Page as unknown as jest.Mock).mockImplementation(mockPageConstructor);

      (FacebookAdsApi.init as jest.Mock).mockReturnValue({
        getPage: jest.fn().mockReturnValue(mockPageInstance),
      });

      const connector = new FacebookConnector(mockConfig);
      await connector.connect();

      const results = await connector.searchContent("test");

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        id: mockPost.id,
        text: mockPost.message,
        platform: "facebook",
        timestamp: expect.any(Date),
        engagementMetrics: {
          likes: mockPost.reactions.summary.total_count,
          shares: mockPost.shares.count,
          comments: mockPost.comments.summary.total_count,
          reach: mockPost.insights.data[0].values[0].value,
          viralityScore: expect.any(Number),
        },
      });
    });

    it("should handle search errors", async () => {
      const mockError = new Error("API Error");
      const mockPageInstance = {
        getPosts: jest.fn().mockRejectedValue(mockError),
      };

      const mockPageConstructor = jest.fn(() => mockPageInstance);
      (Page as unknown as jest.Mock).mockImplementation(mockPageConstructor);

      (FacebookAdsApi.init as jest.Mock).mockReturnValue({
        getPage: jest.fn().mockReturnValue(mockPageInstance),
      });

      const connector = new FacebookConnector(mockConfig);
      await connector.connect();

      await expect(connector.searchContent("test")).rejects.toThrow(
        "API Error"
      );
    });
  });

  describe("getAuthorDetails", () => {
    it("should fetch and transform page details", async () => {
      const mockPageData = {
        id: "123",
        name: "Test Page",
        verification_status: "verified",
        fan_count: 1000,
      };

      const mockPageInstance = {
        get: jest.fn().mockResolvedValue(mockPageData),
      };

      const mockPageConstructor = jest.fn(() => mockPageInstance);
      (Page as unknown as jest.Mock).mockImplementation(mockPageConstructor);

      (FacebookAdsApi.init as jest.Mock).mockReturnValue({
        getPage: jest.fn().mockReturnValue(mockPageInstance),
      });

      const connector = new FacebookConnector(mockConfig);
      await connector.connect();

      const result = await connector.getAuthorDetails("author123");

      expect(result).toMatchObject({
        id: mockPageData.id,
        name: mockPageData.name,
        platform: "facebook",
        credibilityScore: expect.any(Number),
        verificationStatus: "verified",
      });
    });

    it("should handle non-existent pages", async () => {
      const mockPageInstance = {
        get: jest.fn().mockResolvedValue(undefined),
      };

      const mockPageConstructor = jest.fn(() => mockPageInstance);
      (Page as unknown as jest.Mock).mockImplementation(mockPageConstructor);

      (FacebookAdsApi.init as jest.Mock).mockReturnValue({
        getPage: jest.fn().mockReturnValue(mockPageInstance),
      });

      const connector = new FacebookConnector(mockConfig);
      await connector.connect();

      await expect(connector.getAuthorDetails("non-existent")).rejects.toThrow(
        "Page non-existent not found"
      );
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
    // Increase timeout for streaming tests
    jest.setTimeout(10000);

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it("should stream posts matching keywords", async () => {
      const mockPost = {
        id: "123",
        message: "Test post",
        created_time: "2023-01-01T00:00:00Z",
        from: {
          id: "author123",
          name: "Test Author",
        },
        permalink_url: "https://facebook.com/posts/123",
        reactions: { summary: { total_count: 10 } },
        shares: { count: 5 },
        comments: { summary: { total_count: 3 } },
        insights: {
          data: [
            {
              name: "post_impressions",
              values: [{ value: 1000 }],
            },
          ],
        },
      };

      const mockPageInstance = {
        getPosts: jest.fn().mockResolvedValue({
          data: [mockPost],
        }),
      };

      const mockPageConstructor = jest.fn(() => mockPageInstance);
      (Page as unknown as jest.Mock).mockImplementation(mockPageConstructor);

      (FacebookAdsApi.init as jest.Mock).mockReturnValue({
        getPage: jest.fn().mockReturnValue(mockPageInstance),
      });

      const connector = new FacebookConnector(mockConfig);
      await connector.connect();

      const posts: SocialMediaPost[] = [];
      const stream = connector.streamContent(["test"]);

      stream.on("data", (post: SocialMediaPost) => {
        posts.push(post);
      });

      // Wait for the first interval to complete
      await jest.advanceTimersByTimeAsync(60000);

      expect(posts).toHaveLength(1);
      expect(posts[0]).toMatchObject({
        id: mockPost.id,
        text: mockPost.message,
        platform: "facebook",
        timestamp: expect.any(Date),
        engagementMetrics: {
          likes: mockPost.reactions.summary.total_count,
          shares: mockPost.shares.count,
          comments: mockPost.comments.summary.total_count,
          reach: mockPost.insights.data[0].values[0].value,
          viralityScore: expect.any(Number),
        },
      });

      stream.removeAllListeners();
      await connector.disconnect();
    });

    it("should handle streaming errors gracefully", async () => {
      const mockError = new Error("Stream error");
      const mockPageInstance = {
        getPosts: jest.fn().mockRejectedValue(mockError),
      };

      const mockPageConstructor = jest.fn(() => mockPageInstance);
      (Page as unknown as jest.Mock).mockImplementation(mockPageConstructor);

      (FacebookAdsApi.init as jest.Mock).mockReturnValue({
        getPage: jest.fn().mockReturnValue(mockPageInstance),
      });

      const connector = new FacebookConnector(mockConfig);
      await connector.connect();

      const errors: Error[] = [];
      const stream = connector.streamContent(["test"]);

      stream.on("error", (error: Error) => {
        errors.push(error);
      });

      // Wait for the first interval to complete
      await jest.advanceTimersByTimeAsync(60000);

      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe("Stream error");

      stream.removeAllListeners();
      await connector.disconnect();
    });

    it("should stop streaming when disconnected", async () => {
      const mockPost = {
        id: "123",
        message: "Test post",
        created_time: "2023-01-01T00:00:00Z",
        from: {
          id: "author123",
          name: "Test Author",
        },
        permalink_url: "https://facebook.com/posts/123",
        reactions: { summary: { total_count: 10 } },
        shares: { count: 5 },
        comments: { summary: { total_count: 3 } },
        insights: {
          data: [
            {
              name: "post_impressions",
              values: [{ value: 1000 }],
            },
          ],
        },
      };

      const mockPageInstance = {
        getPosts: jest.fn().mockResolvedValue({
          data: [mockPost],
        }),
      };

      const mockPageConstructor = jest.fn(() => mockPageInstance);
      (Page as unknown as jest.Mock).mockImplementation(mockPageConstructor);

      (FacebookAdsApi.init as jest.Mock).mockReturnValue({
        getPage: jest.fn().mockReturnValue(mockPageInstance),
      });

      const connector = new FacebookConnector(mockConfig);
      await connector.connect();

      const posts: SocialMediaPost[] = [];
      const stream = connector.streamContent(["test"]);

      stream.on("data", (post: SocialMediaPost) => {
        posts.push(post);
      });

      // Wait for the first interval to complete
      await jest.advanceTimersByTimeAsync(60000);

      const initialLength = posts.length;
      stream.removeAllListeners();
      await connector.disconnect();

      // Wait for another interval
      await jest.advanceTimersByTimeAsync(60000);

      expect(posts.length).toBe(initialLength);
    });
  });
});
