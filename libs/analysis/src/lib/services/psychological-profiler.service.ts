/**
 * MAGI Psychological Profiler
 *
 * Uses gemini-3.1-pro-preview to build comprehensive behavioral and
 * psychological profiles from a user's posting history. Every assessment
 * is backed by specific post citations as evidence.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { PsychologicalProfile } from '@veritas/ingestion';

interface UserPost {
  text: string;
  timestamp: string;
  platform: string;
  url?: string;
  engagement: { likes: number; comments: number; shares: number };
  sentiment?: { score: number; label: string };
}

const JSON_SCHEMA = `{
  "communicationStyle": {
    "formality": "formal | casual | mixed",
    "tone": "confrontational | diplomatic | analytical | emotional | sardonic | mixed",
    "complexity": "simple | moderate | complex",
    "evidence": ["post excerpt 1", "post excerpt 2"]
  },
  "coreBeliefs": [
    { "belief": "description", "confidence": 0.8, "evidence": ["post excerpt"] }
  ],
  "interestDomains": [
    { "domain": "topic name", "engagementLevel": "primary | secondary | peripheral", "postCount": 12 }
  ],
  "emotionalTriggers": {
    "anger": ["topic or event that provokes anger"],
    "excitement": ["topic or event"],
    "fear": ["topic or event"],
    "evidence": { "anger": ["post excerpt"], "excitement": ["post excerpt"], "fear": ["post excerpt"] }
  },
  "engagementPatterns": {
    "likelyToEngageWith": ["content type"],
    "likelyToShare": ["content type"],
    "likelyToCreate": ["content type"],
    "contentPreferences": ["preference"]
  },
  "influenceSusceptibility": {
    "vulnerableTo": ["type of messaging"],
    "resistantTo": ["type of messaging"],
    "echoChamberDepth": "none | mild | moderate | deep",
    "evidence": ["post excerpt"]
  },
  "persuasionStyle": {
    "primaryTechniques": ["technique"],
    "targetAudience": "description",
    "effectiveness": "low | moderate | high",
    "evidence": ["post excerpt"]
  },
  "riskIndicators": {
    "radicalizationSignals": ["signal"],
    "manipulationVulnerability": "low | moderate | high",
    "echoChamberDepth": "none | mild | moderate | deep",
    "flags": ["flag"],
    "evidence": ["post excerpt"]
  },
  "socialRole": {
    "primary": "leader | amplifier | bridge_node | follower | contrarian | provocateur | analyst",
    "confidence": 0.8,
    "evidence": ["post excerpt"]
  },
  "summary": "2-3 paragraph analytical summary of this individual"
}`;

@Injectable()
export class PsychologicalProfilerService {
  private readonly logger = new Logger(PsychologicalProfilerService.name);
  private readonly genAI: GoogleGenerativeAI | null = null;
  private readonly deepModel = 'gemini-3.1-pro-preview';
  private static readonly MAX_PROFILE_POSTS = 120;
  private static readonly MAX_RECENT_POSTS = 50;
  private static readonly MAX_TOP_ENGAGEMENT_POSTS = 30;
  private static readonly MAX_POST_TEXT_CHARS = 280;
  private static readonly MAX_TOTAL_POST_TEXT_CHARS = 24000;
  private static readonly GENERATION_RETRIES = 3;
  private static readonly BASE_RETRY_DELAY_MS = 1500;

  constructor(private readonly configService: ConfigService) {
    const geminiKey =
      this.configService.get<string>('GEMINI_API_KEY') ||
      process.env['GEMINI_API_KEY'];

    if (geminiKey) {
      this.genAI = new GoogleGenerativeAI(geminiKey);
    }
  }

  /**
   * Generate a full psychological profile from scratch.
   */
  async generateProfile(params: {
    handle: string;
    platform: string;
    posts: UserPost[];
    authorProfile?: {
      followersCount?: number | null;
      followingCount?: number | null;
      postsCount?: number | null;
      isVerified?: boolean;
      bio?: string | null;
    } | null;
    existingProfile?: PsychologicalProfile | null;
  }): Promise<PsychologicalProfile> {
    if (!this.genAI) {
      throw new Error('GEMINI_API_KEY not configured — cannot generate psychological profile');
    }

    const { handle, platform, posts, authorProfile, existingProfile } = params;

    if (posts.length === 0) {
      throw new Error('No posts available for profiling');
    }

    const normalizedPosts = this.dedupePosts(posts);

    // Sample posts strategically: recent + random older + high-engagement.
    // The original 200 x 500-char payload was too large and made the profile
    // generation path fragile under load.
    const sampledPosts = this.samplePosts(
      normalizedPosts,
      PsychologicalProfilerService.MAX_PROFILE_POSTS,
    );

    this.logger.log(
      `Generating MAGI profile for @${handle} [${platform}] — ${sampledPosts.length} posts`,
    );

    const model = this.genAI.getGenerativeModel({ model: this.deepModel });

    const systemPrompt = this.buildSystemPrompt();
    const userMessage = this.buildUserMessage(
      handle,
      platform,
      sampledPosts,
      authorProfile,
      existingProfile,
    );

    try {
      const result = await this.generateWithRetry(model, systemPrompt, userMessage, handle);

      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        throw new Error('LLM did not return valid JSON');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      const profile: PsychologicalProfile = {
        version: existingProfile ? (existingProfile.version ?? 0) + 1 : 1,
        generatedAt: new Date(),
        modelUsed: this.deepModel,
        postCountAnalyzed: sampledPosts.length,
        communicationStyle: parsed.communicationStyle ?? { formality: 'mixed', tone: 'mixed', complexity: 'moderate', evidence: [] },
        coreBeliefs: parsed.coreBeliefs ?? [],
        interestDomains: parsed.interestDomains ?? [],
        emotionalTriggers: parsed.emotionalTriggers ?? { anger: [], excitement: [], fear: [], evidence: {} },
        engagementPatterns: parsed.engagementPatterns ?? { likelyToEngageWith: [], likelyToShare: [], likelyToCreate: [], contentPreferences: [] },
        influenceSusceptibility: parsed.influenceSusceptibility ?? { vulnerableTo: [], resistantTo: [], echoChamberDepth: 'none', evidence: [] },
        persuasionStyle: parsed.persuasionStyle ?? { primaryTechniques: [], targetAudience: '', effectiveness: 'low', evidence: [] },
        riskIndicators: parsed.riskIndicators ?? { radicalizationSignals: [], manipulationVulnerability: 'low', echoChamberDepth: 'none', flags: [], evidence: [] },
        socialRole: parsed.socialRole ?? { primary: 'follower', confidence: 0.5, evidence: [] },
        summary: parsed.summary ?? '',
      };

      this.logger.log(
        `MAGI profile generated for @${handle} — ${profile.coreBeliefs.length} beliefs, ` +
        `${profile.interestDomains.length} domains, role: ${profile.socialRole.primary}`,
      );

      return profile;
    } catch (err) {
      this.logger.error(`MAGI profile generation failed for @${handle}: ${err}`);
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Prompt construction
  // -------------------------------------------------------------------------

  private buildSystemPrompt(): string {
    return `You are MAGI, an analytical intelligence system within the NERV framework. Your task is to construct a comprehensive psychological and behavioral profile of a social media user based on their posting history.

You are objective, rigorous, and evidence-based. Every assessment you make MUST cite specific posts as evidence (quote short excerpts). You do not moralize — you analyze. You consider multiple hypotheses before drawing conclusions.

## Analysis Dimensions

1. **Communication Style** — Formality, dominant tone, linguistic complexity, rhetorical patterns
2. **Core Beliefs & Values** — Consistent positions, implied worldview, contradictions between stated beliefs and behavior
3. **Interest Domains** — Primary topics (most posts), secondary (regular), peripheral (occasional)
4. **Emotional Triggers** — What provokes strong responses, categorized by emotion type
5. **Engagement Patterns** — What they engage with, share, create vs amplify
6. **Influence Susceptibility** — What messaging could influence them, what they're resistant to, echo chamber depth
7. **Persuasion Style** — How they influence others, techniques used, target audience
8. **Risk Indicators** — Radicalization signals, manipulation vulnerability, source diversity
9. **Social Role** — Leader, amplifier, bridge node, follower, contrarian, provocateur, or analyst

## Rules
- Be SPECIFIC. "User is opinionated" is useless. "User frames economic policy through libertarian lens, citing Austrian economics in 6/15 policy posts" is useful.
- CITE EVIDENCE. Quote short excerpts from posts.
- Consider ALTERNATIVE EXPLANATIONS before concluding.
- If insufficient data for a dimension, say so rather than speculating.
- Do NOT moralize. You are an intelligence analyst, not a judge.

## Output
Respond ONLY with a JSON object matching this schema (no markdown fences):
${JSON_SCHEMA}`;
  }

  private buildUserMessage(
    handle: string,
    platform: string,
    posts: UserPost[],
    authorProfile?: Record<string, unknown> | null,
    existingProfile?: PsychologicalProfile | null,
  ): string {
    const dateRange = this.getDateRange(posts);

    const authorSection = authorProfile
      ? `\nAccount: ${authorProfile['followersCount'] ?? '?'} followers, ${authorProfile['followingCount'] ?? '?'} following, verified: ${authorProfile['isVerified'] ?? false}\nBio: ${authorProfile['bio'] ?? 'N/A'}`
      : '';

    const postSection = this.buildPostSection(posts);

    const existingSection = existingProfile
      ? `\n\n## Previous Profile (v${existingProfile.version})\nUpdate based on new evidence. Note changes.\n${existingProfile.summary.slice(0, 1200)}`
      : '';

    return `## Subject\nHandle: @${handle}\nPlatform: ${platform}\nPost corpus: ${posts.length} posts spanning ${dateRange}${authorSection}${existingSection}\n\n## Posts\n${postSection}`;
  }

  // -------------------------------------------------------------------------
  // Post sampling strategy
  // -------------------------------------------------------------------------

  private samplePosts(posts: UserPost[], maxPosts: number): UserPost[] {
    if (posts.length <= maxPosts) return posts;

    const sorted = [...posts].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    // Most recent posts
    const recent = sorted.slice(0, Math.min(PsychologicalProfilerService.MAX_RECENT_POSTS, maxPosts));

    // Highest engagement posts
    const byEngagement = [...posts].sort(
      (a, b) =>
        (b.engagement.likes + b.engagement.comments + b.engagement.shares) -
        (a.engagement.likes + a.engagement.comments + a.engagement.shares),
    );
    const topEngagement = byEngagement.slice(
      0,
      Math.min(
        PsychologicalProfilerService.MAX_TOP_ENGAGEMENT_POSTS,
        Math.max(maxPosts - recent.length, 0),
      ),
    );

    // Random sample from the rest
    const usedIds = new Set([...recent, ...topEngagement].map((p) => p.text.slice(0, 50)));
    const remaining = posts.filter((p) => !usedIds.has(p.text.slice(0, 50)));
    const randomSample = this.randomSample(
      remaining,
      Math.max(maxPosts - recent.length - topEngagement.length, 0),
    );

    // Deduplicate
    const seen = new Set<string>();
    const result: UserPost[] = [];
    for (const post of [...recent, ...topEngagement, ...randomSample]) {
      const key = post.text.slice(0, 80);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(post);
      }
      if (result.length >= maxPosts) break;
    }

    return result;
  }

  private buildPostSection(posts: UserPost[]): string {
    let totalChars = 0;
    const lines: string[] = [];

    for (const [index, post] of posts.entries()) {
      const text = post.text.replace(/\s+/g, ' ').trim().slice(0, PsychologicalProfilerService.MAX_POST_TEXT_CHARS);
      const entry =
        `[${index}] [${post.platform}] [${post.timestamp}] ` +
        `[engagement: ${post.engagement.likes}L ${post.engagement.comments}C ${post.engagement.shares}S]` +
        `${post.sentiment ? ` [sentiment: ${post.sentiment.label}]` : ''}\n${text}`;

      if (lines.length > 0 && totalChars + entry.length > PsychologicalProfilerService.MAX_TOTAL_POST_TEXT_CHARS) {
        break;
      }

      lines.push(entry);
      totalChars += entry.length;
    }

    return lines.join('\n\n');
  }

  private dedupePosts(posts: UserPost[]): UserPost[] {
    const seen = new Set<string>();
    const result: UserPost[] = [];

    for (const post of posts) {
      const normalizedText = post.text.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 180);
      const dayBucket = post.timestamp.slice(0, 10);
      const key = `${post.platform}|${dayBucket}|${normalizedText}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(post);
    }

    return result;
  }

  private async generateWithRetry(
    model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>,
    systemPrompt: string,
    userMessage: string,
    handle: string,
  ) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= PsychologicalProfilerService.GENERATION_RETRIES; attempt++) {
      try {
        return await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: userMessage }] }],
          systemInstruction: systemPrompt,
          generationConfig: { responseMimeType: 'application/json' },
        });
      } catch (err) {
        lastError = err;
        if (attempt >= PsychologicalProfilerService.GENERATION_RETRIES || !this.isTransientGeminiError(err)) {
          throw err;
        }

        const delayMs = PsychologicalProfilerService.BASE_RETRY_DELAY_MS * 2 ** (attempt - 1);
        this.logger.warn(
          `Transient MAGI generation failure for @${handle}; retrying attempt ${attempt + 1}/${PsychologicalProfilerService.GENERATION_RETRIES} in ${delayMs}ms`,
        );
        await this.sleep(delayMs);
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Unknown MAGI generation failure');
  }

  private isTransientGeminiError(err: unknown): boolean {
    const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
    return (
      message.includes('fetch failed') ||
      message.includes('429') ||
      message.includes('quota') ||
      message.includes('rate limit') ||
      message.includes('deadline') ||
      message.includes('timeout') ||
      message.includes('temporar') ||
      message.includes('overloaded') ||
      message.includes('unavailable')
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private randomSample<T>(arr: T[], n: number): T[] {
    if (arr.length <= n) return arr;
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    return shuffled.slice(0, n);
  }

  private getDateRange(posts: UserPost[]): string {
    if (posts.length === 0) return 'no posts';
    const timestamps = posts.map((p) => new Date(p.timestamp).getTime());
    const min = new Date(Math.min(...timestamps));
    const max = new Date(Math.max(...timestamps));
    const days = Math.round((max.getTime() - min.getTime()) / (1000 * 60 * 60 * 24));
    return `${min.toISOString().split('T')[0]} to ${max.toISOString().split('T')[0]} (${days} days)`;
  }
}
