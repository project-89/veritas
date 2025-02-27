import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { SourceCreateInput, SourceUpdateInput } from "./source.service";

const SourceCreateSchema = z.object({
  name: z.string().min(1).max(200),
  platform: z.enum(["twitter", "facebook", "reddit", "other"]),
  credibilityScore: z.number().min(0).max(1).optional(),
  verificationStatus: z.enum(["verified", "unverified", "disputed"]).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const SourceUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  credibilityScore: z.number().min(0).max(1).optional(),
  verificationStatus: z.enum(["verified", "unverified", "disputed"]).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

@Injectable()
export class SourceValidationService {
  async validateSourceInput(input: SourceCreateInput): Promise<void> {
    try {
      await SourceCreateSchema.parseAsync(input);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Source validation failed: ${error.message}`);
      }
      throw error;
    }
  }

  async validateSourceUpdate(input: SourceUpdateInput): Promise<void> {
    try {
      await SourceUpdateSchema.parseAsync(input);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Source update validation failed: ${error.message}`);
      }
      throw error;
    }
  }
}
