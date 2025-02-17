import { Resolver, Query, Args } from "@nestjs/graphql";
import { VisualizationService } from "../services/visualization.service";
import { TimeFrame } from "@/modules/analysis/dto";
import { TimelineEventType } from "../types/timeline.types";
import { TimelineEvent } from "../services/visualization.service";

@Resolver(() => TimelineEventType)
export class TimelineResolver {
  constructor(private readonly visualizationService: VisualizationService) {}

  @Query(() => [TimelineEventType])
  async timeline(
    @Args("timeframe") timeframe: TimeFrame
  ): Promise<TimelineEvent[]> {
    return this.visualizationService.getTimeline(timeframe);
  }
}
