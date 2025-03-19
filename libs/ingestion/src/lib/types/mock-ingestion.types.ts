/**
 * Mock implementation of ingestion types for testing purposes
 * This avoids dependencies on external modules
 */

// Enums
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

// Mock for EngagementMetricsInput
export class EngagementMetricsInput {
  likes = 0;
  shares = 0;
  comments = 0;
  reach = 0;
  viralityScore = 0;
}

// Mock for ContentIngestionInput
export class ContentIngestionInput {
  text = '';
  platform: 'twitter' | 'facebook' | 'reddit' | 'other' = 'twitter';
  engagementMetrics?: EngagementMetricsInput;
  metadata?: Record<string, any>;
}

// Mock for SourceIngestionInput
export class SourceIngestionInput {
  name = '';
  platform: 'twitter' | 'facebook' | 'reddit' | 'other' = 'twitter';
  credibilityScore = 0.5;
  verificationStatus: VerificationStatus = VerificationStatus.UNVERIFIED;
  metadata?: Record<string, any>;
}
