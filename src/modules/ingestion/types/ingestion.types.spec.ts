import { validate } from "class-validator";
import {
  ContentIngestionInput,
  SourceIngestionInput,
  EngagementMetricsInput,
  Platform,
  VerificationStatus,
} from "./ingestion.types";

describe("Ingestion Types", () => {
  describe("ContentIngestionInput", () => {
    it("should validate a valid content input", async () => {
      const input = new ContentIngestionInput();
      input.text = "Valid content text";
      input.platform = Platform.TWITTER;
      input.engagementMetrics = {
        likes: 100,
        shares: 50,
        comments: 25,
        reach: 1000,
        viralityScore: 0.75,
      };
      input.metadata = { source: "test" };

      const errors = await validate(input);
      expect(errors).toHaveLength(0);
    });

    it("should fail validation with empty text", async () => {
      const input = new ContentIngestionInput();
      input.text = "";
      input.platform = Platform.TWITTER;
      input.engagementMetrics = {
        likes: 100,
        shares: 50,
        comments: 25,
        reach: 1000,
        viralityScore: 0.75,
      };

      const errors = await validate(input);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe("text");
    });

    it("should fail validation with invalid platform", async () => {
      const input = new ContentIngestionInput();
      input.text = "Valid content";
      (input as any).platform = "invalid_platform";
      input.engagementMetrics = {
        likes: 100,
        shares: 50,
        comments: 25,
        reach: 1000,
        viralityScore: 0.75,
      };

      const errors = await validate(input);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe("platform");
    });

    it("should fail validation with invalid engagement metrics", async () => {
      const input = new ContentIngestionInput();
      input.text = "Valid content";
      input.platform = Platform.TWITTER;

      const metrics = new EngagementMetricsInput();
      metrics.likes = -1; // Invalid negative value
      metrics.shares = 50;
      metrics.comments = 25;
      metrics.reach = 1000;
      metrics.viralityScore = 0.75;

      input.engagementMetrics = metrics;

      const errors = await validate(input, {
        validationError: { target: false },
      });
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe("engagementMetrics");
    });
  });

  describe("SourceIngestionInput", () => {
    it("should validate a valid source input", async () => {
      const input = new SourceIngestionInput();
      input.name = "Valid Source";
      input.platform = Platform.TWITTER;
      input.credibilityScore = 0.8;
      input.verificationStatus = VerificationStatus.VERIFIED;
      input.metadata = { verified: true };

      const errors = await validate(input);
      expect(errors).toHaveLength(0);
    });

    it("should fail validation with empty name", async () => {
      const input = new SourceIngestionInput();
      input.name = "";
      input.platform = Platform.TWITTER;
      input.credibilityScore = 0.8;
      input.verificationStatus = VerificationStatus.VERIFIED;

      const errors = await validate(input);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe("name");
    });

    it("should fail validation with invalid credibility score", async () => {
      const input = new SourceIngestionInput();
      input.name = "Valid Source";
      input.platform = Platform.TWITTER;
      input.credibilityScore = 1.5; // Invalid score > 1
      input.verificationStatus = VerificationStatus.VERIFIED;

      const errors = await validate(input);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe("credibilityScore");
    });

    it("should fail validation with invalid verification status", async () => {
      const input = new SourceIngestionInput();
      input.name = "Valid Source";
      input.platform = Platform.TWITTER;
      input.credibilityScore = 0.8;
      (input as any).verificationStatus = "INVALID_STATUS";

      const errors = await validate(input);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe("verificationStatus");
    });
  });

  describe("EngagementMetricsInput", () => {
    it("should validate valid engagement metrics", async () => {
      const input = new EngagementMetricsInput();
      input.likes = 100;
      input.shares = 50;
      input.comments = 25;
      input.reach = 1000;
      input.viralityScore = 0.75;

      const errors = await validate(input);
      expect(errors).toHaveLength(0);
    });

    it("should fail validation with negative metrics", async () => {
      const input = new EngagementMetricsInput();
      input.likes = -1;
      input.shares = 50;
      input.comments = 25;
      input.reach = 1000;
      input.viralityScore = 0.75;

      const errors = await validate(input);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe("likes");
    });

    it("should fail validation with invalid virality score", async () => {
      const input = new EngagementMetricsInput();
      input.likes = 100;
      input.shares = 50;
      input.comments = 25;
      input.reach = 1000;
      input.viralityScore = 1.5; // Invalid score > 1

      const errors = await validate(input);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe("viralityScore");
    });
  });
});
