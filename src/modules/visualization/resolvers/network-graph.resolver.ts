import { Resolver, Query, Args } from "@nestjs/graphql";
import { VisualizationService } from "../services/visualization.service";
import { TimeFrame } from "@/modules/analysis/dto";
import {
  NetworkGraph,
  NetworkGraphType,
  NetworkNodeType,
  NetworkEdgeType,
  NetworkMetricsType,
} from "../types/network-graph.types";

@Resolver(() => NetworkGraphType)
export class NetworkGraphResolver {
  constructor(private readonly visualizationService: VisualizationService) {}

  @Query(() => NetworkGraphType)
  async networkGraph(
    @Args("timeframe") timeframe: TimeFrame
  ): Promise<NetworkGraph> {
    return this.visualizationService.getNetworkGraph(timeframe);
  }
}
