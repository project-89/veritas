import { Controller, Post, Put, Body, Param } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { IngestionService } from "./ingestion.service";
import { ContentNode, SourceNode } from "@/schemas/base.schema";

@ApiTags("ingestion")
@Controller("ingestion")
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post("content")
  @ApiOperation({ summary: "Ingest new content with its source" })
  async ingestContent(
    @Body("content") content: ContentNode,
    @Body("source") source: SourceNode
  ) {
    return this.ingestionService.ingestContent(content, source);
  }

  @Put("content/:id")
  @ApiOperation({ summary: "Update existing content" })
  async updateContent(
    @Param("id") contentId: string,
    @Body() updates: Partial<ContentNode>
  ) {
    return this.ingestionService.updateContent(contentId, updates);
  }

  @Put("source/:id/verify")
  @ApiOperation({ summary: "Update source verification status" })
  async verifySource(
    @Param("id") sourceId: string,
    @Body("status") status: "verified" | "unverified" | "disputed"
  ) {
    return this.ingestionService.verifySource(sourceId, status);
  }
}
