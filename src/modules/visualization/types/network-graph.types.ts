import { ObjectType, Field, ID, Float } from "@nestjs/graphql";

@ObjectType("NodeMetrics")
export class NodeMetricsType {
  @Field(() => Float)
  size: number;

  @Field()
  color: string;

  @Field(() => Float)
  weight: number;
}

@ObjectType("EdgeMetrics")
export class EdgeMetricsType {
  @Field(() => Float)
  width: number;

  @Field()
  color: string;

  @Field(() => Float)
  weight: number;
}

@ObjectType("NetworkNode")
export class NetworkNodeType {
  @Field(() => ID)
  id: string;

  @Field()
  type: string;

  @Field()
  label: string;

  @Field(() => NodeMetricsType)
  metrics: NodeMetricsType;

  @Field(() => Object)
  properties: Record<string, any>;
}

@ObjectType("NetworkEdge")
export class NetworkEdgeType {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  source: string;

  @Field(() => ID)
  target: string;

  @Field()
  type: string;

  @Field(() => EdgeMetricsType)
  metrics: EdgeMetricsType;

  @Field(() => Object)
  properties: Record<string, any>;
}

@ObjectType("NetworkMetadata")
export class NetworkMetricsType {
  @Field()
  timestamp: Date;

  @Field(() => Float)
  nodeCount: number;

  @Field(() => Float)
  edgeCount: number;

  @Field(() => Float)
  density: number;
}

@ObjectType("NetworkGraph")
export class NetworkGraphType {
  @Field(() => [NetworkNodeType])
  nodes: NetworkNodeType[];

  @Field(() => [NetworkEdgeType])
  edges: NetworkEdgeType[];

  @Field(() => NetworkMetricsType)
  metadata: NetworkMetricsType;
}

// Re-export interfaces from the service
export type {
  NetworkNode,
  NetworkEdge,
  NetworkGraph,
} from "../services/visualization.service";
