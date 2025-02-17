import { Module } from "@nestjs/common";
import { DatabaseModule } from "@/database";
import { VisualizationService } from "./services/visualization.service";
import { NetworkGraphResolver } from "./resolvers/network-graph.resolver";
import { TimelineResolver } from "./resolvers/timeline.resolver";
import { VisualizationController } from "./visualization.controller";

@Module({
  imports: [DatabaseModule],
  providers: [VisualizationService, NetworkGraphResolver, TimelineResolver],
  controllers: [VisualizationController],
  exports: [VisualizationService],
})
export class VisualizationModule {}
