import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
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

/** The verification status of a source */
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

export class EngagementMetricsInput {
  @IsNumber()
  @Min(0)
  likes = 0;

  @IsNumber()
  @Min(0)
  shares = 0;

  @IsNumber()
  @Min(0)
  comments = 0;

  @IsNumber()
  @Min(0)
  reach = 0;

  @IsNumber()
  @Min(0)
  @Max(1)
  viralityScore = 0;
}

export class ContentIngestionInput {
  @IsString()
  @IsNotEmpty()
  text = '';

  @IsEnum(Platform)
  platform: 'twitter' | 'facebook' | 'reddit' | 'other' = 'twitter';

  @IsOptional()
  @ValidateNested()
  engagementMetrics?: EngagementMetricsInput;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class SourceIngestionInput {
  @IsString()
  @IsNotEmpty()
  name = '';

  @IsEnum(Platform)
  platform: 'twitter' | 'facebook' | 'reddit' | 'other' = 'twitter';

  @IsNumber()
  @Min(0)
  @Max(1)
  credibilityScore = 0.5;

  @IsEnum(VerificationStatus)
  verificationStatus: VerificationStatus = VerificationStatus.UNVERIFIED;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
