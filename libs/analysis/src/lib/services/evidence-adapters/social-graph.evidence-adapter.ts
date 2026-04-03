import { Logger } from '@nestjs/common';
import type { IdentityRecordRepository } from '@veritas/ingestion';
import type { EvidenceAdapter, EvidenceSource } from './evidence-adapter.interface';

const HANDLE_RE = /@?([a-zA-Z0-9_]{1,50})/g;

export class SocialGraphEvidenceAdapter implements EvidenceAdapter {
  readonly name = 'Social Graph (Internal)';
  readonly sourceType = 'social' as const;
  readonly claimDomains = ['credibility', 'bot', 'coordination', 'account', 'history'];

  private readonly logger = new Logger(SocialGraphEvidenceAdapter.name);

  constructor(private readonly identityRepo: IdentityRecordRepository) {}

  canVerify(_claim: string, _entities: string[]): boolean {
    // Can always check claim author's history
    return true;
  }

  async fetchEvidence(params: {
    claim: string;
    entities: string[];
    timeRange?: { start: string; end: string };
  }): Promise<EvidenceSource[]> {
    const results: EvidenceSource[] = [];

    // Extract handles from entities
    const handles = this.extractHandles(params.entities);

    for (const handle of handles.slice(0, 5)) {
      try {
        const record = await this.identityRepo.findByHandle(handle, 'twitter');
        if (!record) {
          // Try other platforms
          const altRecord = await this.identityRepo.search(handle, 1);
          if (altRecord.length === 0) continue;
          const found = altRecord[0]!;
          results.push(this.buildEvidence(found, handle));
          continue;
        }
        results.push(this.buildEvidence(record, handle));
      } catch (err) {
        this.logger.debug(`Failed to look up identity for ${handle}: ${err}`);
      }
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private extractHandles(entities: string[]): string[] {
    const handles: Set<string> = new Set();
    for (const entity of entities) {
      const matches = entity.matchAll(HANDLE_RE);
      for (const match of matches) {
        const handle = match[1];
        if (handle && handle.length > 1) {
          handles.add(handle.toLowerCase());
        }
      }
    }
    return [...handles];
  }

  private buildEvidence(record: {
    primaryHandle: string;
    primaryPlatform: string;
    currentCredibility?: number | null;
    currentBotProbability?: number | null;
    totalInvestigations: number;
    aggregatedFlags: string[];
    totalPostsAnalyzed: number;
    platformAccounts: { platform: string; handle: string }[];
    lastInvestigatedAt?: Date | null;
  }, queryHandle: string): EvidenceSource {
    const flags = record.aggregatedFlags;
    const credibility = record.currentCredibility;
    const botProb = record.currentBotProbability;

    const excerptParts: string[] = [`@${record.primaryHandle} (${record.primaryPlatform})`];
    if (credibility != null) excerptParts.push(`credibility: ${(credibility * 100).toFixed(0)}%`);
    if (botProb != null) excerptParts.push(`bot probability: ${(botProb * 100).toFixed(0)}%`);
    excerptParts.push(`${record.totalInvestigations} prior investigations`);
    excerptParts.push(`${record.totalPostsAnalyzed} posts analyzed`);
    if (flags.length > 0) excerptParts.push(`flags: ${flags.slice(0, 5).join(', ')}`);

    const crossPlatform = record.platformAccounts.length;

    // Determine stance: low credibility or high bot prob contradicts claim reliability
    let stance: 'supports' | 'contradicts' | 'neutral' = 'neutral';
    if (botProb != null && botProb > 0.7) stance = 'contradicts';
    else if (credibility != null && credibility < 0.3) stance = 'contradicts';
    else if (credibility != null && credibility > 0.7) stance = 'supports';

    return {
      source: `Veritas Identity: @${record.primaryHandle}`,
      sourceType: 'social',
      credibilityScore: 0.6,
      data: {
        handle: record.primaryHandle,
        platform: record.primaryPlatform,
        credibility,
        botProbability: botProb,
        totalInvestigations: record.totalInvestigations,
        totalPostsAnalyzed: record.totalPostsAnalyzed,
        crossPlatformAccounts: crossPlatform,
        flags,
        queryHandle,
      },
      excerpt: excerptParts.join(' | '),
      relevance: 0.7,
      freshness: this.computeFreshness(record.lastInvestigatedAt),
      stance,
      retrievedAt: new Date().toISOString(),
    };
  }

  private computeFreshness(lastInvestigatedAt?: Date | null): number {
    if (!lastInvestigatedAt) return 0.3;
    const daysSince = (Date.now() - new Date(lastInvestigatedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 1) return 1.0;
    if (daysSince < 7) return 0.8;
    if (daysSince < 30) return 0.6;
    return 0.4;
  }
}
