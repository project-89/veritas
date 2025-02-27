import { Module } from "@nestjs/common";
import { DatabaseModule } from "@/database";
import { ContentService } from "./services/content.service";
import { ContentController } from "./content.controller";
import { ContentResolver } from "./resolvers/content.resolver";
import { ContentValidationService } from "./services/content-validation.service";
import { ContentClassificationService } from "./services/content-classification.service";

@Module({
  imports: [DatabaseModule],
  providers: [
    ContentService,
    ContentResolver,
    ContentValidationService,
    ContentClassificationService,
  ],
  controllers: [ContentController],
  exports: [ContentService],
})
export class ContentModule {}
