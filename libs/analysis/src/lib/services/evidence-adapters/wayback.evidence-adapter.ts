import { Logger } from '@nestjs/common';
import type { EvidenceAdapter, EvidenceSource } from './evidence-adapter.interface';

const URL_PATTERN = /https?:\/\/[^\s"'<>)\]]+/gi;
// Bare domain: label(s) + a plausible TLD. Kept conservative to avoid matching
// version strings / abbreviations.
const DOMAIN_PATTERN = /\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24})\b/gi;
const NOT_A_DOMAIN_TLD = new Set(['js', 'ts', 'py', 'md', 'txt', 'json', 'sol']);

interface CdxRow {
  timestamp: string;
  original: string;
  statuscode?: string;
}

/**
 * Wayback Machine (Internet Archive) provenance adapter.
 *
 * Wayback is a URL archive, not a searchable index — so its value for claim
 * verification is PROVENANCE, not discovery:
 *  - Origin dating: when a URL/domain first appeared (earliest capture).
 *  - Longevity: how long it has existed / how many times it changed.
 *  - Deleted/edited recovery: a permanent snapshot link even if the live page
 *    is gone or has been altered.
 *
 * Only engages when the claim or its entities reference a URL or domain (via
 * the CDX API — no key required).
 * Docs: https://archive.org/help/wayback_api.php  (CDX server)
 */
export class WaybackEvidenceAdapter implements EvidenceAdapter {
  readonly name = 'Wayback Machine';
  readonly sourceType = 'journalistic' as const;
  readonly claimDomains = ['provenance', 'origin', 'website', 'article', 'source', 'domain'];

  private readonly logger = new Logger(WaybackEvidenceAdapter.name);
  private readonly cdxUrl = 'https://web.archive.org/cdx/search/cdx';

  canVerify(claim: string, entities: string[]): boolean {
    return this.extractTargets(claim, entities).length > 0;
  }

  async fetchEvidence(params: {
    claim: string;
    entities: string[];
    timeRange?: { start: string; end: string };
  }): Promise<EvidenceSource[]> {
    const targets = this.extractTargets(params.claim, params.entities).slice(0, 3);
    const results: EvidenceSource[] = [];

    for (const target of targets) {
      const captures = await this.fetchCaptures(target);
      if (captures.length === 0) continue;

      const first = captures[0];
      const last = captures[captures.length - 1];
      if (!first || !last) continue;

      const firstDate = this.toDate(first.timestamp);
      const lastDate = this.toDate(last.timestamp);
      const snapshotUrl = `https://web.archive.org/web/${first.timestamp}/${first.original}`;

      const excerpt =
        captures.length === 1
          ? `Archived once, on ${this.human(firstDate)}. Snapshot: ${snapshotUrl}`
          : `First archived ${this.human(firstDate)}; ${captures.length}+ captures through ${this.human(lastDate)}. Earliest snapshot: ${snapshotUrl}`;

      results.push({
        source: `Wayback Machine: ${target}`,
        sourceType: 'journalistic',
        credibilityScore: 0.85, // archival record — high provenance reliability
        url: snapshotUrl,
        data: {
          target,
          firstCapture: firstDate.toISOString(),
          lastCapture: lastDate.toISOString(),
          captureCount: captures.length,
          earliestSnapshotUrl: snapshotUrl,
          ageDays: Math.floor((Date.now() - firstDate.getTime()) / 86_400_000),
        },
        excerpt,
        relevance: 0.7,
        freshness: this.freshness(lastDate),
        // Provenance is context, not support/refute on its own.
        stance: 'neutral',
        retrievedAt: new Date().toISOString(),
      });
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Extract URLs and bare domains from the claim text and entity list. */
  private extractTargets(claim: string, entities: string[]): string[] {
    const found = new Set<string>();
    const haystack = `${claim} ${entities.join(' ')}`;

    for (const m of haystack.matchAll(URL_PATTERN)) {
      found.add(m[0].replace(/[.,)]+$/, ''));
    }
    for (const m of haystack.matchAll(DOMAIN_PATTERN)) {
      const domain = m[1];
      if (!domain) continue;
      const tld = domain.split('.').pop()?.toLowerCase() ?? '';
      if (NOT_A_DOMAIN_TLD.has(tld)) continue;
      // Skip if it's already covered by a full URL match.
      if ([...found].some((u) => u.includes(domain))) continue;
      found.add(domain.toLowerCase());
    }
    return [...found];
  }

  private async fetchCaptures(target: string): Promise<CdxRow[]> {
    const url = new URL(this.cdxUrl);
    url.searchParams.set('url', target);
    url.searchParams.set('output', 'json');
    url.searchParams.set('fl', 'timestamp,original,statuscode');
    // Collapse to monthly so a heavily-crawled page doesn't return thousands.
    url.searchParams.set('collapse', 'timestamp:6');
    url.searchParams.set('limit', '200');

    try {
      const response = await fetch(url.toString(), {
        headers: { 'User-Agent': 'Veritas/2.0 (+https://github.com/oneirocom/veritas)' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        this.logger.debug(`Wayback CDX HTTP ${response.status} for ${target}`);
        return [];
      }
      const rows = (await response.json()) as string[][];
      // First row is the field header.
      return rows
        .slice(1)
        .map((r) => ({ timestamp: r[0] ?? '', original: r[1] ?? '', statuscode: r[2] }))
        .filter((r) => r.timestamp && r.original);
    } catch (err) {
      this.logger.debug(`Wayback CDX failed for ${target}: ${(err as Error).message}`);
      return [];
    }
  }

  /** Wayback timestamp YYYYMMDDhhmmss -> Date. */
  private toDate(ts: string): Date {
    const iso = ts.replace(
      /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?$/,
      (_m, y, mo, d, h = '00', mi = '00', s = '00') => `${y}-${mo}-${d}T${h}:${mi}:${s}Z`,
    );
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }

  private human(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  private freshness(lastCapture: Date): number {
    const days = (Date.now() - lastCapture.getTime()) / 86_400_000;
    if (days < 30) return 1;
    if (days < 365) return 0.6;
    return 0.3;
  }
}
