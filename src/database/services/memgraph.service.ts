import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import neo4j, { Driver, Session } from "neo4j-driver";
import { DatabaseDriver, DatabaseConfig } from "../interfaces";

@Injectable()
export class MemgraphService
  implements OnModuleInit, OnModuleDestroy, DatabaseDriver
{
  private driver: Driver;
  private config: DatabaseConfig;

  constructor(private configService: ConfigService) {
    this.config = {
      host: this.configService.get("MEMGRAPH_HOST", "localhost"),
      port: parseInt(this.configService.get("MEMGRAPH_PORT", "7687")),
      username: this.configService.get("MEMGRAPH_USERNAME", ""),
      password: this.configService.get("MEMGRAPH_PASSWORD", ""),
    };
  }

  async onModuleInit() {
    this.driver = neo4j.driver(
      `bolt://${this.config.host}:${this.config.port}`,
      neo4j.auth.basic(this.config.username || "", this.config.password || ""),
      {
        maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 hours
        maxConnectionPoolSize: 50,
        connectionAcquisitionTimeout: 2 * 60 * 1000, // 2 minutes
      }
    );

    try {
      await this.driver.verifyConnectivity();
      console.log("Successfully connected to Memgraph");
    } catch (error) {
      console.error("Failed to connect to Memgraph:", error);
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.driver) {
      await this.driver.close();
    }
  }

  getDriver(): Driver {
    return this.driver;
  }

  getSession(): Session {
    return this.driver.session();
  }

  async executeQuery(
    query: string,
    params: Record<string, any> = {}
  ): Promise<any[]> {
    const session = this.getSession();
    try {
      const result = await session.run(query, params);
      return result.records.map((record) => record.toObject());
    } finally {
      await session.close();
    }
  }

  async createNode(
    label: string,
    properties: Record<string, any>
  ): Promise<any> {
    const query = `
      CREATE (n:${label} $properties)
      RETURN n
    `;
    const result = await this.executeQuery(query, { properties });
    return result[0]?.n;
  }

  async createRelationship(
    fromNodeId: string,
    toNodeId: string,
    type: string,
    properties: Record<string, any> = {}
  ): Promise<any> {
    const query = `
      MATCH (from), (to)
      WHERE id(from) = $fromNodeId AND id(to) = $toNodeId
      CREATE (from)-[r:${type} $properties]->(to)
      RETURN r
    `;
    const result = await this.executeQuery(query, {
      fromNodeId,
      toNodeId,
      properties,
    });
    return result[0]?.r;
  }

  async findNodeById(id: string): Promise<any> {
    const query = `
      MATCH (n)
      WHERE id(n) = $id
      RETURN n
    `;
    const result = await this.executeQuery(query, { id });
    return result[0]?.n;
  }

  async findNodesByLabel(label: string): Promise<any[]> {
    const query = `
      MATCH (n:${label})
      RETURN n
    `;
    const result = await this.executeQuery(query);
    return result.map((r) => r.n);
  }

  async findNodesByProperty(
    label: string,
    property: string,
    value: any
  ): Promise<any[]> {
    const query = `
      MATCH (n:${label})
      WHERE n.${property} = $value
      RETURN n
    `;
    const result = await this.executeQuery(query, { value });
    return result.map((r) => r.n);
  }
}
