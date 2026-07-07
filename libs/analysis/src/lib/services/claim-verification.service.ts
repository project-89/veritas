import { GoogleGenerativeAI } from '@google/generative-ai';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DexScreenerEvidenceAdapter } from './evidence-adapters/dexscreener.evidence-adapter';
import { EtherscanEvidenceAdapter } from './evidence-adapters/etherscan.evidence-adapter';
import type {
  EvidenceAdapter,
  EvidenceSource,
  InvestigativeLead,
} from './evidence-adapters/evidence-adapter.interface';
import { GitHubEvidenceAdapter } from './evidence-adapters/github.evidence-adapter';
import { SecEdgarEvidenceAdapter } from './evidence-adapters/sec-edgar.evidence-adapter';
import {
  type IdentityRecordLookup,
  SocialGraphEvidenceAdapter,
} from './evidence-adapters/social-graph.evidence-adapter';
import { PlatformCredibilityService } from './platform-credibility.service';
import type { AnalysisMode, ExtractedClaim } from './propaganda.service';

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
  /** How the verdict was produced — heuristic verdicts are keyword-matching, not reasoning. */
  analysisMode: AnalysisMode;

  evidence: {
    supporting: EvidenceItem[];
    contradicting: EvidenceItem[];
  };

  reasoning: string;
  caveats: string[];
  sourcesChecked: string[];
  evidenceSources?: EvidenceSource[];
  investigativeLeads?: InvestigativeLead[];
}

export interface ClaimVerificationBatchResult {
  /** 'heuristic' when GEMINI_API_KEY is missing — verdicts are keyword matches, not reasoning. */
  analysisMode: AnalysisMode;
  results: VerificationResult[];
  summary: string;
  verifiedCount: number;
  disputedCount: number;
  unverifiedCount: number;
  investigativeLeads?: InvestigativeLead[];
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

const USER_AGENT = 'Mozilla/5.0 (compatible; Veritas/2.0; +https://github.com/oneirocom/veritas)';

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
  private readonly evidenceAdapters: EvidenceAdapter[] = [];
  private readonly platformCredibility: PlatformCredibilityService | null = null;

