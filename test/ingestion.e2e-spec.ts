import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { AppModule } from "../src/app.module";
import {
  Platform,
  VerificationStatus,
} from "../src/modules/ingestion/types/ingestion.types";

describe("Ingestion (e2e)", () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const validContentInput = {
    text: "Test content for e2e testing",
    platform: Platform.TWITTER,
    engagementMetrics: {
      likes: 100,
      shares: 50,
      comments: 25,
      reach: 1000,
      viralityScore: 0.75,
    },
    metadata: { source: "e2e-test" },
  };

  const validSourceInput = {
    name: "E2E Test Source",
    platform: Platform.TWITTER,
    credibilityScore: 0.8,
    verificationStatus: VerificationStatus.VERIFIED,
    metadata: { verified: true },
  };

  describe("GraphQL", () => {
    it("should successfully ingest content with source", () => {
      const query = `
        mutation ingestContent($content: ContentIngestionInput!, $source: SourceIngestionInput!) {
          ingestContent(content: $content, source: $source) {
            id
            text
            platform
            engagementMetrics {
              likes
              shares
              comments
              reach
              viralityScore
            }
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
            metadata
          }
        }
      `;

      return request(app.getHttpServer())
        .post("/graphql")
        .send({
          query,
          variables: {
            content: validContentInput,
            source: validSourceInput,
          },
        })
        .expect(200)
        .expect((res) => {
          const content = res.body.data.ingestContent;
          expect(content).toBeDefined();
          expect(content.id).toBeDefined();
          expect(content.text).toBe(validContentInput.text);
          expect(content.platform).toBe(validContentInput.platform);
          expect(content.engagementMetrics).toEqual(
            validContentInput.engagementMetrics
          );
          expect(content.classification).toBeDefined();
          expect(content.metadata).toEqual(validContentInput.metadata);
        });
    });

    it("should handle invalid content input", () => {
      const query = `
        mutation ingestContent($content: ContentIngestionInput!, $source: SourceIngestionInput!) {
          ingestContent(content: $content, source: $source) {
            id
            text
          }
        }
      `;

      const invalidContent = {
        ...validContentInput,
        text: "", // Invalid empty text
      };

      return request(app.getHttpServer())
        .post("/graphql")
        .send({
          query,
          variables: {
            content: invalidContent,
            source: validSourceInput,
          },
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.errors).toBeDefined();
          expect(res.body.errors[0].message).toContain("text");
        });
    });

    it("should verify a source", () => {
      const query = `
        mutation verifySource($sourceId: String!, $status: VerificationStatus!) {
          verifySource(sourceId: $sourceId, status: $status) {
            id
            name
            platform
            credibilityScore
            verificationStatus
            metadata
          }
        }
      `;

      return request(app.getHttpServer())
        .post("/graphql")
        .send({
          query,
          variables: {
            sourceId: "test-source-id",
            status: VerificationStatus.VERIFIED,
          },
        })
        .expect(200)
        .expect((res) => {
          const source = res.body.data.verifySource;
          expect(source).toBeDefined();
          expect(source.id).toBeDefined();
          expect(source.verificationStatus).toBe(VerificationStatus.VERIFIED);
        });
    });
  });

  describe("REST", () => {
    it("should successfully ingest content with source", () => {
      return request(app.getHttpServer())
        .post("/ingestion/content")
        .send({
          content: validContentInput,
          source: validSourceInput,
        })
        .expect(201)
        .expect((res) => {
          const content = res.body;
          expect(content).toBeDefined();
          expect(content.id).toBeDefined();
          expect(content.text).toBe(validContentInput.text);
          expect(content.platform).toBe(validContentInput.platform);
          expect(content.engagementMetrics).toEqual(
            validContentInput.engagementMetrics
          );
          expect(content.classification).toBeDefined();
          expect(content.metadata).toEqual(validContentInput.metadata);
        });
    });

    it("should handle invalid content input", () => {
      const invalidContent = {
        ...validContentInput,
        text: "", // Invalid empty text
      };

      return request(app.getHttpServer())
        .post("/ingestion/content")
        .send({
          content: invalidContent,
          source: validSourceInput,
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toBeDefined();
          expect(res.body.message).toContain("text");
        });
    });

    it("should verify a source", () => {
      return request(app.getHttpServer())
        .patch("/ingestion/sources/test-source-id/verify")
        .send({
          status: VerificationStatus.VERIFIED,
        })
        .expect(200)
        .expect((res) => {
          const source = res.body;
          expect(source).toBeDefined();
          expect(source.id).toBeDefined();
          expect(source.verificationStatus).toBe(VerificationStatus.VERIFIED);
        });
    });
  });
});
