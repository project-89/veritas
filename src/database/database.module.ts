import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MemgraphService } from "./services/memgraph.service";
import { RedisService } from "./services/redis.service";

@Global()
@Module({
  imports: [ConfigModule],
  providers: [MemgraphService, RedisService],
  exports: [MemgraphService, RedisService],
})
export class DatabaseModule {}
