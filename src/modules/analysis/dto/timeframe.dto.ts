import { Field, ObjectType, InputType } from "@nestjs/graphql";

@ObjectType("TimeFrame")
@InputType("TimeFrameInput")
export class TimeFrame {
  @Field(() => Date)
  start: Date;

  @Field(() => Date)
  end: Date;
}
