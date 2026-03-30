import { InputType, Field, registerEnumType, Float } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';
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

// Local definition of EngagementMetrics to avoid external dependency
export interface EngagementMetrics {
  likes: number;
  shares: number;
  comments: number;
  reach: number;
  viralityScore: number;
}

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
  @Field(() => Float)
  @IsNumber()
  @Min(0)
  likes = 0;

  @Field(() => Float)
  @IsNumber()
  @Min(0)
  shares = 0;

  @Field(() => Float)
  @IsNumber()
  @Min(0)
  comments = 0;

  @Field(() => Float)
  @IsNumber()
  @Min(0)
  reach = 0;

  @Field(() => Float)
  @IsNumber()
  @Min(0)
  @Max(1)
  viralityScore = 0;
}

@InputType()
export class ContentIngestionInput {
  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  text = '';

  @Field(() => String)
  @IsEnum(Platform)
  platform: 'twitter' | 'facebook' | 'reddit' | 'other' = 'twitter';

  @Field(() => EngagementMetricsInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  engagementMetrics?: EngagementMetricsInput;

  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

@InputType()
export class SourceIngestionInput {
  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  name = '';

  @Field(() => String)
  @IsEnum(Platform)
  platform: 'twitter' | 'facebook' | 'reddit' | 'other' = 'twitter';

  @Field(() => Float)
  @IsNumber()
  @Min(0)
  @Max(1)
  credibilityScore = 0.5;

  @Field(() => VerificationStatus)
  @IsEnum(VerificationStatus)
  verificationStatus: VerificationStatus = VerificationStatus.UNVERIFIED;

  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
