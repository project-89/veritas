import { Logger } from '@nestjs/common';
import type { EvidenceAdapter, EvidenceSource } from './evidence-adapter.interface';

const SEC_KEYWORDS = ['sec', 'filing', 'corporate', 'insider', 'securities', 'regulation', 'edgar', '10-k', '10-q', '8-k', 'proxy'];

export class SecEdgarEvidenceAdapter implements EvidenceAdapter {
  readonly name = 'SEC EDGAR';
  readonly sourceType = 'governmental' as const;
  readonly claimDomains = ['sec', 'filing', 'corporate', 'insider', 'securities', 'regulation'];

  private readonly logger = new Logger(SecEdgarEvidenceAdapter.name);
  private readonly baseUrl = 'https://efts.sec.gov/LATEST/search-index';

  canVerify(claim: string, entities: string[]): boolean {
    const text = `${claim} ${entities.join(' ')}`.toLowerCase();
    return SEC_KEYWORDS.some((kw) => text.includes(kw));
  }

  async fetchEvidence(params: {
    claim: string;
    entities: string[];
    timeRange?: { start: string; end: string };
  }): Promise<EvidenceSource[]> {
    const query = this.buildQuery(params.claim, params.entities);
    const results: EvidenceSource[] = [];

    const url = new URL(this.baseUrl);
    url.searchParams.set('q', query);
    if (params.timeRange) {
      url.searchParams.set('dateRange', 'custom');
      url.searchParams.set('startdt', params.timeRange.start.slice(0, 10));
      url.searchParams.set('enddt', params.timeRange.end.slice(0, 10));
    }

    const data = await this.apiCall(url.toString());
    if (!data) return results;

    const response = data as EdgarSearchResponse;
    const hits = response.hits?.hits ?? [];

    for (const hit of hits.slice(0, 10)) {
      const source = hit._source ?? {};
      const filingDate = source.file_date ?? source.period_of_report ?? '';
      const formType = source.form_type ?? 'Unknown';
      const entityName = source.entity_name ?? 'Unknown';
      const filingId = source.file_num ?? hit._id ?? '';

      results.push({
        source: `SEC EDGAR: ${entityName} (${formType})`,
        sourceType: 'governmental',
        credibilityScore: 0.95,
        url: source.file_url
          ? `https://www.sec.gov${source.file_url}`
          : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&filenum=${filingId}`,
        data: {
          entityName,
          formType,
          filingDate,
          fileNumber: filingId,
          description: source.file_description,
        },
        excerpt: `${entityName} filed ${formType} on ${filingDate}${source.file_description ? `: ${source.file_description.slice(0, 150)}` : ''}`,
        relevance: this.computeRelevance(params.claim, source),
        freshness: this.computeFreshness(filingDate),
        stance: 'neutral',
        retrievedAt: new Date().toISOString(),
      });
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private buildQuery(claim: string, entities: string[]): string {
    // Combine entity names with claim keywords, take first 5 meaningful terms
    const entityTerms = entities.filter((e) => e.length > 2).slice(0, 3);
    if (entityTerms.length > 0) return entityTerms.join(' ');

    // Fall back to extracting keywords from the claim
    const stopwords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'has', 'have', 'had', 'that', 'this', 'with', 'from', 'for', 'and', 'but', 'or']);
    return claim
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopwords.has(w.toLowerCase()))
      .slice(0, 5)
      .join(' ');
  }

  private async apiCall(url: string): Promise<unknown | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Veritas/2.0 (research@oneirocom.com)',
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
          this.logger.warn(`SEC EDGAR returned HTTP ${response.status}`);
          return null;
        }
        return await response.json();
      } catch (err) {
        if (attempt === 0) {
          this.logger.debug(`SEC EDGAR attempt 1 failed, retrying: ${err}`);
          continue;
        }
        this.logger.warn(`SEC EDGAR fetch failed after 2 attempts: ${err}`);
        return null;
      }
    }
    return null;
  }

  private computeRelevance(claim: string, source: EdgarHitSource): number {
    const claimLower = claim.toLowerCase();
    const entityLower = (source.entity_name ?? '').toLowerCase();
    if (claimLower.includes(entityLower) || entityLower.includes(claimLower.split(' ')[0] ?? '')) {
      return 0.9;
    }
    return 0.6;
  }

  private computeFreshness(filingDate: string): number {
    if (!filingDate) return 0.5;
    const daysSinceFiling = (Date.now() - new Date(filingDate).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceFiling < 30) return 1.0;
    if (daysSinceFiling < 90) return 0.8;
    if (daysSinceFiling < 365) return 0.6;
    return 0.3;
  }
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface EdgarHitSource {
  entity_name?: string;
  form_type?: string;
  file_date?: string;
  period_of_report?: string;
  file_num?: string;
  file_url?: string;
  file_description?: string;
}

interface EdgarHit {
  _id?: string;
  _source?: EdgarHitSource;
}

interface EdgarSearchResponse {
  hits?: {
    hits?: EdgarHit[];
    total?: { value?: number };
  };
}
