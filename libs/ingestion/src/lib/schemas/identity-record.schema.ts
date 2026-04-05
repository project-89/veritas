import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

@Schema({ _id: false })
class PlatformAccountEmbed {
  @Prop({ required: true })
  platform!: string;

  @Prop({ required: true })
  handle!: string;

  @Prop({ type: String, default: '' })
  url!: string;

  @Prop({ type: Date, default: () => new Date() })
  discoveredAt!: Date;

  @Prop({ type: String, enum: ['sherlock', 'investigation', 'manual'], default: 'investigation' })
  discoveryMethod!: 'sherlock' | 'investigation' | 'manual';

  @Prop({ type: Boolean, default: false })
  verified!: boolean;
}

@Schema({ _id: false })
class ProfileImageEmbed {
  @Prop({ required: true })
  url!: string;

  @Prop({ required: true })
  platform!: string;

  @Prop({ type: Date, default: () => new Date() })
  capturedAt!: Date;

  @Prop({ type: Boolean, default: true })
  isCurrent!: boolean;
}

@Schema({ _id: false })
class AuthorProfileEmbed {
  @Prop({ type: Number, default: null })
  followersCount!: number | null;

  @Prop({ type: Number, default: null })
  followingCount!: number | null;

  @Prop({ type: Number, default: null })
  postsCount!: number | null;

  @Prop({ type: Boolean, default: false })
  isVerified!: boolean;

  @Prop({ type: String, default: null })
  bio!: string | null;

  @Prop({ type: String, default: null })
  joinDate!: string | null;
}

@Schema({ _id: false })
class ScoreHistoryEmbed {
  @Prop({ required: true })
  value!: number;

  @Prop({ type: Date, required: true })
  timestamp!: Date;

  @Prop({ type: String, default: '' })
  investigationQuery!: string;
}

@Schema({ _id: false })
class InvestigationSnapshotEmbed {
  @Prop({ required: true })
  query!: string;

  @Prop({ type: Date, required: true })
  timestamp!: Date;

  @Prop({ type: Number, default: 0 })
  postCount!: number;

  @Prop({ type: [String], default: [] })
  platforms!: string[];

  @Prop({ type: Number, default: null })
  credibilityScore!: number | null;

  @Prop({ type: Number, default: null })
  botProbability!: number | null;

  @Prop({ type: [String], default: [] })
  flags!: string[];

  @Prop({ type: Number, default: 0 })
  influenceScore!: number;
}

// ---------------------------------------------------------------------------
// Psychological profile sub-schema
// ---------------------------------------------------------------------------

@Schema({ _id: false })
class CommunicationStyleEmbed {
  @Prop({ type: String, default: 'mixed' })
  formality!: string;

  @Prop({ type: String, default: 'mixed' })
  tone!: string;

  @Prop({ type: String, default: 'moderate' })
  complexity!: string;

  @Prop({ type: [String], default: [] })
  evidence!: string[];
}

@Schema({ _id: false })
class EmotionalTriggersEmbed {
  @Prop({ type: [String], default: [] })
  anger!: string[];

  @Prop({ type: [String], default: [] })
  excitement!: string[];

  @Prop({ type: [String], default: [] })
  fear!: string[];

  @Prop({ type: Object, default: {} })
  evidence!: Record<string, string[]>;
}

@Schema({ _id: false })
class PsychologicalProfileEmbed {
  @Prop({ type: Number, default: 1 })
  version!: number;

  @Prop({ type: Date, required: true })
  generatedAt!: Date;

  @Prop({ type: String, default: 'gemini-3.1-pro-preview' })
  modelUsed!: string;

  @Prop({ type: Number, default: 0 })
  postCountAnalyzed!: number;

  @Prop({ type: CommunicationStyleEmbed, default: () => ({}) })
  communicationStyle!: CommunicationStyleEmbed;

  @Prop({ type: Array, default: [] })
  coreBeliefs!: Array<{ belief: string; confidence: number; evidence: string[] }>;

