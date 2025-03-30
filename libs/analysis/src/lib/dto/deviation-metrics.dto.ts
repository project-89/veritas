import { Field, ObjectType, Float } from '@nestjs/graphql';

@ObjectType('DeviationMetrics')
export class DeviationMetrics {
  @Field(() => Float)
  baselineScore = 0.0;

  @Field(() => Float)
  deviationMagnitude = 0.0;

  @Field(() => Float)
  propagationVelocity = 0.0;

  @Field(() => Float)
  crossReferenceScore = 0.0;

  @Field(() => Float)
  sourceCredibility = 0.0;

  @Field(() => Float)
  impactScore = 0.0;
}
