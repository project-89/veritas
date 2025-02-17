import { Field, InputType, registerEnumType } from "@nestjs/graphql";
import { EngagementMetrics } from "@/schemas/base.schema";

export enum VerificationStatus {
  VERIFIED = "verified",
  UNVERIFIED = "unverified",
  SUSPICIOUS = "suspicious",
}

export enum Platform {
  TWITTER = "twitter",
  FACEBOOK = "facebook",
  REDDIT = "reddit",
  OTHER = "other",
}

registerEnumType(VerificationStatus, {
  name: "VerificationStatus",
  description: "The verification status of a source",
});

registerEnumType(Platform, {
  name: "Platform",
});

@InputType()
export class EngagementMetricsInput {
  @Field()
  likes: number;

  @Field()
  shares: number;

  @Field()
  comments: number;

  @Field()
  reach: number;

  @Field()
  viralityScore: number;
}

@InputType()
export class ContentIngestionInput {
  @Field()
  text: string;

  @Field()
  platform: "twitter" | "facebook" | "reddit" | "other";

  @Field(() => EngagementMetricsInput, { nullable: true })
  engagementMetrics?: EngagementMetrics;

  @Field(() => Object, { nullable: true })
  metadata?: Record<string, any>;
}

@InputType()
export class SourceIngestionInput {
  @Field()
  name: string;

  @Field()
  platform: "twitter" | "facebook" | "reddit" | "other";

  @Field()
  credibilityScore: number;

  @Field(() => VerificationStatus)
  verificationStatus: VerificationStatus;

  @Field(() => Object, { nullable: true })
  metadata?: Record<string, any>;
}
