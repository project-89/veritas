import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "../src/database";
import { IngestionModule } from "../src/modules/ingestion/ingestion.module";
import {
  Platform,
  VerificationStatus,
} from "../src/modules/ingestion/types/ingestion.types";

describe("Ingestion (e2e)", () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: ".env.test",
        }),
        DatabaseModule,
        IngestionModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("GraphQL", () => {
    const validContentInput = {
      text: "Test content for ingestion",
      platform: Platform.TWITTER,
      engagementMetrics: {
        likes: 100,
        shares: 50,
        comments: 25,
        reach: 1000,
        viralityScore: 0.75,
      },
      metadata: {
        source: "test",
      },
    };

    const validSourceInput = {
      name: "Test Source",
      platform: Platform.TWITTER,
      credibilityScore: 0.8,
      verificationStatus: VerificationStatus.UNVERIFIED,
    };

    it("should ingest content successfully", () => {
      const query = `
        mutation {
          ingestContent(input: {
            text: "${validContentInput.text}",
            platform: ${validContentInput.platform},
            engagementMetrics: {
              likes: ${validContentInput.engagementMetrics.likes},
              shares: ${validContentInput.engagementMetrics.shares},
              comments: ${validContentInput.engagementMetrics.comments},
              reach: ${validContentInput.engagementMetrics.reach},
              viralityScore: ${validContentInput.engagementMetrics.viralityScore}
            },
            metadata: {
              source: "${validContentInput.metadata.source}"
            }
          }) {
            id
            text
            platform
            classification {
              categories
              sentiment
              toxicity
              subjectivity
              language
              topics
              entities {
                text
                type
                confidence
              }
            }
            engagementMetrics {
              likes
              shares
              comments
              reach
              viralityScore
            }
            metadata
          }
        }
      `;

      return request(app.getHttpServer())
        .post("/graphql")
        .send({ query })
        .expect(200)
        .expect((res) => {
          const content = res.body.data.ingestContent;
          expect(content).toBeDefined();
          expect(content.id).toBeDefined();
          expect(content.text).toBe(validContentInput.text);
          expect(content.platform).toBe(validContentInput.platform);
          expect(content.classification).toBeDefined();
          expect(content.engagementMetrics).toEqual(
            validContentInput.engagementMetrics
          );
          expect(content.metadata).toEqual(validContentInput.metadata);
        });
    });

    it("should verify source successfully", () => {
      const query = `
        mutation {
          verifySource(input: {
            name: "${validSourceInput.name}",
            platform: ${validSourceInput.platform},
            credibilityScore: ${validSourceInput.credibilityScore},
            verificationStatus: ${validSourceInput.verificationStatus}
          }) {
            id
            name
            platform
            credibilityScore
            verificationStatus
          }
        }
      `;

      return request(app.getHttpServer())
        .post("/graphql")
        .send({ query })
        .expect(200)
        .expect((res) => {
          const source = res.body.data.verifySource;
          expect(source).toBeDefined();
          expect(source.id).toBeDefined();
          expect(source.name).toBe(validSourceInput.name);
          expect(source.platform).toBe(validSourceInput.platform);
          expect(source.credibilityScore).toBe(
            validSourceInput.credibilityScore
          );
          expect(source.verificationStatus).toBe(
            validSourceInput.verificationStatus
          );
        });
    });

    it("should handle invalid content input", () => {
      const query = `
        mutation {
          ingestContent(input: {
            text: "",
            platform: INVALID_PLATFORM,
            engagementMetrics: {
              likes: -1,
              shares: -1,
              comments: -1,
              reach: -1,
              viralityScore: 2
            }
          }) {
            id
          }
        }
      `;

      return request(app.getHttpServer())
        .post("/graphql")
        .send({ query })
        .expect(200)
        .expect((res) => {
          expect(res.body.errors).toBeDefined();
          expect(res.body.errors[0].message).toContain("Validation failed");
        });
    });

    it("should handle invalid source input", () => {
      const query = `
        mutation {
          verifySource(input: {
            name: "",
            platform: INVALID_PLATFORM,
            credibilityScore: 2,
            verificationStatus: INVALID_STATUS
          }) {
            id
          }
        }
      `;

      return request(app.getHttpServer())
        .post("/graphql")
        .send({ query })
        .expect(200)
        .expect((res) => {
          expect(res.body.errors).toBeDefined();
          expect(res.body.errors[0].message).toContain("Validation failed");
        });
    });
  });

  describe("REST", () => {
    it("should ingest content via REST endpoint", () => {
      const contentData = {
        text: "Test content for REST ingestion",
        platform: Platform.TWITTER,
        engagementMetrics: {
          likes: 100,
          shares: 50,
          comments: 25,
          reach: 1000,
          viralityScore: 0.75,
        },
        metadata: {
          source: "test",
        },
      };

      return request(app.getHttpServer())
        .post("/ingestion/content")
        .send(contentData)
        .expect(201)
        .expect((res) => {
          expect(res.body.id).toBeDefined();
          expect(res.body.text).toBe(contentData.text);
          expect(res.body.platform).toBe(contentData.platform);
          expect(res.body.engagementMetrics).toEqual(
            contentData.engagementMetrics
          );
          expect(res.body.metadata).toEqual(contentData.metadata);
        });
    });

    it("should verify source via REST endpoint", () => {
      const sourceData = {
        name: "Test Source REST",
        platform: Platform.TWITTER,
        credibilityScore: 0.8,
        verificationStatus: VerificationStatus.UNVERIFIED,
      };

      return request(app.getHttpServer())
        .post("/ingestion/source")
        .send(sourceData)
        .expect(201)
        .expect((res) => {
          expect(res.body.id).toBeDefined();
          expect(res.body.name).toBe(sourceData.name);
          expect(res.body.platform).toBe(sourceData.platform);
          expect(res.body.credibilityScore).toBe(sourceData.credibilityScore);
          expect(res.body.verificationStatus).toBe(
            sourceData.verificationStatus
          );
        });
    });

    it("should handle invalid content via REST endpoint", () => {
      const invalidContent = {
        text: "",
        platform: "invalid",
        engagementMetrics: {
          likes: -1,
          shares: -1,
          comments: -1,
          reach: -1,
          viralityScore: 2,
        },
      };

      return request(app.getHttpServer())
        .post("/ingestion/content")
        .send(invalidContent)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain("Validation failed");
        });
    });

    it("should handle invalid source via REST endpoint", () => {
      const invalidSource = {
        name: "",
        platform: "invalid",
        credibilityScore: 2,
        verificationStatus: "invalid",
      };

      return request(app.getHttpServer())
        .post("/ingestion/source")
        .send(invalidSource)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain("Validation failed");
        });
    });
  });
});
