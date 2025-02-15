import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, RedisClientType } from "redis";
import { CacheClient } from "../interfaces";

@Injectable()
export class RedisService
  implements OnModuleInit, OnModuleDestroy, CacheClient
{
  private client: RedisClientType;

  constructor(private configService: ConfigService) {
    this.client = createClient({
      url: this.configService.get("REDIS_URL", "redis://localhost:6379"),
    });

    this.client.on("error", (err) => console.error("Redis Client Error", err));
    this.client.on("connect", () =>
      console.log("Successfully connected to Redis")
    );
  }

  async onModuleInit() {
    await this.client.connect();
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  getClient(): RedisClientType {
    return this.client;
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.client.set(key, value, { EX: ttl });
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async setHash(
    key: string,
    fields: Record<string, string>,
    ttl?: number
  ): Promise<void> {
    await this.client.hSet(key, fields);
    if (ttl) {
      await this.client.expire(key, ttl);
    }
  }

  async getHash(key: string): Promise<Record<string, string>> {
    return await this.client.hGetAll(key);
  }

  async getHashField(key: string, field: string): Promise<string | null> {
    const result = await this.client.hGet(key, field);
    return result || null;
  }

  async delHashField(key: string, field: string): Promise<void> {
    await this.client.hDel(key, field);
  }

  async lpush(key: string, value: string): Promise<void> {
    await this.client.lPush(key, value);
  }

  async rpush(key: string, value: string): Promise<void> {
    await this.client.rPush(key, value);
  }

  async lpop(key: string): Promise<string | null> {
    return await this.client.lPop(key);
  }

  async rpop(key: string): Promise<string | null> {
    return await this.client.rPop(key);
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return await this.client.lRange(key, start, stop);
  }
}
