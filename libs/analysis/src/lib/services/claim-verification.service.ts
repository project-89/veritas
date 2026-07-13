import { createHash } from 'node:crypto';
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
import {
  DETERMINISTIC_JSON_CONFIG,
  extractFirstJsonObject,
  geminiChatModel,
} from './utils/llm-config';
import { LlmBudgetExceededError, LlmGateway } from './utils/llm-gateway';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Bumped whenever the verification prompt changes in a way that affects
 * verdicts. v2 added citation grounding: exact-quote excerpts, no outside
 * knowledge for the status decision.
 */
export const CLAIM_VERIFICATION_PROMPT_VERSION = 2;

/** Appended when a verdict is downgraded because its citations failed grounding. */
export const GROUNDING_DOWNGRADE_CAVEAT =
  'Original verdict was not supported by verifiable evidence citations and was downgraded.';

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
  /**
   * Grounded cited excerpts / total cited excerpts (0-1). Null when the
   * verdict cited nothing, so there was nothing to ground.
   */
  groundingScore?: number | null;
  /** Citations dropped because their excerpts were not found in the retrieved evidence. */
  droppedUngroundedCitations?: number;
  /** Version of the verification prompt that produced this result. */
  promptVersion?: number;
  /** Model that produced the verdict ('heuristic' for the keyword fallback). */
  model?: string;
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

