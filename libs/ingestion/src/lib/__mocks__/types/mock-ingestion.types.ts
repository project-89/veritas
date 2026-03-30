/**
 * Mock ingestion types for testing
 * Simplified versions of the real types to avoid GraphQL dependencies
 */

export enum VerificationStatus {
  VERIFIED = 'VERIFIED',
  UNVERIFIED = 'UNVERIFIED',
  SUSPICIOUS = 'SUSPICIOUS',
}

export class ContentIngestionInput {
  text!: string;
  platform!: string;
  engagementMetrics?: {
    likes?: number;
    shares?: number;
    comments?: number;
    reach?: number;
    viralityScore?: number;
  };
}

export class SourceIngestionInput {
  name!: string;
  platform!: string;
  credibilityScore?: number;
  verificationStatus?: VerificationStatus;
}
