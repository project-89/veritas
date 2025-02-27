import { Field, ObjectType } from "@nestjs/graphql";
import { DeviationMetrics } from "./deviation-metrics.dto";
import { Pattern } from "./pattern.dto";

@ObjectType("AnalysisResult")
export class AnalysisResult {
  @Field()
  status: string;

  @Field(() => DeviationMetrics, { nullable: true })
  metrics?: DeviationMetrics;

  @Field(() => [Pattern], { nullable: true })
  patterns?: Pattern[];
}
