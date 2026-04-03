import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A user node in the investigation graph */
export interface UserNode {
  handle: string;
  name: string;
  platform: string;
  /** Posts by this user related to the investigation topic */
  topicPosts: UserPost[];
  /** Full historical posts (broader timeline) */
  historicalPosts: UserPost[];
  /** When this user first posted about the topic */
  firstMention: string;
  /** Narrative evolution: how their stance changed over time */
  narrativeEvolution: NarrativeShift[];
  /** LLM-assessed profile */
  profile: UserProfile;
}

export interface UserPost {
  text: string;
  timestamp: string;
  platform: string;
  url?: string;
  engagement: { likes: number; comments: number; shares: number };
  sentiment: { score: number; label: string };
}

export interface NarrativeShift {
  timestamp: string;
  fromStance: string;
  toStance: string;
  triggerPost?: string;
  confidence: number;
}

export interface UserProfile {
  /** LLM-generated summary of who this user is and what they post about */
  summary: string;
  /** Primary topics this user engages with */
  topics: string[];
  /** Posting patterns */
  patterns: {
    avgPostsPerDay: number;
    mostActiveHours: number[];
    platformPresence: string[];
  };
  /** Potential motivations (LLM-assessed) */
  motivations: string[];
  /** Coordination signals */
  coordinationFlags: string[];
}

/** Result of analyzing a single user node */
export interface UserInvestigationResult {
  user: UserNode;
  /** When they adopted the narrative */
  adoptionTimestamp: string | null;
  /** Where they likely got it from (earlier user in the chain) */
  likelySource: string | null;
  /** How central they are to spreading the narrative */
  influenceScore: number;
  /** Suspicious patterns detected */
  flags: string[];
}

