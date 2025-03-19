/**
 * Tests for ingestion types using our mock validator implementation
 */

import { validate } from './mock-class-validator';
import {
  ContentIngestionInput,
  SourceIngestionInput,
  EngagementMetricsInput,
  Platform,
  VerificationStatus,
} from './mock-ingestion.types';

describe('Ingestion Types', () => {
  describe('ContentIngestionInput', () => {
    it('should validate a valid content input', async () => {
      const input = new ContentIngestionInput();
      input.text = 'Valid content text';
      input.platform = Platform.TWITTER;
      input.engagementMetrics = new EngagementMetricsInput();
      input.engagementMetrics.likes = 100;
      input.engagementMetrics.shares = 50;
      input.engagementMetrics.comments = 25;
      input.engagementMetrics.reach = 1000;
      input.engagementMetrics.viralityScore = 0.75;
      input.metadata = { source: 'test' };

      const errors = await validate(input);
      if (errors.length !== 0) {
        throw new Error(`Expected no errors but got ${errors.length}`);
      }
    });

    it('should fail validation with empty text', async () => {
      const input = new ContentIngestionInput();
      input.text = '';
      input.platform = Platform.TWITTER;

      const errors = await validate(input);
      if (errors.length === 0) {
        throw new Error('Expected validation errors but got none');
      }

      if (errors[0].property !== 'text') {
        throw new Error(
          `Expected error on 'text' property but got '${errors[0].property}'`
        );
      }
    });

    it('should fail validation with invalid platform', async () => {
      const input = new ContentIngestionInput();
      input.text = 'Valid content';
      (input as any).platform = 'invalid_platform';

      const errors = await validate(input);
      if (errors.length === 0) {
        throw new Error('Expected validation errors but got none');
      }

      if (errors[0].property !== 'platform') {
        throw new Error(
          `Expected error on 'platform' property but got '${errors[0].property}'`
        );
      }
    });
  });

  describe('SourceIngestionInput', () => {
    it('should validate a valid source input', async () => {
      const input = new SourceIngestionInput();
      input.name = 'Valid Source';
      input.platform = Platform.TWITTER;
      input.credibilityScore = 0.8;
      input.verificationStatus = VerificationStatus.VERIFIED;
      input.metadata = { verified: true };

      const errors = await validate(input);
      if (errors.length !== 0) {
        throw new Error(`Expected no errors but got ${errors.length}`);
      }
    });

    it('should fail validation with empty name', async () => {
      const input = new SourceIngestionInput();
      input.name = '';
      input.platform = Platform.TWITTER;
      input.credibilityScore = 0.8;
      input.verificationStatus = VerificationStatus.VERIFIED;

      const errors = await validate(input);
      if (errors.length === 0) {
        throw new Error('Expected validation errors but got none');
      }

      if (errors[0].property !== 'name') {
        throw new Error(
          `Expected error on 'name' property but got '${errors[0].property}'`
        );
      }
    });

    it('should fail validation with invalid credibility score', async () => {
      const input = new SourceIngestionInput();
      input.name = 'Valid Source';
      input.platform = Platform.TWITTER;
      input.credibilityScore = 1.5; // Invalid score > 1
      input.verificationStatus = VerificationStatus.VERIFIED;

      const errors = await validate(input);
      if (errors.length === 0) {
        throw new Error('Expected validation errors but got none');
      }

      if (errors[0].property !== 'credibilityScore') {
        throw new Error(
          `Expected error on 'credibilityScore' property but got '${errors[0].property}'`
        );
      }
    });
  });

  describe('EngagementMetricsInput', () => {
    it('should validate valid engagement metrics', async () => {
      const input = new EngagementMetricsInput();
      input.likes = 100;
      input.shares = 50;
      input.comments = 25;
      input.reach = 1000;
      input.viralityScore = 0.75;

      const errors = await validate(input);
      if (errors.length !== 0) {
        throw new Error(`Expected no errors but got ${errors.length}`);
      }
    });

    it('should fail validation with negative metrics', async () => {
      const input = new EngagementMetricsInput();
      input.likes = -1;
      input.shares = 50;
      input.comments = 25;
      input.reach = 1000;
      input.viralityScore = 0.75;

      const errors = await validate(input);
      if (errors.length === 0) {
        throw new Error('Expected validation errors but got none');
      }

      if (errors[0].property !== 'likes') {
        throw new Error(
          `Expected error on 'likes' property but got '${errors[0].property}'`
        );
      }
    });

    it('should fail validation with invalid virality score', async () => {
      const input = new EngagementMetricsInput();
      input.likes = 100;
      input.shares = 50;
      input.comments = 25;
      input.reach = 1000;
      input.viralityScore = 1.5; // Invalid score > 1

      const errors = await validate(input);
      if (errors.length === 0) {
        throw new Error('Expected validation errors but got none');
      }

      if (errors[0].property !== 'viralityScore') {
        throw new Error(
          `Expected error on 'viralityScore' property but got '${errors[0].property}'`
        );
      }
    });
  });
});
