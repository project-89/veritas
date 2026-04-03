import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ExtractedClaim } from './propaganda.service';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface EvidenceItem {
  source: string;
  url?: string;
  excerpt: string;
  credibility: 'high' | 'medium' | 'low';
  timestamp?: string;
}

export interface VerificationResult {
  claim: string;
  status: 'verified' | 'disputed' | 'unverified' | 'mixed' | 'false';
  confidence: number;

  evidence: {
    supporting: EvidenceItem[];
    contradicting: EvidenceItem[];
  };

  reasoning: string;
  caveats: string[];
  sourcesChecked: string[];
}

export interface ClaimVerificationBatchResult {
  results: VerificationResult[];
  summary: string;
  verifiedCount: number;
  disputedCount: number;
  unverifiedCount: number;
}

// ---------------------------------------------------------------------------
// Internal types for API responses
// ---------------------------------------------------------------------------

interface WikiSearchResult {
  title: string;
  snippet: string;
  pageid: number;
  timestamp?: string;
}

interface WikiSearchResponse {
  query?: {
    search?: WikiSearchResult[];
  };
}

interface GdeltArticle {
  url?: string;
  title?: string;
  seendate?: string;
  domain?: string;
  tone?: string;
}

interface GdeltResponse {
  articles?: GdeltArticle[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_AGENT =
  'Mozilla/5.0 (compatible; Veritas/2.0; +https://github.com/oneirocom/veritas)';

const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
const GDELT_API = 'https://api.gdeltproject.org/api/v2/doc/doc';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ClaimVerificationService {
  private readonly logger = new Logger(ClaimVerificationService.name);
  private readonly genAI: GoogleGenerativeAI | null = null;
  private readonly chatModel: string = 'gemini-2.0-flash';

  constructor(private readonly configService: ConfigService) {
    const geminiKey =
      this.configService.get<string>('GEMINI_API_KEY') ||
      process.env['GEMINI_API_KEY'];

    if (geminiKey) {
      this.genAI = new GoogleGenerativeAI(geminiKey);
      this.logger.log('ClaimVerificationService initialized with Gemini');
    } else {
      this.logger.warn(
        'GEMINI_API_KEY not set -- claim verification will use heuristic fallback',
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Verify a batch of extracted claims. Filters to verifiable claims only,
   * searches for evidence from free sources, and uses LLM reasoning (or
   * heuristic fallback) to assess veracity.
   */
  async verifyBatch(
    claims: ExtractedClaim[],
  ): Promise<ClaimVerificationBatchResult> {
    const verifiable = claims.filter((c) => c.verifiability === 'verifiable');

    if (verifiable.length === 0) {
      return {
        results: [],
        summary:
          'No verifiable claims found. All claims were either subjective or unfalsifiable.',
        verifiedCount: 0,
        disputedCount: 0,
        unverifiedCount: 0,
      };
    }

    // Process claims concurrently (bounded to avoid rate limits)
    const results: VerificationResult[] = [];
    const batchSize = 3;

    for (let i = 0; i < verifiable.length; i += batchSize) {
      // Delay between batches to avoid rate limiting Wikipedia/GDELT (skip first)
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      const batch = verifiable.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((claim) => this.verifySingleClaim(claim)),
      );
      results.push(...batchResults);
    }

    const verifiedCount = results.filter(
      (r) => r.status === 'verified',
    ).length;
    const disputedCount = results.filter(
      (r) => r.status === 'disputed' || r.status === 'false',
    ).length;
    const unverifiedCount = results.filter(
      (r) => r.status === 'unverified',
    ).length;

    const summary = this.buildBatchSummary(
      results,
      verifiable.length,
      claims.length - verifiable.length,
    );

    return { results, summary, verifiedCount, disputedCount, unverifiedCount };
  }

  // ---------------------------------------------------------------------------
  // Single claim verification
  // ---------------------------------------------------------------------------

  async verifySingleClaim(claim: ExtractedClaim): Promise<VerificationResult> {
    const sourcesChecked: string[] = [];

    // Search for evidence from multiple free sources
    const [wikiEvidence, gdeltEvidence] = await Promise.all([
      this.searchWikipedia(claim.claim),
      this.searchGdelt(claim.claim),
    ]);

    if (wikiEvidence.length > 0) sourcesChecked.push('Wikipedia');
    if (gdeltEvidence.length > 0) sourcesChecked.push('GDELT Global News');

    const allEvidence = [...wikiEvidence, ...gdeltEvidence];

    // Use LLM reasoning if available, otherwise fall back to heuristic
    if (this.genAI) {
      return this.llmVerification(claim, allEvidence, sourcesChecked);
    }

    return this.heuristicVerification(claim, allEvidence, sourcesChecked);
  }

  // ---------------------------------------------------------------------------
  // Evidence search: Wikipedia
  // ---------------------------------------------------------------------------

  async searchWikipedia(
    claimText: string,
  ): Promise<{ source: 'Wikipedia'; items: WikiSearchResult[] }[]> {
    try {
      const query = this.extractSearchTerms(claimText);
      const url = new URL(WIKIPEDIA_API);
      url.searchParams.set('action', 'query');
      url.searchParams.set('list', 'search');
      url.searchParams.set('srsearch', query);
      url.searchParams.set('srlimit', '5');
      url.searchParams.set('format', 'json');
      url.searchParams.set('origin', '*');

      const response = await fetch(url.toString(), {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        this.logger.warn(`Wikipedia API returned HTTP ${response.status}`);
        return [];
      }

      const data = (await response.json()) as WikiSearchResponse;
      const results = data.query?.search ?? [];

      if (results.length === 0) return [];

      return [{ source: 'Wikipedia' as const, items: results }];
    } catch (err) {
      this.logger.warn(`Wikipedia search failed: ${err}`);
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Evidence search: GDELT
  // ---------------------------------------------------------------------------

  async searchGdelt(
    claimText: string,
  ): Promise<{ source: 'GDELT'; items: GdeltArticle[] }[]> {
    try {
      const query = this.extractSearchTerms(claimText);

      const url = new URL(GDELT_API);
      url.searchParams.set('query', query);
      url.searchParams.set('mode', 'artlist');
      url.searchParams.set('maxrecords', '10');
      url.searchParams.set('format', 'json');

      const response = await fetch(url.toString(), {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        this.logger.warn(`GDELT API returned HTTP ${response.status}`);
        return [];
      }

      const data = (await response.json()) as GdeltResponse;
      const articles = data.articles ?? [];

      if (articles.length === 0) return [];

      return [{ source: 'GDELT' as const, items: articles }];
    } catch (err) {
      this.logger.warn(`GDELT search failed: ${err}`);
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // LLM-based verification
  // ---------------------------------------------------------------------------

  private async llmVerification(
    claim: ExtractedClaim,
    evidence: Array<
      | { source: 'Wikipedia'; items: WikiSearchResult[] }
      | { source: 'GDELT'; items: GdeltArticle[] }
    >,
    sourcesChecked: string[],
  ): Promise<VerificationResult> {
    const model = this.genAI!.getGenerativeModel({ model: this.chatModel });

    const evidenceText = this.formatEvidenceForPrompt(evidence);

    const prompt = `You are an evidence-based fact-checking assistant. Given a claim and evidence found from public sources, assess the veracity of the claim.

CRITICAL PRINCIPLES:
- Evidence-first: base your assessment ONLY on the evidence provided.
- Use bounded language: "evidence suggests", "sources indicate", not "this is true/false".
- Absence of evidence is not evidence of absence.
- Consider source credibility: Wikipedia is generally reliable for well-sourced articles; news articles vary.
- If evidence is insufficient, say so clearly.

CLAIM: "${claim.claim}"
CLAIM TYPE: ${claim.type}
SOURCES WHO MADE THIS CLAIM: ${claim.sources.join(', ') || 'Unknown'}

EVIDENCE FOUND:
${evidenceText || 'No relevant evidence found from searched sources.'}

Respond ONLY with a single JSON object (no markdown fences, no other text):

{
  "status": "verified|disputed|unverified|mixed|false",
  "confidence": 0.0 to 1.0,
  "supporting": [
    {
      "source": "Source name",
      "url": "URL if available",
      "excerpt": "Relevant excerpt that supports the claim",
      "credibility": "high|medium|low",
      "timestamp": "ISO timestamp if available"
    }
  ],
  "contradicting": [
    {
      "source": "Source name",
      "url": "URL if available",
      "excerpt": "Relevant excerpt that contradicts the claim",
      "credibility": "high|medium|low",
      "timestamp": "ISO timestamp if available"
    }
  ],
  "reasoning": "Step-by-step reasoning chain explaining the assessment",
  "caveats": ["Explicit limitations and uncertainties"]
}

Rules:
- "status": verified = strong supporting evidence, disputed = conflicting evidence, unverified = insufficient evidence, mixed = some support + some contradiction, false = strong contradicting evidence
- confidence 0-1: how confident you are in the status assessment
- Only include evidence items that are actually relevant to the claim
- Always include at least one caveat
- Use bounded language throughout`;

    try {
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      return this.parseLlmResponse(claim.claim, responseText, sourcesChecked);
    } catch (err) {
      this.logger.error(`LLM verification failed: ${err}`);
      // Fall back to heuristic
      return this.heuristicVerification(claim, evidence, sourcesChecked);
    }
  }

  private parseLlmResponse(
    claimText: string,
    responseText: string,
    sourcesChecked: string[],
  ): VerificationResult {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      this.logger.warn('Could not extract JSON from LLM verification response');
      return this.unverifiedResult(claimText, sourcesChecked);
    }

    try {
      const raw = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      return this.validateLlmResult(claimText, raw, sourcesChecked);
    } catch (err) {
      this.logger.warn(`Failed to parse LLM verification JSON: ${err}`);
      return this.unverifiedResult(claimText, sourcesChecked);
    }
  }

  private validateLlmResult(
    claimText: string,
    raw: Record<string, unknown>,
    sourcesChecked: string[],
  ): VerificationResult {
    const validStatuses = new Set([
      'verified',
      'disputed',
      'unverified',
      'mixed',
      'false',
    ]);

    const status = validStatuses.has(raw['status'] as string)
      ? (raw['status'] as VerificationResult['status'])
      : 'unverified';

    const confidence = this.clamp(Number(raw['confidence']) || 0, 0, 1);

    const supporting = this.validateEvidenceItems(raw['supporting']);
    const contradicting = this.validateEvidenceItems(raw['contradicting']);

    const reasoning =
      typeof raw['reasoning'] === 'string'
        ? raw['reasoning']
        : 'Assessment could not be completed.';

    const caveats = Array.isArray(raw['caveats'])
      ? raw['caveats'].filter((c): c is string => typeof c === 'string')
      : [
          'This is an automated assessment and may contain errors.',
          'Evidence was gathered from a limited set of public sources.',
        ];

    return {
      claim: claimText,
      status,
      confidence,
      evidence: { supporting, contradicting },
      reasoning,
      caveats,
      sourcesChecked,
    };
  }

  private validateEvidenceItems(raw: unknown): EvidenceItem[] {
    if (!Array.isArray(raw)) return [];

    const validCredibility = new Set(['high', 'medium', 'low']);

    return raw
      .filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null,
      )
      .map((item) => ({
        source:
          typeof item['source'] === 'string' ? item['source'] : 'Unknown',
        url: typeof item['url'] === 'string' ? item['url'] : undefined,
        excerpt:
          typeof item['excerpt'] === 'string' ? item['excerpt'] : '',
        credibility: validCredibility.has(item['credibility'] as string)
          ? (item['credibility'] as EvidenceItem['credibility'])
          : 'medium',
        timestamp:
          typeof item['timestamp'] === 'string'
            ? item['timestamp']
            : undefined,
      }))
      .filter((item) => item.excerpt.length > 0);
  }

  // ---------------------------------------------------------------------------
  // Heuristic-based verification (fallback when no Gemini key)
  // ---------------------------------------------------------------------------

  heuristicVerification(
    claim: ExtractedClaim,
    evidence: Array<
      | { source: 'Wikipedia'; items: WikiSearchResult[] }
      | { source: 'GDELT'; items: GdeltArticle[] }
    >,
    sourcesChecked: string[],
  ): VerificationResult {
    const supporting: EvidenceItem[] = [];
    const contradicting: EvidenceItem[] = [];

    for (const evidenceGroup of evidence) {
      if (evidenceGroup.source === 'Wikipedia') {
        for (const item of evidenceGroup.items) {
          const snippet = this.stripHtml(item.snippet);
          const relevance = this.computeRelevance(claim.claim, snippet);
          if (relevance > 0.3) {
            supporting.push({
              source: 'Wikipedia',
              url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
              excerpt: snippet,
              credibility: 'high',
              timestamp: item.timestamp,
            });
          }
        }
      } else if (evidenceGroup.source === 'GDELT') {
        for (const article of evidenceGroup.items) {
          if (article.title) {
            const relevance = this.computeRelevance(
              claim.claim,
              article.title,
            );
            if (relevance > 0.2) {
              supporting.push({
                source: `GDELT: ${article.domain ?? 'news'}`,
                url: article.url,
                excerpt: article.title,
                credibility: 'medium',
                timestamp: article.seendate,
              });
            }
          }
        }
      }
    }

    // Determine status based on evidence
    let status: VerificationResult['status'];
    let confidence: number;

    if (supporting.length >= 2 && contradicting.length === 0) {
      status = 'verified';
      confidence = Math.min(0.6, 0.3 + supporting.length * 0.1);
    } else if (contradicting.length >= 2 && supporting.length === 0) {
      status = 'disputed';
      confidence = Math.min(0.6, 0.3 + contradicting.length * 0.1);
    } else if (supporting.length > 0 && contradicting.length > 0) {
      status = 'mixed';
      confidence = 0.3;
    } else if (supporting.length === 1) {
      status = 'unverified';
      confidence = 0.2;
    } else {
      status = 'unverified';
      confidence = 0.1;
    }

    const reasoning =
      supporting.length === 0 && contradicting.length === 0
        ? 'No relevant evidence was found in the searched sources. This does not mean the claim is false -- only that it could not be verified with available data.'
        : `Heuristic assessment based on ${supporting.length} supporting and ${contradicting.length} contradicting evidence items found across ${sourcesChecked.join(', ') || 'searched sources'}.`;

    return {
      claim: claim.claim,
      status,
      confidence,
      evidence: { supporting, contradicting },
      reasoning,
      caveats: [
        'This assessment uses simple keyword-matching heuristics, not LLM reasoning.',
        'Evidence was gathered from a limited set of public sources.',
        'Absence of evidence is not evidence of absence.',
      ],
      sourcesChecked,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Extract meaningful search terms from a claim.
   * Removes common stop words and limits to key terms.
   */
  extractSearchTerms(claimText: string): string {
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'being',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'shall',
      'can',
      'that',
      'this',
      'these',
      'those',
      'it',
      'its',
      'of',
      'in',
      'on',
      'at',
      'to',
      'for',
      'with',
      'by',
      'from',
      'and',
      'or',
      'not',
      'no',
      'but',
      'if',
      'about',
      'than',
      'very',
      'just',
      'also',
      'more',
      'some',
      'they',
      'them',
      'their',
      'there',
      'here',
      'when',
      'where',
      'what',
      'which',
      'who',
      'how',
    ]);

    const words = claimText
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w.toLowerCase()));

    // Take the most meaningful terms (up to 6)
    return words.slice(0, 6).join(' ');
  }

  /**
   * Compute a rough relevance score between a claim and a text snippet.
   * Based on overlapping significant words.
   */
  private computeRelevance(claim: string, text: string): number {
    const claimWords = new Set(
      claim
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 3),
    );
    const textWords = new Set(
      text
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 3),
    );

    if (claimWords.size === 0) return 0;

    let overlap = 0;
    for (const word of claimWords) {
      if (textWords.has(word)) overlap++;
    }

    return overlap / claimWords.size;
  }

  /** Strip HTML tags from Wikipedia snippet. */
  stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim();
  }

  /** Format evidence groups into a text block for the LLM prompt. */
  private formatEvidenceForPrompt(
    evidence: Array<
      | { source: 'Wikipedia'; items: WikiSearchResult[] }
      | { source: 'GDELT'; items: GdeltArticle[] }
    >,
  ): string {
    const sections: string[] = [];

    for (const group of evidence) {
      if (group.source === 'Wikipedia') {
        const wikiItems = group.items
          .map(
            (item) =>
              `  - "${item.title}": ${this.stripHtml(item.snippet)} (https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))})`,
          )
          .join('\n');
        sections.push(`WIKIPEDIA RESULTS:\n${wikiItems}`);
      } else if (group.source === 'GDELT') {
        const gdeltItems = group.items
          .filter((a) => a.title)
          .map(
            (a) =>
              `  - "${a.title}" [${a.domain ?? 'unknown source'}] ${a.url ?? ''}`,
          )
          .join('\n');
        sections.push(`NEWS ARTICLES (via GDELT):\n${gdeltItems}`);
      }
    }

    return sections.join('\n\n');
  }

  private buildBatchSummary(
    results: VerificationResult[],
    verifiableCount: number,
    skippedCount: number,
  ): string {
    const verified = results.filter((r) => r.status === 'verified').length;
    const disputed = results.filter(
      (r) => r.status === 'disputed' || r.status === 'false',
    ).length;
    const mixed = results.filter((r) => r.status === 'mixed').length;
    const unverified = results.filter((r) => r.status === 'unverified').length;

    const parts = [
      `Checked ${verifiableCount} verifiable claim${verifiableCount !== 1 ? 's' : ''}.`,
    ];

    if (skippedCount > 0) {
      parts.push(
        `Skipped ${skippedCount} non-verifiable (subjective/unfalsifiable) claim${skippedCount !== 1 ? 's' : ''}.`,
      );
    }

    const statusParts: string[] = [];
    if (verified > 0)
      statusParts.push(
        `${verified} found supporting evidence`,
      );
    if (disputed > 0)
      statusParts.push(`${disputed} found contradicting evidence`);
    if (mixed > 0) statusParts.push(`${mixed} found mixed evidence`);
    if (unverified > 0)
      statusParts.push(`${unverified} could not be verified`);

    if (statusParts.length > 0) {
      parts.push(statusParts.join(', ') + '.');
    }

    parts.push(
      'All assessments are based on limited public sources and should be treated as preliminary.',
    );

    return parts.join(' ');
  }

  private unverifiedResult(
    claimText: string,
    sourcesChecked: string[],
  ): VerificationResult {
    return {
      claim: claimText,
      status: 'unverified',
      confidence: 0,
      evidence: { supporting: [], contradicting: [] },
      reasoning:
        'Verification could not be completed due to an error in processing.',
      caveats: [
        'This claim could not be assessed. This does not indicate truthfulness or falsehood.',
      ],
      sourcesChecked,
    };
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}
