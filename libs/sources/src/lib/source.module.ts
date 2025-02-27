import { Module } from "@nestjs/common";
import { DatabaseModule } from "@/database";
import { SourceService } from "./services/source.service";
import { SourceController } from "./source.controller";
import { SourceResolver } from "./resolvers/source.resolver";
import { SourceValidationService } from "./services/source-validation.service";

@Module({
  imports: [DatabaseModule],
  providers: [SourceService, SourceResolver, SourceValidationService],
  controllers: [SourceController],
  exports: [SourceService],
})
export class SourceModule {}
