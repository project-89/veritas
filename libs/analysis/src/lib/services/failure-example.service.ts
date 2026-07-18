import { GoogleGenerativeAI } from '@google/generative-ai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RawPost } from './deviation.service';
import { DETERMINISTIC_JSON_CONFIG, extractFirstJsonObject, geminiChatModel } from './utils/llm-config';
import { LlmBudgetExceededError, LlmGateway } from './utils/llm-gateway';

export const FAILURE_EXAMPLE_PROMPT_VERSION = 1;

/**
 * Extracts CONCRETE, documented failure/struggle examples about a subject
 * (typically an AI model, e.g. "Google Gemini") from scanned social posts.
 *
 * The output is a provenance-tracked corpus: each example must cite a verbatim
 * excerpt from the source post, verified server-side — an example whose
 * "evidence" doesn't actually appear in the post is dropped, not shipped.
 * Vague complaints ("Gemini sucks") are counted but never become examples;
 * only posts describing WHAT was asked and HOW the model failed qualify.
 */

/** A RawPost plus the provenance fields the corpus needs. */
export interface ExamplePost extends RawPost {
  url?: string;
}

export type FailureModality =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'code'
  | 'multimodal'
  | 'unspecified';

export interface FailureExample {
  /** The specific model named in the post ("Gemini 2.5 Pro"), or 'unspecified'. */
  model: string;
  modality: FailureModality;
  /** Canonical categories suggested to the LLM; free-form strings tolerated. */
  failureCategory: string;
  /** Verbatim prompt if the post quotes one, else null. Never paraphrased. */
  quotedPrompt: string | null;
  /** What happened, grounded in the post's own account. */
  description: string;
  /** Exact substring of the source post backing this example (server-verified). */
  evidenceExcerpt: string;
  confidence: 'high' | 'medium' | 'low';
  // Provenance — derived server-side from the cited post, never from the LLM.
  postRef: number;
  platform: string;
  authorName: string;
  authorHandle: string;
  url: string | null;
  timestamp: string;
  engagement: { likes: number; shares: number; comments: number };
}

export interface FailureExampleResult {
  status: 'ok' | 'skipped' | 'unavailable';
  statusReason?: string;
  subject: string;
  examples: FailureExample[];
  /** Posts complaining about the subject without a concrete, usable example. */
  vagueComplaintCount: number;
  /** Examples the LLM produced whose evidence excerpt failed verification. */
  ungroundedDropped: number;
  postsScanned: number;
  modelUsed: string | null;
  promptVersion: number;
}

export interface LlmExample {
  postRef?: number;
  model?: string;
  modality?: string;
  failureCategory?: string;
  quotedPrompt?: string | null;
  description?: string;
  evidenceExcerpt?: string;
  confidence?: string;
}

interface LlmBatchResponse {
  examples?: LlmExample[];
  vagueComplaintRefs?: number[];
}

const MODALITIES: ReadonlySet<string> = new Set([
  'text',
  'image',
  'video',
  'audio',
  'code',
  'multimodal',
  'unspecified',
]);

const CONFIDENCES: ReadonlySet<string> = new Set(['high', 'medium', 'low']);

// Batch sizing: cap per-post text so a batch stays well inside the context
// window, and batch enough posts per call that a 200-post scan is ~5 calls.
const POST_TEXT_CAP = 700;
const BATCH_SIZE = 40;
const MIN_POST_CHARS = 25;

