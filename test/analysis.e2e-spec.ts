import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "../src/database";
import { AnalysisModule } from "../src/modules/analysis/analysis.module";
import { MemgraphService } from "../src/database";

interface Pattern {
  id: string;
  type: "organic" | "coordinated" | "automated";
  confidence: number;
  nodes: string[];
  edges: string[];
  timeframe: {
    start: string;
    end: string;
  };
}

describe("Analysis Module (e2e)", () => {
  let app: INestApplication;
  let memgraphService: MemgraphService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: ".env.test",
        }),
        DatabaseModule,
        AnalysisModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    memgraphService = moduleFixture.get<MemgraphService>(MemgraphService);
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    // Clean up test data
    await memgraphService.executeQuery("MATCH (n) DETACH DELETE n");
  });

  describe("/analysis/deviation/:narrativeId (GET)", () => {
    it("should return reality deviation metrics for existing content", async () => {
      // Create test content and source
      const sourceQuery = `
        CREATE (s:Source {
          id: '123',
          name: 'Test Source',
          credibilityScore: 0.8,
          verificationStatus: 'verified'
        })
        RETURN s
      `;
      await memgraphService.executeQuery(sourceQuery);

      const contentQuery = `
        CREATE (c:Content {
          id: '456',
          text: 'Test content',
          timestamp: datetime(),
          platform: 'twitter'
        })
        WITH c
        MATCH (s:Source {id: '123'})
        CREATE (s)-[:PUBLISHED]->(c)
        RETURN c
      `;
      await memgraphService.executeQuery(contentQuery);

      // Create some interactions
      const interactionsQuery = `
        MATCH (c:Content {id: '456'})
        CREATE 
          (a1:Account {id: 'user1'})-[:SHARED {timestamp: datetime()}]->(c),
          (a2:Account {id: 'user2'})-[:SHARED {timestamp: datetime()}]->(c),
          (ref1:Content {id: 'ref1'})-[:REFERENCED_BY {type: 'support'}]->(c),
          (ref2:Content {id: 'ref2'})-[:REFERENCED_BY {type: 'contradiction'}]->(c)
      `;
      await memgraphService.executeQuery(interactionsQuery);

      const response = await request(app.getHttpServer())
        .get("/analysis/deviation/456")
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          baselineScore: expect.any(Number),
          deviationMagnitude: expect.any(Number),
          propagationVelocity: expect.any(Number),
          crossReferenceScore: expect.any(Number),
          sourceCredibility: expect.any(Number),
          impactScore: expect.any(Number),
        })
      );
    });

    it("should return 404 for non-existent content", async () => {
      await request(app.getHttpServer())
        .get("/analysis/deviation/nonexistent")
        .expect(404);
    });
  });

  describe("/analysis/patterns (GET)", () => {
    it("should detect patterns within timeframe", async () => {
      // Create test data with coordinated pattern
      const setupQuery = `
        CREATE 
          (a1:Account {id: 'bot1'}),
          (a2:Account {id: 'bot2'}),
          (a3:Account {id: 'bot3'}),
          (c1:Content {id: 'content1'}),
          (c2:Content {id: 'content2'})
        WITH a1, a2, a3, c1, c2
        CREATE
          (a1)-[:SHARED {timestamp: datetime()}]->(c1),
          (a2)-[:SHARED {timestamp: datetime()}]->(c1),
          (a3)-[:SHARED {timestamp: datetime()}]->(c1),
          (a1)-[:SHARED {timestamp: datetime()}]->(c2),
          (a2)-[:SHARED {timestamp: datetime()}]->(c2)
      `;
      await memgraphService.executeQuery(setupQuery);

      const response = await request(app.getHttpServer())
        .get("/analysis/patterns")
        .query({
          start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 24 hours ago
          end: new Date().toISOString(),
        })
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);

      response.body.forEach((pattern: Pattern) => {
        expect(pattern).toEqual(
          expect.objectContaining({
            id: expect.any(String),
            type: expect.stringMatching(/^(organic|coordinated|automated)$/),
            confidence: expect.any(Number),
            nodes: expect.any(Array),
            edges: expect.any(Array),
            timeframe: expect.objectContaining({
              start: expect.any(String),
              end: expect.any(String),
            }),
          })
        );
      });
    });

    it("should return empty array when no patterns found", async () => {
      const response = await request(app.getHttpServer())
        .get("/analysis/patterns")
        .query({
          start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          end: new Date().toISOString(),
        })
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(0);
    });

    it("should validate timeframe parameters", async () => {
      await request(app.getHttpServer())
        .get("/analysis/patterns")
        .query({
          start: "invalid-date",
          end: new Date().toISOString(),
        })
        .expect(400);

      await request(app.getHttpServer())
        .get("/analysis/patterns")
        .query({
          start: new Date().toISOString(),
          end: "invalid-date",
        })
        .expect(400);
    });
  });

  describe("GraphQL API", () => {
    it("should query reality deviation through GraphQL", async () => {
      // Create test data
      const setupQuery = `
        CREATE (s:Source {
          id: '123',
          name: 'Test Source',
          credibilityScore: 0.8,
          verificationStatus: 'verified'
        })-[:PUBLISHED]->(c:Content {
          id: '456',
          text: 'Test content',
          timestamp: datetime(),
          platform: 'twitter'
        })
        RETURN c
      `;
      await memgraphService.executeQuery(setupQuery);

      const query = `
        query {
          realityDeviation(narrativeId: "456") {
            baselineScore
            deviationMagnitude
            propagationVelocity
            crossReferenceScore
            sourceCredibility
            impactScore
          }
        }
      `;

      const response = await request(app.getHttpServer())
        .post("/graphql")
        .send({ query })
        .expect(200);

      expect(response.body.data.realityDeviation).toEqual(
        expect.objectContaining({
          baselineScore: expect.any(Number),
          deviationMagnitude: expect.any(Number),
          propagationVelocity: expect.any(Number),
          crossReferenceScore: expect.any(Number),
          sourceCredibility: expect.any(Number),
          impactScore: expect.any(Number),
        })
      );
    });

    it("should query patterns through GraphQL", async () => {
      const query = `
        query {
          patterns(timeframe: {
            start: "${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()}"
            end: "${new Date().toISOString()}"
          }) {
            id
            type
            confidence
            nodes
            edges
            timeframe {
              start
              end
            }
          }
        }
      `;

      const response = await request(app.getHttpServer())
        .post("/graphql")
        .send({ query })
        .expect(200);

      expect(Array.isArray(response.body.data.patterns)).toBe(true);
    });
  });
});
