import { Module } from "@nestjs/common";
import { ClientsModule, Transport } from "@nestjs/microservices";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { IngestionService } from "./ingestion.service";
import { IngestionController } from "./ingestion.controller";
import { DatabaseModule } from "@/database";

@Module({
  imports: [
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
  providers: [IngestionService],
  controllers: [IngestionController],
  exports: [IngestionService],
})
export class IngestionModule {}
