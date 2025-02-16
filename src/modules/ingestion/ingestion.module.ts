import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ClientsModule, Transport } from "@nestjs/microservices";
import { DatabaseModule } from "@/database";

import { TwitterConnector } from "./services/twitter.connector";
import { FacebookConnector } from "./services/facebook.connector";
import { RedditConnector } from "./services/reddit.connector";
import { SocialMediaService } from "./services/social-media.service";
import { ContentStorageService } from "./content-storage.service";
import { IngestionController } from "./ingestion.controller";

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    ClientsModule.registerAsync([
      {
        name: "KAFKA_SERVICE",
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.KAFKA,
          options: {
            client: {
              clientId: "veritas-ingestion",
              brokers: configService
                .get<string>("KAFKA_BROKERS", "localhost:9092")
                .split(","),
            },
            consumer: {
              groupId: "veritas-ingestion-consumer",
            },
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  providers: [
    // Social Media Connectors
    TwitterConnector,
    FacebookConnector,
    RedditConnector,
    SocialMediaService,
    // Database and Event Services
    ContentStorageService,
  ],
  controllers: [IngestionController],
  exports: [SocialMediaService, ContentStorageService],
})
export class IngestionModule {}
