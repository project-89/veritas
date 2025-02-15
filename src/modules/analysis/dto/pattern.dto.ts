import { Field, ObjectType, ID, Float } from "@nestjs/graphql";
import { TimeFrame } from "./timeframe.dto";

@ObjectType("Pattern")
export class Pattern {
  @Field(() => ID)
  id: string;

  @Field()
  type: string;

  @Field(() => Float)
  confidence: number;

  @Field(() => [ID])
  nodes: string[];

  @Field(() => [ID])
  edges: string[];

  @Field(() => TimeFrame)
  timeframe: TimeFrame;
}
