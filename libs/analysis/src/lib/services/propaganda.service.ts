import { GoogleGenerativeAI } from '@google/generative-ai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RawPost } from './deviation.service';
import type { AnalyzedNarrative } from './narrative-analysis.service';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PropagandaTechnique {
  id: string;
  name: string;
  description: string;
  confidence: number;
  examples: string[];
  educationalNote: string;
}

export interface ExtractedClaim {
  claim: string;
  type: 'factual' | 'interpretive' | 'predictive' | 'normative';
  sources: string[];
  firstSeen: string;
  frequency: number;
  verifiability: 'verifiable' | 'subjective' | 'unfalsifiable';
}

export interface NarrativeFrame {
  frame: string;
  description: string;
  narrativeIds: string[];
  emotionalAppeal: string;
}

export interface PropagandaAnalysisResult {
  techniques: PropagandaTechnique[];
  claims: ExtractedClaim[];
  frames: NarrativeFrame[];
  overallAssessment: {
    manipulationLikelihood: 'low' | 'medium' | 'high';
    confidence: number;
    reasoning: string;
    caveats: string[];
  };
}

// ---------------------------------------------------------------------------
// Known technique catalog (used in prompt + fallback)
// ---------------------------------------------------------------------------

const TECHNIQUE_CATALOG = [
  'scapegoating',
  'demonization',
  'bandwagon',
  'appeal to fear',
  'appeal to authority',
  'whataboutism',
  'false dichotomy',
  'big lie',
  'firehose of falsehood',
  'emotional manipulation',
  'astroturfing indicators',
  'manufactured consensus',
  'cherry picking',
  'straw man',
  'ad hominem',
  'loaded language',
  'transfer/association',
] as const;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class PropagandaAnalysisService {
  private readonly logger = new Logger(PropagandaAnalysisService.name);
  private readonly genAI: GoogleGenerativeAI | null = null;
  private readonly chatModel: string = 'gemini-2.0-flash';

  constructor(private readonly configService: ConfigService) {
    const geminiKey =
      this.configService.get<string>('GEMINI_API_KEY') || process.env['GEMINI_API_KEY'];

    if (geminiKey) {
      this.genAI = new GoogleGenerativeAI(geminiKey);
      this.logger.log('PropagandaAnalysisService initialized with Gemini');
    } else {
      this.logger.warn('GEMINI_API_KEY not set -- propaganda analysis will return empty results');
    }
  }

  /**
   * Analyze narratives and their source posts for propaganda techniques,
   * extractable claims, and framing patterns.
   */
  async analyze(
    narratives: AnalyzedNarrative[],
    posts: RawPost[],
  ): Promise<PropagandaAnalysisResult> {
    if (narratives.length === 0) {
      return this.emptyResult();
    }

    if (!this.genAI) {
      this.logger.warn('No Gemini key -- returning empty propaganda analysis');
      return this.emptyResult();
    }

    const model = this.genAI.getGenerativeModel({ model: this.chatModel });

    // Build a representative sample of posts per narrative
    const narrativeSections = narratives.map((n) => {
      const samplePosts = n.postIndices
        .slice(0, 10)
        .map((idx) => {
          const post = posts[idx];
          if (!post) return null;
          return `  - [@${post.authorHandle || post.authorName}] ${post.text.slice(0, 300)}`;
        })
        .filter(Boolean)
        .join('\n');

      return `[Narrative "${n.id}": "${n.summary}" | ${n.postIndices.length} posts | sentiment: ${n.avgSentiment.toFixed(2)} | velocity: ${n.velocity.trend}]
${samplePosts}`;
    });

    const prompt = `You are an expert in communication analysis and rhetoric. Analyze the following narrative clusters and their representative social media posts for the presence of classical propaganda and persuasion techniques.

IMPORTANT PRINCIPLES:
- Follow evidence-first analysis: describe patterns you observe, do not label content as left/right or good/bad.
- Use bounded confidence: express how certain you are about each identification.
- Distinguish between intentional manipulation and organic emotional expression.
- A technique being present does not mean the underlying claims are false.

NARRATIVES AND SAMPLE POSTS:
${narrativeSections.join('\n\n')}

TECHNIQUES TO CHECK FOR:
${TECHNIQUE_CATALOG.join(', ')}

Respond ONLY with a single JSON object matching this exact schema (no markdown fences, no other text):

{
  "techniques": [
    {
      "id": "technique-0",
      "name": "Technique Name",
      "description": "What this technique is and how it works",
      "confidence": 0.75,
      "examples": ["Exact or near-exact quote from posts above"],
      "educationalNote": "Why this technique is effective and how readers can recognize it"
    }
  ],
  "claims": [
    {
      "claim": "The specific propositional statement",
      "type": "factual",
      "sources": ["author handles who made this claim"],
      "firstSeen": "ISO timestamp of earliest post containing this claim",
      "frequency": 5,
      "verifiability": "verifiable"
    }
  ],
  "frames": [
    {
      "frame": "frame name (e.g. victim, aggressor, coverup, whistleblower)",
      "description": "How this interpretive lens shapes the narrative",
      "narrativeIds": ["narrative-0"],
      "emotionalAppeal": "fear"
    }
  ],
  "overallAssessment": {
    "manipulationLikelihood": "low",
    "confidence": 0.6,
    "reasoning": "Evidence-based explanation of the assessment",
    "caveats": ["Explicit limitations and uncertainties in this analysis"]
  }
}

Rules for the JSON:
- Only include techniques you actually detect with confidence >= 0.3
- "type" must be one of: factual, interpretive, predictive, normative
- "verifiability" must be one of: verifiable, subjective, unfalsifiable
- "manipulationLikelihood" must be one of: low, medium, high
- "emotionalAppeal" should be a single emotion word (fear, anger, hope, disgust, pride, etc.)
- confidence values are 0-1 floats
- Always include at least one caveat`;

    try {
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      const parsed = this.parseResponse(responseText);
      return parsed;
    } catch (err) {
      this.logger.error(`Propaganda analysis LLM call failed: ${err}`);
      return this.emptyResult();
    }
  }

  // ---------------------------------------------------------------------------
  // Response parsing
  // ---------------------------------------------------------------------------

  private parseResponse(text: string): PropagandaAnalysisResult {
    // Try to extract JSON from response (may have markdown fences)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      this.logger.warn('Could not extract JSON from LLM response');
      return this.emptyResult();
    }

    try {
      const raw = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      return this.validateAndNormalize(raw);
    } catch (err) {
      this.logger.warn(`Failed to parse propaganda analysis JSON: ${err}`);
      return this.emptyResult();
    }
  }

  private validateAndNormalize(raw: Record<string, unknown>): PropagandaAnalysisResult {
    const techniques = this.validateTechniques(raw['techniques']);
    const claims = this.validateClaims(raw['claims']);
    const frames = this.validateFrames(raw['frames']);
    const overallAssessment = this.validateAssessment(raw['overallAssessment']);

    return { techniques, claims, frames, overallAssessment };
  }

  private validateTechniques(raw: unknown): PropagandaTechnique[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null)
      .map((t, i) => ({
        id: typeof t['id'] === 'string' ? t['id'] : `technique-${i}`,
        name: typeof t['name'] === 'string' ? t['name'] : 'Unknown',
        description: typeof t['description'] === 'string' ? t['description'] : '',
        confidence: this.clamp(Number(t['confidence']) || 0, 0, 1),
        examples: Array.isArray(t['examples'])
          ? t['examples'].filter((e): e is string => typeof e === 'string')
          : [],
        educationalNote: typeof t['educationalNote'] === 'string' ? t['educationalNote'] : '',
      }))
      .filter((t) => t.confidence >= 0.3);
  }

  private validateClaims(raw: unknown): ExtractedClaim[] {
    const validTypes = new Set(['factual', 'interpretive', 'predictive', 'normative']);
    const validVerifiability = new Set(['verifiable', 'subjective', 'unfalsifiable']);

    if (!Array.isArray(raw)) return [];
    return raw
      .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
      .map((c) => ({
        claim: typeof c['claim'] === 'string' ? c['claim'] : '',
        type: validTypes.has(c['type'] as string)
          ? (c['type'] as ExtractedClaim['type'])
          : 'interpretive',
        sources: Array.isArray(c['sources'])
          ? c['sources'].filter((s): s is string => typeof s === 'string')
          : [],
        firstSeen: typeof c['firstSeen'] === 'string' ? c['firstSeen'] : '',
        frequency: Math.max(Math.round(Number(c['frequency']) || 0), 0),
        verifiability: validVerifiability.has(c['verifiability'] as string)
          ? (c['verifiability'] as ExtractedClaim['verifiability'])
          : 'subjective',
      }))
      .filter((c) => c.claim.length > 0);
  }

  private validateFrames(raw: unknown): NarrativeFrame[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((f): f is Record<string, unknown> => typeof f === 'object' && f !== null)
      .map((f) => ({
        frame: typeof f['frame'] === 'string' ? f['frame'] : '',
        description: typeof f['description'] === 'string' ? f['description'] : '',
        narrativeIds: Array.isArray(f['narrativeIds'])
          ? f['narrativeIds'].filter((id): id is string => typeof id === 'string')
          : [],
        emotionalAppeal:
          typeof f['emotionalAppeal'] === 'string' ? f['emotionalAppeal'] : 'neutral',
      }))
      .filter((f) => f.frame.length > 0);
  }

  private validateAssessment(raw: unknown): PropagandaAnalysisResult['overallAssessment'] {
    const defaults: PropagandaAnalysisResult['overallAssessment'] = {
      manipulationLikelihood: 'low',
      confidence: 0,
      reasoning: 'Analysis could not be completed.',
      caveats: [
        'This is an automated analysis and may contain errors.',
        'The presence of persuasion techniques does not necessarily indicate intentional manipulation.',
      ],
    };

    if (typeof raw !== 'object' || raw === null) return defaults;
    const obj = raw as Record<string, unknown>;

    const validLikelihood = new Set(['low', 'medium', 'high']);

    return {
      manipulationLikelihood: validLikelihood.has(obj['manipulationLikelihood'] as string)
        ? (obj[
            'manipulationLikelihood'
          ] as PropagandaAnalysisResult['overallAssessment']['manipulationLikelihood'])
        : 'low',
      confidence: this.clamp(Number(obj['confidence']) || 0, 0, 1),
      reasoning: typeof obj['reasoning'] === 'string' ? obj['reasoning'] : defaults.reasoning,
      caveats: Array.isArray(obj['caveats'])
        ? obj['caveats'].filter((c): c is string => typeof c === 'string')
        : defaults.caveats,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  private emptyResult(): PropagandaAnalysisResult {
    return {
      techniques: [],
      claims: [],
      frames: [],
      overallAssessment: {
        manipulationLikelihood: 'low',
        confidence: 0,
        reasoning: 'Analysis could not be completed (no Gemini API key or no narratives provided).',
        caveats: [
          'No analysis was performed. Configure GEMINI_API_KEY for full propaganda technique detection.',
        ],
      },
    };
  }
}
