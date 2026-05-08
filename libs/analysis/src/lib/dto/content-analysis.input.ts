import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsString } from 'class-validator';

@InputType()
export class ContentAnalysisInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  contentId!: string;
}
