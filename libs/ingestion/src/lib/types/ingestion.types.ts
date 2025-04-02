import { InputType, registerEnumType } from '@nestjs/graphql';
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

// Create local decorator implementations for testing
export function Field(typeFunc?: any, options?: any): PropertyDecorator {
  return (target: any, propertyKey: string | symbol) => {
    // This is a mock implementation
  };
}

export function Type(typeFunction: () => any): PropertyDecorator {
  return (target: any, propertyKey: string | symbol) => {
    // This is a mock implementation
  };
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
  @Field()
  @IsNumber()
  @Min(0)
  likes = 0;

  @Field()
  @IsNumber()
  @Min(0)
  shares = 0;

  @Field()
  @IsNumber()
  @Min(0)
  comments = 0;

  @Field()
  @IsNumber()
  @Min(0)
  reach = 0;

  @Field()
  @IsNumber()
  @Min(0)
  @Max(1)
  viralityScore = 0;
}

@InputType()
export class ContentIngestionInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  text = '';

  @Field()
  @IsEnum(Platform)
  platform: 'twitter' | 'facebook' | 'reddit' | 'other' = 'twitter';

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
  name = '';

  @Field()
  @IsEnum(Platform)
  platform: 'twitter' | 'facebook' | 'reddit' | 'other' = 'twitter';

  @Field()
  @IsNumber()
  @Min(0)
  @Max(1)
  credibilityScore = 0.5;

  @Field(() => VerificationStatus)
  @IsEnum(VerificationStatus)
  verificationStatus: VerificationStatus = VerificationStatus.UNVERIFIED;

  @Field(() => Object, { nullable: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
