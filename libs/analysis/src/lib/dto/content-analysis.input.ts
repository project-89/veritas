import { Field, InputType } from '@nestjs/graphql';
import { IsString, IsNotEmpty } from 'class-validator';

@InputType()
export class ContentAnalysisInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  contentId!: string;
}
