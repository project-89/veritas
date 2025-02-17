import { InputType, Field, registerEnumType } from "@nestjs/graphql";

export enum VerificationStatus {
  VERIFIED = "verified",
  UNVERIFIED = "unverified",
  DISPUTED = "disputed",
}

export enum Platform {
  TWITTER = "twitter",
  FACEBOOK = "facebook",
  REDDIT = "reddit",
  OTHER = "other",
}

registerEnumType(VerificationStatus, {
  name: "VerificationStatus",
});

registerEnumType(Platform, {
  name: "Platform",
});

@InputType()
export class EngagementMetricsInput {
  @Field(() => Number)
  likes: number;

  @Field(() => Number)
  shares: number;

  @Field(() => Number)
  comments: number;

  @Field(() => Number)
  reach: number;

  @Field(() => Number)
  viralityScore: number;
}

@InputType()
export class ContentIngestionInput {
  @Field()
  text: string;

  @Field(() => Platform)
  platform: Platform;

  @Field(() => EngagementMetricsInput)
  engagementMetrics: EngagementMetricsInput;

  @Field(() => Object, { nullable: true })
  metadata?: Record<string, any>;
}

@InputType()
export class SourceIngestionInput {
  @Field()
  name: string;

  @Field(() => Platform)
  platform: Platform;

  @Field(() => Number)
  credibilityScore: number;

  @Field(() => VerificationStatus)
  verificationStatus: VerificationStatus;

  @Field(() => Object, { nullable: true })
  metadata?: Record<string, any>;
}
