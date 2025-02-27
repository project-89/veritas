import {
  ObjectType,
  InputType,
  Field,
  ID,
  Float,
  registerEnumType,
} from "@nestjs/graphql";

export enum SourcePlatform {
  TWITTER = "twitter",
  FACEBOOK = "facebook",
  REDDIT = "reddit",
  OTHER = "other",
}

export enum VerificationStatus {
  VERIFIED = "verified",
  UNVERIFIED = "unverified",
  DISPUTED = "disputed",
}

registerEnumType(SourcePlatform, {
  name: "SourcePlatform",
  description: "The platform where the source is from",
});

registerEnumType(VerificationStatus, {
  name: "VerificationStatus",
  description: "The verification status of a source",
});

@ObjectType("Source")
export class SourceType {
  @Field(() => ID)
  id: string;

  @Field()
  name: string;

  @Field(() => SourcePlatform)
  platform: SourcePlatform;

  @Field(() => Float)
  credibilityScore: number;

  @Field(() => VerificationStatus)
  verificationStatus: VerificationStatus;

  @Field(() => Object, { nullable: true })
  metadata?: Record<string, any>;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}

@InputType("SourceCreateInput")
export class SourceCreateInputType {
  @Field()
  name: string;

  @Field(() => SourcePlatform)
  platform: SourcePlatform;

  @Field(() => Float, { nullable: true })
  credibilityScore?: number;

  @Field(() => VerificationStatus, { nullable: true })
  verificationStatus?: VerificationStatus;

  @Field(() => Object, { nullable: true })
  metadata?: Record<string, any>;
}

@InputType("SourceUpdateInput")
export class SourceUpdateInputType {
  @Field({ nullable: true })
  name?: string;

  @Field(() => Float, { nullable: true })
  credibilityScore?: number;

  @Field(() => VerificationStatus, { nullable: true })
  verificationStatus?: VerificationStatus;

  @Field(() => Object, { nullable: true })
  metadata?: Record<string, any>;
}

@InputType("SourceSearchParams")
export class SourceSearchParamsType {
  @Field({ nullable: true })
  query?: string;

  @Field(() => SourcePlatform, { nullable: true })
  platform?: SourcePlatform;

  @Field(() => VerificationStatus, { nullable: true })
  verificationStatus?: VerificationStatus;

  @Field(() => Float, { nullable: true })
  minCredibilityScore?: number;

  @Field(() => Float, { nullable: true })
  limit?: number;

  @Field(() => Float, { nullable: true })
  offset?: number;
}
