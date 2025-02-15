import { Field, ObjectType, Float } from "@nestjs/graphql";

@ObjectType("DeviationMetrics")
export class DeviationMetrics {
  @Field(() => Float)
  baselineScore: number;

  @Field(() => Float)
  deviationMagnitude: number;

  @Field(() => Float)
  propagationVelocity: number;

  @Field(() => Float)
  crossReferenceScore: number;

  @Field(() => Float)
  sourceCredibility: number;

  @Field(() => Float)
  impactScore: number;
}