/** A single retrieved evidence snippet, normalized across wiki/GDELT/adapters. */
interface RetrievedSnippet {
  text: string;
  source: string;
  url?: string;
  timestamp?: string;
  credibility: 'high' | 'medium' | 'low';
  stance?: 'supports' | 'contradicts' | 'neutral';
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_AGENT = 'Mozilla/5.0 (compatible; Veritas/2.0; +https://github.com/oneirocom/veritas)';

const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
const GDELT_API = 'https://api.gdeltproject.org/api/v2/doc/doc';

/** Max evidence snippets sent to the LLM after relevance ranking. */
const MAX_PROMPT_SNIPPETS = 12;

/** Minimum token-overlap ratio for a cited excerpt to count as grounded. */
const GROUNDING_OVERLAP_THRESHOLD = 0.7;

/** Confidence ceiling for verdicts downgraded by the grounding check. */
const DOWNGRADED_CONFIDENCE_CAP = 0.3;

const STOP_WORDS = new Set([
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

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ClaimVerificationService {
  private readonly logger = new Logger(ClaimVerificationService.name);
  private readonly genAI: GoogleGenerativeAI | null = null;
  private readonly chatModel: string = geminiChatModel();
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

    // One budget scope per batch: every claim in a verification run shares a
    // context so a large batch can't fan out into unbounded LLM spend.
    const contextKey = `claim-batch:${createHash('sha256')
      .update(verifiable.map((c) => c.claim).join(' '))
      .digest('hex')
      .slice(0, 16)}`;

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
      const batchResults = await Promise.all(
        batch.map((claim) => this.verifySingleClaim(claim, contextKey)),
      );
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

  async verifySingleClaim(claim: ExtractedClaim, contextKey?: string): Promise<VerificationResult> {
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
        contextKey,
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
      // Weighting must not lift a grounding-downgraded verdict back up.
      if (result.caveats.includes(GROUNDING_DOWNGRADE_CAVEAT)) {
        result.confidence = Math.min(result.confidence, DOWNGRADED_CONFIDENCE_CAP);
      }
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
    contextKey?: string,
  ): Promise<VerificationResult> {
    if (!this.genAI) {
      throw new Error('Gemini client is not initialized');
    }

    const model = this.genAI.getGenerativeModel({
      model: this.chatModel,
      generationConfig: DETERMINISTIC_JSON_CONFIG,
    });

    // Rank all retrieved snippets against the claim and keep only the most
    // relevant ones, so the prompt is focused instead of first-come-first-served.
    const snippets = this.collectSnippets(evidence, adapterEvidence);
    const { kept, dropped } = this.rankSnippets(claim.claim, snippets, MAX_PROMPT_SNIPPETS);
    if (dropped > 0) {
      this.logger.debug(
        `Evidence ranking kept ${kept.length}/${snippets.length} snippets (dropped ${dropped}) for claim: "${claim.claim.slice(0, 80)}"`,
      );
    }
    const evidenceText = this.formatRankedEvidenceForPrompt(kept);

    const prompt = `You are an evidence-based fact-checking assistant. Given a claim and evidence found from public sources, assess the veracity of the claim.

CRITICAL PRINCIPLES:
- Evidence-first: base your assessment ONLY on the evidence provided below.
- If the provided evidence is insufficient, the status is unverified — do NOT use background knowledge to verify or refute.
- Every cited "excerpt" MUST be an EXACT verbatim quote copied character-for-character from the evidence below. Never paraphrase, summarize, or invent quotes — citations that do not appear in the evidence will be discarded.
- Use bounded language: "evidence suggests", "sources indicate", not "this is true/false".
- Absence of evidence is not evidence of absence.
- Consider source credibility: Wikipedia is generally reliable for well-sourced articles; news articles vary. On-chain data (Etherscan) and regulatory filings (SEC EDGAR) are highly reliable. Market data (DexScreener) reflects current state but not intent.
- If evidence is insufficient, say so clearly.

CLAIM: "${claim.claim}"
CLAIM TYPE: ${claim.type}
SOURCES WHO MADE THIS CLAIM: ${(claim.sources ?? []).join(', ') || 'Unknown'}

EVIDENCE FOUND (the ONLY material you may cite):
${evidenceText || 'No relevant evidence found from searched sources.'}

Respond ONLY with a single JSON object (no markdown fences, no other text):

{
  "status": "verified|disputed|unverified|mixed|false",
  "confidence": 0.0 to 1.0,
  "supporting": [
    {
      "source": "Source name",
      "url": "URL if available",
      "excerpt": "Exact verbatim quote from the evidence that supports the claim",
      "credibility": "high|medium|low",
      "timestamp": "ISO timestamp if available"
    }
  ],
  "contradicting": [
    {
      "source": "Source name",
      "url": "URL if available",
      "excerpt": "Exact verbatim quote from the evidence that contradicts the claim",
      "credibility": "high|medium|low",
      "timestamp": "ISO timestamp if available"
    }
  ],
  "reasoning": "Step-by-step reasoning chain explaining the assessment",
  "caveats": ["Explicit limitations and uncertainties"]
}

Rules:
- "status": verified = strong supporting evidence, disputed = conflicting evidence, unverified = insufficient evidence, mixed = some support + some contradiction, false = strong contradicting evidence
- "verified" requires at least one exact-quote supporting excerpt; "false" requires at least one exact-quote contradicting excerpt
- The status decision must rest ONLY on the evidence above — never on background knowledge
- confidence 0-1: how confident you are in the status assessment
- Every "excerpt" must be an exact verbatim quote from the EVIDENCE FOUND section
- Only include evidence items that are actually relevant to the claim
- Always include at least one caveat
- Use bounded language throughout
- Weight on-chain and governmental evidence higher than social media claims`;

    try {
      const responseText = await LlmGateway.instance.run({
        model: this.chatModel,
        promptVersion: CLAIM_VERIFICATION_PROMPT_VERSION,
        prompt,
        contextKey,
        generate: () => model.generateContent(prompt).then((r) => r.response.text()),
      });
      return this.parseLlmResponse(
        claim.claim,
        responseText,
        sourcesChecked,
        kept.map((s) => s.text),
      );
    } catch (err) {
      if (err instanceof LlmBudgetExceededError) {
        this.logger.warn(`Claim verification degraded to heuristic — ${err.message}`);
      } else {
        this.logger.error(`LLM verification failed: ${err}`);
      }
      // Fall back to heuristic
      return this.heuristicVerification(claim, evidence, sourcesChecked);
    }
  }

  private parseLlmResponse(
    claimText: string,
    responseText: string,
    sourcesChecked: string[],
    sentSnippets: string[],
  ): VerificationResult {
    // Extract the first balanced JSON object. A greedy /\{[\s\S]*\}/ breaks on
    // "thinking" models (e.g. gemini-3.x) that append reasoning or a second
    // block after the JSON — JSON.parse then fails on trailing content.
    const jsonStr = extractFirstJsonObject(responseText);
    if (!jsonStr) {
      this.logger.warn('Could not extract JSON from LLM verification response');
      return this.unverifiedResult(claimText, sourcesChecked);
    }

    try {
      const raw = JSON.parse(jsonStr) as Record<string, unknown>;
      return this.validateLlmResult(claimText, raw, sourcesChecked, sentSnippets);
    } catch (err) {
      this.logger.warn(`Failed to parse LLM verification JSON: ${err}`);
      return this.unverifiedResult(claimText, sourcesChecked);
    }
  }

  private validateLlmResult(
    claimText: string,
    raw: Record<string, unknown>,
    sourcesChecked: string[],
    sentSnippets: string[],
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

    const result: VerificationResult = {
      claim: claimText,
      status,
      confidence,
      analysisMode: 'llm',
      evidence: { supporting, contradicting },
      reasoning,
      caveats,
      sourcesChecked,
      promptVersion: CLAIM_VERIFICATION_PROMPT_VERSION,
      model: this.chatModel,
    };

    return this.applyGroundingCheck(result, sentSnippets);
  }

  // ---------------------------------------------------------------------------
  // Citation grounding: verify LLM-cited excerpts against retrieved evidence
  // ---------------------------------------------------------------------------

  /**
   * Drop cited excerpts that cannot be found in the evidence actually sent to
   * the LLM, then enforce verdict consistency: a verdict that no longer has a
   * grounded citation backing it is downgraded to 'unverified'.
   */
  private applyGroundingCheck(
    result: VerificationResult,
    sentSnippets: string[],
  ): VerificationResult {
    const citedCount = result.evidence.supporting.length + result.evidence.contradicting.length;

    const groundedSupporting = result.evidence.supporting.filter((item) =>
      this.checkAndLogGrounding(item, 'supporting', sentSnippets),
    );
    const groundedContradicting = result.evidence.contradicting.filter((item) =>
      this.checkAndLogGrounding(item, 'contradicting', sentSnippets),
    );

    const groundedCount = groundedSupporting.length + groundedContradicting.length;
    const dropped = citedCount - groundedCount;

    result.evidence.supporting = groundedSupporting;
    result.evidence.contradicting = groundedContradicting;
    result.groundingScore = citedCount > 0 ? groundedCount / citedCount : null;
    result.droppedUngroundedCitations = dropped;

    const needsDowngrade =
      (result.status === 'verified' && groundedSupporting.length === 0) ||
      (result.status === 'false' && groundedContradicting.length === 0) ||
      ((result.status === 'disputed' || result.status === 'mixed') && groundedCount === 0);

    if (needsDowngrade) {
      this.logger.debug(
        `Downgrading '${result.status}' verdict to 'unverified': no grounded citations back it (claim: "${result.claim.slice(0, 80)}")`,
      );
      result.status = 'unverified';
      result.confidence = Math.min(result.confidence, DOWNGRADED_CONFIDENCE_CAP);
      result.caveats.push(GROUNDING_DOWNGRADE_CAVEAT);
    }

    return result;
  }

  private checkAndLogGrounding(
    item: EvidenceItem,
    side: 'supporting' | 'contradicting',
    sentSnippets: string[],
  ): boolean {
    const grounded = this.isExcerptGrounded(item.excerpt, sentSnippets);
    if (!grounded) {
      this.logger.debug(
        `Dropping ungrounded ${side} citation from "${item.source}": excerpt not found in retrieved evidence ("${item.excerpt.slice(0, 100)}")`,
      );
    }
    return grounded;
  }

  /**
   * An excerpt is grounded if, after whitespace/case/punctuation
   * normalization, it occurs verbatim inside one of the snippets sent to the
   * LLM — or if a single snippet contains >= GROUNDING_OVERLAP_THRESHOLD of
   * its content tokens (tolerates minor elision, not fabrication).
   */
  private isExcerptGrounded(excerpt: string, sentSnippets: string[]): boolean {
    const normalizedExcerpt = this.normalizeForGrounding(excerpt);
    if (normalizedExcerpt.length === 0) return false;

    const excerptTokens = new Set(this.tokenize(excerpt));

    for (const snippet of sentSnippets) {
      if (this.normalizeForGrounding(snippet).includes(normalizedExcerpt)) {
        return true;
      }

      if (excerptTokens.size > 0) {
        const snippetTokens = new Set(this.tokenize(snippet));
        let shared = 0;
        for (const token of excerptTokens) {
          if (snippetTokens.has(token)) shared++;
        }
        if (shared / excerptTokens.size >= GROUNDING_OVERLAP_THRESHOLD) {
          return true;
        }
      }
    }

    return false;
  }

  /** Lowercase, strip punctuation, collapse whitespace. */
  private normalizeForGrounding(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ---------------------------------------------------------------------------
  // Evidence ranking: focus the prompt on claim-relevant snippets
  // ---------------------------------------------------------------------------

  /** Normalize every retrieved evidence item into a flat snippet list. */
  private collectSnippets(
    evidence: Array<
      | { source: 'Wikipedia'; items: WikiSearchResult[] }
      | { source: 'GDELT'; items: GdeltArticle[] }
    >,
    adapterEvidence: EvidenceSource[],
  ): RetrievedSnippet[] {
    const snippets: RetrievedSnippet[] = [];

    for (const group of evidence) {
      if (group.source === 'Wikipedia') {
        for (const item of group.items) {
          const text = this.stripHtml(item.snippet);
          if (!text) continue;
          snippets.push({
            text,
            source: `Wikipedia: ${item.title}`,
            url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
            timestamp: item.timestamp,
            credibility: 'high',
          });
        }
      } else {
        for (const article of group.items) {
          if (!article.title) continue;
          snippets.push({
            text: article.title,
            source: `GDELT: ${article.domain ?? 'news'}`,
            url: article.url,
            timestamp: article.seendate,
            credibility: 'medium',
          });
        }
      }
    }

    for (const es of adapterEvidence) {
      if (!es.excerpt) continue;
      snippets.push({
        text: es.excerpt,
        source: es.source,
        url: es.url,
        timestamp: es.retrievedAt,
        credibility: this.mapCredibilityScore(es.credibilityScore),
        stance: es.stance,
      });
    }

    return snippets;
  }

  /**
   * Rank snippets by lexical overlap with the claim: shared content tokens,
   * each weighted by its inverse document frequency across the snippet set
   * (terms appearing in every snippet carry little signal). Keeps the top
   * `keep` snippets, preserving retrieval order when nothing must be dropped.
   */
  private rankSnippets(
    claim: string,
    snippets: RetrievedSnippet[],
    keep: number,
  ): { kept: RetrievedSnippet[]; dropped: number } {
    if (snippets.length <= keep) {
      return { kept: snippets, dropped: 0 };
    }

    const claimTokens = new Set(this.tokenize(claim));
    const snippetTokenSets = snippets.map((s) => new Set(this.tokenize(s.text)));

    // Document frequency of each term across the snippet set
    const documentFrequency = new Map<string, number>();
    for (const tokens of snippetTokenSets) {
      for (const token of tokens) {
        documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
      }
    }

    const scored = snippets.map((snippet, index) => {
      let score = 0;
      const tokens = snippetTokenSets[index];
      if (tokens) {
        for (const token of tokens) {
          if (claimTokens.has(token)) {
            score += 1 / (documentFrequency.get(token) ?? 1);
          }
        }
      }
      return { snippet, score, index };
    });

    // Highest score first; ties keep retrieval order.
    scored.sort((a, b) => b.score - a.score || a.index - b.index);

    const kept = scored
      .slice(0, keep)
      .sort((a, b) => a.index - b.index)
      .map((s) => s.snippet);

    return { kept, dropped: snippets.length - keep };
  }

  /** Lowercase content tokens: no stop words, no tokens shorter than 3 chars. */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  }

  /** Format ranked snippets into a numbered evidence block for the prompt. */
  private formatRankedEvidenceForPrompt(snippets: RetrievedSnippet[]): string {
    return snippets
      .map((s, i) => {
        const stance = s.stance ? `, stance: ${s.stance}` : '';
        return `  [${i + 1}] (${s.source} | credibility: ${s.credibility}${stance}) "${s.text}"${s.url ? ` (${s.url})` : ''}`;
      })
      .join('\n');
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

    const citedCount = supporting.length + contradicting.length;

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
      // Heuristic citations ARE retrieved snippets, so they are grounded by construction.
      groundingScore: citedCount > 0 ? 1 : null,
      droppedUngroundedCitations: 0,
      promptVersion: CLAIM_VERIFICATION_PROMPT_VERSION,
      model: 'heuristic',
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
    const words = claimText
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()));

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
      promptVersion: CLAIM_VERIFICATION_PROMPT_VERSION,
      model: this.chatModel,
    };
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}
