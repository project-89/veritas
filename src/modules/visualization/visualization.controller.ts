import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiQuery } from "@nestjs/swagger";
import { VisualizationService } from "./services/visualization.service";
import { TimeFrame } from "@/modules/analysis/dto";
import { NetworkGraph, TimelineEvent } from "./services/visualization.service";

@ApiTags("visualization")
@Controller("visualization")
export class VisualizationController {
  constructor(private readonly visualizationService: VisualizationService) {}

  @Get("network")
  @ApiOperation({ summary: "Get network graph data for visualization" })
  @ApiQuery({ name: "startDate", type: Date, required: true })
  @ApiQuery({ name: "endDate", type: Date, required: true })
  async getNetworkGraph(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string
  ): Promise<NetworkGraph> {
    const timeframe: TimeFrame = {
      start: new Date(startDate),
      end: new Date(endDate),
    };
    return this.visualizationService.getNetworkGraph(timeframe);
  }

  @Get("timeline")
  @ApiOperation({ summary: "Get timeline data for visualization" })
  @ApiQuery({ name: "startDate", type: Date, required: true })
  @ApiQuery({ name: "endDate", type: Date, required: true })
  async getTimeline(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string
  ): Promise<TimelineEvent[]> {
    const timeframe: TimeFrame = {
      start: new Date(startDate),
      end: new Date(endDate),
    };
    return this.visualizationService.getTimeline(timeframe);
  }
}
