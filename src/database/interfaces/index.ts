import { Driver } from "neo4j-driver";
import { RedisClientType } from "redis";

export interface DatabaseDriver {
  getDriver(): Driver;
}

export interface CacheClient {
  getClient(): RedisClientType;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
}
