import { Field, Float, ID, ObjectType } from '@nestjs/graphql';
import { TimeFrame } from './timeframe.dto';

@ObjectType('Pattern')
export class Pattern {
  @Field(() => ID)
  id = '';

  @Field(() => String)
  type = 'organic';

  @Field(() => Float)
  confidence = 0.0;

  @Field(() => [ID])
  nodes: string[] = [];

  @Field(() => [ID])
  edges: string[] = [];

  @Field(() => TimeFrame)
  timeframe: TimeFrame = new TimeFrame();
}