/** Full investigation result */
export interface DeepInvestigationResult {
  /** The topic/narrative being investigated */
  topic: string;
  /** All user nodes analyzed */
  users: UserInvestigationResult[];
  /** The likely origin point of the narrative */
  originAnalysis: {
    firstMover: string;
    firstPlatform: string;
    firstTimestamp: string;
    propagationChain: string[];
  };
  /** Who benefits from this narrative (LLM analysis) */
  cuiBono: {
    beneficiaries: Array<{
      entity: string;
      howTheyBenefit: string;
      confidence: number;
    }>;
    agendas: string[];
    summary: string;
  };
  /** Cross-user coordination patterns */
  coordination: {
    clusters: Array<{
      users: string[];
      pattern: string;
      confidence: number;
    }>;
    summary: string;
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class DeepInvestigationService {
  private readonly logger = new Logger(DeepInvestigationService.name);
  private readonly genAI: GoogleGenerativeAI | null = null;
  private readonly chatModel: string = 'gemini-2.0-flash';

  constructor(private readonly configService: ConfigService) {
    const geminiKey =
      this.configService.get<string>('GEMINI_API_KEY') ||
      process.env['GEMINI_API_KEY'];

    if (geminiKey) {
      this.genAI = new GoogleGenerativeAI(geminiKey);
      this.logger.log('DeepInvestigationService initialized');
    } else {
      this.logger.warn('GEMINI_API_KEY not set — deep investigation LLM features disabled');
    }
  }

  /**
   * Investigate a narrative by analyzing each user who posted about it.
   * Takes the topic posts (already fetched) plus historical posts per user
   * (fetched by the caller / connector layer).
   */
  async investigate(
    topic: string,
    userTimelines: Map<string, { topicPosts: UserPost[]; historicalPosts: UserPost[] }>,
  ): Promise<DeepInvestigationResult> {
    this.logger.log(
      `Deep investigation: "${topic}" — ${userTimelines.size} users to analyze`,
    );

    // Step 1: Analyze each user in parallel (up to 5 concurrent)
    const userEntries = Array.from(userTimelines.entries());
    const userResults: UserInvestigationResult[] = [];

    const CONCURRENCY = 5;
    for (let i = 0; i < userEntries.length; i += CONCURRENCY) {
      const batch = userEntries.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(([handle, data]) =>
          this.analyzeUser(topic, handle, data.topicPosts, data.historicalPosts),
        ),
      );
      userResults.push(...batchResults);
      this.logger.debug(
        `Analyzed users ${i + 1}-${Math.min(i + CONCURRENCY, userEntries.length)} of ${userEntries.length}`,
      );
    }

    // Step 2: Determine origin / propagation chain
    const originAnalysis = this.traceOrigin(userResults);

    // Step 3: Detect coordination patterns
    const coordination = this.detectCoordination(userResults);

    // Step 4: Cui bono analysis (who benefits)
    const cuiBono = await this.analyzeCuiBono(topic, userResults);

    return {
      topic,
      users: userResults.sort((a, b) => b.influenceScore - a.influenceScore),
      originAnalysis,
      cuiBono,
      coordination,
    };
  }

  // ---------------------------------------------------------------------------
  // Per-user analysis
  // ---------------------------------------------------------------------------

  private async analyzeUser(
    topic: string,
    handle: string,
    topicPosts: UserPost[],
    historicalPosts: UserPost[],
  ): Promise<UserInvestigationResult> {
    // Sort chronologically
    const sortedTopic = [...topicPosts].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    const sortedHistory = [...historicalPosts].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    const firstTopicPost = sortedTopic[0];
    const platform = firstTopicPost?.platform ?? 'unknown';

    // Detect narrative shifts
    const shifts = this.detectNarrativeShifts(sortedTopic);

    // Calculate posting patterns
    const patterns = this.analyzePostingPatterns(sortedHistory);

    // LLM profile analysis
    const profile = await this.profileUser(
      handle,
      topic,
      sortedTopic,
      sortedHistory,
    );

    // Influence score based on engagement and reach
    const totalEngagement = topicPosts.reduce(
      (s, p) => s + p.engagement.likes + p.engagement.comments + p.engagement.shares,
      0,
    );
    const influenceScore = Math.min(
      1,
      Math.log10(totalEngagement + 1) / 5 + topicPosts.length / 50,
    );

    // Detect suspicious flags
    const flags = this.detectFlags(handle, topicPosts, historicalPosts, patterns);

    return {
      user: {
        handle,
        name: handle,
        platform,
        topicPosts: sortedTopic,
        historicalPosts: sortedHistory,
        firstMention: firstTopicPost?.timestamp ?? '',
        narrativeEvolution: shifts,
        profile,
      },
      adoptionTimestamp: firstTopicPost?.timestamp ?? null,
      likelySource: null, // Filled in by traceOrigin
      influenceScore,
      flags,
    };
  }

  private detectNarrativeShifts(posts: UserPost[]): NarrativeShift[] {
    if (posts.length < 2) return [];

    const shifts: NarrativeShift[] = [];
    let prevSentiment = posts[0]!.sentiment.label;

    for (let i = 1; i < posts.length; i++) {
      const post = posts[i]!;
      if (post.sentiment.label !== prevSentiment) {
        shifts.push({
          timestamp: post.timestamp,
          fromStance: prevSentiment,
          toStance: post.sentiment.label,
          triggerPost: post.text.slice(0, 200),
          confidence: Math.abs(post.sentiment.score),
        });
        prevSentiment = post.sentiment.label;
      }
    }

    return shifts;
  }

  private analyzePostingPatterns(
    posts: UserPost[],
  ): UserProfile['patterns'] {
    if (posts.length === 0) {
      return { avgPostsPerDay: 0, mostActiveHours: [], platformPresence: [] };
    }

    const firstTs = new Date(posts[0]!.timestamp).getTime();
    const lastTs = new Date(posts[posts.length - 1]!.timestamp).getTime();
    const days = Math.max((lastTs - firstTs) / (1000 * 60 * 60 * 24), 1);

    // Hour distribution
    const hourCounts = new Map<number, number>();
    const platformSet = new Set<string>();
    for (const post of posts) {
      const hour = new Date(post.timestamp).getUTCHours();
      hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
      platformSet.add(post.platform);
    }

    const sortedHours = Array.from(hourCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([hour]) => hour);

    return {
      avgPostsPerDay: posts.length / days,
      mostActiveHours: sortedHours,
      platformPresence: Array.from(platformSet),
    };
  }

  private detectFlags(
    handle: string,
    topicPosts: UserPost[],
    historicalPosts: UserPost[],
    patterns: UserProfile['patterns'],
  ): string[] {
    const flags: string[] = [];

    // Flag: Very high posting rate
    if (patterns.avgPostsPerDay > 50) {
      flags.push('Unusually high posting rate (>50 posts/day)');
    }

    // Flag: Only posts about this topic (single-issue account)
    if (historicalPosts.length > 0 && topicPosts.length / historicalPosts.length > 0.8) {
      flags.push('Single-issue account — >80% of posts are about this topic');
    }

    // Flag: Burst posting (many posts in short window)
    const timestamps = topicPosts.map((p) => new Date(p.timestamp).getTime()).sort();
    for (let i = 0; i < timestamps.length - 4; i++) {
      const window = (timestamps[i + 4]! - timestamps[i]!) / (1000 * 60);
      if (window < 5) {
        flags.push('Burst posting — 5+ posts within 5 minutes');
        break;
      }
    }

    // Flag: Near-identical posts (copy-paste)
    const uniqueTexts = new Set(topicPosts.map((p) => p.text.toLowerCase().trim().slice(0, 100)));
    if (uniqueTexts.size < topicPosts.length * 0.5) {
      flags.push('Repetitive content — >50% of posts are near-identical');
    }

    return flags;
  }

  // ---------------------------------------------------------------------------
  // LLM-powered analysis
  // ---------------------------------------------------------------------------

  private async profileUser(
    handle: string,
    topic: string,
    topicPosts: UserPost[],
    historicalPosts: UserPost[],
  ): Promise<UserProfile> {
    const fallback: UserProfile = {
      summary: `@${handle} — ${topicPosts.length} posts about "${topic}"`,
      topics: [],
      patterns: this.analyzePostingPatterns(historicalPosts),
      motivations: [],
      coordinationFlags: [],
    };

    if (!this.genAI || topicPosts.length === 0) return fallback;

    const model = this.genAI.getGenerativeModel({ model: this.chatModel });

    const topicSamples = topicPosts
      .slice(0, 10)
      .map((p) => `[${p.timestamp}] ${p.text.slice(0, 200)}`)
      .join('\n');

    const historySamples = historicalPosts
      .slice(-10)
      .map((p) => `[${p.timestamp}] ${p.text.slice(0, 200)}`)
      .join('\n');

    const prompt = `Analyze this social media user's posting behavior. Be objective and analytical.

User: @${handle}
Topic under investigation: "${topic}"

Their posts about the topic (${topicPosts.length} total):
${topicSamples}

Their other recent posts (${historicalPosts.length} total):
${historySamples}

Respond ONLY with a JSON object:
{
  "summary": "1-2 sentence objective description of this user and their relationship to the topic",
  "topics": ["list of 3-5 main topics they post about"],
  "motivations": ["possible motivations for posting about ${topic} — be analytical, not accusatory"],
  "coordinationFlags": ["any patterns suggesting coordination with others, or empty array if none"]
}`;

    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Partial<UserProfile>;
        return {
          summary: parsed.summary ?? fallback.summary,
          topics: parsed.topics ?? [],
          patterns: fallback.patterns,
          motivations: parsed.motivations ?? [],
          coordinationFlags: parsed.coordinationFlags ?? [],
        };
      }
    } catch (err) {
      this.logger.warn(`User profile LLM failed for @${handle}: ${err}`);
    }