  @Prop({ type: Array, default: [] })
  interestDomains!: Array<{ domain: string; engagementLevel: string; postCount: number }>;

  @Prop({ type: EmotionalTriggersEmbed, default: () => ({}) })
  emotionalTriggers!: EmotionalTriggersEmbed;

  @Prop({ type: Object, default: {} })
  engagementPatterns!: {
    likelyToEngageWith: string[];
    likelyToShare: string[];
    likelyToCreate: string[];
    contentPreferences: string[];
  };

  @Prop({ type: Object, default: {} })
  influenceSusceptibility!: {
    vulnerableTo: string[];
    resistantTo: string[];
    echoChamberDepth: string;
    evidence: string[];
  };

  @Prop({ type: Object, default: {} })
  persuasionStyle!: {
    primaryTechniques: string[];
    targetAudience: string;
    effectiveness: string;
    evidence: string[];
  };

  @Prop({ type: Object, default: {} })
  riskIndicators!: {
    radicalizationSignals: string[];
    manipulationVulnerability: string;
    echoChamberDepth: string;
    flags: string[];
    evidence: string[];
  };

  @Prop({ type: Object, default: {} })
  socialRole!: {
    primary: string;
    confidence: number;
    evidence: string[];
  };

  @Prop({ type: String, default: '' })
  summary!: string;
}

// ---------------------------------------------------------------------------
// Main Identity Record schema
// ---------------------------------------------------------------------------

@Schema({
  collection: 'identity_records',
  timestamps: true,
  toJSON: {
    transform: (_: unknown, ret: Record<string, unknown>) => {
      ret['id'] = ret['_id'];
      delete ret['__v'];
      return ret;
    },
  },
})
export class IdentityRecordSchema extends Document {
  @Prop({ required: true })
  primaryHandle!: string;

  @Prop({ required: true })
  primaryPlatform!: string;

  @Prop({ type: String, default: null })
  displayName!: string | null;

  // Cross-platform
  @Prop({ type: [PlatformAccountEmbed], default: [] })
  platformAccounts!: PlatformAccountEmbed[];

  @Prop({ type: String, default: null })
  identityClusterId!: string | null;

  @Prop({ type: [String], default: [] })
  linkedIdentityIds!: string[];

  // Author metadata
  @Prop({ type: AuthorProfileEmbed, default: null })
  authorProfile!: AuthorProfileEmbed | null;

  // Profile images
  @Prop({ type: [ProfileImageEmbed], default: [] })
  profileImages!: ProfileImageEmbed[];

  @Prop({ type: [ProfileImageEmbed], default: [] })
  bannerImages!: ProfileImageEmbed[];

  // Score tracking
  @Prop({ type: Number, default: null })
  currentCredibility!: number | null;

  @Prop({ type: Number, default: null })
  currentBotProbability!: number | null;

  @Prop({ type: [ScoreHistoryEmbed], default: [] })
  credibilityHistory!: ScoreHistoryEmbed[];

  @Prop({ type: [ScoreHistoryEmbed], default: [] })
  botProbabilityHistory!: ScoreHistoryEmbed[];

  // Investigation history
  @Prop({ type: [InvestigationSnapshotEmbed], default: [] })
  investigations!: InvestigationSnapshotEmbed[];

  @Prop({ type: Number, default: 0 })
  totalInvestigations!: number;

  @Prop({ type: Date, default: null })
  firstInvestigatedAt!: Date | null;

  @Prop({ type: Date, default: null })
  lastInvestigatedAt!: Date | null;

  // Psychological profile
  @Prop({ type: PsychologicalProfileEmbed, default: null })
  psychologicalProfile!: PsychologicalProfileEmbed | null;

  @Prop({
    type: String,
    enum: ['none', 'queued', 'generating', 'complete', 'failed'],
    default: 'none',
  })
  profileGenerationStatus!: string;

  // Cached timeline (avoids re-fetching from connectors)
  @Prop({ type: Object, default: null })
  cachedTimeline!: {
    posts: unknown[];
    fetchedAt: string;
    platforms: string[];
  } | null;

