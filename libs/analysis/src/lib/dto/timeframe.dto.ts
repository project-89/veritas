import { Field, ObjectType, InputType } from '@nestjs/graphql';

@ObjectType('TimeFrame')
@InputType('TimeFrameInput')
export class TimeFrame {
  @Field(() => Date)
  start: Date = new Date();

  @Field(() => Date)
  end: Date = new Date();
}