    return fallback;
  }

  // ---------------------------------------------------------------------------
  // Origin tracing
  // ---------------------------------------------------------------------------

  private traceOrigin(
    users: UserInvestigationResult[],
  ): DeepInvestigationResult['originAnalysis'] {
    // Sort by adoption timestamp to find first mover
    const withAdoption = users
      .filter((u) => u.adoptionTimestamp)
      .sort(
        (a, b) =>
          new Date(a.adoptionTimestamp!).getTime() -
          new Date(b.adoptionTimestamp!).getTime(),
      );

    if (withAdoption.length === 0) {
      return {
        firstMover: 'unknown',
        firstPlatform: 'unknown',
        firstTimestamp: '',
        propagationChain: [],
      };
    }

    const first = withAdoption[0]!;

    // Build propagation chain (ordered by adoption time)
    const chain = withAdoption.map((u) => u.user.handle);

    // Set likelySource for each user (the previous user in the chain)
    for (let i = 1; i < withAdoption.length; i++) {
      withAdoption[i]!.likelySource = withAdoption[i - 1]!.user.handle;
    }

    return {
      firstMover: first.user.handle,
      firstPlatform: first.user.platform,
      firstTimestamp: first.adoptionTimestamp!,
      propagationChain: chain,
    };
  }

  // ---------------------------------------------------------------------------
  // Coordination detection
  // ---------------------------------------------------------------------------

  private detectCoordination(
    users: UserInvestigationResult[],
  ): DeepInvestigationResult['coordination'] {
    const clusters: DeepInvestigationResult['coordination']['clusters'] = [];

    // Check for temporal clustering: users who adopted within minutes of each other
    const withTimestamps = users
      .filter((u) => u.adoptionTimestamp)
      .sort(
        (a, b) =>
          new Date(a.adoptionTimestamp!).getTime() -
          new Date(b.adoptionTimestamp!).getTime(),
      );

    // Sliding window: users who adopted within 30 minutes of each other
    const WINDOW_MS = 30 * 60 * 1000;
    let windowStart = 0;
    for (let i = 1; i < withTimestamps.length; i++) {
      const gap =
        new Date(withTimestamps[i]!.adoptionTimestamp!).getTime() -
        new Date(withTimestamps[windowStart]!.adoptionTimestamp!).getTime();

      if (gap > WINDOW_MS) {
        // Check if window had enough users for a cluster
        if (i - windowStart >= 3) {
          clusters.push({
            users: withTimestamps
              .slice(windowStart, i)
              .map((u) => u.user.handle),
            pattern: `${i - windowStart} users adopted the narrative within ${Math.round(gap / 60000)} minutes`,
            confidence: Math.min(0.9, (i - windowStart) / 10),
          });
        }
        windowStart = i;
      }
    }

    // Check remaining window
    if (withTimestamps.length - windowStart >= 3) {
      clusters.push({
        users: withTimestamps.slice(windowStart).map((u) => u.user.handle),
        pattern: `${withTimestamps.length - windowStart} users adopted the narrative in rapid succession`,
        confidence: Math.min(0.9, (withTimestamps.length - windowStart) / 10),
      });
    }

    // Check for users with shared flags
    const flaggedUsers = users.filter((u) => u.flags.length > 0);
    if (flaggedUsers.length >= 2) {
      clusters.push({
        users: flaggedUsers.map((u) => u.user.handle),
        pattern: `${flaggedUsers.length} users show suspicious posting patterns`,
        confidence: 0.5,
      });
    }

    return {
      clusters,
      summary:
        clusters.length > 0
          ? `${clusters.length} potential coordination cluster(s) detected`
          : 'No obvious coordination patterns detected',
    };
  }

  // ---------------------------------------------------------------------------
  // Cui bono (who benefits) analysis
  // ---------------------------------------------------------------------------

  private async analyzeCuiBono(
    topic: string,
    users: UserInvestigationResult[],
  ): Promise<DeepInvestigationResult['cuiBono']> {
    const fallback: DeepInvestigationResult['cuiBono'] = {
      beneficiaries: [],
      agendas: [],
      summary: 'Unable to determine beneficiaries without LLM analysis.',
    };

    if (!this.genAI || users.length === 0) return fallback;

    const model = this.genAI.getGenerativeModel({ model: this.chatModel });

    // Gather representative posts from the most influential users
    const topUsers = users.slice(0, 10);
    const samplePosts = topUsers
      .flatMap((u) =>
        u.user.topicPosts.slice(0, 3).map(
          (p) => `@${u.user.handle} (${u.user.platform}): ${p.text.slice(0, 200)}`,
        ),
      )
      .join('\n');

    const userFlags = users
      .filter((u) => u.flags.length > 0)
      .map((u) => `@${u.user.handle}: ${u.flags.join(', ')}`)
      .join('\n');

    const prompt = `You are an intelligence analyst. Given these social media posts about "${topic}", analyze who benefits from this narrative.

Sample posts from the most active users:
${samplePosts}

${userFlags ? `Suspicious patterns detected:\n${userFlags}\n` : ''}

Analyze objectively:
1. Who (individuals, organizations, nations, industries) would benefit if this narrative is widely believed?
2. What agendas does this narrative serve?
3. Are there financial, political, or social motivations visible?

Respond ONLY with JSON:
{
  "beneficiaries": [{"entity": "...", "howTheyBenefit": "...", "confidence": 0.0-1.0}],
  "agendas": ["..."],
  "summary": "1-3 sentence analytical summary"
}`;

    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as DeepInvestigationResult['cuiBono'];
        return {
          beneficiaries: parsed.beneficiaries ?? [],
          agendas: parsed.agendas ?? [],
          summary: parsed.summary ?? fallback.summary,
        };
      }
    } catch (err) {
      this.logger.warn(`Cui bono analysis failed: ${err}`);
    }

    return fallback;
  }
}
