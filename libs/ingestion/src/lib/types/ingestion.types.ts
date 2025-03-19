import { Field, InputType, registerEnumType } from '@nestjs/graphql';
import { EngagementMetrics } from '@veritas/shared';
import {
  IsString,
  IsEnum,
  IsNumber,
  Min,
  Max,
  IsOptional,
  IsObject,
  IsNotEmpty,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum VerificationStatus {
  VERIFIED = 'verified',
  UNVERIFIED = 'unverified',
  SUSPICIOUS = 'suspicious',
}

export enum Platform {
  TWITTER = 'twitter',
  FACEBOOK = 'facebook',
  REDDIT = 'reddit',
  OTHER = 'other',
}

registerEnumType(VerificationStatus, {
  name: 'VerificationStatus',
  description: 'The verification status of a source',
});

registerEnumType(Platform, {
  name: 'Platform',
});

@InputType()
export class EngagementMetricsInput {
  @Field()
  @IsNumber()
  @Min(0)
  likes: number;

  @Field()
  @IsNumber()
  @Min(0)
  shares: number;

  @Field()
  @IsNumber()
  @Min(0)
  comments: number;

  @Field()
  @IsNumber()
  @Min(0)
  reach: number;

  @Field()
  @IsNumber()
  @Min(0)
  @Max(1)
  viralityScore: number;
}

@InputType()
export class ContentIngestionInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  text: string;

  @Field()
  @IsEnum(Platform)
  platform: 'twitter' | 'facebook' | 'reddit' | 'other';

  @Field(() => EngagementMetricsInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => EngagementMetricsInput)
  engagementMetrics?: EngagementMetricsInput;

  @Field(() => Object, { nullable: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

@InputType()
export class SourceIngestionInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  name: string;

  @Field()
  @IsEnum(Platform)
  platform: 'twitter' | 'facebook' | 'reddit' | 'other';

  @Field()
  @IsNumber()
  @Min(0)
  @Max(1)
  credibilityScore: number;

  @Field(() => VerificationStatus)
  @IsEnum(VerificationStatus)
  verificationStatus: VerificationStatus;

  @Field(() => Object, { nullable: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
