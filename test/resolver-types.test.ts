import { IngestionResolver } from '@veritas/ingestion';
import { ContentClassificationService } from '../libs/ingestion/src/lib/services/content-classification.service';
import { TransformOnIngestService } from '@veritas/ingestion';
import { NarrativeRepository } from '@veritas/ingestion';
import {
  ContentIngestionInput,
  SourceIngestionInput,
} from '@veritas/ingestion';

// Type validation test - not meant to be executed, just to verify TypeScript compilation
describe('IngestionResolver Types', () => {
  it('should validate type compatibility', () => {
    // This test doesn't actually run, it just helps validate types
    const resolver = new IngestionResolver(
      {} as ContentClassificationService,
      {} as TransformOnIngestService,
      {} as NarrativeRepository
    );

    // Test ingest content
    const contentInput: ContentIngestionInput = {
      text: 'Test content',
      platform: 'twitter',
      engagementMetrics: {
        likes: 10,
        shares: 5,
        comments: 3,
        reach: 1000,
        viralityScore: 0.7,
      },
      metadata: { key: 'value' },
    };

    const sourceInput: SourceIngestionInput = {
      name: 'Test Source',
      platform: 'twitter',
      credibilityScore: 0.8,
      verificationStatus: 'VERIFIED' as any,
      metadata: { key: 'value' },
    };

    // Just validate that the types match up
    const promise1 = resolver.ingestSocialContent(contentInput, sourceInput);
    const promise2 = resolver.getNarrativeInsights('week', 10, 0);
    const promise3 = resolver.getNarrativeTrends('month');
    const promise4 = resolver.verifySource('source-id', 'VERIFIED' as any);

    // TypeScript should validate these as Promise types without errors
    const _checkTypes = [promise1, promise2, promise3, promise4];

    console.log('Types pass validation');
  });
});