/** Whitespace/case-insensitive containment check for evidence grounding. */
export function normalizeForGrounding(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Validate an LLM example against its cited post: the postRef must exist and
 * the evidence excerpt must actually appear in that post's text. Provenance
 * fields are then taken from the post itself, never from the model.
 */
export function groundFailureExample(
  raw: LlmExample,
  posts: ExamplePost[],
): FailureExample | null {
  const ref = raw.postRef;
  if (typeof ref !== 'number' || ref < 0 || ref >= posts.length) return null;
  const post = posts[ref];
  if (!post) return null;

  const excerpt = (raw.evidenceExcerpt ?? '').trim();
  const description = (raw.description ?? '').trim();
  if (!excerpt || !description) return null;
  if (!normalizeForGrounding(post.text ?? '').includes(normalizeForGrounding(excerpt))) {
    return null;
  }

  const modality = MODALITIES.has(raw.modality ?? '')
    ? (raw.modality as FailureModality)
    : 'unspecified';
  const confidence = CONFIDENCES.has(raw.confidence ?? '')
    ? (raw.confidence as FailureExample['confidence'])
    : 'low';
  const quotedPrompt =
    typeof raw.quotedPrompt === 'string' && raw.quotedPrompt.trim().length > 0
      ? raw.quotedPrompt.trim()
      : null;

  return {
    model: (raw.model ?? '').trim() || 'unspecified',
    modality,
    failureCategory: (raw.failureCategory ?? '').trim() || 'other',
    quotedPrompt,
    description,
    evidenceExcerpt: excerpt,
    confidence,
    postRef: ref,
    platform: post.platform,
    authorName: post.authorName,
    authorHandle: post.authorHandle,
    url: post.url ?? null,
    timestamp: post.timestamp,
    engagement: {
      likes: post.engagement?.likes ?? 0,
      shares: post.engagement?.shares ?? 0,
      comments: post.engagement?.comments ?? 0,
    },
  };
}

@Injectable()
export class FailureExampleService {
  private readonly logger = new Logger(FailureExampleService.name);
  private readonly genAI: GoogleGenerativeAI | null = null;
  private readonly chatModel: string = geminiChatModel();

  constructor(private readonly configService: ConfigService) {
    const geminiKey =
      this.configService.get<string>('GEMINI_API_KEY') || process.env['GEMINI_API_KEY'];
    if (geminiKey) {
      this.genAI = new GoogleGenerativeAI(geminiKey);
      this.logger.log('FailureExampleService initialized with Gemini');
    } else {
      this.logger.warn('GEMINI_API_KEY not set -- failure-example extraction unavailable');
    }
  }

  async extract(subject: string, posts: ExamplePost[]): Promise<FailureExampleResult> {
    const trimmedSubject = subject.trim();
    if (!trimmedSubject) {
      return this.emptyResult(subject, 'skipped', 'No subject provided.');
    }

    // Index BEFORE filtering so postRef always addresses the caller's array.
    const usable = posts
      .map((post, index) => ({ post, index }))
      .filter(({ post }) => (post.text ?? '').trim().length >= MIN_POST_CHARS);

    if (usable.length === 0) {
      return this.emptyResult(
        trimmedSubject,
        'skipped',
        'No posts with enough text to contain a concrete example.',
      );
    }

    if (!this.genAI) {
      return this.emptyResult(
        trimmedSubject,
        'unavailable',
        'GEMINI_API_KEY is not configured — extraction did not run.',
      );
    }

    const model = this.genAI.getGenerativeModel({
      model: this.chatModel,
      generationConfig: DETERMINISTIC_JSON_CONFIG,
    });

    const batches: Array<Array<{ post: ExamplePost; index: number }>> = [];
    for (let i = 0; i < usable.length; i += BATCH_SIZE) {
      batches.push(usable.slice(i, i + BATCH_SIZE));
    }

    const examples: FailureExample[] = [];
    const vagueRefs = new Set<number>();
    let ungroundedDropped = 0;
    let anyBatchSucceeded = false;
    let budgetExhausted = false;

    for (const batch of batches) {
      if (budgetExhausted) break;
      const prompt = this.buildPrompt(trimmedSubject, batch);
      try {
        const responseText = await LlmGateway.instance.run({
          model: this.chatModel,
          promptVersion: FAILURE_EXAMPLE_PROMPT_VERSION,
          prompt,
          contextKey: `failure-examples:${trimmedSubject.toLowerCase()}`,
          generate: () => model.generateContent(prompt).then((r) => r.response.text()),
        });
        const parsed = this.parseBatch(responseText);
        anyBatchSucceeded = true;

        for (const ref of parsed.vagueComplaintRefs ?? []) {
          if (typeof ref === 'number') vagueRefs.add(ref);
        }
        for (const raw of parsed.examples ?? []) {
          const grounded = groundFailureExample(raw, posts);
          if (grounded) examples.push(grounded);
          else ungroundedDropped++;
        }
      } catch (err) {
        if (err instanceof LlmBudgetExceededError) {
          this.logger.warn(`Failure-example extraction stopped early — ${err.message}`);
          budgetExhausted = true;
        } else {
          this.logger.error(`Failure-example batch failed: ${err}`);
        }
      }
    }

    if (!anyBatchSucceeded) {
      return this.emptyResult(
        trimmedSubject,
        'unavailable',
        'All LLM extraction calls failed — no examples extracted.',
      );
    }

    return {
      status: 'ok',
      statusReason: budgetExhausted
        ? 'LLM token budget was exhausted before all batches ran — results are partial.'
        : undefined,
      subject: trimmedSubject,
      examples,
      vagueComplaintCount: vagueRefs.size,
      ungroundedDropped,
      postsScanned: usable.length,
      modelUsed: this.chatModel,
      promptVersion: FAILURE_EXAMPLE_PROMPT_VERSION,
    };
  }

  // ---------------------------------------------------------------------------
  // Prompt
  // ---------------------------------------------------------------------------

  private buildPrompt(subject: string, batch: Array<{ post: ExamplePost; index: number }>): string {
    const postBlock = batch
      .map(({ post, index }) => {
        const text = (post.text ?? '').replace(/\s+/g, ' ').slice(0, POST_TEXT_CAP);
        return `[P${index}] (${post.platform}, @${post.authorHandle || post.authorName || 'unknown'}) ${text}`;
      })
      .join('\n');

    return `You are auditing public posts for CONCRETE, documented examples of "${subject}" (an AI model/product) failing, struggling, or behaving unexpectedly.

A post qualifies as an EXAMPLE only if it describes a specific interaction: what the user asked or did, and how ${subject} failed (wrong answer, hallucinated fact, refused a benign request, broken code, garbled image, ignored instruction, etc.). General praise, vague complaints ("it's gotten worse", "Gemini sucks"), benchmarks without specifics, and news/announcement posts do NOT qualify.

Posts:
${postBlock}

Return STRICT JSON:
{
  "examples": [
    {
      "postRef": <number from [P#]>,
      "model": "<specific model/version named in the post, or 'unspecified'>",
      "modality": "text|image|video|audio|code|multimodal|unspecified",
      "failureCategory": "hallucination|factual-error|refusal|instruction-following|reasoning-error|code-error|image-generation|context-loss|safety-overreach|other",
      "quotedPrompt": "<the user's prompt VERBATIM if the post quotes it, else null — never paraphrase>",
      "description": "<one or two sentences: what was asked, what went wrong>",
      "evidenceExcerpt": "<an EXACT substring copied from the post text that documents the failure>",
      "confidence": "high|medium|low"
    }
  ],
  "vagueComplaintRefs": [<postRef numbers that complain about ${subject} but give no concrete example>]
}

Rules:
- evidenceExcerpt MUST be copied character-for-character from the post (it is verified mechanically; fabricated or paraphrased excerpts are discarded).
- Only report failures OF ${subject}. A post about a different product, or about ${subject} succeeding, is neither an example nor a vague complaint.
- confidence: "high" = first-person account with specifics; "medium" = second-hand but concrete; "low" = concrete but ambiguous about model or cause.
- If nothing qualifies, return {"examples": [], "vagueComplaintRefs": []}.`;
  }

  // ---------------------------------------------------------------------------
  // Parsing + grounding
  // ---------------------------------------------------------------------------

  private parseBatch(responseText: string): LlmBatchResponse {
    const json = extractFirstJsonObject(responseText);
    if (!json) {
      this.logger.warn('Failure-example response contained no JSON object');
      return {};
    }
    try {
      return JSON.parse(json) as LlmBatchResponse;
    } catch (err) {
      this.logger.warn(`Failure-example response JSON parse failed: ${err}`);
      return {};
    }
  }

  private emptyResult(
    subject: string,
    status: 'skipped' | 'unavailable',
    reason: string,
  ): FailureExampleResult {
    return {
      status,
      statusReason: reason,
      subject,
      examples: [],
      vagueComplaintCount: 0,
      ungroundedDropped: 0,
      postsScanned: 0,
      modelUsed: this.genAI ? this.chatModel : null,
      promptVersion: FAILURE_EXAMPLE_PROMPT_VERSION,
    };
  }
}