  constructor(
    private readonly configService: ConfigService,
    @Optional()
    @Inject(PlatformCredibilityService)
    platformCredibility?: PlatformCredibilityService,
    @Optional()
    @Inject('IDENTITY_RECORD_REPOSITORY')
    identityRepo?: IdentityRecordLookup,
  ) {
    const geminiKey =
      this.configService.get<string>('GEMINI_API_KEY') || process.env['GEMINI_API_KEY'];

    if (geminiKey) {
      this.genAI = new GoogleGenerativeAI(geminiKey);
      this.logger.log('ClaimVerificationService initialized with Gemini');
    } else {
      this.logger.warn('GEMINI_API_KEY not set -- claim verification will use heuristic fallback');
    }

    if (platformCredibility) {
      this.platformCredibility = platformCredibility;
    }

    // Instantiate evidence adapters
    this.evidenceAdapters = [
      new EtherscanEvidenceAdapter(),
      new DexScreenerEvidenceAdapter(),
      new GitHubEvidenceAdapter(),
      new SecEdgarEvidenceAdapter(),
    ];

    if (identityRepo) {
      this.evidenceAdapters.push(new SocialGraphEvidenceAdapter(identityRepo));
    }

    this.logger.log(
      `Evidence adapters initialized: ${this.evidenceAdapters.map((a) => a.name).join(', ')}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Verify a batch of extracted claims. Filters to verifiable claims only,
   * searches for evidence from free sources, and uses LLM reasoning (or
   * heuristic fallback) to assess veracity.
   */
  async verifyBatch(claims: ExtractedClaim[]): Promise<ClaimVerificationBatchResult> {
    const verifiable = claims.filter((c) => c.verifiability === 'verifiable');

    if (verifiable.length === 0) {
      return {
        analysisMode: 'skipped',
        results: [],
        summary: 'No verifiable claims found. All claims were either subjective or unfalsifiable.',
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
      const batchResults = await Promise.all(batch.map((claim) => this.verifySingleClaim(claim)));
      results.push(...batchResults);
    }

    const verifiedCount = results.filter((r) => r.status === 'verified').length;
    const disputedCount = results.filter(
      (r) => r.status === 'disputed' || r.status === 'false',
    ).length;
    const unverifiedCount = results.filter((r) => r.status === 'unverified').length;

    const summary = this.buildBatchSummary(
      results,
      verifiable.length,
      claims.length - verifiable.length,
    );

    // Aggregate all investigative leads from individual results
    const allLeads = results.flatMap((r) => r.investigativeLeads ?? []);

    // Batch is only LLM-grade if every individual verdict was LLM-reasoned.
    const analysisMode: AnalysisMode = results.every((r) => r.analysisMode === 'llm')
      ? 'llm'
      : 'heuristic';

    return {
      analysisMode,
      results,
      summary,
      verifiedCount,
      disputedCount,
      unverifiedCount,
      investigativeLeads: allLeads.length > 0 ? allLeads : undefined,
    };
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

    // Gather targeted evidence from adapters
    const entities = this.extractEntities(claim.claim);
    const entityValues = entities.map((e) => e.value);
    const matchingAdapters = this.evidenceAdapters.filter((adapter) =>
      adapter.canVerify(claim.claim, entityValues),
    );

    const adapterEvidenceSources: EvidenceSource[] = [];

    if (matchingAdapters.length > 0) {
      const evidenceResults = await Promise.allSettled(
        matchingAdapters.map((adapter) =>
          adapter.fetchEvidence({ claim: claim.claim, entities: entityValues }),
        ),
      );

      for (let i = 0; i < evidenceResults.length; i++) {
        const result = evidenceResults[i];
        const adapter = matchingAdapters[i];
        if (!result || !adapter) continue;

        if (result.status === 'fulfilled' && result.value.length > 0) {
          sourcesChecked.push(adapter.name);
          adapterEvidenceSources.push(...result.value);
        } else if (result.status === 'rejected') {
          this.logger.warn(`Evidence adapter ${adapter.name} failed: ${result.reason}`);
        }
      }
    }

    // Convert adapter evidence sources to EvidenceItems for the existing pipeline
    const adapterSupporting: EvidenceItem[] = [];
    const adapterContradicting: EvidenceItem[] = [];

    for (const es of adapterEvidenceSources) {
      const credibility = this.mapCredibilityScore(es.credibilityScore);
      const item: EvidenceItem = {
        source: es.source,
        url: es.url,
        excerpt: es.excerpt,
        credibility,
        timestamp: es.retrievedAt,
      };

      if (es.stance === 'supports') {
        adapterSupporting.push(item);
      } else if (es.stance === 'contradicts') {
        adapterContradicting.push(item);
      } else {
        // Neutral evidence goes to supporting as context
        adapterSupporting.push(item);
      }
    }

    // Generate investigative leads
    const investigativeLeads = this.generateInvestigativeLeads(
      claim.claim,
      entities,
      adapterEvidenceSources,
    );

    // Use LLM reasoning if available, otherwise fall back to heuristic
    let result: VerificationResult;

    if (this.genAI) {
      result = await this.llmVerification(
        claim,
        allEvidence,
        sourcesChecked,
        adapterEvidenceSources,
      );
    } else {
      result = this.heuristicVerification(claim, allEvidence, sourcesChecked);
    }

    // Merge adapter evidence into the result
    result.evidence.supporting.push(...adapterSupporting);
    result.evidence.contradicting.push(...adapterContradicting);
    result.evidenceSources = adapterEvidenceSources.length > 0 ? adapterEvidenceSources : undefined;
    result.investigativeLeads = investigativeLeads.length > 0 ? investigativeLeads : undefined;

    // Apply platform credibility weighting if available
    if (this.platformCredibility && claim.sources.length > 0) {
      result.confidence = this.applyPlatformCredibilityWeighting(
        result.confidence,
        adapterEvidenceSources,
      );
    }

    return result;
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

  async searchGdelt(claimText: string): Promise<{ source: 'GDELT'; items: GdeltArticle[] }[]> {
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
  adapterEvidence: EvidenceSource[] = [],
  ): Promise<VerificationResult> {
    if (!this.genAI) {
      throw new Error('Gemini client is not initialized');
    }

    const model = this.genAI.getGenerativeModel({ model: this.chatModel });

    const evidenceText = this.formatEvidenceForPrompt(evidence);
    const adapterEvidenceText = this.formatAdapterEvidenceForPrompt(adapterEvidence);

    const prompt = `You are an evidence-based fact-checking assistant. Given a claim and evidence found from public sources, assess the veracity of the claim.

CRITICAL PRINCIPLES:
- Evidence-first: base your assessment ONLY on the evidence provided.
- Use bounded language: "evidence suggests", "sources indicate", not "this is true/false".
- Absence of evidence is not evidence of absence.
- Consider source credibility: Wikipedia is generally reliable for well-sourced articles; news articles vary. On-chain data (Etherscan) and regulatory filings (SEC EDGAR) are highly reliable. Market data (DexScreener) reflects current state but not intent.
- If evidence is insufficient, say so clearly.

CLAIM: "${claim.claim}"
CLAIM TYPE: ${claim.type}
SOURCES WHO MADE THIS CLAIM: ${claim.sources.join(', ') || 'Unknown'}

EVIDENCE FOUND:
${evidenceText || 'No relevant evidence found from searched sources.'}
${adapterEvidenceText ? `\nTARGETED EVIDENCE FROM SPECIALIZED SOURCES:\n${adapterEvidenceText}` : ''}

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
- Use bounded language throughout
- Weight on-chain and governmental evidence higher than social media claims`;

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
    const validStatuses = new Set(['verified', 'disputed', 'unverified', 'mixed', 'false']);

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
      analysisMode: 'llm',
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
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item) => ({
        source: typeof item['source'] === 'string' ? item['source'] : 'Unknown',
        url: typeof item['url'] === 'string' ? item['url'] : undefined,
        excerpt: typeof item['excerpt'] === 'string' ? item['excerpt'] : '',
        credibility: validCredibility.has(item['credibility'] as string)
          ? (item['credibility'] as EvidenceItem['credibility'])
          : 'medium',
        timestamp: typeof item['timestamp'] === 'string' ? item['timestamp'] : undefined,
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
            const relevance = this.computeRelevance(claim.claim, article.title);
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
      analysisMode: 'heuristic',
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
  // Entity extraction
  // ---------------------------------------------------------------------------

  private extractEntities(claim: string): Array<{ type: string; value: string }> {
    const entities: Array<{ type: string; value: string }> = [];

    // Wallet addresses (Ethereum-style)
    const walletMatches = claim.match(/0x[a-fA-F0-9]{40}/g);
    if (walletMatches) {
      for (const addr of walletMatches) {
        entities.push({ type: 'wallet', value: addr });
      }
    }

    // Ticker symbols ($BTC, $ETH, etc.)
    const tickerMatches = claim.match(/\$[A-Z]{2,10}/g);
    if (tickerMatches) {
      for (const ticker of tickerMatches) {
        entities.push({ type: 'ticker', value: ticker.slice(1) }); // remove $
      }
    }

    // Social handles (@username)
    const handleMatches = claim.match(/@[\w]+/g);
    if (handleMatches) {
      for (const handle of handleMatches) {
        entities.push({ type: 'handle', value: handle });
      }
    }

    // GitHub-style repo references (org/repo)
    const repoMatches = claim.match(/\b[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\b/g);
    if (repoMatches) {
      for (const repo of repoMatches) {
        // Filter out common false positives like dates (e.g. "2024/01")
        if (!/^\d+\/\d+$/.test(repo)) {
          entities.push({ type: 'repo', value: repo });
        }
      }
    }

    return entities;
  }

  // ---------------------------------------------------------------------------
  // Investigative leads generation
  // ---------------------------------------------------------------------------

  private generateInvestigativeLeads(
    claim: string,
    entities: Array<{ type: string; value: string }>,
    existingEvidence: EvidenceSource[],
  ): InvestigativeLead[] {
    const leads: InvestigativeLead[] = [];
    const claimLower = claim.toLowerCase();

    // For wallet addresses without owner identification
    for (const e of entities.filter((e) => e.type === 'wallet')) {
      const hasOwnerInfo = existingEvidence.some(
        (ev) => ev.source.includes(e.value.slice(0, 10)) && ev.data['ownerIdentified'],
      );
      if (!hasOwnerInfo) {
        leads.push({
          question: `Who controls wallet ${e.value}? Check if it's labeled on Etherscan or linked to any ENS name.`,
          dataSources: ['Etherscan', 'ENS'],
          priority: 'high',
          automatable: false,
        });
      }
    }

    // For token claims without on-chain verification
    if (claimLower.includes('sold') || claimLower.includes('dump') || claimLower.includes('rug')) {
      leads.push({
        question:
          'Were team tokens actually sold? Check deployer wallet and known team wallets for outgoing transfers.',
        dataSources: ['Etherscan', 'DexScreener'],
        priority: 'high',
        automatable: true,
      });
    }

    // For project activity claims
    if (
      claimLower.includes('abandon') ||
      claimLower.includes('dead') ||
      claimLower.includes('inactive')
    ) {
      leads.push({
        question:
          'Is development actually inactive? Check GitHub commit history and recent activity.',
        dataSources: ['GitHub'],
        priority: 'high',
        automatable: true,
      });
    }

    // For partnership/collaboration claims
    if (
      claimLower.includes('partner') ||
      claimLower.includes('collaborat') ||
      claimLower.includes('deal')
    ) {
      leads.push({
        question:
          'Has this partnership been officially announced? Check SEC filings and official press releases.',
        dataSources: ['SEC EDGAR', 'GDELT'],
        priority: 'medium',
        automatable: true,
      });
    }

    // For claims about specific people/accounts
    for (const e of entities.filter((e) => e.type === 'handle')) {
      leads.push({
        question: `What is the credibility history of ${e.value}? Check past claims, bot probability, and cross-platform presence.`,
        dataSources: ['Social Graph', 'Twitter'],
        priority: 'medium',
        automatable: true,
      });
    }

    // For market manipulation claims
    if (
      claimLower.includes('pump') ||
      claimLower.includes('manipulat') ||
      claimLower.includes('wash trad')
    ) {
      leads.push({
        question:
          'Is there evidence of coordinated trading? Check on-chain transaction patterns and DEX volume anomalies.',
        dataSources: ['Etherscan', 'DexScreener'],
        priority: 'high',
        automatable: true,
      });
    }

    // For regulatory claims
    if (
      claimLower.includes('sec') ||
      claimLower.includes('regulat') ||
      claimLower.includes('lawsuit') ||
      claimLower.includes('fine')
    ) {
      leads.push({
        question:
          'Are there actual regulatory filings or enforcement actions? Check SEC EDGAR for official records.',
        dataSources: ['SEC EDGAR'],
        priority: 'high',
        automatable: true,
      });
    }

    return leads;
  }

  // ---------------------------------------------------------------------------
  // Platform credibility weighting
  // ---------------------------------------------------------------------------

  private applyPlatformCredibilityWeighting(
    confidence: number,
    adapterEvidence: EvidenceSource[],
  ): number {
    if (!this.platformCredibility || adapterEvidence.length === 0) {
      return confidence;
    }

    // Weight evidence by source type credibility
    const sourceTypeWeights: Record<string, number> = {
      'on-chain': 0.95,
      governmental: 0.95,
      financial: 0.85,
      journalistic: 0.7,
      social: 0.5,
    };

    let totalWeight = 0;
    let weightedConfidence = 0;

    for (const es of adapterEvidence) {
      const typeWeight = sourceTypeWeights[es.sourceType] ?? 0.5;
      const evidenceWeight = typeWeight * es.credibilityScore * es.relevance;
      totalWeight += evidenceWeight;
      weightedConfidence +=
        evidenceWeight *
        (es.stance === 'supports' ? 1.0 : es.stance === 'contradicts' ? -0.5 : 0.3);
    }

    if (totalWeight === 0) return confidence;

    // Blend the adapter-weighted signal with the existing confidence
    const adapterSignal = this.clamp(weightedConfidence / totalWeight, 0, 1);
    const blended = confidence * 0.6 + adapterSignal * 0.4;
    return this.clamp(blended, 0, 1);
  }

  // ---------------------------------------------------------------------------
  // Adapter evidence formatting
  // ---------------------------------------------------------------------------

  private formatAdapterEvidenceForPrompt(adapterEvidence: EvidenceSource[]): string {
    if (adapterEvidence.length === 0) return '';

    const grouped = new Map<string, EvidenceSource[]>();
    for (const es of adapterEvidence) {
      const key = es.sourceType;
      const list = grouped.get(key) ?? [];
      list.push(es);
      grouped.set(key, list);
    }

    const sections: string[] = [];

    for (const [sourceType, items] of grouped) {
      const label = sourceType.toUpperCase().replace('-', ' ');
      const lines = items.map(
        (es) =>
          `  - [${es.source}] (credibility: ${es.credibilityScore.toFixed(2)}, stance: ${es.stance}): ${es.excerpt}${es.url ? ` (${es.url})` : ''}`,
      );
      sections.push(`${label} EVIDENCE:\n${lines.join('\n')}`);
    }

    return sections.join('\n\n');
  }

  private mapCredibilityScore(score: number): 'high' | 'medium' | 'low' {
    if (score >= 0.8) return 'high';
    if (score >= 0.5) return 'medium';
    return 'low';
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
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&[^;]+;/g, ' ')
      .trim();
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
          .map((a) => `  - "${a.title}" [${a.domain ?? 'unknown source'}] ${a.url ?? ''}`)
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
    const disputed = results.filter((r) => r.status === 'disputed' || r.status === 'false').length;
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
    if (verified > 0) statusParts.push(`${verified} found supporting evidence`);
    if (disputed > 0) statusParts.push(`${disputed} found contradicting evidence`);
    if (mixed > 0) statusParts.push(`${mixed} found mixed evidence`);
    if (unverified > 0) statusParts.push(`${unverified} could not be verified`);

    if (statusParts.length > 0) {
      parts.push(statusParts.join(', ') + '.');
    }

    parts.push(
      'All assessments are based on limited public sources and should be treated as preliminary.',
    );

    return parts.join(' ');
  }

  private unverifiedResult(claimText: string, sourcesChecked: string[]): VerificationResult {
    return {
      claim: claimText,
      status: 'unverified',
      confidence: 0,
      analysisMode: 'unavailable',
      evidence: { supporting: [], contradicting: [] },
      reasoning: 'Verification could not be completed due to an error in processing.',
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