  // Aggregated
  @Prop({ type: [String], default: [] })
  aggregatedFlags!: string[];

  @Prop({ type: Number, default: 0 })
  totalPostsAnalyzed!: number;
}

export const IdentityRecordModel = SchemaFactory.createForClass(IdentityRecordSchema);

IdentityRecordModel.index({ primaryHandle: 1, primaryPlatform: 1 }, { unique: true });
IdentityRecordModel.index({ identityClusterId: 1 });
IdentityRecordModel.index({ lastInvestigatedAt: -1 });

// ---------------------------------------------------------------------------
// TypeScript interfaces
// ---------------------------------------------------------------------------

export interface PlatformAccount {
  platform: string;
  handle: string;
  url: string;
  discoveredAt: Date;
  discoveryMethod: 'sherlock' | 'investigation' | 'manual';
  verified: boolean;
}

export interface ProfileImage {
  url: string;
  platform: string;
  capturedAt: Date;
  isCurrent: boolean;
}

export interface ScoreHistory {
  value: number;
  timestamp: Date;
  investigationQuery: string;
}

export interface InvestigationSnapshot {
  query: string;
  timestamp: Date;
  postCount: number;
  platforms: string[];
  credibilityScore: number | null;
  botProbability: number | null;
  flags: string[];
  influenceScore: number;
}

export interface PsychologicalProfile {
  version: number;
  generatedAt: Date;
  modelUsed: string;
  postCountAnalyzed: number;
  communicationStyle: {
    formality: string;
    tone: string;
    complexity: string;
    evidence: string[];
  };
  coreBeliefs: Array<{ belief: string; confidence: number; evidence: string[] }>;
  interestDomains: Array<{ domain: string; engagementLevel: string; postCount: number }>;
  emotionalTriggers: {
    anger: string[];
    excitement: string[];
    fear: string[];
    evidence: Record<string, string[]>;
  };
  engagementPatterns: {
    likelyToEngageWith: string[];
    likelyToShare: string[];
    likelyToCreate: string[];
    contentPreferences: string[];
  };
  influenceSusceptibility: {
    vulnerableTo: string[];
    resistantTo: string[];
    echoChamberDepth: string;
    evidence: string[];
  };
  persuasionStyle: {
    primaryTechniques: string[];
    targetAudience: string;
    effectiveness: string;
    evidence: string[];
  };
  riskIndicators: {
    radicalizationSignals: string[];
    manipulationVulnerability: string;
    echoChamberDepth: string;
    flags: string[];
    evidence: string[];
  };
  socialRole: {
    primary: string;
    confidence: number;
    evidence: string[];
  };
  summary: string;
}

export interface IdentityRecord {
  _id: string;
  id: string;
  primaryHandle: string;
  primaryPlatform: string;
  displayName: string | null;
  platformAccounts: PlatformAccount[];
  identityClusterId: string | null;
  linkedIdentityIds: string[];
  authorProfile: {
    followersCount: number | null;
    followingCount: number | null;
    postsCount: number | null;
    isVerified: boolean;
    bio: string | null;
    joinDate: string | null;
  } | null;
  profileImages: ProfileImage[];
  bannerImages: ProfileImage[];
  currentCredibility: number | null;
  currentBotProbability: number | null;
  credibilityHistory: ScoreHistory[];
  botProbabilityHistory: ScoreHistory[];
  investigations: InvestigationSnapshot[];
  totalInvestigations: number;
  firstInvestigatedAt: Date | null;
  lastInvestigatedAt: Date | null;
  psychologicalProfile: PsychologicalProfile | null;
  profileGenerationStatus: string;
  cachedTimeline: {
    posts: unknown[];
    fetchedAt: string;
    platforms: string[];
  } | null;
  aggregatedFlags: string[];
  totalPostsAnalyzed: number;
  createdAt: Date;
  updatedAt: Date;
}
