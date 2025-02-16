import { Controller, Post, Put, Body, Param } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { ContentStorageService } from "./content-storage.service";
import { ContentNode, SourceNode } from "@/schemas/base.schema";

@ApiTags("ingestion")
@Controller("ingestion")
export class IngestionController {
  constructor(private readonly storageService: ContentStorageService) {}

  @Post("content")
  @ApiOperation({ summary: "Ingest new content with its source" })
  async ingestContent(
    @Body("content") content: ContentNode,
    @Body("source") source: SourceNode
  ) {
    return this.storageService.ingestContent(content, source);
  }

  @Put("content/:id")
  @ApiOperation({ summary: "Update existing content" })
  async updateContent(
    @Param("id") contentId: string,
    @Body() updates: Partial<ContentNode>
  ) {
    return this.storageService.updateContent(contentId, updates);
  }

  @Put("source/:id/verify")
  @ApiOperation({ summary: "Update source verification status" })
  async verifySource(
    @Param("id") sourceId: string,
    @Body("status") status: "verified" | "unverified" | "disputed"
  ) {
    return this.storageService.verifySource(sourceId, status);
  }
}
