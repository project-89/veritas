import { GoogleGenerativeAI } from '@google/generative-ai';
import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import {
  DETERMINISTIC_JSON_CONFIG,
  extractFirstJsonObject,
  geminiChatModel,
  LlmGateway,
} from '@veritas/analysis';
import { WebSearchService, type WebSearchResponse } from '@veritas/ingestion';

const REFINE_PROMPT_VERSION = 1;

export interface RefineResult extends WebSearchResponse {
  /** null when the LLM is unavailable — raw web results still returned. */
  interpretation: string | null;
  refinedQueries: string[];
  entities: string[];
  analysisMode: 'llm' | 'unavailable';
}

/**
 * Web search + query refinement for vague scan topics.
 *
 * /web/search — raw keyless web+news results (provenance-tagged).
 * /web/refine — web context fed to Gemini to produce sharper scan queries and
 * the entities involved. Without a key it degrades honestly: raw results
 * only, analysisMode 'unavailable', nothing fabricated.
 */
@Controller('web')
export class WebSearchController {
  constructor(private readonly webSearch: WebSearchService) {}

  @Get('search')
  async search(
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ): Promise<WebSearchResponse> {
    const query = (q ?? '').trim();
    if (!query) throw new BadRequestException('q is required');
    return this.webSearch.searchAll(query, Math.min(Number(limit) || 8, 20));
  }

  @Get('refine')
  async refine(@Query('q') q?: string): Promise<RefineResult> {
    const query = (q ?? '').trim();
    if (!query) throw new BadRequestException('q is required');

    const searched = await this.webSearch.searchAll(query, 8);
    const geminiKey = process.env['GEMINI_API_KEY'];
    if (!geminiKey || searched.results.length === 0) {
      return {
        ...searched,
        interpretation: null,
        refinedQueries: [],
        entities: [],
        analysisMode: 'unavailable',
      };
    }

    const context = searched.results
      .slice(0, 8)
      .map((r, i) => `${i + 1}. [${r.provider}] ${r.title}${r.snippet ? ` — ${r.snippet.slice(0, 200)}` : ''}`)
      .join('\n');
    const chatModel = geminiChatModel();
    const prompt = `A user wants to scan social media and news for the vague topic: "${query}"

Current web results for that topic:
${context}

From this context, produce STRICT JSON:
{
  "interpretation": "<one sentence: what this topic currently refers to>",
  "refinedQueries": ["<2-4 word scan query>", ...],   // 3-5, each a sharper, more specific angle
  "entities": ["<person/org/place/product central to the topic>", ...]  // up to 8
}
Ground everything in the web results above — do not invent angles the results don't support.`;

    try {
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({
        model: chatModel,
        generationConfig: DETERMINISTIC_JSON_CONFIG,
      });
      const text = await LlmGateway.instance.run({
        model: chatModel,
        promptVersion: REFINE_PROMPT_VERSION,
        prompt,
        generate: () => model.generateContent(prompt).then((r) => r.response.text()),
      });
      const json = extractFirstJsonObject(text);
      const parsed = json
        ? (JSON.parse(json) as {
            interpretation?: string;
            refinedQueries?: unknown[];
            entities?: unknown[];
          })
        : {};
      return {
        ...searched,
        interpretation:
          typeof parsed.interpretation === 'string' ? parsed.interpretation : null,
        refinedQueries: (parsed.refinedQueries ?? []).filter(
          (x): x is string => typeof x === 'string' && x.trim().length > 0,
        ),
        entities: (parsed.entities ?? []).filter(
          (x): x is string => typeof x === 'string' && x.trim().length > 0,
        ),
        analysisMode: 'llm',
      };
    } catch {
      return {
        ...searched,
        interpretation: null,
        refinedQueries: [],
        entities: [],
        analysisMode: 'unavailable',
      };
    }
  }
}
