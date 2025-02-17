import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import * as request from "supertest";
import { AppModule } from "../src/app.module";
import { mockContentNode, mockSourceNode, mockTimeFrame } from "./test-utils";
import { GlobalExceptionFilter } from "../src/filters/global-exception.filter";
import { LoggingService } from "../src/services/logging.service";

describe("AppController (e2e)", () => {
  let app: INestApplication;
  let logger: LoggingService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    logger = app.get(LoggingService);
    app.useLogger(logger);

    // Set up global pipes and filters
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      })
    );
    app.useGlobalFilters(new GlobalExceptionFilter());

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("Content Analysis", () => {
    it("/analysis/content (POST) - should analyze content", () => {
      return request(app.getHttpServer())
        .post("/analysis/content")
        .send({
          content: mockContentNode,
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toBeDefined();
          expect(res.body.patterns).toBeDefined();
          expect(res.body.deviationMetrics).toBeDefined();
          expect(res.body.relatedContent).toBeDefined();
        });
    });

    it("/analysis/patterns (GET) - should get patterns within timeframe", () => {
      return request(app.getHttpServer())
        .get("/analysis/patterns")
        .query({
          startDate: mockTimeFrame.start.toISOString(),
          endDate: mockTimeFrame.end.toISOString(),
        })
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          if (res.body.length > 0) {
            expect(res.body[0].id).toBeDefined();
            expect(res.body[0].confidence).toBeDefined();
            expect(res.body[0].nodes).toBeDefined();
            expect(res.body[0].edges).toBeDefined();
          }
        });
    });

    it("/analysis/deviation/:narrativeId (GET) - should measure reality deviation", () => {
      const narrativeId = "test-narrative-1";
      return request(app.getHttpServer())
        .get(`/analysis/deviation/${narrativeId}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.baselineScore).toBeDefined();
          expect(res.body.deviationMagnitude).toBeDefined();
          expect(res.body.propagationVelocity).toBeDefined();
          expect(res.body.crossReferenceScore).toBeDefined();
          expect(res.body.sourceCredibility).toBeDefined();
          expect(res.body.impactScore).toBeDefined();
        });
    });
  });

  describe("Source Analysis", () => {
    it("/analysis/source/:sourceId/credibility (GET) - should calculate source credibility", () => {
      return request(app.getHttpServer())
        .get(`/analysis/source/${mockSourceNode.id}/credibility`)
        .expect(200)
        .expect((res) => {
          expect(typeof res.body.credibilityScore).toBe("number");
          expect(res.body.credibilityScore).toBeGreaterThanOrEqual(0);
          expect(res.body.credibilityScore).toBeLessThanOrEqual(1);
        });
    });
  });

  describe("GraphQL Endpoints", () => {
    it("should query content analysis", () => {
      const query = `
        query {
          analyzeContent(contentId: "${mockContentNode.id}") {
            patterns {
              id
              confidence
              nodes
              edges
            }
            deviationMetrics {
              baselineScore
              deviationMagnitude
              propagationVelocity
              crossReferenceScore
              sourceCredibility
              impactScore
            }
          }
        }
      `;

      return request(app.getHttpServer())
        .post("/graphql")
        .send({ query })
        .expect(200)
        .expect((res) => {
          expect(res.body.data).toBeDefined();
          expect(res.body.data.analyzeContent).toBeDefined();
          expect(res.body.data.analyzeContent.patterns).toBeDefined();
          expect(res.body.data.analyzeContent.deviationMetrics).toBeDefined();
        });
    });

    it("should query patterns within timeframe", () => {
      const query = `
        query {
          getPatterns(timeframe: {
            start: "${mockTimeFrame.start.toISOString()}"
            end: "${mockTimeFrame.end.toISOString()}"
          }) {
            id
            confidence
            nodes
            edges
          }
        }
      `;

      return request(app.getHttpServer())
        .post("/graphql")
        .send({ query })
        .expect(200)
        .expect((res) => {
          expect(res.body.data).toBeDefined();
          expect(Array.isArray(res.body.data.getPatterns)).toBe(true);
        });
    });
  });

  describe("Error Handling", () => {
    it("should handle validation errors", () => {
      return request(app.getHttpServer())
        .post("/analysis/content")
        .send({
          invalidField: "test",
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.statusCode).toBe(400);
          expect(res.body.message).toBeDefined();
          expect(res.body.details).toBeDefined();
        });
    });

    it("should handle not found errors", () => {
      return request(app.getHttpServer())
        .get("/analysis/deviation/non-existent")
        .expect(404)
        .expect((res) => {
          expect(res.body.statusCode).toBe(404);
          expect(res.body.message).toBeDefined();
        });
    });
  });
});
